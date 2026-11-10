// Live news + weather for the Chirp "Live" block — SERVER SIDE ONLY.
//
// Sources are free and keyless: publisher RSS feeds for headlines,
// Open-Meteo for weather, and Wikimedia Commons → Openverse for a
// topical photo when a feed item carries no image of its own. Every
// read fails soft: a dead feed yields an empty list or a placeholder
// tile, never a crashed page.
//
// Feeds were verified by hand on 2026-11-10 (items + image presence +
// freshness) — see BUILD_NOTES.md. PIB was dropped (its RSS is
// Hindi-only with no dates, descriptions or photos) and NDTV /
// Gadgets 360 return 403 to server fetches, so national news is
// The Hindu National + Indian Express India.

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

// Image hunt, in order: media:content → media:thumbnail → image
// enclosure → first <img> inside the description HTML.
function extractImage(block: string, rawDescription: string | null): string | null {
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
  if (rawDescription) {
    const img = rawDescription.match(/<img\b[^>]*>/i);
    if (img) {
      const src = attrOf(img[0], "src");
      if (src) return src;
    }
  }
  return null;
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
      imageUrl: normaliseImageUrl(extractImage(block, rawDescription)),
    });
  }
  return items;
}

async function fetchFeed(def: FeedDef): Promise<NewsItem[]> {
  try {
    const res = await fetch(def.url, {
      headers: {
        "User-Agent":
          "OneUco/1.0 (+https://one-university-community.vercel.app)",
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

// Image URLs are normalised to https at the point they enter an item:
// some sources (and older feed items) still hand out http:// URLs,
// which an https page cannot load at all (mixed content). Protocol-
// relative //host URLs get https too. Applied to feed images in the
// parser and to fallback results alike.
function normaliseImageUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://")) return "https://" + trimmed.slice(7);
  if (trimmed.startsWith("//")) return "https:" + trimmed;
  return trimmed;
}

// ── Photo fallback (Wikimedia Commons → Openverse) ──────────────────
// For items whose feed gave no image. Runs inside getNews, so the
// lookups ride the same 10-minute fetch cache as the feeds themselves
// and happen at most once per category per cache window — never per
// page view.
//
// ORDER + TIMING (measured 2026-11-10, see BUILD_NOTES perf addendum):
// Commons answers in ~1s; Openverse took 8.6s to a 504 from the build
// sandbox and 13.4s for a single call in production, where it ran
// FIRST and serially per item — that wait was the 20–25s cold tab
// load. So: Commons first, Openverse second, every lookup capped by a
// hard 3s timeout, lookups for a category run in parallel with a
// small concurrency cap, and only the first 8 items of a category are
// eligible. A timeout/failure degrades that one card to its gradient
// tile — it can never stall the category response.

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

const FALLBACK_TIMEOUT_MS = 3000;

async function openverseImage(query: string): Promise<string | null> {
  try {
    const url =
      "https://api.openverse.org/v1/images/?q=" +
      encodeURIComponent(query) +
      "&license_type=all&size=medium&page_size=1";
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: { url?: string; thumbnail?: string }[];
    };
    const first = json.results?.[0];
    if (!first) return null;
    // Prefer `thumbnail`: Openverse serves it from its own CDN for
    // embedding. `url` (the original host) is the fallback — its
    // hotlink reliability could not be verified from the build sandbox
    // (the API itself 504s through the sandbox proxy; see BUILD_NOTES).
    return first.thumbnail ?? first.url ?? null;
  } catch {
    return null;
  }
}

async function commonsImage(query: string): Promise<string | null> {
  try {
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
      `&gsrsearch=${encodeURIComponent(query)}` +
      "&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json";
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "OneUco/1.0 (+https://one-university-community.vercel.app)",
        Accept: "application/json",
      },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
    });
    if (!res.ok) return null;
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

const FALLBACK_CONCURRENCY = 4;
const FALLBACK_ITEM_LIMIT = 8;

async function fillMissingImages(items: NewsItem[]): Promise<void> {
  // Only the first FALLBACK_ITEM_LIMIT items of the category are
  // eligible; of those, only the ones the feed left imageless.
  const missing = items
    .slice(0, FALLBACK_ITEM_LIMIT)
    .filter((item) => !item.imageUrl);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < missing.length) {
      const item = missing[next];
      next += 1;
      const query = photoQuery(item.title);
      if (!query) continue;
      // Commons first (fast, reliable), Openverse second — each with
      // its own hard timeout inside the lookup helpers.
      item.imageUrl = normaliseImageUrl(
        (await commonsImage(query)) ?? (await openverseImage(query)),
      );
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(FALLBACK_CONCURRENCY, missing.length) },
      () => worker(),
    ),
  );
}

// ── Public reads ─────────────────────────────────────────────────────

export async function getNews(
  category: NewsCategory,
  region: RegionDef,
): Promise<NewsItem[]> {
  const defs =
    category === "regional" ? region.feeds : CATEGORY_FEEDS[category];
  const lists = await Promise.all(defs.map(fetchFeed));
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const merged: NewsItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      const linkKey = item.link.split(/[?#]/)[0].replace(/\/$/, "");
      const titleKey = item.title.toLowerCase();
      if (seenLinks.has(linkKey) || seenTitles.has(titleKey)) continue;
      seenLinks.add(linkKey);
      seenTitles.add(titleKey);
      merged.push(item);
    }
  }
  merged.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });
  const page = merged.slice(0, 12);
  await fillMissingImages(page);
  return page;
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
    const res = await fetch(url, { next: { revalidate: 600 } });
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
