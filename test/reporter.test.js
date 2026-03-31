import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateJsonReport } from "../src/reporter/json-reporter.js";
import { generateSummary } from "../src/reporter/html-reporter.js";

const mockResults = [
  {
    url: "https://example.com",
    timestamp: "2026-03-31T00:00:00.000Z",
    pageTitle: "Example",
    loadTimeMs: 500,
    screenshotPath: null,
    violations: [
      {
        id: "color-contrast",
        impact: "serious",
        description: "Elements must meet color contrast",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.0/color-contrast",
        wcagTags: ["wcag2aa"],
        nodes: [{ html: "<p>text</p>", target: ["p"], failureSummary: "Fix contrast", screenshotPath: null }],
      },
      {
        id: "image-alt",
        impact: "critical",
        description: "Images must have alt text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.0/image-alt",
        wcagTags: ["wcag2a"],
        nodes: [{ html: "<img>", target: ["img"], failureSummary: "Add alt", screenshotPath: null }],
      },
    ],
  },
  {
    url: "https://example.com/about",
    timestamp: "2026-03-31T00:00:01.000Z",
    pageTitle: "About",
    loadTimeMs: 300,
    screenshotPath: null,
    violations: [],
  },
];

describe("generateJsonReport", () => {
  it("produces valid JSON with all results", () => {
    const json = generateJsonReport(mockResults);
    const parsed = JSON.parse(json);
    assert.equal(parsed.pages.length, 2);
    assert.equal(parsed.summary.totalPages, 2);
    assert.equal(parsed.summary.totalViolations, 2);
    assert.ok(parsed.summary.bySeverity.critical >= 1);
    assert.ok(parsed.summary.bySeverity.serious >= 1);
  });
});

describe("generateSummary", () => {
  it("computes correct summary statistics", () => {
    const summary = generateSummary(mockResults);
    assert.equal(summary.totalPages, 2);
    assert.equal(summary.totalViolations, 2);
    assert.equal(summary.pagesWithViolations, 1);
    assert.equal(summary.bySeverity.critical, 1);
    assert.equal(summary.bySeverity.serious, 1);
    assert.equal(summary.bySeverity.moderate, 0);
    assert.equal(summary.bySeverity.minor, 0);
  });
});
