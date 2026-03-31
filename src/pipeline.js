import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { autoCrawl, discoverFromSitemap, discoverFromFile } from "./crawler.js";
import { auditPage } from "./auditor.js";
import { captureScreenshots } from "./screenshotter.js";
import { generateHtmlReport } from "./reporter/html-reporter.js";
import { generateJsonReport } from "./reporter/json-reporter.js";
import {
  info,
  success,
  warn,
  error,
  debug,
  startSpinner,
  stopSpinner,
} from "./utils/logger.js";

export async function runPipeline(config) {
  const {
    url,
    depth,
    maxPages,
    concurrency,
    level,
    sitemap,
    urlsFile,
    outputDir,
    format,
    screenshots,
    viewport,
    timeout,
  } = config;

  // --- Phase 1: URL Discovery ---
  info("Phase 1: Discovering URLs...");
  const browser = await chromium.launch();
  let urls;

  try {
    if (urlsFile) {
      urls = await discoverFromFile(urlsFile);
      info(`Loaded ${urls.length} URLs from file`);
    } else if (sitemap) {
      urls = await discoverFromSitemap(sitemap);
      info(`Found ${urls.length} URLs from sitemap`);
    } else {
      const crawlContext = await browser.newContext();
      const crawlPage = await crawlContext.newPage();
      urls = await autoCrawl(url, crawlPage, {
        maxDepth: depth,
        maxPages,
        origin: url,
      });
      await crawlContext.close();
    }

    if (urls.length === 0) {
      error("No pages found to audit.");
      await browser.close();
      process.exit(2);
    }

    // Enforce max pages
    if (urls.length > maxPages) {
      warn(`Limiting to ${maxPages} pages (found ${urls.length})`);
      urls = urls.slice(0, maxPages);
    }

    // --- Phase 2: Audit ---
    info(`Phase 2: Auditing ${urls.length} pages (concurrency: ${concurrency})...`);
    const results = [];
    const chunks = [];
    for (let i = 0; i < urls.length; i += concurrency) {
      chunks.push(urls.slice(i, i + concurrency));
    }

    let completed = 0;
    const spinner = startSpinner(`Auditing 0/${urls.length} pages`);

    for (const chunk of chunks) {
      const promises = chunk.map(async (pageUrl) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          const result = await auditPage(page, pageUrl, {
            level,
            timeout,
            screenshots,
            outputDir,
            viewport,
          });

          if (screenshots) {
            await captureScreenshots(page, result, outputDir);
          }

          return result;
        } catch (err) {
          warn(`Failed to audit ${pageUrl}: ${err.message}`);
          return {
            url: pageUrl,
            timestamp: new Date().toISOString(),
            pageTitle: "Error",
            loadTimeMs: 0,
            screenshotPath: null,
            violations: [],
            error: err.message,
          };
        } finally {
          await context.close();
        }
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
      completed += chunkResults.length;
      spinner.text = `Auditing ${completed}/${urls.length} pages`;
    }

    stopSpinner();
    success(`Audited ${results.length} pages`);

    // --- Phase 3: Report ---
    info("Phase 3: Generating report...");
    await mkdir(outputDir, { recursive: true });

    if (format === "html" || format === "both") {
      const html = await generateHtmlReport(results, outputDir, level);
      const htmlPath = path.join(outputDir, "report.html");
      await writeFile(htmlPath, html, "utf-8");
      success(`HTML report: ${htmlPath}`);
    }

    if (format === "json" || format === "both") {
      const json = generateJsonReport(results);
      const jsonPath = path.join(outputDir, "report.json");
      await writeFile(jsonPath, json, "utf-8");
      success(`JSON report: ${jsonPath}`);
    }

    // Summary
    const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
    const pagesWithIssues = results.filter((r) => r.violations.length > 0).length;

    console.log("");
    info(`Summary: ${totalViolations} violations across ${pagesWithIssues}/${results.length} pages`);

    await browser.close();

    return totalViolations > 0 ? 1 : 0;
  } catch (err) {
    await browser.close();
    error(`Pipeline failed: ${err.message}`);
    debug(err.stack);
    return 2;
  }
}
