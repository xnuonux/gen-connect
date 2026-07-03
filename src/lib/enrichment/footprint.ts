// the public-footprint resolver ... the "find the person, not just the email"
// wedge, built on the COMPLIANT path. it resolves an email into the social + web
// profiles a person has PUBLICLY and intentionally published about themselves,
// using only official/open apis:
//   - gravatar v3 (email-keyed by design ... the person opted in + verified each
//     linked account on their own profile, so even a linkedin url here is one they
//     self-published, never scraped)
//   - github public profile + the official /social_accounts endpoint (their own
//     linked socials + personal site)
// no walled-garden scraping, no data-broker vendor, no cost. see
// docs/07-identity-unibox-scoping.md for why this is the legal door, not the
// proxycurl/linkedin-scraping graveyard.

export type FootprintLink = {
  // normalized: x | linkedin | github | instagram | mastodon | bluesky | website | ...
  platform: string;
  url: string;
  handle?: string;
  // true when the person verified this account on their own gravatar profile.
  verified: boolean;
  source: "gravatar" | "github" | "site";
};

export type Footprint = {
  name?: string;
  bio?: string;
  avatarUrl?: string;
  location?: string;
  jobTitle?: string;
  company?: string;
  website?: string;
  links: FootprintLink[];
  // which resolvers actually contributed, e.g. ["gravatar","github"].
  sources: string[];
};

// summarize a persisted footprint (gc_contacts.enrichment_data.footprint) into a
// one-line RELATIONSHIP CONTEXT string for the 5-angle drafter. this is what turns the
// person-graph from inert enrichment into the wedge: the drafter can open on a real
// channel the prospect actually runs, not a guess. everything here is FACTUAL resolved
// data (verified handles, their own bio/site), so it never trips the drafter's
// no-fabrication line. returns null when there's nothing real to say. pure, no io.
export function summarizeFootprintForDraft(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const fp = raw as Partial<Footprint>;
  const bits: string[] = [];

  const links = Array.isArray(fp.links) ? fp.links : [];
  const channels = links
    .filter(
      (l): l is FootprintLink =>
        !!l && typeof l === "object" && typeof l.platform === "string",
    )
    .slice(0, 6)
    .map((l) => {
      const handle = l.handle ? ` @${l.handle}` : "";
      const verified = l.verified ? " (verified)" : "";
      return `${l.platform}${handle}${verified}`;
    });
  if (channels.length) bits.push(`public channels: ${channels.join(", ")}`);
  if (typeof fp.bio === "string" && fp.bio.trim()) {
    bits.push(`their bio: ${fp.bio.trim().slice(0, 220)}`);
  }
  if (typeof fp.website === "string" && fp.website.trim()) {
    bits.push(`personal site: ${fp.website.trim()}`);
  }
  if (typeof fp.location === "string" && fp.location.trim()) {
    bits.push(`based in: ${fp.location.trim()}`);
  }

  return bits.length ? bits.join(" · ") : null;
}

export type FootprintInput = {
  email?: string | null;
  // an explicit github handle short-circuits discovery (e.g. from a prior run).
  githubUsername?: string | null;
  // the email's domain (or a known company domain). when there's no personal
  // site, we crawl this homepage for the socials a typical business lead lists
  // there ... the lever that un-sparses non-dev contacts. freemail is skipped.
  domain?: string | null;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

// gravatar's service_type / github's provider both use "twitter" for x. fold
// them to one canonical platform so the link graph doesn't double-count.
function normPlatform(p?: string): string {
  const k = (p ?? "").toLowerCase().trim();
  if (k === "twitter" || k === "x") return "x";
  return k || "link";
}

// github's blog field is sometimes a bare domain ... give it a scheme so it's a
// real link.
function normUrl(u?: string): string | undefined {
  const s = str(u);
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

// best-effort GET that never throws: a 404 (no profile) or 403 (rate-limited)
// just resolves to null so the resolver degrades to whatever else it found.
async function getJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 8000,
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "gen-connect-footprint", ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type GravatarV3 = {
  display_name?: unknown;
  description?: unknown;
  avatar_url?: unknown;
  location?: unknown;
  job_title?: unknown;
  company?: unknown;
  verified_accounts?: unknown;
};

// gravatar v3 is keyed by the sha256 of the lowercased, trimmed email. unauthed,
// public profiles only ... exactly the self-published data we want.
async function fromGravatar(
  email: string,
): Promise<{ profile: Partial<Footprint>; links: FootprintLink[] } | null> {
  const hash = await sha256Hex(email.trim().toLowerCase());
  const data = (await getJson(
    `https://api.gravatar.com/v3/profiles/${hash}`,
  )) as GravatarV3 | null;
  if (!data) return null;

  const accounts = Array.isArray(data.verified_accounts)
    ? (data.verified_accounts as Record<string, unknown>[])
    : [];
  const links: FootprintLink[] = [];
  for (const a of accounts) {
    if (a.is_hidden === true) continue;
    const url = str(a.url);
    if (!url) continue;
    links.push({
      platform: normPlatform(str(a.service_type)),
      url,
      verified: true,
      source: "gravatar",
    });
  }

  return {
    profile: {
      name: str(data.display_name),
      bio: str(data.description),
      avatarUrl: str(data.avatar_url),
      location: str(data.location),
      jobTitle: str(data.job_title),
      company: str(data.company),
    },
    links,
  };
}

type GitHubUser = {
  name?: unknown;
  bio?: unknown;
  avatar_url?: unknown;
  location?: unknown;
  company?: unknown;
  blog?: unknown;
  html_url?: unknown;
  twitter_username?: unknown;
};

// github public profile + the official social_accounts endpoint. unauthed is
// 60/hr per ip; a GITHUB_TOKEN (optional) raises it to 5000/hr for a deployed
// instance. degrades to gravatar-only if github rate-limits.
async function fromGitHub(
  username: string,
): Promise<{ profile: Partial<Footprint>; links: FootprintLink[] } | null> {
  const headers: Record<string, string> = {};
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  const u = encodeURIComponent(username);
  const user = (await getJson(
    `https://api.github.com/users/${u}`,
    headers,
  )) as GitHubUser | null;
  if (!user) return null;

  const social = (await getJson(
    `https://api.github.com/users/${u}/social_accounts`,
    headers,
  )) as Record<string, unknown>[] | null;

  const links: FootprintLink[] = [
    {
      platform: "github",
      url: str(user.html_url) ?? `https://github.com/${username}`,
      handle: username,
      verified: false,
      source: "github",
    },
  ];
  const twitter = str(user.twitter_username);
  if (twitter) {
    links.push({
      platform: "x",
      url: `https://x.com/${twitter}`,
      handle: twitter,
      verified: false,
      source: "github",
    });
  }
  if (Array.isArray(social)) {
    for (const s of social) {
      const url = str(s.url);
      if (url) {
        links.push({
          platform: normPlatform(str(s.provider)),
          url,
          verified: false,
          source: "github",
        });
      }
    }
  }

  return {
    profile: {
      name: str(user.name),
      bio: str(user.bio),
      avatarUrl: str(user.avatar_url),
      location: str(user.location),
      company: str(user.company)?.replace(/^@/, ""),
      website: normUrl(str(user.blog)),
    },
    links,
  };
}

// freemail domains carry no site to crawl ... skip them so we never fetch
// gmail.com et al expecting a personal/company homepage.
const FREEMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
  "fastmail.com",
  "hey.com",
  "duck.com",
]);

// known social hosts -> canonical platform. federated/self-hosted instances
// (mastodon) are best-effort; the host-match covers the common cases.
const SOCIAL_HOST_PLATFORM: Record<string, string> = {
  "x.com": "x",
  "twitter.com": "x",
  "linkedin.com": "linkedin",
  "github.com": "github",
  "instagram.com": "instagram",
  "youtube.com": "youtube",
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "tiktok.com": "tiktok",
  "bsky.app": "bluesky",
  "threads.net": "threads",
  "mastodon.social": "mastodon",
  "youtu.be": "youtube",
};

// share / intent / dialog links are buttons, not profiles ... drop them so the
// graph doesn't fill with "tweet this" junk.
const SHARE_RE =
  /(?:\/intent\/|\/share(?:r)?(?:[/?]|$)|sharearticle|\/dialog\/|[?&](?:text|url|via)=)/i;

function socialPlatform(host: string): string | undefined {
  for (const key of Object.keys(SOCIAL_HOST_PLATFORM)) {
    if (host === key || host.endsWith("." + key)) return SOCIAL_HOST_PLATFORM[key];
  }
  return undefined;
}

// crawl ONE public homepage (their own site, or their company domain) and pull
// the social profiles + bio they list there. a single GET of a public,
// self-published page ... the compliant "view their site" move, not scraping a
// walled garden. degrades to null on any hiccup (non-html, timeout, no links).
async function fromWebsite(
  rawUrl: string,
): Promise<{ profile: Partial<Footprint>; links: FootprintLink[] } | null> {
  const base = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  let html = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(base, {
      headers: {
        "user-agent": "gen-connect-footprint",
        accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
      return null;
    }
    html = (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  }

  const links: FootprintLink[] = [];
  const seen = new Set<string>();
  const hrefRe = /href=["']([^"'\s]+)["']/gi;
  let m: RegExpExecArray | null;
  let scanned = 0;
  while ((m = hrefRe.exec(html)) !== null && scanned < 400 && links.length < 25) {
    scanned += 1;
    const href = m[1];
    if (!href || !/^https?:\/\//i.test(href) || SHARE_RE.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.pathname.length <= 1) continue; // bare domain, not a profile
    const platform = socialPlatform(u.hostname.replace(/^www\./, ""));
    if (!platform) continue;
    const clean = `${u.origin}${u.pathname}`.replace(/\/+$/, "");
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ platform, url: clean, verified: false, source: "site" });
  }

  const desc =
    str(
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
      )?.[1],
    ) ??
    str(
      html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
      )?.[1],
    );

  if (links.length === 0 && !desc) return null;
  return { profile: { bio: desc, website: base }, links };
}

function githubHandleFromLinks(links: FootprintLink[]): string | undefined {
  const gh = links.find((l) => l.platform === "github");
  if (!gh) return undefined;
  const m = gh.url.match(/github\.com\/([^/?#]+)/i);
  const handle = m?.[1];
  return handle && handle.length > 0 ? handle : undefined;
}

// fill-missing merge: the first resolver's value wins, the next fills gaps.
function mergeProfile(
  a: Partial<Footprint>,
  b: Partial<Footprint>,
): Partial<Footprint> {
  const pick = (x?: string, y?: string): string | undefined =>
    x && x.trim() ? x : y && y.trim() ? y : undefined;
  return {
    name: pick(a.name, b.name),
    bio: pick(a.bio, b.bio),
    avatarUrl: pick(a.avatarUrl, b.avatarUrl),
    location: pick(a.location, b.location),
    jobTitle: pick(a.jobTitle, b.jobTitle),
    company: pick(a.company, b.company),
    website: pick(a.website, b.website),
  };
}

// dedupe by normalized url; a verified (gravatar) link wins over an unverified
// (github) one for the same destination. canonicalize host quirks so the same
// account isn't double-listed: drop www., and fold twitter.com onto x.com (the
// common case where gravatar gives x.com and github gives twitter.com).
function dedupeLinks(links: FootprintLink[]): FootprintLink[] {
  const seen = new Map<string, FootprintLink>();
  for (const l of links) {
    const key = l.url
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/^twitter\.com\//, "x.com/")
      .replace(/\/+$/, "");
    const existing = seen.get(key);
    if (!existing || (l.verified && !existing.verified)) seen.set(key, l);
  }
  return Array.from(seen.values());
}

// resolve a person's public footprint from their email (+ optional github
// handle). gravatar first (it carries the verified social graph), then github
// to fill the personal site + any socials gravatar missed. returns an empty-ish
// footprint (links:[], sources:[]) when nothing public exists ... the caller
// decides what to do with a cold result.
export async function resolveFootprint(
  input: FootprintInput,
): Promise<Footprint> {
  let profile: Partial<Footprint> = {};
  const links: FootprintLink[] = [];
  const sources: string[] = [];

  const email = str(input.email ?? undefined);
  if (email) {
    const g = await fromGravatar(email);
    if (g) {
      profile = { ...g.profile };
      links.push(...g.links);
      sources.push("gravatar");
    }
  }

  const handle =
    str(input.githubUsername ?? undefined) ?? githubHandleFromLinks(links);
  if (handle) {
    const gh = await fromGitHub(handle);
    if (gh) {
      profile = mergeProfile(profile, gh.profile);
      links.push(...gh.links);
      sources.push("github");
    }
  }

  // crawl a homepage for the socials they list there: prefer their OWN site
  // (the github blog, unambiguously theirs), else fall back to the email/company
  // domain (skipping freemail). this is the lever that un-sparses a typical
  // business lead with no gravatar/github.
  const domain = str(input.domain ?? undefined)?.toLowerCase();
  const siteCandidate =
    str(profile.website ?? undefined) ??
    (domain && !FREEMAIL.has(domain) ? domain : undefined);
  if (siteCandidate) {
    const site = await fromWebsite(siteCandidate);
    if (site) {
      profile = mergeProfile(profile, site.profile);
      links.push(...site.links);
      sources.push("website");
    }
  }

  return { ...profile, links: dedupeLinks(links), sources };
}

// the draftable contact fields a footprint teaches us. so a (free) footprint
// resolve also fills an empty contact + hands the 5-angle drafter a real hook,
// not just a pile of links ... a footprint-only contact becomes draftable. the
// caller fills these into gc_contacts fill-missing (never overwrites what's there).
export function footprintToContactFields(f: Footprint): {
  name?: string;
  title?: string;
  company_name?: string;
  location?: string;
  hook?: string;
} {
  // prefer a clean, factual role-anchor; fall back to the first sentence of bio.
  const roleHook =
    f.jobTitle && f.company ? `${f.jobTitle} at ${f.company}` : f.jobTitle;
  const bioHook = f.bio
    ? f.bio.split(/(?<=[.!?])\s/)[0]?.slice(0, 200)
    : undefined;
  return {
    name: f.name,
    title: f.jobTitle,
    company_name: f.company,
    location: f.location,
    hook: roleHook ?? bioHook,
  };
}
