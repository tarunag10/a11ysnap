import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runPipeline } from "../src/pipeline.js";
import { SCAN_EVENTS } from "../src/scan-events.js";

function createFakeBrowser() {
  return {
    closed: false,
    contexts: [],
    async newContext() {
      const context = {
        pages: [],
        async newPage() {
          const page = {};
          this.pages.push(page);
          return page;
        },
        async close() {},
      };
      this.contexts.push(context);
      return context;
    },
    async close() {
      this.closed = true;
    },
  };
}

describe("runPipeline", () => {
  it("returns reports, summary, and progress events without exiting", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "a11ysnap-pipeline-"));
    const browser = createFakeBrowser();
    const events = [];

    try {
      const result = await runPipeline(
        {
          url: "https://example.com",
          depth: 1,
          maxPages: 5,
          concurrency: 2,
          level: "AA",
          outputDir,
          format: "both",
          screenshots: false,
          viewport: { width: 1280, height: 720 },
          timeout: 1000,
        },
        {
          onEvent: (event) => events.push(event),
          browserFactory: async () => browser,
          discoverers: {
            auto: async () => ["https://example.com", "https://example.com/about"],
          },
          auditPage: async (_page, pageUrl) => ({
            url: pageUrl,
            timestamp: "2026-05-29T00:00:00.000Z",
            pageTitle: pageUrl.endsWith("/about") ? "About" : "Home",
            loadTimeMs: 10,
            screenshotPath: null,
            violations: pageUrl.endsWith("/about")
              ? []
              : [
                  {
                    id: "image-alt",
                    impact: "critical",
                    description: "Images must have alt text",
                    helpUrl: "https://example.com/rule",
                    wcagTags: ["wcag2a"],
                    nodes: [{ html: "<img>", target: ["img"], failureSummary: "Add alt" }],
                  },
                ],
          }),
        }
      );

      assert.equal(result.exitCode, 1);
      assert.equal(result.results.length, 2);
      assert.equal(result.summary.totalPages, 2);
      assert.equal(result.summary.totalViolations, 1);
      assert.ok(result.reportPaths.html.endsWith("report.html"));
      assert.ok(result.reportPaths.json.endsWith("report.json"));
      assert.equal(browser.closed, true);

      const json = JSON.parse(await readFile(result.reportPaths.json, "utf-8"));
      assert.equal(json.schemaVersion, 1);
      assert.equal(json.pages.length, 2);

      assert.deepEqual(
        events.map((event) => event.type),
        [
          SCAN_EVENTS.SCAN_START,
          SCAN_EVENTS.DISCOVERY_START,
          SCAN_EVENTS.DISCOVERY_COMPLETE,
          SCAN_EVENTS.AUDIT_PAGE_START,
          SCAN_EVENTS.AUDIT_PAGE_START,
          SCAN_EVENTS.AUDIT_PAGE_COMPLETE,
          SCAN_EVENTS.AUDIT_PAGE_COMPLETE,
          SCAN_EVENTS.REPORT_COMPLETE,
          SCAN_EVENTS.SCAN_COMPLETE,
        ]
      );
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("returns exit code 2 when no pages are discovered", async () => {
    const browser = createFakeBrowser();
    const result = await runPipeline(
      {
        url: "https://example.com",
        depth: 1,
        maxPages: 5,
        concurrency: 1,
        level: "AA",
        outputDir: "/tmp/a11ysnap-empty",
        format: "json",
        screenshots: false,
        viewport: { width: 1280, height: 720 },
        timeout: 1000,
      },
      {
        browserFactory: async () => browser,
        discoverers: {
          auto: async () => [],
        },
      }
    );

    assert.equal(result.exitCode, 2);
    assert.deepEqual(result.results, []);
    assert.equal(browser.closed, true);
  });

  it("records per-page audit errors and continues", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "a11ysnap-pipeline-errors-"));

    try {
      const result = await runPipeline(
        {
          url: "https://example.com",
          depth: 1,
          maxPages: 5,
          concurrency: 1,
          level: "AA",
          outputDir,
          format: "json",
          screenshots: false,
          viewport: { width: 1280, height: 720 },
          timeout: 1000,
        },
        {
          browserFactory: async () => createFakeBrowser(),
          discoverers: {
            auto: async () => ["https://example.com/fail"],
          },
          auditPage: async () => {
            throw new Error("Navigation failed");
          },
        }
      );

      assert.equal(result.exitCode, 0);
      assert.equal(result.results[0].error, "Navigation failed");
      assert.equal(result.summary.pagesWithErrors, 1);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
