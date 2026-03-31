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
});
