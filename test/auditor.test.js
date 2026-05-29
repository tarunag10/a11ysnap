import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const runBrowserTests = process.env.ALLYSNAP_BROWSER_TESTS === "1";

describe("auditPage", { skip: !runBrowserTests }, () => {
  let browser;
  let auditPage;

  before(async () => {
    const playwright = await import("playwright");
    const auditor = await import("../src/auditor.js");
    auditPage = auditor.auditPage;
    const { chromium } = playwright;
    browser = await chromium.launch();
  });

  after(async () => {
    await browser.close();
  });

  it("finds no critical violations on good page", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const filePath = path.join(fixturesDir, "good-page.html");
    const result = await auditPage(page, `file://${filePath}`, {
      level: "AA",
      timeout: 10000,
      screenshots: false,
      outputDir: "/tmp/a11ysnap-test",
      viewport: { width: 1280, height: 720 },
    });
    await context.close();

    assert.equal(result.url, `file://${filePath}`);
    assert.equal(typeof result.pageTitle, "string");
    assert.equal(typeof result.loadTimeMs, "number");
    const critical = result.violations.filter((v) => v.impact === "critical");
    assert.equal(critical.length, 0);
  });

  it("finds violations on bad page", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const filePath = path.join(fixturesDir, "bad-page.html");
    const result = await auditPage(page, `file://${filePath}`, {
      level: "AA",
      timeout: 10000,
      screenshots: false,
      outputDir: "/tmp/a11ysnap-test",
      viewport: { width: 1280, height: 720 },
    });
    await context.close();

    assert.ok(result.violations.length > 0, "Should find violations on bad page");
    const v = result.violations[0];
    assert.ok(v.id, "Violation should have an id");
    assert.ok(v.impact, "Violation should have an impact level");
    assert.ok(v.description, "Violation should have a description");
    assert.ok(v.nodes.length > 0, "Violation should have affected nodes");
  });
});
