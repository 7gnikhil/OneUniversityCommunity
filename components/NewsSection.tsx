"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NewsCategory, NewsItem, WeatherView } from "@/lib/news";
import { getNewsAction, getWeatherAction } from "@/app/chirp/actions";

// The Live News page body (/chirp/news): the student's local weather
// + live news with photos (Top / National / Regional / Tech / Sports /
// Celebs). This used to be a collapsible block on /chirp; the owner
// moved it to its own page — the /chirp hub keeps only a slim teaser
// card, and this component is the full experience, always open.
// Initial Top news + weather arrive server-rendered from the page;
// category switches and the 5-minute auto-refresh go through the
// chirp server actions. Everything fails soft — a dead feed shows a
// gentle empty state, a dead photo shows a category tile.
//
// Data behaviour is unchanged from the block era: categories lazy-
// load on first view and are never fetched twice per mount, the
// remaining categories prefetch in the background once the page is
// open (landing here IS the open intent), and the open category +
// weather auto-refresh every 5 minutes. The stories block ANIMATES
// in — the same grid-template-rows 0fr→1fr + opacity technique as
// the settings dropdowns, re-keyed per category so a switch replays
// the reveal. The category is chosen from a native <select>
// (reliable on phones, accessible).

const CATEGORY_OPTIONS: { key: NewsCategory; label: string }[] = [
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

function Chevron() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-neutral-400"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// The stories block's reveal: mounts closed, flips open on the next
// frame so the grid-rows + opacity transition actually runs. The
// parent keys this by category, so every switch remounts and
// replays the animation.
function AnimatedStories({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<boolean>(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
        shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
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
          width={800}
          height={450}
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
  // page). The background prefetcher and the category lazy-loader
  // share this set so a category is never fetched twice; only the
  // 5-minute refresh forces a re-fetch.
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

  // Lazy-load the selected category the first time it is shown.
  useEffect(() => {
    if (byCategory[active] === undefined && loading !== active) {
      void loadCategory(active);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Warmth: on mount, prefetch the remaining categories one by one
  // in the background (idle-scheduled, sequential). A cold category
  // costs real seconds server-side, but the result rides the shared
  // 10-minute server cache — warming it here makes later switches
  // feel instant instead of paying the cold cost on tap. (In the
  // block era this waited for the first panel open; the page being
  // open at all is that intent now.)
  useEffect(() => {
    let cancelled = false;
    const warm = async (): Promise<void> => {
      for (const option of CATEGORY_OPTIONS) {
        if (cancelled) return;
        if (option.key === "top") continue;
        await loadCategory(option.key);
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

  // Auto-refresh the open category + weather every 5 minutes, and
  // keep the time-ago labels honest every minute.
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
  const activeLabel =
    CATEGORY_OPTIONS.find((option) => option.key === active)?.label ?? "";

  return (
    <section className="flex flex-col gap-3" aria-label="Live news">
      {/* The header bar — the slim bar from the block era, now a
          static page header: LIVE dot, the weather chip, the
          updated stamp and the native category dropdown. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-100">
            Live News
          </span>
          {weather ? (
            <span className="truncate text-xs text-neutral-400">
              {weather.placeLabel} · {weather.temperatureC}°C ·{" "}
              {weather.conditionLabel}
            </span>
          ) : null}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-neutral-500 sm:inline">
            {updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Live"}
          </span>
          <label className="sr-only" htmlFor="news-category-select">
            Category
          </label>
          <span className="relative inline-flex">
            <select
              id="news-category-select"
              aria-label="News category"
              value={active}
              onChange={(event) =>
                setActive(event.target.value as NewsCategory)
              }
              className="appearance-none rounded-full border border-neutral-700 bg-neutral-900 py-1.5 pl-3.5 pr-8 text-xs font-medium text-neutral-100 transition hover:border-neutral-500 focus:border-neutral-400 focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
              <Chevron />
            </span>
          </span>
        </span>
      </div>

      {/* The weather header card. */}
      {weather ? (
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-100">
              {weather.placeLabel}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              {weather.conditionLabel} · Humidity{" "}
              {weather.humidityPercent}% · Wind {weather.windKmh}{" "}
              km/h
            </p>
          </div>
          <p className="shrink-0 text-3xl font-semibold text-neutral-50">
            {weather.temperatureC}°
            <span className="text-base text-neutral-400">C</span>
          </p>
        </div>
      ) : null}

      {/* The stories, animated in per category (the reveal replays
          on every switch via the key). */}
      <AnimatedStories key={active}>
        <div className="flex flex-col gap-3">
          {active === "regional" ? (
            <p className="text-[11px] text-neutral-500">
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
        </div>
      </AnimatedStories>
    </section>
  );
}
