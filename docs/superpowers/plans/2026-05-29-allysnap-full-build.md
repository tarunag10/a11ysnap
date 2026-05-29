# AllySnap Full Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing a11ysnap CLI engine, expose it through a reusable worker API with progress events, and add a web frontend for running and viewing accessibility scans.

**Architecture:** Keep the current CLI pipeline as the core engine, but separate validation, scan orchestration, and event emission from process-level CLI behavior. Add a small HTTP worker around the engine with an in-memory scan store and SSE progress, then add a Vite React frontend that talks to the worker.

**Tech Stack:** Node.js ES modules, node:test, Playwright, @axe-core/playwright, Express, Vite, React.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/config.js` | Validate and normalize CLI/API scan configuration. |
| `src/scan-events.js` | Shared scan event names and helpers. |
| `src/pipeline.js` | Reusable scan orchestration with hooks and no internal process exits. |
| `src/cli.js` | CLI parsing and process exit behavior only. |
| `src/crawler.js` | URL discovery and sitemap/file parsing. |
| `src/reporter/html-reporter.js` | HTML report rendering with page errors and node counts. |
| `src/reporter/json-reporter.js` | Versioned JSON scan result payloads. |
| `src/worker/server.js` | Express app factory and worker API routes. |
| `src/worker/scan-store.js` | In-memory scan job storage, event history, and lifecycle state. |
| `web/` | React/Vite frontend app. |
| `test/*.test.js` | Unit, integration, worker API, and browser-health tests. |

## Task 1: Core Engine Hardening

**Files:**
- Create: `src/config.js`
- Create: `src/scan-events.js`
- Modify: `src/cli.js`
- Modify: `src/pipeline.js`
- Modify: `src/reporter/json-reporter.js`
- Test: `test/config.test.js`
- Test: `test/pipeline.test.js`

- [ ] Write failing config tests for valid defaults, invalid URL, invalid numeric options, conflicting `sitemap` and `urlsFile`, invalid viewport, invalid format, invalid level, and missing URL list file.
- [ ] Implement `validateConfig(input)` returning `{ ok: true, config }` or `{ ok: false, errors }`.
- [ ] Update CLI to call `validateConfig`, print every validation error, and exit `2` without launching Playwright.
- [ ] Add scan event constants for `scan:start`, `discovery:start`, `discovery:complete`, `audit:page:start`, `audit:page:complete`, `audit:page:error`, `report:complete`, and `scan:complete`.
- [ ] Refactor `runPipeline(config, hooks = {})` to return `{ exitCode, results, summary, reportPaths }`, emit progress events through `hooks.onEvent`, and never call `process.exit`.
- [ ] Add dependency injection options for `browserFactory`, `discoverers`, `auditPage`, `captureScreenshots`, and reporters so pipeline tests do not require Chromium.
- [ ] Update JSON reporter to include `schemaVersion: 1`, `generatedAt`, `summary`, and `pages`.
- [ ] Run `node --test test/config.test.js test/pipeline.test.js test/reporter.test.js`.

## Task 2: Discovery And Report Quality

**Files:**
- Modify: `src/crawler.js`
- Modify: `src/utils/url-utils.js`
- Modify: `src/reporter/html-reporter.js`
- Test: `test/crawler.test.js`
- Test: `test/url-utils.test.js`
- Test: `test/reporter.test.js`

- [ ] Add tests for URL normalization preserving meaningful query strings, removing fragments, default port normalization, trailing slash behavior, and duplicate handling.
- [ ] Add tests for sitemap XML entity decoding, sitemap indexes, same-origin filtering when a base URL is provided, and invalid sitemap fetch failures.
- [ ] Add report tests that page-level errors are visible in summary data and rendered HTML.
- [ ] Replace brittle sitemap extraction with small XML-safe helpers based on regex plus entity decoding for Node-only compatibility.
- [ ] Add `countNodes` and `pagesWithErrors` to report summary.
- [ ] Render errored pages in the HTML page breakdown with the error message escaped.
- [ ] Run `node --test test/url-utils.test.js test/crawler.test.js test/reporter.test.js`.

## Task 3: Worker API

**Files:**
- Create: `src/worker/scan-store.js`
- Create: `src/worker/server.js`
- Create: `src/worker/index.js`
- Modify: `package.json`
- Test: `test/worker.test.js`

- [ ] Add Express dependency and worker scripts.
- [ ] Implement an in-memory scan store with scan IDs, status, config, events, result, error, created/updated timestamps, and cancellation flag.
- [ ] Implement `createWorkerApp({ runPipeline })`.
- [ ] Add `POST /scans` to validate config, create a scan, start `runPipeline` asynchronously, and return `202` with the scan ID.
- [ ] Add `GET /scans/:id` to return scan status, event count, result summary, and errors.
- [ ] Add `GET /scans/:id/events` SSE endpoint that replays existing events and streams new ones.
- [ ] Add `DELETE /scans/:id` to mark queued/running scans as cancelled.
- [ ] Add basic SSRF guardrails: only `http:` and `https:` URLs, reject localhost/private hostnames by default for API scans, and document local override by constructor option.
- [ ] Test the API with a fake `runPipeline`.
- [ ] Run `node --test test/worker.test.js`.

## Task 4: Web Frontend

**Files:**
- Create: `web/package.json`
- Create: `web/index.html`
- Create: `web/src/App.jsx`
- Create: `web/src/main.jsx`
- Create: `web/src/styles.css`
- Create: `web/src/api.js`
- Create: `web/src/sample-result.js`

- [ ] Build a Vite React app that defaults to `VITE_WORKER_URL=http://localhost:4317`.
- [ ] Create a scan form with URL, level, max pages, depth, and screenshot toggle.
- [ ] Validate URL input client-side and show actionable errors.
- [ ] On submit, call `POST /scans`, connect to SSE, and render progress events.
- [ ] Render a dashboard with scanned pages, rule violations, affected elements, pages with issues, pages with errors, and severity totals.
- [ ] Render filterable issue lists by severity and page.
- [ ] Render page breakdown including successful, clean, and errored pages.
- [ ] Add demo mode using `sample-result.js` so the UI is useful without a live worker.
- [ ] Run `npm install` inside `web`, then `npm run build`.

## Task 5: Integration And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/web-app-overview.md`
- Modify: `.gitignore`
- Test: entire repo

- [ ] Document CLI, worker, and web app usage.
- [ ] Add ignored local output folders for worker and frontend builds where needed.
- [ ] Run fast tests: `npm test` after making browser tests timeout-safe or skip with a clear environment diagnostic.
- [ ] Run worker tests.
- [ ] Run web build.
- [ ] Start worker and frontend locally, verify the primary frontend flow in a browser, and capture any blocker.
- [ ] Summarize remaining limitations, especially Chromium launch behavior if still environment-blocked.
