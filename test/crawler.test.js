import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractLinks, discoverFromFile } from "../src/crawler.js";
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
