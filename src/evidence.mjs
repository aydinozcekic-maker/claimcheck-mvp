import { isIP } from "node:net";

const MAX_EVIDENCE_LENGTH = 1400;

function terms(value) {
  return new Set(
    value.toLowerCase().match(/[a-z0-9]{3,}/g) || []
  );
}

function overlapScore(claim, text) {
  const claimTerms = terms(claim);
  const textTerms = terms(text);
  let total = 0;
  for (const term of claimTerms) {
    if (textTerms.has(term)) total += 1;
  }
  return total;
}

function cleanHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function validateRemoteUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported source URL protocol: ${url.protocol}`);
  }
  const hostname = url.hostname.toLowerCase();
  const privateIpv4 = /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  const privateIpv6 = hostname === "[::1]" || hostname === "::1" ||
    /^\[?(fc|fd|fe80):/i.test(hostname) || /^\[?::ffff:/i.test(hostname) ||
    hostname === "[::]";
  if (
    hostname === "localhost" ||
    (isIP(hostname) === 4 && privateIpv4) ||
    privateIpv4 ||
    privateIpv6
  ) {
    throw new Error("Private or local source URLs are not allowed.");
  }
  return url;
}

export function sourceQuality(url = "", origin = "provided") {
  if (origin === "provided") return 0.8;
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host.endsWith(".gov") || host.endsWith(".edu")) return 0.9;
  if (host.includes("wikipedia.org")) return 0.6;
  return 0.65;
}

export async function prepareSources({ sourceText = "", sourceUrls = [] }, fetchImpl = fetch) {
  const sources = [];
  const pastedSections = sourceText
    .split(/\n\s*---+\s*\n/)
    .map((text) => text.trim())
    .filter(Boolean);

  pastedSections.forEach((text, index) => {
    sources.push({
      source: `Provided document ${index + 1}`,
      text,
      url: null,
      origin: "provided",
      quality: sourceQuality("", "provided")
    });
  });

  for (const rawUrl of sourceUrls.filter(Boolean).slice(0, 5)) {
    const url = validateRemoteUrl(rawUrl);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Could not retrieve ${url.href} (${response.status}).`);
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    const text = contentType.includes("html") ? cleanHtml(body) : body.trim();
    sources.push({
      source: url.hostname,
      text,
      url: url.href,
      origin: "url",
      quality: sourceQuality(url.href, "url")
    });
  }
  return sources;
}

async function tavilySearch(claim, apiKey, fetchImpl) {
  if (!apiKey) return [];
  const response = await fetchImpl("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: claim,
      search_depth: "basic",
      max_results: 3,
      include_answer: false
    })
  });
  if (!response.ok) throw new Error(`Web search failed (${response.status}).`);
  const payload = await response.json();
  return (payload.results || []).map((result) => ({
    source: result.title || result.url,
    text: result.content || "",
    url: result.url || null,
    origin: "web",
    quality: sourceQuality(result.url, "web")
  }));
}

export async function retrieveEvidence(claim, sources, { tavilyApiKey = "", fetchImpl = fetch } = {}) {
  const sourceMatches = sources
    .map((source) => ({ ...source, score: overlapScore(claim.claim, source.text) }))
    .filter((source) => source.score > 0 || sources.length <= 2)
    .sort((a, b) => b.score - a.score || b.quality - a.quality)
    .slice(0, 3);
  const webMatches = await tavilySearch(claim.claim, tavilyApiKey, fetchImpl);

  return [...sourceMatches, ...webMatches].slice(0, 5).map((item) => ({
    source: item.source,
    text: item.text.slice(0, MAX_EVIDENCE_LENGTH),
    url: item.url,
    quality: item.quality,
    origin: item.origin
  }));
}
