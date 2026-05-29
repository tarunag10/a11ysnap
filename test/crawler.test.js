import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { extractLinks, discoverFromFile, discoverFromSitemap } from "../src/crawler.js";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

describe("extractLinks", () => {
  it("extracts href values from HTML", () => {
    const html = '<a href="/about">About</a><a href="/contact">Contact</a>';
    const baseUrl = "https://example.com";
    const links = extractLinks(html, baseUrl);
    assert.deepEqual(links, ["https://example.com/about", "https://example.com/contact"]);
  });

  it("resolves relative URLs against base", () => {
    const html = '<a href="page2">Page 2</a>';
    const baseUrl = "https://example.com/dir/";
    const links = extractLinks(html, baseUrl);
    assert.deepEqual(links, ["https://example.com/dir/page2"]);
  });

  it("ignores non-http links", () => {
    const html = '<a href="mailto:a@b.com">Email</a><a href="javascript:void(0)">JS</a>';
    const links = extractLinks(html, "https://example.com");
    assert.deepEqual(links, []);
  });
});

describe("discoverFromFile", () => {
  const tmpFile = path.join(import.meta.dirname, "tmp-urls.txt");

  it("reads URLs from a file", async () => {
    writeFileSync(tmpFile, "https://example.com\nhttps://example.com/about\n\n# comment\n");
    const urls = await discoverFromFile(tmpFile);
    assert.deepEqual(urls, ["https://example.com", "https://example.com/about"]);
    unlinkSync(tmpFile);
  });
});

describe("discoverFromSitemap", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(responses) {
    globalThis.fetch = async (url) => {
      const response = responses[url];
      if (!response) {
        return { ok: false, status: 404, text: async () => "" };
      }
      return {
        ok: response.ok ?? true,
        status: response.status ?? 200,
        text: async () => response.body,
      };
    };
  }

  it("decodes XML entities in sitemap loc values", async () => {
    mockFetch({
      "https://example.com/sitemap.xml": {
        body: `<?xml version="1.0"?><urlset>
          <url><loc>https://example.com/search?q=a&amp;page=1</loc></url>
        </urlset>`,
      },
    });

    const urls = await discoverFromSitemap("https://example.com/sitemap.xml");

    assert.deepEqual(urls, ["https://example.com/search?q=a&page=1"]);
  });

  it("follows sitemap indexes and deduplicates child URLs", async () => {
    mockFetch({
      "https://example.com/sitemap.xml": {
        body: `<sitemapindex>
          <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
          <sitemap><loc>https://example.com/blog.xml</loc></sitemap>
        </sitemapindex>`,
      },
      "https://example.com/pages.xml": {
        body: `<urlset><url><loc>https://example.com/about</loc></url></urlset>`,
      },
      "https://example.com/blog.xml": {
        body: `<urlset>
          <url><loc>https://example.com/about/</loc></url>
          <url><loc>https://example.com/blog</loc></url>
        </urlset>`,
      },
    });

    const urls = await discoverFromSitemap("https://example.com/sitemap.xml");

    assert.deepEqual(urls, ["https://example.com/about", "https://example.com/blog"]);
  });

  it("filters sitemap URLs to the provided origin", async () => {
    mockFetch({
      "https://example.com/sitemap.xml": {
        body: `<urlset>
          <url><loc>https://example.com/about</loc></url>
          <url><loc>https://cdn.example.com/asset</loc></url>
          <url><loc>https://other.com/page</loc></url>
        </urlset>`,
      },
    });

    const urls = await discoverFromSitemap("https://example.com/sitemap.xml", {
      origin: "https://example.com",
    });

    assert.deepEqual(urls, ["https://example.com/about"]);
  });

  it("throws a clear error when sitemap fetch fails", async () => {
    mockFetch({
      "https://example.com/sitemap.xml": {
        ok: false,
        status: 503,
        body: "unavailable",
      },
    });

    await assert.rejects(
      () => discoverFromSitemap("https://example.com/sitemap.xml"),
      /Failed to fetch sitemap https:\/\/example\.com\/sitemap\.xml: 503/
    );
  });
});
