"""
Music Mitra Karaoke Service
===========================

Turns any song into a karaoke track + synced lyrics, ONCE, then
serves the cached result forever. Built for OneUco's Music Mitra,
extending the owner's original MusicMitra demucs_server.py.

Pipeline per song (keyed by the song id the client sends):
  1. Download the song audio from the URL the client provides.
  2. Demucs (htdemucs) separates the stems:
       - instrumental = every stem except vocals  -> karaoke track
       - vocals       = kept only long enough to transcribe
  3. faster-whisper transcribes the VOCALS stem (isolated vocals
     transcribe far better than the full mix) with segment
     timestamps -> synced lyric lines.
  4. Results are cached on disk under CACHE_DIR/<song_id>/:
       instrumental.mp3, lyrics.json, meta.json
     Later requests for the same song answer instantly.

API (all JSON unless noted):
  GET  /health                      -> { ok, model, device, stub }
  POST /karaoke                     -> start (or fetch) a job
       body: { song_id, audio_url, title, artist, language? }
       200: { song_id, status: ready|processing|failed, ... }
  GET  /karaoke/{song_id}           -> job status; when ready also
                                       { instrumental_url, lines,
                                         lyrics_source }
  GET  /karaoke/{song_id}/instrumental -> the mp3 (audio/mpeg)

Jobs run on a background thread — separation on CPU takes roughly
the song's length or longer, so the client polls. One job at a
time per song; concurrent songs queue on a single worker (free
tiers have one throat; the cache is what makes this feel fast).

KARAOKE_STUB=1 swaps Demucs + Whisper for instant fakes (the
original audio stands in as the "instrumental", lyrics come back
empty) — used for plumbing tests and demos, never for real users.

Env:
  PORT           (default 7860 — Hugging Face Spaces' port)
  CACHE_DIR      (default ./cache)
  WHISPER_MODEL  (default large-v3-turbo; tiny/base for weak CPUs)
  KARAOKE_STUB   (default off)
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import traceback
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

PORT = int(os.environ.get("PORT", "7860"))
CACHE_DIR = Path(os.environ.get("CACHE_DIR", "./cache"))
STUB = os.environ.get("KARAOKE_STUB", "") == "1"
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")

CACHE_DIR.mkdir(parents=True, exist_ok=True)

# In-memory job registry: song_id -> {status, error, started_at}
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_worker_lock = threading.Lock()  # one separation at a time

_models: dict = {"demucs": None, "whisper": None, "device": "cpu"}


def _load_models() -> None:
    """Load Demucs + Whisper once at startup (skipped in stub mode)."""
    if STUB:
        print("[karaoke] STUB mode — models not loaded")
        return
    import torch
    from demucs.pretrained import get_model

    device = "cuda" if torch.cuda.is_available() else "cpu"
    _models["device"] = device
    print(f"[karaoke] loading Demucs htdemucs on {device}…")
    model = get_model("htdemucs")
    model.eval()
    if device == "cuda":
        model.cuda()
    _models["demucs"] = model

    from faster_whisper import WhisperModel

    print(f"[karaoke] loading faster-whisper {WHISPER_MODEL}…")
    _models["whisper"] = WhisperModel(
        WHISPER_MODEL,
        device=device,
        compute_type="float16" if device == "cuda" else "int8",
    )
    print("[karaoke] models ready")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_models()
    yield


app = FastAPI(title="Music Mitra Karaoke Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _safe_id(song_id: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "_", song_id)[:80]
    if not cleaned:
        raise HTTPException(status_code=400, detail="song_id is required")
    return cleaned


def _song_dir(song_id: str) -> Path:
    return CACHE_DIR / _safe_id(song_id)


def _meta_path(song_id: str) -> Path:
    return _song_dir(song_id) / "meta.json"


def _read_meta(song_id: str) -> dict | None:
    path = _meta_path(song_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _result_payload(song_id: str, request: Request) -> dict:
    meta = _read_meta(song_id)
    job = _jobs.get(song_id, {})
    if meta and meta.get("status") == "ready":
        base = str(request.base_url).rstrip("/")
        return {
            "song_id": song_id,
            "status": "ready",
            "instrumental_url": f"{base}/karaoke/{song_id}/instrumental",
            "lines": meta.get("lines", []),
            "lyrics_source": meta.get("lyrics_source", "whisper"),
            "title": meta.get("title"),
        }
    if meta and meta.get("status") == "failed":
        return {
            "song_id": song_id,
            "status": "failed",
            "error": meta.get("error", "processing failed"),
        }
    if job.get("status") == "processing" or meta:
        return {"song_id": song_id, "status": "processing"}
    return {"song_id": song_id, "status": "unknown"}


# ── The pipeline ─────────────────────────────────────────────────

def _download(url: str, dest: Path) -> None:
    req = urllib.request.Request(
        url, headers={"User-Agent": "MusicMitra-Karaoke/1.0"}
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        dest.write_bytes(response.read())


def _separate(mix_path: Path, out_dir: Path) -> tuple[Path, Path]:
    """Demucs: write instrumental + vocals WAVs, return their paths."""
    import numpy as np
    import soundfile as sf
    import torch
    import librosa
    from demucs.apply import apply_model

    model = _models["demucs"]
    device = _models["device"]

    wav_np, sr = librosa.load(str(mix_path), sr=44100, mono=False)
    if wav_np.ndim == 1:
        wav_np = np.stack([wav_np, wav_np])
    elif wav_np.shape[0] > 2:
        wav_np = wav_np[:2]
    peak = float(np.max(np.abs(wav_np))) or 1.0
    wav_np = (wav_np / max(1.0, peak)).astype("float32")

    mix = torch.from_numpy(wav_np).unsqueeze(0).to(device)
    with torch.no_grad():
        sources = apply_model(model, mix, device=device)[0]
    names = list(model.sources)
    vocals_idx = names.index("vocals")

    instrumental = sum(
        sources[i] for i in range(len(names)) if i != vocals_idx
    )
    vocals = sources[vocals_idx]

    instrumental_path = out_dir / "instrumental.wav"
    vocals_path = out_dir / "vocals.wav"
    sf.write(str(instrumental_path), instrumental.cpu().numpy().T, sr)
    sf.write(str(vocals_path), vocals.cpu().numpy().T, sr)
    return instrumental_path, vocals_path


def _transcribe(vocals_path: Path, language: str | None) -> list[dict]:
    """faster-whisper on the vocal stem -> [{t, text}] lines."""
    whisper = _models["whisper"]
    segments, _info = whisper.transcribe(
        str(vocals_path),
        language=language or None,
        vad_filter=True,
        beam_size=1,
    )
    lines: list[dict] = []
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            lines.append({"t": round(float(segment.start), 2), "text": text})
    return lines


def _to_mp3(wav_path: Path, mp3_path: Path) -> None:
    """WAV -> compact mp3 via ffmpeg (present in the image)."""
    import subprocess

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(wav_path),
            "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3_path),
        ],
        check=True,
        capture_output=True,
        timeout=600,
    )


def _run_job(song_id: str, audio_url: str, title: str, artist: str,
             language: str | None) -> None:
    song_dir = _song_dir(song_id)
    song_dir.mkdir(parents=True, exist_ok=True)
    meta_path = _meta_path(song_id)
    with _jobs_lock:
        _jobs[song_id] = {"status": "processing", "started_at": time.time()}
    try:
        with _worker_lock:  # one separation at a time
            if STUB:
                lines: list[dict] = []
                src_mp3 = song_dir / "instrumental.mp3"
                _download(audio_url, src_mp3)  # stand-in "instrumental"
                lyrics_source = "stub"
            else:
                mix_path = song_dir / "mix.m4a"
                _download(audio_url, mix_path)
                instrumental_wav, vocals_wav = _separate(mix_path, song_dir)
                _to_mp3(instrumental_wav, song_dir / "instrumental.mp3")
                lines = _transcribe(vocals_wav, language)
                lyrics_source = "whisper"
                for leftover in (mix_path, instrumental_wav, vocals_wav):
                    leftover.unlink(missing_ok=True)
        meta = {
            "status": "ready",
            "title": title,
            "artist": artist,
            "lines": lines,
            "lyrics_source": lyrics_source,
            "finished_at": time.time(),
        }
        (song_dir / "lyrics.json").write_text(
            json.dumps(lines, ensure_ascii=False), encoding="utf-8"
        )
        meta_path.write_text(
            json.dumps(meta, ensure_ascii=False), encoding="utf-8"
        )
        with _jobs_lock:
            _jobs[song_id] = {"status": "ready"}
    except Exception as exc:  # noqa: BLE001 — surface it to pollers
        traceback.print_exc()
        meta_path.write_text(
            json.dumps({"status": "failed", "error": str(exc)[:300]}),
            encoding="utf-8",
        )
        with _jobs_lock:
            _jobs[song_id] = {"status": "failed", "error": str(exc)[:300]}


# ── Routes ───────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": "music-mitra-karaoke",
        "model": "htdemucs + faster-whisper " + WHISPER_MODEL,
        "device": _models["device"],
        "stub": STUB,
        "cached_songs": sum(1 for p in CACHE_DIR.iterdir() if p.is_dir()),
    }


@app.post("/karaoke")
async def start_karaoke(request: Request) -> JSONResponse:
    body = await request.json()
    song_id = _safe_id(str(body.get("song_id", "")))
    audio_url = str(body.get("audio_url", "")).strip()
    title = str(body.get("title", "")).strip()
    artist = str(body.get("artist", "")).strip()
    language = body.get("language") or None

    existing = _result_payload(song_id, request)
    if existing["status"] in ("ready", "processing"):
        return JSONResponse(existing)
    if not audio_url.startswith("http"):
        raise HTTPException(status_code=400, detail="audio_url is required")

    # Clear a previous failure so a retry can run.
    meta = _read_meta(song_id)
    if meta and meta.get("status") == "failed":
        _meta_path(song_id).unlink(missing_ok=True)

    thread = threading.Thread(
        target=_run_job,
        args=(song_id, audio_url, title, artist, language),
        daemon=True,
    )
    thread.start()
    return JSONResponse({"song_id": song_id, "status": "processing"})


@app.get("/karaoke/{song_id}")
def karaoke_status(song_id: str, request: Request) -> JSONResponse:
    return JSONResponse(_result_payload(_safe_id(song_id), request))


@app.get("/karaoke/{song_id}/instrumental")
def karaoke_instrumental(song_id: str) -> FileResponse:
    path = _song_dir(song_id) / "instrumental.mp3"
    if not path.exists():
        raise HTTPException(status_code=404, detail="not ready")
    return FileResponse(str(path), media_type="audio/mpeg")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT, proxy_headers=True)
