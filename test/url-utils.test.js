import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, isSameOrigin, deduplicateUrls } from "../src/utils/url-utils.js";

describe("normalizeUrl", () => {
  it("removes trailing slash", () => {
    assert.equal(normalizeUrl("https://example.com/"), "https://example.com");
  });

  it("removes fragment", () => {
    assert.equal(normalizeUrl("https://example.com/page#section"), "https://example.com/page");
  });

  it("lowercases protocol and host", () => {
    assert.equal(normalizeUrl("HTTPS://EXAMPLE.COM/Path"), "https://example.com/Path");
  });

  it("removes default ports", () => {
    assert.equal(normalizeUrl("https://example.com:443/page"), "https://example.com/page");
    assert.equal(normalizeUrl("http://example.com:80/page"), "http://example.com/page");
  });

  it("preserves meaningful query strings", () => {
    assert.equal(
      normalizeUrl("https://example.com/search?q=accessibility&page=2#results"),
      "https://example.com/search?q=accessibility&page=2"
    );
  });

  it("returns null for invalid URLs", () => {
    assert.equal(normalizeUrl("not-a-url"), null);
  });
});

describe("isSameOrigin", () => {
  it("returns true for same origin", () => {
    assert.equal(isSameOrigin("https://example.com/a", "https://example.com/b"), true);
  });

  it("returns false for different host", () => {
    assert.equal(isSameOrigin("https://example.com", "https://other.com"), false);
  });

  it("returns false for different protocol", () => {
    assert.equal(isSameOrigin("https://example.com", "http://example.com"), false);
  });
});

describe("deduplicateUrls", () => {
  it("removes duplicate URLs", () => {
    const urls = ["https://example.com", "https://example.com/", "https://example.com"];
    assert.deepEqual(deduplicateUrls(urls), ["https://example.com"]);
  });

  it("normalizes before deduplicating", () => {
    const urls = ["https://example.com/page#a", "https://example.com/page#b"];
    assert.deepEqual(deduplicateUrls(urls), ["https://example.com/page"]);
  });

  it("keeps distinct query variants", () => {
    const urls = [
      "https://example.com/products?page=1",
      "https://example.com/products?page=2",
      "https://example.com/products?page=1#top",
    ];
    assert.deepEqual(deduplicateUrls(urls), [
      "https://example.com/products?page=1",
      "https://example.com/products?page=2",
    ]);
  });
});
