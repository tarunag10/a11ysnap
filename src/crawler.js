import { readFile } from "node:fs/promises";
import { normalizeUrl, isSameOrigin, deduplicateUrls } from "./utils/url-utils.js";
import { debug, warn, info } from "./utils/logger.js";

function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractLocValues(xml, parentTag) {
  const blockRegex = new RegExp(`<${parentTag}[^>]*>[\\s\\S]*?<\\/${parentTag}>`, "gi");
  const locRegex = /<loc[^>]*>([\s\S]*?)<\/loc>/i;
  return [...xml.matchAll(blockRegex)]
    .map((block) => block[0].match(locRegex)?.[1]?.trim())
    .filter(Boolean)
    .map(decodeXmlEntities);
}

export function extractLinks(html, baseUrl) {
  const linkRegex = /href\s*=\s*["']([^"']+)["']/gi;
  const links = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl).toString();
      if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
        links.push(normalizeUrl(resolved));
      }
    } catch {
      // skip invalid URLs
    }
  }
  return links.filter(Boolean);
}

export async function discoverFromFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(normalizeUrl)
    .filter(Boolean);
}

export async function discoverFromSitemap(sitemapUrl, options = {}) {
  debug(`Fetching sitemap: ${sitemapUrl}`);
  const resp = await fetch(sitemapUrl);
  if (!resp.ok) throw new Error(`Failed to fetch sitemap ${sitemapUrl}: ${resp.status}`);
  const xml = await resp.text();

  // Check if this is a sitemap index
  const sitemapRefs = extractLocValues(xml, "sitemap");
  if (sitemapRefs.length > 0) {
    debug(`Found sitemap index with ${sitemapRefs.length} sitemaps`);
    const allUrls = [];
    for (const ref of sitemapRefs) {
      const urls = await discoverFromSitemap(ref, options);
      allUrls.push(...urls);
    }
    return deduplicateUrls(allUrls);
  }

  // Regular sitemap — extract <loc> URLs
  const urls = extractLocValues(xml, "url");
  debug(`Found ${urls.length} URLs in sitemap`);
  const filtered = options.origin
    ? urls.filter((candidate) => isSameOrigin(candidate, options.origin))
    : urls;
  return deduplicateUrls(filtered);
}

export async function autoCrawl(startUrl, page, { maxDepth, maxPages, origin }) {
  const visited = new Set();
  const queue = [{ url: normalizeUrl(startUrl), depth: 0 }];
  const discovered = [];

  while (queue.length > 0 && discovered.length < maxPages) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    if (!isSameOrigin(url, origin)) continue;

    discovered.push(url);
    debug(`Crawled [depth=${depth}]: ${url}`);

    if (depth >= maxDepth) continue;

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      const html = await page.content();
      const links = extractLinks(html, url);

      for (const link of links) {
        if (!visited.has(link) && isSameOrigin(link, origin)) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    } catch (err) {
      warn(`Failed to crawl ${url}: ${err.message}`);
    }
  }

  info(`Discovered ${discovered.length} pages`);
  return deduplicateUrls(discovered);
}
