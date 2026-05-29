import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { validateConfig } from "../src/config.js";

describe("validateConfig", () => {
  it("normalizes a valid minimal config with defaults", () => {
    const result = validateConfig({ url: "https://example.com" });

    assert.equal(result.ok, true);
    assert.equal(result.config.url, "https://example.com");
    assert.equal(result.config.depth, 3);
    assert.equal(result.config.maxPages, 50);
    assert.equal(result.config.concurrency, 3);
    assert.equal(result.config.level, "AA");
    assert.equal(result.config.format, "html");
    assert.deepEqual(result.config.viewport, { width: 1280, height: 720 });
    assert.equal(result.config.screenshots, true);
  });

  it("reports invalid URL, level, format, viewport, and numeric options", () => {
    const result = validateConfig({
      url: "not-a-url",
      level: "BAD",
      format: "xml",
      viewport: "wide",
      depth: -1,
      maxPages: 0,
      concurrency: 0,
      timeout: Number.NaN,
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /Invalid URL/);
    assert.match(result.errors.join("\n"), /Invalid WCAG level/);
    assert.match(result.errors.join("\n"), /Invalid format/);
    assert.match(result.errors.join("\n"), /Invalid viewport/);
    assert.match(result.errors.join("\n"), /depth must be/);
    assert.match(result.errors.join("\n"), /maxPages must be/);
    assert.match(result.errors.join("\n"), /concurrency must be/);
    assert.match(result.errors.join("\n"), /timeout must be/);
  });

  it("rejects conflicting sitemap and URL file discovery modes", async () => {
    const filePath = path.join(import.meta.dirname, "tmp-config-urls.txt");
    await writeFile(filePath, "https://example.com\n");

    try {
      const result = validateConfig({
        url: "https://example.com",
        sitemap: "https://example.com/sitemap.xml",
        urlsFile: filePath,
      });

      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /Use either --sitemap or --urls/);
    } finally {
      await rm(filePath, { force: true });
    }
  });

  it("validates sitemap URL and URL file existence", () => {
    const badSitemap = validateConfig({
      url: "https://example.com",
      sitemap: "not-a-url",
    });
    const missingFile = validateConfig({
      url: "https://example.com",
      urlsFile: "/tmp/a11ysnap-definitely-missing.txt",
    });

    assert.equal(badSitemap.ok, false);
    assert.match(badSitemap.errors.join("\n"), /Invalid sitemap URL/);
    assert.equal(missingFile.ok, false);
    assert.match(missingFile.errors.join("\n"), /URL file does not exist/);
  });
});
