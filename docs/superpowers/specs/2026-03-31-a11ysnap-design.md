# a11ysnap Design Spec

## Summary

a11ysnap is a CLI tool that crawls a website and runs WCAG 2.1 accessibility audits on every discovered page. It produces an HTML report with violations grouped by severity, including screenshots that highlight offending elements. It also supports JSON output for CI/CD integration.

## Target Users

- **Developers**: CI/CD integration, fast feedback, machine-readable output, exit codes
- **QA / Auditors**: Comprehensive HTML reports, evidence screenshots, exportable results

## V1 Scope

### In Scope
- Three URL discovery methods: auto-crawl (BFS link-following), sitemap.xml parsing, URL list file
- WCAG 2.1 auditing at configurable conformance levels (A, AA, AAA; default AA)
- Full-page and element-level screenshots with violation highlighting
- Self-contained HTML report with dashboard, filtering, and expandable violation cards
- JSON output for machine consumption
- Configurable concurrency, depth, page limits, viewport size
- CI-friendly exit codes (0 = clean, 1 = violations found, 2 = error)

### Out of Scope (V1)
- Authentication (login-protected pages)
- Custom axe-core rules
- PDF/CSV export
- Scheduled/recurring scans
- Web UI or dashboard server
- Multi-site comparison

## Architecture

**Approach: Monolithic Pipeline** — a single sequential pipeline with concurrent page auditing.

### Pipeline Stages

```
1. URL Discovery
   ├── Auto-crawl: BFS from start URL, follow same-origin links up to --depth
   ├── Sitemap: Parse sitemap.xml (including sitemap index files), extract all <loc> URLs
   └── URL file: Read lines from file
   → Output: URL[] (deduplicated, same-origin filtered)

2. Audit (concurrent, up to --concurrency pages in parallel)
   For each URL:
   ├── Navigate with Playwright
   ├── Wait for network idle
   ├── Run axe-core via @axe-core/playwright
   ├── Capture full-page screenshot
   └── For each violation node, capture element screenshot with red highlight
   → Output: PageResult[]

3. Report Generation
   ├── Aggregate results across all pages
   ├── Group by severity (critical > serious > moderate > minor)
   ├── Generate self-contained HTML report (inline CSS/JS/base64 images)
   └── Generate JSON output if requested
   → Output: report.html + report.json in output directory
```

### Data Model

```typescript
interface PageResult {
  url: string;
  timestamp: string;
  pageTitle: string;
  loadTimeMs: number;
  screenshotPath: string;       // full page screenshot
  violations: Violation[];
}

interface Violation {
  id: string;                   // axe rule ID (e.g., "color-contrast")
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  helpUrl: string;              // link to axe documentation
  wcagTags: string[];           // e.g., ["wcag2aa", "wcag143"]
  nodes: ViolationNode[];
}

interface ViolationNode {
  html: string;                 // offending element HTML snippet
  target: string[];             // CSS selector path
  failureSummary: string;
  screenshotPath: string;       // element-level screenshot
}
```

## CLI Interface

```
a11ysnap <url> [options]

Options:
  --depth <n>          Max crawl depth (default: 3)
  --max-pages <n>      Max pages to audit (default: 50)
  --concurrency <n>    Parallel browser pages (default: 3)
  --level <A|AA|AAA>   WCAG conformance level (default: AA)
  --sitemap <url>      Crawl from sitemap.xml instead of link-following
  --urls <file>        Read URLs from a file (one per line)
  --output <dir>       Output directory (default: ./a11ysnap-report)
  --format <type>      html | json | both (default: html)
  --no-screenshots     Skip screenshot capture (faster)
  --viewport <WxH>     Browser viewport (default: 1280x720)
  --timeout <ms>       Page load timeout (default: 30000)
  --verbose            Show detailed progress

Exit Codes:
  0  No violations found
  1  Violations found
  2  Error (crash, network failure, invalid arguments)
```

## HTML Report

- Self-contained single HTML file (all CSS, JS, and images base64-encoded inline)
- **Dashboard**: total pages scanned, violations by severity, pass rate
- **Violations table**: sortable/filterable, grouped by severity
- **Violation cards** (expandable): description, affected element HTML, CSS selector, fix suggestion from axe, WCAG docs link
- **Screenshots**: inline thumbnails with click-to-expand lightbox
- **Page breakdown tab**: per-page results view

## Project Structure

```
a11ysnap/
├── package.json
├── bin/
│   └── a11ysnap.js              # CLI entry point (shebang)
├── src/
│   ├── cli.js                   # Argument parsing (commander)
│   ├── crawler.js               # URL discovery (auto-crawl, sitemap, file)
│   ├── auditor.js               # Playwright + axe-core audit logic
│   ├── screenshotter.js         # Screenshot capture with element highlighting
│   ├── reporter/
│   │   ├── html-reporter.js     # HTML report generation
│   │   ├── json-reporter.js     # JSON output
│   │   └── template.html        # HTML report template
│   └── utils/
│       ├── logger.js            # Console output + progress
│       └── url-utils.js         # URL normalization, same-origin checks
├── test/
│   ├── crawler.test.js
│   ├── auditor.test.js
│   └── fixtures/                # Test HTML pages with known violations
└── README.md
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `playwright` | Browser automation and page navigation |
| `@axe-core/playwright` | axe-core accessibility engine integration |
| `commander` | CLI argument parsing |
| `chalk` | Colored terminal output |
| `ora` | Spinner and progress indicators |

## Error Handling

- **Network errors**: Log failed URLs, continue with remaining pages, include failures in report summary
- **Timeout**: Respect `--timeout`, skip page after timeout, log warning
- **Invalid URLs**: Validate upfront, exit with code 2 for invalid start URL
- **No pages found**: Exit with code 2 and clear error message
- **Crawler loops**: URL deduplication prevents infinite crawling

## Testing Strategy

- **Unit tests**: crawler URL extraction, URL normalization, report data aggregation
- **Integration tests**: audit a local test fixture HTML page with known violations, verify correct violations detected
- **Test fixtures**: static HTML files with deliberate accessibility violations (missing alt text, low contrast, missing labels)
