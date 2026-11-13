# Deploying the Music Mitra Karaoke Service

The service turns a song into a **karaoke instrumental** (Demucs
vocal removal) plus **synced lyrics** (faster-whisper transcribing
the isolated vocal stem), once per song, cached on disk forever.
OneUco talks to it through its own `/api/radio?type=karaoke…`
proxy — the browser never calls it directly.

## 1 · Put it on Hugging Face Spaces (free)

1. huggingface.co → New Space → name `music-mitra-karaoke`,
   SDK **Docker**, hardware **CPU basic (free)**.
2. Upload this folder's files into the Space:
   `app.py`, `requirements.txt`, `Dockerfile`, `README.md`.
3. Wait for the build (first build downloads torch + the Demucs
   and Whisper models — allow 10–20 minutes).
4. Check `https://<your-space>.hf.space/health` → `{ "ok": true }`.

Reality check on the free CPU tier: separating one song takes
about as long as the song (or longer), and Whisper adds a bit.
That's fine **because of the cache** — a song is only ever
processed once. For faster first-runs: Space hardware → ZeroGPU
or a small paid GPU, and/or set `WHISPER_MODEL=base` in the
Space's variables (weaker lyrics, much faster).

Space variables (Settings → Variables and secrets):
- `WHISPER_MODEL` — `large-v3-turbo` (default) / `base` / `small`
- `KARAOKE_STUB` — leave unset in production (`1` = fake pipeline
  for tests)

## 2 · Point OneUco at it

In **Vercel** → project `one-university-community` → Settings →
Environment Variables (Production):

```
KARAOKE_SERVICE_URL = https://<your-space>.hf.space
```

Then redeploy (Deployments → ⋯ → Redeploy) so the new env lands.

Until this variable exists, Music Mitra simply behaves as before
(LRCLIB lyrics karaoke only) — nothing breaks.

## Local run / test

```bash
cd karaoke-service
python -m venv .venv && . .venv/bin/activate
pip install fastapi "uvicorn>=0.29" python-multipart   # plumbing only
KARAOKE_STUB=1 PORT=8000 python app.py
curl localhost:8000/health
curl -X POST localhost:8000/karaoke -H 'Content-Type: application/json' \
  -d '{"song_id":"test1","audio_url":"https://example.com/song.mp4","title":"T","artist":"A"}'
curl localhost:8000/karaoke/test1
```

Full local run (real models): `pip install -r requirements.txt`
plus ffmpeg on the machine, then start without `KARAOKE_STUB`.
