import { existsSync } from "node:fs";

const DEFAULTS = {
  depth: 3,
  maxPages: 50,
  concurrency: 3,
  level: "AA",
  outputDir: "./a11ysnap-report",
  format: "html",
  screenshots: true,
  viewport: "1280x720",
  timeout: 30000,
  verbose: false,
};

const LEVELS = new Set(["A", "AA", "AAA"]);
const FORMATS = new Set(["html", "json", "both"]);

export function validateConfig(input = {}) {
  const raw = { ...DEFAULTS, ...input };
  const errors = [];

  validateUrl(raw.url, "URL", errors);
  if (raw.sitemap) validateUrl(raw.sitemap, "sitemap URL", errors);
  if (raw.sitemap && raw.urlsFile) {
    errors.push("Use either --sitemap or --urls, not both.");
  }
  if (raw.urlsFile && !existsSync(raw.urlsFile)) {
    errors.push(`URL file does not exist: ${raw.urlsFile}`);
  }

  if (!LEVELS.has(raw.level)) {
    errors.push(`Invalid WCAG level "${raw.level}". Must be A, AA, or AAA.`);
  }
  if (!FORMATS.has(raw.format)) {
    errors.push(`Invalid format "${raw.format}". Must be html, json, or both.`);
  }

  const depth = parseInteger(raw.depth);
  const maxPages = parseInteger(raw.maxPages);
  const concurrency = parseInteger(raw.concurrency);
  const timeout = parseInteger(raw.timeout);
  if (depth === null || depth < 0) errors.push("depth must be an integer greater than or equal to 0.");
  if (maxPages === null || maxPages < 1) errors.push("maxPages must be an integer greater than or equal to 1.");
  if (concurrency === null || concurrency < 1) {
    errors.push("concurrency must be an integer greater than or equal to 1.");
  }
  if (timeout === null || timeout < 1) errors.push("timeout must be an integer greater than or equal to 1.");

  const viewport = parseViewport(raw.viewport);
  if (!viewport) {
    errors.push(`Invalid viewport "${formatViewport(raw.viewport)}". Use format WxH, e.g. 1280x720.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      url: raw.url,
      depth,
      maxPages,
      concurrency,
      level: raw.level,
      sitemap: raw.sitemap,
      urlsFile: raw.urlsFile,
      outputDir: raw.outputDir,
      format: raw.format,
      screenshots: Boolean(raw.screenshots),
      viewport,
      timeout,
      verbose: Boolean(raw.verbose),
    },
  };
}

function validateUrl(value, label, errors) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      errors.push(`Invalid ${label}: must use http or https.`);
    }
  } catch {
    errors.push(`Invalid ${label}: "${value}".`);
  }
}

function parseInteger(value) {
  const number = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isInteger(number) ? number : null;
}

function parseViewport(value) {
  if (value && typeof value === "object") {
    const width = parseInteger(value.width);
    const height = parseInteger(value.height);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  const width = parseInteger(match[1]);
  const height = parseInteger(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

function formatViewport(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return `${value.width}x${value.height}`;
  return String(value);
}
