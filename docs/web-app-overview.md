# A11ySnap Web App Overview

## Concept

A11ySnap now has a web scan console layered on top of the existing CLI engine.
Users paste a URL, start a scan, watch real-time progress, and inspect the WCAG
result inline.

## Architecture

### 1. Frontend

- Vite + React app in `web/`
- Uses `VITE_WORKER_URL` or `http://localhost:4317` as the worker base URL
- Provides a usable scan console as the first screen
- Includes demo mode for local UI review without a live worker
- Renders summary metrics, severity filters, issue details, and page breakdowns

### 2. Crawl Worker

- Node HTTP worker in `src/worker/`
- Wraps the reusable `runPipeline(config, hooks)` engine
- Stores scan state in memory for V1
- Streams progress through `/scans/:id/events` using Server-Sent Events
- Exposes scan lifecycle through `POST`, `GET`, and `DELETE /scans`

## User Flow

```text
User enters URL -> Frontend POSTs /scans
                -> Worker creates scan and starts pipeline
                -> Pipeline emits discovery/audit/report events
                -> Frontend receives SSE progress
                -> Frontend fetches final scan result
                -> User filters issues and page outcomes inline
```

## Local Development

```bash
npm run worker
npm run web:dev
```

Set `VITE_WORKER_URL=http://127.0.0.1:3001` if the worker is not running on the
frontend default.

## Current Limits

- Worker scan storage is in memory.
- API SSRF protection rejects literal localhost/private hosts by default but does
  not yet resolve DNS to detect public names that point at private IPs.
- Browser-backed audit tests are opt-in with `npm run test:browser`; the default
  suite avoids Playwright import/launch because Chromium can hang in constrained
  local environments.
