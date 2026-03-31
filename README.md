# a11ysnap

Crawl a website and run WCAG 2.1 accessibility audits on every page. Get an HTML report with violations grouped by severity and screenshots highlighting offending elements.

## Install

```bash
npm install -g a11ysnap
npx playwright install chromium
```

## Usage

```bash
# Auto-crawl a site (follows links up to depth 3, max 50 pages)
a11ysnap https://example.com

# Use a sitemap
a11ysnap https://example.com --sitemap https://example.com/sitemap.xml

# Audit specific URLs from a file
a11ysnap https://example.com --urls urls.txt

# Custom options
a11ysnap https://example.com \
  --depth 5 \
  --max-pages 100 \
  --concurrency 5 \
  --level AAA \
  --format both \
  --output ./my-report \
  --viewport 1920x1080

# Fast mode (no screenshots)
a11ysnap https://example.com --no-screenshots --format json
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--depth <n>` | 3 | Max crawl depth |
| `--max-pages <n>` | 50 | Max pages to audit |
| `--concurrency <n>` | 3 | Parallel browser pages |
| `--level <A\|AA\|AAA>` | AA | WCAG conformance level |
| `--sitemap <url>` | — | Use sitemap.xml for URL discovery |
| `--urls <file>` | — | Read URLs from file (one per line) |
| `--output <dir>` | ./a11ysnap-report | Output directory |
| `--format <type>` | html | html, json, or both |
| `--no-screenshots` | — | Skip screenshots (faster) |
| `--viewport <WxH>` | 1280x720 | Browser viewport |
| `--timeout <ms>` | 30000 | Page load timeout |
| `--verbose` | — | Show detailed progress |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No violations found |
| 1 | Violations found |
| 2 | Error |

## License

MIT
