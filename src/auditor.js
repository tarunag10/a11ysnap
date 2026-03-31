import AxeBuilder from "@axe-core/playwright";
import { debug } from "./utils/logger.js";

const LEVEL_TAGS = {
  A: ["wcag2a", "wcag21a"],
  AA: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  AAA: ["wcag2a", "wcag2aa", "wcag2aaa", "wcag21a", "wcag21aa", "wcag21aaa"],
};

export async function auditPage(page, url, options) {
  const start = Date.now();
  debug(`Auditing: ${url}`);

  await page.setViewportSize(options.viewport);
  await page.goto(url, { waitUntil: "networkidle", timeout: options.timeout });

  const pageTitle = await page.title();
  const loadTimeMs = Date.now() - start;

  const tags = LEVEL_TAGS[options.level] || LEVEL_TAGS.AA;
  const axeResults = await new AxeBuilder({ page }).withTags(tags).analyze();

  const violations = axeResults.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    helpUrl: v.helpUrl,
    wcagTags: v.tags.filter((t) => t.startsWith("wcag")),
    nodes: v.nodes.map((n) => ({
      html: n.html,
      target: n.target,
      failureSummary: n.failureSummary,
      screenshotPath: null,
    })),
  }));

  debug(`Found ${violations.length} violations on ${url}`);

  return {
    url,
    timestamp: new Date().toISOString(),
    pageTitle,
    loadTimeMs,
    screenshotPath: null,
    violations,
  };
}
