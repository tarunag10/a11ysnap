import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { autoCrawl, discoverFromSitemap, discoverFromFile } from "./crawler.js";
import { auditPage } from "./auditor.js";
import { captureScreenshots } from "./screenshotter.js";
import { generateHtmlReport } from "./reporter/html-reporter.js";
import { generateJsonReport } from "./reporter/json-reporter.js";
import { generateSummary } from "./reporter/html-reporter.js";
import { createScanEvent, SCAN_EVENTS } from "./scan-events.js";
import {
  info,
  success,
  warn,
  error,
  debug,
  startSpinner,
  stopSpinner,
} from "./utils/logger.js";

export async function runPipeline(config, hooks = {}) {
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

  const emit = (type, payload = {}) => hooks.onEvent?.(createScanEvent(type, payload));
  const browserFactory = hooks.browserFactory || launchChromium;
  const discoverers = {
    file: discoverFromFile,
    sitemap: discoverFromSitemap,
    auto: autoCrawl,
    ...(hooks.discoverers || {}),
  };
  const audit = hooks.auditPage || auditPage;
  const screenshot = hooks.captureScreenshots || captureScreenshots;
  const htmlReporter = hooks.generateHtmlReport || generateHtmlReport;
  const jsonReporter = hooks.generateJsonReport || generateJsonReport;

  emit(SCAN_EVENTS.SCAN_START, { url, level, format });
  info("Phase 1: Discovering URLs...");
  emit(SCAN_EVENTS.DISCOVERY_START, { url });
  const browser = await browserFactory();
  let urls;

  try {
    if (urlsFile) {
      urls = await discoverers.file(urlsFile);
      info(`Loaded ${urls.length} URLs from file`);
    } else if (sitemap) {
      urls = await discoverers.sitemap(sitemap, { origin: url });
      info(`Found ${urls.length} URLs from sitemap`);
    } else {
      const crawlContext = await browser.newContext();
      const crawlPage = await crawlContext.newPage();
      urls = await discoverers.auto(url, crawlPage, {
        maxDepth: depth,
        maxPages,
        origin: url,
      });
      await crawlContext.close();
    }

    if (urls.length === 0) {
      error("No pages found to audit.");
      await browser.close();
      const summary = generateSummary([]);
      emit(SCAN_EVENTS.SCAN_COMPLETE, { exitCode: 2, summary });
      return { exitCode: 2, results: [], summary, reportPaths: {} };
    }

    // Enforce max pages
    if (urls.length > maxPages) {
      warn(`Limiting to ${maxPages} pages (found ${urls.length})`);
      urls = urls.slice(0, maxPages);
    }
    emit(SCAN_EVENTS.DISCOVERY_COMPLETE, { count: urls.length, urls });

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
        if (hooks.isCancelled?.()) {
          return null;
        }
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          emit(SCAN_EVENTS.AUDIT_PAGE_START, { url: pageUrl });
          const result = await audit(page, pageUrl, {
            level,
            timeout,
            screenshots,
            outputDir,
            viewport,
          });

          if (screenshots) {
            await screenshot(page, result, outputDir);
          }

          emit(SCAN_EVENTS.AUDIT_PAGE_COMPLETE, {
            url: pageUrl,
            violations: result.violations.length,
          });
          return result;
        } catch (err) {
          warn(`Failed to audit ${pageUrl}: ${err.message}`);
          emit(SCAN_EVENTS.AUDIT_PAGE_ERROR, { url: pageUrl, error: err.message });
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
      results.push(...chunkResults.filter(Boolean));
      completed += chunkResults.length;
      spinner.text = `Auditing ${completed}/${urls.length} pages`;
    }

    stopSpinner();
    success(`Audited ${results.length} pages`);

    // --- Phase 3: Report ---
    info("Phase 3: Generating report...");
    await mkdir(outputDir, { recursive: true });

    const reportPaths = {};
    if (format === "html" || format === "both") {
      const html = await htmlReporter(results, outputDir, level);
      const htmlPath = path.join(outputDir, "report.html");
      await writeFile(htmlPath, html, "utf-8");
      reportPaths.html = htmlPath;
      success(`HTML report: ${htmlPath}`);
    }

    if (format === "json" || format === "both") {
      const json = jsonReporter(results);
      const jsonPath = path.join(outputDir, "report.json");
      await writeFile(jsonPath, json, "utf-8");
      reportPaths.json = jsonPath;
      success(`JSON report: ${jsonPath}`);
    }

    // Summary
    const summary = generateSummary(results);
    emit(SCAN_EVENTS.REPORT_COMPLETE, { reportPaths, summary });

    console.log("");
    info(`Summary: ${summary.totalViolations} violations across ${summary.pagesWithViolations}/${results.length} pages`);

    await browser.close();

    const exitCode = summary.totalViolations > 0 ? 1 : 0;
    emit(SCAN_EVENTS.SCAN_COMPLETE, { exitCode, summary, reportPaths });
    return { exitCode, results, summary, reportPaths };
  } catch (err) {
    await browser.close();
    error(`Pipeline failed: ${err.message}`);
    debug(err.stack);
    const summary = generateSummary([]);
    emit(SCAN_EVENTS.SCAN_COMPLETE, { exitCode: 2, error: err.message, summary });
    return { exitCode: 2, results: [], summary, reportPaths: {}, error: err.message };
  }
}

async function launchChromium() {
  const { chromium } = await import("playwright");
  return chromium.launch();
}
