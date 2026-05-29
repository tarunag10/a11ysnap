import { program } from "commander";
import { setVerbose, error } from "./utils/logger.js";
import { validateConfig } from "./config.js";

const parseIntSafe = (v) => parseInt(v, 10);

program
  .name("a11ysnap")
  .description("Crawl a site and run WCAG 2.1 accessibility checks on every page")
  .version("0.1.0")
  .argument("<url>", "URL to crawl and audit")
  .option("--depth <n>", "Max crawl depth", parseIntSafe, 3)
  .option("--max-pages <n>", "Max pages to audit", parseIntSafe, 50)
  .option("--concurrency <n>", "Parallel browser pages", parseIntSafe, 3)
  .option("--level <level>", "WCAG level: A, AA, or AAA", "AA")
  .option("--sitemap <url>", "Use sitemap.xml for URL discovery")
  .option("--urls <file>", "Read URLs from a file (one per line)")
  .option("--output <dir>", "Output directory", "./a11ysnap-report")
  .option("--format <type>", "Output format: html, json, or both", "html")
  .option("--no-screenshots", "Skip screenshot capture")
  .option("--viewport <WxH>", "Browser viewport size", "1280x720")
  .option("--timeout <ms>", "Page load timeout in ms", parseIntSafe, 30000)
  .option("--verbose", "Show detailed progress")
  .action(async (url, options) => {
    setVerbose(options.verbose || false);

    const validation = validateConfig({
      url,
      depth: options.depth,
      maxPages: options.maxPages,
      concurrency: options.concurrency,
      level: options.level,
      sitemap: options.sitemap,
      urlsFile: options.urls,
      outputDir: options.output,
      format: options.format,
      screenshots: options.screenshots,
      viewport: options.viewport,
      timeout: options.timeout,
      verbose: options.verbose || false,
    });

    if (!validation.ok) {
      for (const message of validation.errors) {
        error(message);
      }
      process.exit(2);
    }

    const { runPipeline } = await import("./pipeline.js");
    const result = await runPipeline(validation.config);
    process.exit(result.exitCode);
  });

program.parse();
