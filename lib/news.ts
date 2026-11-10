// Live news + weather for the Chirp "Live" block — SERVER SIDE ONLY.
//
// Sources are free and keyless: publisher RSS feeds for headlines,
// Open-Meteo for weather, and a fallback chain (Wikimedia Commons →
// the article's own og:image → Openverse) for a photo when a feed
// item carries no image of its own. Every read fails soft: a dead
// feed yields an empty list or a placeholder tile, never a crashed
// page.
//
// Feeds were verified by hand on 2026-11-10 (items + image presence +
// freshness) — see BUILD_NOTES.md. PIB was dropped (its RSS is
// Hindi-only with no dates, descriptions or photos) and NDTV /
// Gadgets 360 return 403 to server fetches, so national news is
// The Hindu National + Indian Express India.

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountRow } from "@/lib/auth/account";

export type NewsCategory =
  | "top"
  | "national"
  | "regional"
  | "tech"
  | "sports"
  | "celebs";

export const NEWS_CATEGORIES: NewsCategory[] = [
  "top",
  "national",
  "regional",
  "tech",
  "sports",
  "celebs",
];

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null; // ISO string; feeds occasionally omit dates
  summary: string | null;
  imageUrl: string | null;
}

export interface WeatherView {
  placeLabel: string;
  temperatureC: number;
  conditionLabel: string;
  humidityPercent: number;
  windKmh: number;
}

interface FeedDef {
  url: string;
  source: string;
}

// ── Regions ──────────────────────────────────────────────────────────
// A region is one "place" for Regional news + weather: a Hindu city
// feeder (or a state feeder) plus the coordinates Open-Meteo needs.

export interface RegionDef {
  key: string;
  label: string;
  feeds: FeedDef[];
  latitude: number;
  longitude: number;
  /** Normalised city names (college_codes.city, free text) → this region. */
  cityAliases: string[];
  /** Substrings matched against the college name as a last resort. */
  keywords: string[];
}

const hinduCity = (path: string): FeedDef => ({
  url: `https://www.thehindu.com/news/cities/${path}/feeder/default.rss`,
  source: "The Hindu",
});

export const REGIONS: RegionDef[] = [
  {
    key: "hyderabad",
    label: "Hyderabad",
    feeds: [hinduCity("Hyderabad")],
    latitude: 17.385,
    longitude: 78.4867,
    cityAliases: ["hyderabad", "secunderabad"],
    keywords: ["hyderabad", "secunderabad"],
  },
  {
    key: "chennai",
    label: "Chennai",
    feeds: [hinduCity("chennai")],
    latitude: 13.0827,
    longitude: 80.2707,
    cityAliases: ["chennai", "madras"],
    keywords: ["chennai"],
  },
  {
    key: "bengaluru",
    label: "Bengaluru",
    feeds: [hinduCity("bangalore")],
    latitude: 12.9716,
    longitude: 77.5946,
    cityAliases: ["bengaluru", "bangalore"],
    keywords: ["bengaluru", "bangalore"],
  },
  {
    key: "delhi",
    label: "Delhi",
    feeds: [hinduCity("Delhi")],
    latitude: 28.6139,
    longitude: 77.209,
    cityAliases: ["delhi", "new delhi"],
    keywords: ["delhi"],
  },
  {
    key: "mumbai",
    label: "Mumbai",
    feeds: [hinduCity("mumbai")],
    latitude: 19.076,
    longitude: 72.8777,
    cityAliases: ["mumbai", "bombay"],
    keywords: ["mumbai"],
  },
  {
    key: "kolkata",
    label: "Kolkata",
    feeds: [hinduCity("Kolkata")],
    latitude: 22.5726,
    longitude: 88.3639,
    cityAliases: ["kolkata", "calcutta"],
    keywords: ["kolkata"],
  },
  {
    key: "kochi",
    label: "Kochi",
    feeds: [hinduCity("Kochi")],
    latitude: 9.9312,
    longitude: 76.2673,
    cityAliases: ["kochi", "cochin", "ernakulam"],
    keywords: ["kochi", "cochin", "ernakulam"],
  },
  {
    key: "thiruvananthapuram",
    label: "Thiruvananthapuram",
    feeds: [hinduCity("Thiruvananthapuram")],
    latitude: 8.5241,
    longitude: 76.9366,
    cityAliases: ["thiruvananthapuram", "trivandrum"],
    keywords: ["thiruvananthapuram", "trivandrum"],
  },
  {
    key: "vijayawada",
    label: "Vijayawada",
    feeds: [hinduCity("Vijayawada")],
    latitude: 16.5062,
    longitude: 80.648,
    cityAliases: ["vijayawada"],
    keywords: ["vijayawada"],
  },
  {
    key: "andhra-pradesh",
    label: "Andhra Pradesh",
    feeds: [
      {
        url: "https://www.thehindu.com/news/national/andhra-pradesh/feeder/default.rss",
        source: "The Hindu",
      },
    ],
    latitude: 16.5062, // Vijayawada as the weather anchor for the state
    longitude: 80.648,
    cityAliases: [],
    keywords: ["andhra pradesh"],
  },
  {
    key: "telangana",
    label: "Telangana",
    feeds: [
      {
        url: "https://www.thehindu.com/news/national/telangana/feeder/default.rss",
        source: "The Hindu",
      },
    ],
    latitude: 17.385, // Hyderabad as the weather anchor for the state
    longitude: 78.4867,
    cityAliases: [],
    keywords: ["telangana"],
  },
];

// Unknown place: the audience is overwhelmingly AP + Telangana, so the
// default Regional tab merges both state feeders (labelled honestly)
// and the weather anchors on Hyderabad.
export const DEFAULT_REGION: RegionDef = {
  key: "ap-telangana",
  label: "Andhra Pradesh & Telangana",
  feeds: [
    {
      url: "https://www.thehindu.com/news/national/andhra-pradesh/feeder/default.rss",
      source: "The Hindu",
    },
    {
      url: "https://www.thehindu.com/news/national/telangana/feeder/default.rss",
      source: "The Hindu",
    },
  ],
  latitude: 17.385,
  longitude: 78.4867,
  cityAliases: [],
  keywords: [],
};

function regionForCity(city: string | null | undefined): RegionDef | null {
  if (!city) return null;
  const norm = city.trim().toLowerCase();
  if (!norm) return null;
  for (const region of REGIONS) {
    if (region.cityAliases.includes(norm)) return region;
  }
  return null;
}

// Resolve the signed-in student's place. The accounts row carries a
// self-declared college (name + JNTUH-style code); the college_codes
// registry knows each college's city. Order: registry city via the
// code → registry city via the exact college name → keyword match on
// the college name → the AP & Telangana default. Never throws.
export async function resolveRegionForAccount(
  supabase: SupabaseClient,
  account: AccountRow,
): Promise<RegionDef> {
  try {
    if (account.college_code) {
      const { data } = await supabase
        .from("college_codes")
        .select("city")
        .eq("code", account.college_code)
        .maybeSingle();
      const region = regionForCity(data?.city);
      if (region) return region;
    }
    if (account.college_name) {
      const { data } = await supabase
        .from("college_codes")
        .select("city")
        .eq("college_name", account.college_name)
        .maybeSingle();
      const region = regionForCity(data?.city);
      if (region) return region;
      const name = account.college_name.toLowerCase();
      for (const region of REGIONS) {
        if (
          region.keywords.some((k) => name.includes(k)) ||
          region.cityAliases.some((a) => name.includes(a))
        ) {
          return region;
        }
      }
    }
  } catch {
    // Region is a nicety — fall through to the default.
  }
  return DEFAULT_REGION;
}

// ── Category feeds ───────────────────────────────────────────────────

const CATEGORY_FEEDS: Record<Exclude<NewsCategory, "regional">, FeedDef[]> = {
  top: [
    { url: "https://www.thehindu.com/feeder/default.rss", source: "The Hindu" },
    { url: "https://indianexpress.com/section/india/feed/", source: "Indian Express" },
  ],
  national: [
    {
      url: "https://www.thehindu.com/news/national/feeder/default.rss",
      source: "The Hindu",
    },
    { url: "https://indianexpress.com/section/india/feed/", source: "Indian Express" },
  ],
  tech: [
    { url: "https://www.thehindu.com/sci-tech/feeder/default.rss", source: "The Hindu" },
    {
      url: "https://indianexpress.com/section/technology/feed/",
      source: "Indian Express",
    },
  ],
  sports: [
    { url: "https://www.thehindu.com/sport/feeder/default.rss", source: "The Hindu" },
    {
      url: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml",
      source: "ESPNcricinfo",
    },
  ],
  celebs: [
    {
      url: "https://indianexpress.com/section/entertainment/feed/",
      source: "Indian Express",
    },
    {
      url: "https://www.bollywoodhungama.com/rss/news.xml",
      source: "Bollywood Hungama",
    },
  ],
};

// Every upstream fetch (RSS, Commons, Openverse, Open-Meteo) sends
// this descriptive User-Agent. Wikimedia's robot policy answers 403
// to a missing UA (verified by curl: empty UA → 403 "Please set a
// user-agent…", any set UA → 200), and Openverse throttles anonymous
// UA-less traffic hardest — so the header is set on ALL of them.
const UPSTREAM_UA =
  "OneUcoBot/1.0 (+https://one-university-community.vercel.app)";

// ── RSS parsing (defensive, regex-based, no parser dependency) ──────

function stripCdata(xml: string): string {
  return xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function cleanText(raw: string | null): string {
  if (!raw) return "";
  return decodeEntities(raw.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tagText(block: string, tag: string): string | null {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return match ? match[1] : null;
}

function attrOf(tagHtml: string, attr: string): string | null {
  // Both quote styles: Bollywood Hungama emits url='…' with singles.
  const match = tagHtml.match(
    new RegExp(`\\b${attr}=(?:"([^"]+)"|'([^']+)')`, "i"),
  );
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2]);
}

// First <img src> in an HTML fragment (description / content:encoded).
function firstImgSrc(html: string | null): string | null {
  if (!html) return null;
  const img = html.match(/<img\b[^>]*>/i);
  if (!img) return null;
  return attrOf(img[0], "src");
}

// Image hunt, in order: media:content → media:thumbnail → image
// enclosure → first <img> inside the description HTML → first <img>
// inside content:encoded. The media:* regexes scan the whole item
// block, so a media:content nested in a <media:group> is found too.
// content:encoded is scanned last for ALL feeds: WordPress feeds
// (Indian Express) carry the story photo in its <figure><img> even
// when the media tags point elsewhere, and some feeds only have it
// there. Verified against the live front/sport/IE feeds: The Hindu
// front + sport carry images ONLY as self-closing media:content
// (51/60 and 44/60 items; no media:group, no content:encoded, no
// description <img>), IE carries media:content + media:thumbnail +
// content:encoded on every item.
function extractImage(
  block: string,
  rawDescription: string | null,
  rawEncoded: string | null,
): string | null {
  const mediaContent = block.match(/<media:content\b[^>]*>/i);
  if (mediaContent) {
    const url = attrOf(mediaContent[0], "url");
    if (url) return url;
  }
  const mediaThumb = block.match(/<media:thumbnail\b[^>]*>/i);
  if (mediaThumb) {
    const url = attrOf(mediaThumb[0], "url");
    if (url) return url;
  }
  const enclosure = block.match(/<enclosure\b[^>]*>/i);
  if (enclosure) {
    const type = attrOf(enclosure[0], "type") ?? "";
    const url = attrOf(enclosure[0], "url");
    if (url && (type.startsWith("image") || /\.(jpe?g|png|webp)(\?|$)/i.test(url))) {
      return url;
    }
  }
  return firstImgSrc(rawDescription) ?? firstImgSrc(rawEncoded);
}

function parseRss(xml: string, source: string): NewsItem[] {
  const body = stripCdata(xml);
  const items: NewsItem[] = [];
  const blocks = body.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = cleanText(tagText(block, "title"));
    const link = cleanText(tagText(block, "link"));
    if (!title || !link) continue;
    const rawDescription = tagText(block, "description");
    const rawEncoded = tagText(block, "content:encoded");
    const summaryText = cleanText(rawDescription);
    const dateRaw =
      cleanText(tagText(block, "pubDate")) || cleanText(tagText(block, "dc:date"));
    let publishedAt: string | null = null;
    if (dateRaw) {
      const parsed = new Date(dateRaw);
      if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
    }
    items.push({
      title,
      link,
      source,
      publishedAt,
      summary:
        summaryText.length > 0
          ? summaryText.slice(0, 180) + (summaryText.length > 180 ? "…" : "")
          : null,
      imageUrl: normaliseImageUrl(
        extractImage(block, rawDescription, rawEncoded),
      ),
    });
  }
  return items;
}

async function fetchFeed(def: FeedDef): Promise<NewsItem[]> {
  try {
    const res = await fetch(def.url, {
      headers: {
        "User-Agent": UPSTREAM_UA,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    return parseRss(await res.text(), def.source);
  } catch {
    return [];
  }
}

// The Hindu's thgim CDN serves named alternates in the URL path
// (…/alternates/LANDSCAPE_1200/photo.jpg). Feeds and og:image tags
// almost always hand out the 1200 variant already (verified on the
// live front feed, 2026-11-10), but if a smaller one ever arrives,
// step it up to 1200 — a pure string transform on a documented URL
// pattern, thgim hosts only.
function preferLargestThgimVariant(url: string): string {
  if (!/thgim\.com/i.test(url)) return url;
  return url.replace(
    /\/(alternates\/(?:LANDSCAPE|PORTRAIT|SQUARE)_)(\d+)\//i,
    (match, prefix: string, size: string) =>
      Number(size) < 1200 ? `/${prefix}1200/` : match,
  );
}

// Image URLs are normalised to https at the point they enter an item:
// some sources (and older feed items) still hand out http:// URLs,
// which an https page cannot load at all (mixed content). Protocol-
// relative //host URLs get https too. Applied to feed images in the
// parser and to fallback results alike.
function normaliseImageUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  let out = trimmed;
  if (out.startsWith("http://")) out = "https://" + out.slice(7);
  if (out.startsWith("//")) out = "https:" + out;
  return preferLargestThgimVariant(out);
}

// ── Photo fallback (Commons → og:image → Openverse) ─────────────────
// For items whose feed gave no image. Runs inside getNews, so the
// lookups ride the same 10-minute cache as the feeds themselves and
// happen at most once per category per cache window — never per
// page view.
//
// ORDER + TIMING (measured 2026-11-10, see BUILD_NOTES addenda):
// Commons cold answers in ~0.6s and is the reliable first step.
// Openverse COLD is the trap: 5.6–6.3s to a 200 (usually an EMPTY
// result for these hyperlocal stories) from the build sandbox, 8.6s
// to a 504 in an earlier session and 13.4s for a single call in
// production — at the old 3s race cap it could essentially never
// answer a cold production computation, and when it ran FIRST and
// serially per item it was the 20–25s cold tab load. The article's
// own og:image answers in 0.26–0.87s and returns the story's REAL
// photo when one exists, so it runs second; Openverse (generic
// topical photo, slow cold) is the last resort. Every attempt is
// capped by a 5s race-timeout (see raceTimeout below for why it is a
// race and not an AbortSignal), each source gets ONE retry on
// timeout/failure (Commons hits for the same query were observed to
// vary between runs — a second attempt often lands), lookups run in
// parallel with a small concurrency cap across the whole 12-item
// page, and a 12s overall deadline bounds the chain so a cold
// getNews stays inside ~15s end to end. A timeout/failure degrades
// that one card to its gradient tile — it can never stall the
// category response.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been",
  "has", "have", "had", "will", "would", "can", "could", "should",
  "this", "that", "these", "those", "it", "its", "after", "before",
  "over", "under", "new", "says", "say", "said", "gets", "get", "got",
  "amid", "into", "out", "up", "down", "off", "about", "against",
]);

// Significant words from the headline: content words in order, first
// five — headlines lead with the subject (crucial for celeb names).
function photoQuery(title: string): string {
  const words = title
    .replace(/[^A-Za-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));
  return words.slice(0, 5).join(" ");
}

// Per-attempt cap. Raised 3s → 5s (2026-11-10 follow-up): cold
// Commons/Openverse calls from a fresh serverless instance regularly
// exceed 3s (Openverse cold measured 5.6–6.3s), so the 3s race was
// forfeiting winnable lookups in production while local runs — warm
// connections, warm caches — passed easily at ~0.15–0.6s.
const FALLBACK_TIMEOUT_MS = 5000;
// Overall budget for one fillMissingImages run (all items, all
// sources, retries included). Feed fetches land before this starts;
// 12s here keeps a fully cold getNews inside ~15s.
const FALLBACK_BUDGET_MS = 12000;

// Timeout by RACING, never by passing an AbortSignal into fetch.
// Production evidence (2026-11-10): the fallback chain returned
// nothing at all in production while the identical code filled
// 11–12/12 items locally under both Bun and Node — and the native
// feed images (fetched WITHOUT a signal) survived in production for
// ESPNcricinfo. The differing layer is Next.js's patched fetch: an
// externally created AbortSignal in the init takes the request off
// the normal Data Cache path and the signalled JSON lookups were
// the ones dying. Racing removes that interaction entirely: the
// caller stops waiting at the deadline while the underlying fetch
// settles in the background (and still populates the data cache).
async function raceTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function openverseImage(
  query: string,
  timeoutMs: number = FALLBACK_TIMEOUT_MS,
): Promise<string | null> {
  const url =
    "https://api.openverse.org/v1/images/?q=" +
    encodeURIComponent(query) +
    "&license_type=all&size=medium&page_size=1";
  const json = await raceTimeout(
    (async (): Promise<{
      results?: { url?: string; thumbnail?: string }[];
    } | null> => {
      const res = await fetch(url, {
        headers: { "User-Agent": UPSTREAM_UA, Accept: "application/json" },
        next: { revalidate: 600 },
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        results?: { url?: string; thumbnail?: string }[];
      };
    })(),
    timeoutMs,
  );
  const first = json?.results?.[0];
  if (!first) return null;
  // Prefer `thumbnail`: Openverse serves it from its own CDN for
  // embedding. `url` (the original host) is the fallback — its
  // hotlink reliability could not be verified from the build sandbox
  // (the API itself 504s through the sandbox proxy; see BUILD_NOTES).
  return first.thumbnail ?? first.url ?? null;
}

async function commonsImage(
  query: string,
  timeoutMs: number = FALLBACK_TIMEOUT_MS,
): Promise<string | null> {
  const res = await raceTimeout(
    fetch(
      "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
        `&gsrsearch=${encodeURIComponent(query)}` +
        "&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json",
      {
        headers: { "User-Agent": UPSTREAM_UA, Accept: "application/json" },
        next: { revalidate: 600 },
      },
    ),
    timeoutMs,
  );
  try {
    if (!res || !res.ok) return null;
    const json = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          { imageinfo?: { thumburl?: string; url?: string }[] }
        >;
      };
    };
    const pages = json.query?.pages;
    if (!pages) return null;
    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (info?.thumburl) return info.thumburl;
      if (info?.url) return info.url;
    }
    return null;
  } catch {
    return null;
  }
}

// The article's own og:image: when a story HAS a photo but its feed
// entry didn't carry it, the article page's social tag points at the
// real thing (verified on Hindu articles: og:image = the same thgim
// LANDSCAPE_1200 photo the feed uses elsewhere; article pages answer
// in 0.26–0.87s). The catch, also verified: a story with NO photo
// gets the publisher's generic placeholder (The Hindu serves
// www.thehindu.com/theme/images/og-image.png) — so a candidate is
// REJECTED when it sits on the article page's own host (placeholders
// and logos live there; real story photos live on image CDNs) or
// when its path smells like a placeholder. The whole fetch + parse
// rides inside the race so a slow article page can't overrun the
// attempt budget on body download.
const OG_PLACEHOLDER_RE = /(og[-_]?image|logo|placeholder|default[-_]?image)/i;

async function articleOgImage(
  item: NewsItem,
  timeoutMs: number = FALLBACK_TIMEOUT_MS,
): Promise<string | null> {
  let articleHost = "";
  try {
    articleHost = new URL(item.link).hostname;
  } catch {
    return null;
  }
  return raceTimeout(
    (async (): Promise<string | null> => {
      const res = await fetch(item.link, {
        headers: { "User-Agent": UPSTREAM_UA, Accept: "text/html" },
        next: { revalidate: 600 },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
      for (const tag of metaTags) {
        if (!/\bproperty\s*=\s*(?:"og:image"|'og:image')/i.test(tag)) {
          continue;
        }
        const candidate = normaliseImageUrl(attrOf(tag, "content"));
        if (!candidate || !candidate.startsWith("https://")) continue;
        let host = "";
        try {
          host = new URL(candidate).hostname;
        } catch {
          continue;
        }
        if (host === articleHost) continue;
        if (OG_PLACEHOLDER_RE.test(candidate)) continue;
        return candidate;
      }
      return null;
    })(),
    timeoutMs,
  );
}

// ── Yield instrumentation ────────────────────────────────────────────
// Per cold getNews computation, getNews logs ONE [news-yield] line:
// per-source item/native counts, how many page items depended on the
// fallback, and per-source tries/hits/timeouts. This is the permanent
// production probe for the server-side yield question — it runs at
// most once per category+region per 10 minutes (inside the shared
// cache), so it costs one log line per cold compute, never per view.

interface SourceTally {
  tries: number;
  hits: number;
  timeouts: number;
}

interface FallbackStats {
  attempted: number;
  filled: number;
  commons: SourceTally;
  ogimage: SourceTally;
  openverse: SourceTally;
}

function emptyTally(): SourceTally {
  return { tries: 0, hits: 0, timeouts: 0 };
}

function emptyFallbackStats(): FallbackStats {
  return {
    attempted: 0,
    filled: 0,
    commons: emptyTally(),
    ogimage: emptyTally(),
    openverse: emptyTally(),
  };
}

const FALLBACK_CONCURRENCY = 4;
// The whole rendered page is eligible (raised from 8): with the
// processed result shared through unstable_cache (see getNewsCached
// below), this cost is paid once per category per 10 minutes for ALL
// users, not per cold action call.
const FALLBACK_ITEM_LIMIT = 12;

// One source, up to two attempts (initial + one retry), bounded by
// both the per-attempt cap and the chain's overall deadline. A null
// result that consumed the whole attempt window counts as a timeout
// in the tally — that distinction is what the [news-yield] log exists
// to surface in production.
async function attemptSource(
  tally: SourceTally,
  deadline: number,
  lookup: (timeoutMs: number) => Promise<string | null>,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 250) return null;
    const cap = Math.min(FALLBACK_TIMEOUT_MS, remaining);
    tally.tries += 1;
    const started = Date.now();
    const result = await lookup(cap);
    if (result) {
      tally.hits += 1;
      return result;
    }
    if (Date.now() - started >= cap - 50) tally.timeouts += 1;
  }
  return null;
}

async function fillMissingImages(items: NewsItem[]): Promise<FallbackStats> {
  const stats = emptyFallbackStats();
  // Only the first FALLBACK_ITEM_LIMIT items of the category are
  // eligible; of those, only the ones the feed left imageless.
  const missing = items
    .slice(0, FALLBACK_ITEM_LIMIT)
    .filter((item) => !item.imageUrl);
  stats.attempted = missing.length;
  if (missing.length === 0) return stats;
  const deadline = Date.now() + FALLBACK_BUDGET_MS;
  let next = 0;
  async function worker(): Promise<void> {
    while (next < missing.length) {
      const item = missing[next];
      next += 1;
      const query = photoQuery(item.title);
      if (!query) continue;
      // Commons (fast, reliable) → the article's own og:image (the
      // story's real photo when it exists) → Openverse (generic,
      // slow when cold) — each with its own raced attempt budget
      // and one retry, all inside the overall deadline.
      const found =
        (await attemptSource(stats.commons, deadline, (ms) =>
          commonsImage(query, ms),
        )) ??
        (await attemptSource(stats.ogimage, deadline, (ms) =>
          articleOgImage(item, ms),
        )) ??
        (await attemptSource(stats.openverse, deadline, (ms) =>
          openverseImage(query, ms),
        ));
      if (found) {
        item.imageUrl = normaliseImageUrl(found);
        stats.filled += 1;
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(FALLBACK_CONCURRENCY, missing.length) },
      () => worker(),
    ),
  );
  return stats;
}

// ── Public reads ─────────────────────────────────────────────────────

export async function getNews(
  category: NewsCategory,
  region: RegionDef,
): Promise<NewsItem[]> {
  const startedAt = Date.now();
  const defs =
    category === "regional" ? region.feeds : CATEGORY_FEEDS[category];
  const lists = await Promise.all(defs.map(fetchFeed));
  const byLink = new Map<string, NewsItem>();
  const byTitle = new Map<string, NewsItem>();
  const merged: NewsItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      const linkKey = item.link.split(/[?#]/)[0].replace(/\/$/, "");
      const titleKey = item.title.toLowerCase();
      const kept = byLink.get(linkKey) ?? byTitle.get(titleKey);
      if (kept) {
        // Duplicate story: the first copy wins, but if it is the
        // imageless one, adopt the duplicate's photo rather than
        // sending the kept copy to the fallback chain (or the tile).
        // (Measured on the live feeds: title collisions between The
        // Hindu front and IE India are currently zero, so this is
        // insurance, not the Top-Stories fix.)
        if (!kept.imageUrl && item.imageUrl) kept.imageUrl = item.imageUrl;
        continue;
      }
      byLink.set(linkKey, item);
      byTitle.set(titleKey, item);
      merged.push(item);
    }
  }
  merged.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });
  const page = merged.slice(0, 12);
  const pageNative = page.filter((item) => item.imageUrl).length;
  const fallback = await fillMissingImages(page);
  // One [news-yield] line per cold computation (see the tally types
  // above). Guarded: a logging failure must never fail the read.
  try {
    const sources = defs
      .map((def, i) => {
        const list = lists[i] ?? [];
        const native = list.filter((item) => item.imageUrl).length;
        return `${def.source}:${list.length} items/${native} native`;
      })
      .join(" · ");
    const tally = (t: SourceTally): string =>
      `tries=${t.tries} hits=${t.hits} timeouts=${t.timeouts}`;
    const finalCount = page.filter((item) => item.imageUrl).length;
    console.info(
      `[news-yield] category=${category} region=${region.key} ` +
        `sources=[${sources}] merged=${merged.length} ` +
        `pageNative=${pageNative}/${page.length} ` +
        `fallback attempted=${fallback.attempted} filled=${fallback.filled} ` +
        `commons[${tally(fallback.commons)}] ` +
        `ogimage[${tally(fallback.ogimage)}] ` +
        `openverse[${tally(fallback.openverse)}] ` +
        `final=${finalCount}/${page.length} ` +
        `computeMs=${Date.now() - startedAt}`,
    );
  } catch {
    // Instrumentation is best-effort only.
  }
  return page;
}

// ── Shared processed-result cache ────────────────────────────────────
// The fetch-level `next: { revalidate: 600 }` above caches upstream
// BYTES, but the parse + merge + photo-fallback work in getNews still
// repeated on every cold action call (every user's tab switch after
// the fetch cache expired paid it). These wrappers cache the
// PROCESSED result per (category, region) for 600s via
// unstable_cache, so one computation serves every user for 10
// minutes. Keyed by region KEY (a string) — the RegionDef itself is
// re-resolved inside, keeping the cache key small and stable.
// Fail-soft is unchanged: getNews/getWeather already degrade to
// [] / null instead of throwing.

export function regionByKey(key: string): RegionDef {
  if (key === DEFAULT_REGION.key) return DEFAULT_REGION;
  return REGIONS.find((r) => r.key === key) ?? DEFAULT_REGION;
}

const getNewsShared = unstable_cache(
  async (category: NewsCategory, regionKey: string): Promise<NewsItem[]> =>
    getNews(category, regionByKey(regionKey)),
  ["oneuco-news-v1"],
  { revalidate: 600, tags: ["news"] },
);

export function getNewsCached(
  category: NewsCategory,
  region: RegionDef,
): Promise<NewsItem[]> {
  return getNewsShared(category, region.key);
}

const getWeatherShared = unstable_cache(
  async (regionKey: string): Promise<WeatherView | null> =>
    getWeather(regionByKey(regionKey)),
  ["oneuco-weather-v1"],
  { revalidate: 600, tags: ["news-weather"] },
);

export function getWeatherCached(region: RegionDef): Promise<WeatherView | null> {
  return getWeatherShared(region.key);
}

const WMO_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

export async function getWeather(
  region: RegionDef,
): Promise<WeatherView | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${region.latitude}` +
      `&longitude=${region.longitude}` +
      "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto";
    const res = await fetch(url, {
      headers: { "User-Agent": UPSTREAM_UA },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };
    const current = json.current;
    if (!current || typeof current.temperature_2m !== "number") return null;
    return {
      placeLabel: region.label,
      temperatureC: Math.round(current.temperature_2m),
      conditionLabel:
        typeof current.weather_code === "number"
          ? (WMO_LABELS[current.weather_code] ?? "—")
          : "—",
      humidityPercent:
        typeof current.relative_humidity_2m === "number"
          ? Math.round(current.relative_humidity_2m)
          : 0,
      windKmh:
        typeof current.wind_speed_10m === "number"
          ? Math.round(current.wind_speed_10m)
          : 0,
    };
  } catch {
    return null;
  }
}
