"use client";

import { useEffect, useRef, useState } from "react";
import type { NewsCategory, NewsItem, WeatherView } from "@/lib/news";
import { getNewsAction, getWeatherAction } from "@/app/chirp/actions";

// The "Live" block at the top of Chirp: the student's local weather +
// live news with photos (Top / National / Regional / Tech / Sports /
// Celebs). Initial Top news + weather arrive server-rendered from the
// page; tab switches and the 5-minute auto-refresh go through the
// chirp server actions. Everything fails soft — a dead feed shows a
// gentle empty state, a dead photo shows a category tile.

const TABS: { key: NewsCategory; label: string }[] = [
  { key: "top", label: "Top Stories" },
  { key: "national", label: "National" },
  { key: "regional", label: "Regional" },
  { key: "tech", label: "Tech" },
  { key: "sports", label: "Sports" },
  { key: "celebs", label: "Celebs" },
];

const TILE_GRADIENTS: Record<NewsCategory, string> = {
  top: "from-rose-950 via-neutral-900 to-neutral-950",
  national: "from-indigo-950 via-neutral-900 to-neutral-950",
  regional: "from-emerald-950 via-neutral-900 to-neutral-950",
  tech: "from-sky-950 via-neutral-900 to-neutral-950",
  sports: "from-amber-950 via-neutral-900 to-neutral-950",
  celebs: "from-fuchsia-950 via-neutral-900 to-neutral-950",
};

function timeAgo(iso: string | null, now: Date): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = now.getTime() - then;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NewsCard({
  item,
  category,
  categoryLabel,
  now,
}: {
  item: NewsItem;
  category: NewsCategory;
  categoryLabel: string;
  now: Date;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imgFailed;
  const ago = timeAgo(item.publishedAt, now);
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 transition hover:border-neutral-600"
    >
      {showImage ? (
        // referrerPolicy="no-referrer": publisher CDNs (The Hindu's
        // th-i.thgim.com in particular) intermittently refuse hotlinked
        // loads that carry a Referer, while the same URLs answer 200
        // with none — sending no referrer is the verified-good case.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="aspect-[16/9] w-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className={`flex aspect-[16/9] w-full items-end bg-gradient-to-br p-3 ${TILE_GRADIENTS[category]}`}
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
            {categoryLabel}
          </span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
          {item.source}
          {ago ? ` · ${ago}` : ""}
        </p>
        <h3 className="text-sm font-medium leading-snug text-neutral-50 line-clamp-3">
          {item.title}
        </h3>
        {item.summary ? (
          <p className="text-xs leading-relaxed text-neutral-400 line-clamp-2">
            {item.summary}
          </p>
        ) : null}
      </div>
    </a>
  );
}

export default function NewsSection({
  initialNews,
  initialWeather,
  regionLabel,
}: {
  initialNews: NewsItem[];
  initialWeather: WeatherView | null;
  regionLabel: string;
}) {
  const [active, setActive] = useState<NewsCategory>("top");
  const [byCategory, setByCategory] = useState<
    Partial<Record<NewsCategory, NewsItem[]>>
  >({ top: initialNews });
  const [loading, setLoading] = useState<NewsCategory | null>(null);
  const [weather, setWeather] = useState<WeatherView | null>(initialWeather);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  // Categories already fetched in this mount (Top arrives with the
  // page). The background prefetcher and the tab lazy-loader share
  // this set so a category is never fetched twice; only the 5-minute
  // refresh forces a re-fetch.
  const fetchedRef = useRef<Set<NewsCategory>>(new Set(["top"]));

  async function loadCategory(
    cat: NewsCategory,
    force = false,
  ): Promise<void> {
    if (!force && fetchedRef.current.has(cat)) return;
    fetchedRef.current.add(cat);
    setLoading(cat);
    try {
      const items = await getNewsAction(cat);
      setByCategory((prev) => ({ ...prev, [cat]: items }));
    } catch {
      setByCategory((prev) => ({ ...prev, [cat]: prev[cat] ?? [] }));
    } finally {
      setLoading((current) => (current === cat ? null : current));
    }
  }

  async function refreshLive(cat: NewsCategory): Promise<void> {
    await loadCategory(cat, true);
    try {
      const fresh = await getWeatherAction();
      if (fresh) setWeather(fresh);
    } catch {
      // Keep the last good weather card.
    }
    setUpdatedAt(new Date());
  }

  // The initial data was fetched with the page — stamp it on mount.
  useEffect(() => {
    setUpdatedAt(new Date());
  }, []);

  // Lazy-load a tab the first time it is opened.
  useEffect(() => {
    if (byCategory[active] === undefined && loading !== active) {
      void loadCategory(active);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Warmth: shortly after first paint, prefetch the remaining
  // categories one by one in the background. A cold category costs
  // real seconds server-side (feed fetch + photo fallback), but the
  // result rides the 10-minute server cache — so warming it here
  // makes later tab switches feel instant instead of paying the cold
  // cost on tap. Sequential + idle-scheduled to stay out of the way
  // of the first paint and the chirp feed below.
  useEffect(() => {
    let cancelled = false;
    const warm = async (): Promise<void> => {
      for (const tab of TABS) {
        if (cancelled) return;
        if (tab.key === "top") continue;
        await loadCategory(tab.key);
      }
    };
    const start = (): void => {
      if (!cancelled) void warm();
    };
    let idleId: number | undefined;
    let timer: number | undefined;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(start, { timeout: 2500 });
    } else {
      timer = window.setTimeout(start, 1500);
    }
    return () => {
      cancelled = true;
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh the open tab + weather every 5 minutes; keep the
  // time-ago labels honest every minute.
  useEffect(() => {
    const refresh = setInterval(() => {
      void refreshLive(active);
    }, 5 * 60_000);
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const items = byCategory[active];
  const activeLabel = TABS.find((tab) => tab.key === active)?.label ?? "";

  return (
    <section className="flex flex-col gap-3" aria-label="Live news">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-100">
          Live News
        </h2>
        <span className="ml-auto text-[11px] text-neutral-500">
          {updatedAt
            ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Live"}
        </span>
      </div>

      {weather ? (
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-100">
              {weather.placeLabel}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              {weather.conditionLabel} · Humidity {weather.humidityPercent}% ·
              Wind {weather.windKmh} km/h
            </p>
          </div>
          <p className="shrink-0 text-3xl font-semibold text-neutral-50">
            {weather.temperatureC}°
            <span className="text-base text-neutral-400">C</span>
          </p>
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={
              active === tab.key
                ? "shrink-0 rounded-full border border-white bg-white px-3.5 py-1.5 text-xs font-medium text-black"
                : "shrink-0 rounded-full border border-neutral-700 px-3.5 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-900"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "regional" ? (
        <p className="-mt-1 text-[11px] text-neutral-500">
          News for {regionLabel}
        </p>
      ) : null}

      {items === undefined || loading === active ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          Loading news…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-3xl border border-neutral-800 bg-neutral-950 p-4 text-center text-sm text-neutral-500">
          News unavailable right now — check back in a bit.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <NewsCard
              key={item.link}
              item={item}
              category={active}
              categoryLabel={activeLabel}
              now={now}
            />
          ))}
        </div>
      )}
    </section>
  );
}
