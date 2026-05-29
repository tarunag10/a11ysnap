import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, createScan, getScan, subscribeToScan } from "./api.js";
import { sampleEvents, sampleResult } from "./sample-result.js";

const severityOrder = ["critical", "serious", "moderate", "minor"];
const levelOptions = ["A", "AA", "AAA"];
const eventLabels = {
  "scan:start": "Scan started",
  "discovery:start": "Discovering pages",
  "discovery:complete": "Discovery complete",
  "audit:page:start": "Auditing page",
  "audit:page:complete": "Page audited",
  "audit:page:error": "Page error",
  "report:complete": "Report complete",
  "scan:complete": "Scan complete",
};

const initialForm = {
  url: "",
  level: "AA",
  maxPages: 10,
  depth: 2,
  screenshots: true,
};

function toResultPayload(scan) {
  return scan?.result || scan?.report || scan?.data?.result || scan;
}

function getPages(result) {
  return Array.isArray(result?.pages) ? result.pages : [];
}

function getSummary(result) {
  const pages = getPages(result);
  const fromResult = result?.summary || {};
  const severityTotals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let violations = 0;
  let affectedElements = 0;
  let pagesWithIssues = 0;
  let pagesWithErrors = 0;

  pages.forEach((page) => {
    const pageViolations = Array.isArray(page.violations) ? page.violations : [];
    if (page.error) pagesWithErrors += 1;
    if (pageViolations.length > 0) pagesWithIssues += 1;

    pageViolations.forEach((violation) => {
      violations += 1;
      const impact = violation.impact || "minor";
      if (impact in severityTotals) severityTotals[impact] += 1;
      affectedElements += Array.isArray(violation.nodes) ? violation.nodes.length : 0;
    });
  });

  return {
    scannedPages: fromResult.scannedPages || fromResult.totalPages || pages.length,
    violations: fromResult.totalViolations ?? fromResult.violations ?? violations,
    affectedElements:
      fromResult.affectedElements ?? fromResult.countNodes ?? fromResult.totalNodes ?? affectedElements,
    pagesWithIssues:
      fromResult.pagesWithIssues ?? fromResult.pagesWithViolations ?? pagesWithIssues,
    pagesWithErrors: fromResult.pagesWithErrors ?? pagesWithErrors,
    severityTotals: {
      ...severityTotals,
      ...(fromResult.bySeverity || fromResult.severityTotals || {}),
    },
  };
}

function flattenIssues(result) {
  return getPages(result).flatMap((page) =>
    (page.violations || []).map((violation) => ({
      ...violation,
      pageUrl: page.url,
      pageTitle: page.pageTitle || page.url,
      nodeCount: Array.isArray(violation.nodes) ? violation.nodes.length : 0,
    })),
  );
}

function validateForm(values) {
  const errors = {};
  const trimmedUrl = values.url.trim();

  if (!trimmedUrl) {
    errors.url = "Enter the page URL to scan.";
  } else {
    try {
      const parsed = new URL(trimmedUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.url = "Use an http or https URL.";
      }
    } catch {
      errors.url = "Enter a full URL, for example https://example.com.";
    }
  }

  if (!Number.isInteger(Number(values.maxPages)) || Number(values.maxPages) < 1) {
    errors.maxPages = "Max pages must be at least 1.";
  }

  if (!Number.isInteger(Number(values.depth)) || Number(values.depth) < 0) {
    errors.depth = "Depth must be 0 or greater.";
  }

  return errors;
}

function formatEvent(event) {
  const payload = event.payload || {};
  const url = payload.url || payload.pageUrl;
  const count = payload.count ?? payload.total ?? payload.pages;
  const suffix = url ? ` - ${url}` : count !== undefined ? ` - ${count} page${count === 1 ? "" : "s"}` : "";
  return `${eventLabels[event.type] || event.type}${suffix}`;
}

function normalizeEvent(event) {
  if (typeof event === "string") return { type: event, payload: {}, receivedAt: new Date().toISOString() };
  return {
    type: event?.type || event?.event || "message",
    payload: event?.payload || event?.data || event || {},
    receivedAt: event?.receivedAt || event?.timestamp || new Date().toISOString(),
  };
}

function MetricCard({ label, value, tone }) {
  return (
    <article className={`metric-card ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ScanForm({ form, errors, isRunning, onChange, onSubmit, onDemo }) {
  return (
    <form className="scan-form" onSubmit={onSubmit} noValidate>
      <div className="field field-url">
        <label htmlFor="url">URL</label>
        <input
          id="url"
          type="url"
          value={form.url}
          placeholder="https://example.com"
          onChange={(event) => onChange("url", event.target.value)}
          aria-invalid={Boolean(errors.url)}
          aria-describedby={errors.url ? "url-error" : undefined}
        />
        {errors.url ? (
          <p className="field-error" id="url-error">
            {errors.url}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="level">Level</label>
        <select id="level" value={form.level} onChange={(event) => onChange("level", event.target.value)}>
          {levelOptions.map((level) => (
            <option key={level} value={level}>
              WCAG {level}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="maxPages">Max pages</label>
        <input
          id="maxPages"
          type="number"
          min="1"
          max="250"
          value={form.maxPages}
          onChange={(event) => onChange("maxPages", event.target.value)}
          aria-invalid={Boolean(errors.maxPages)}
          aria-describedby={errors.maxPages ? "max-pages-error" : undefined}
        />
        {errors.maxPages ? (
          <p className="field-error" id="max-pages-error">
            {errors.maxPages}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="depth">Depth</label>
        <input
          id="depth"
          type="number"
          min="0"
          max="10"
          value={form.depth}
          onChange={(event) => onChange("depth", event.target.value)}
          aria-invalid={Boolean(errors.depth)}
          aria-describedby={errors.depth ? "depth-error" : undefined}
        />
        {errors.depth ? (
          <p className="field-error" id="depth-error">
            {errors.depth}
          </p>
        ) : null}
      </div>

      <label className="toggle-control">
        <input
          type="checkbox"
          checked={form.screenshots}
          onChange={(event) => onChange("screenshots", event.target.checked)}
        />
        <span>Capture screenshots</span>
      </label>

      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isRunning}>
          <span aria-hidden="true">{isRunning ? "..." : ">"}</span>
          {isRunning ? "Scanning" : "Start scan"}
        </button>
        <button className="secondary-button" type="button" onClick={onDemo} disabled={isRunning}>
          <span aria-hidden="true">#</span>
          Demo data
        </button>
      </div>
    </form>
  );
}

function ProgressTimeline({ events, status }) {
  return (
    <section className="panel progress-panel" aria-labelledby="progress-heading">
      <div className="panel-header">
        <div>
          <h2 id="progress-heading">Progress</h2>
          <p>{status}</p>
        </div>
      </div>
      <ol className="timeline">
        {events.length === 0 ? (
          <li className="timeline-empty">Progress events will appear when a scan starts.</li>
        ) : (
          events.map((event, index) => (
            <li key={`${event.type}-${event.receivedAt}-${index}`} className={event.type.includes("error") ? "is-error" : ""}>
              <span className="timeline-dot" aria-hidden="true" />
              <div>
                <strong>{formatEvent(event)}</strong>
                <time dateTime={event.receivedAt}>{new Date(event.receivedAt).toLocaleTimeString()}</time>
              </div>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

function SummaryDashboard({ result }) {
  const summary = getSummary(result);

  return (
    <section className="dashboard" aria-label="Scan summary">
      <MetricCard label="Scanned pages" value={summary.scannedPages} />
      <MetricCard label="Violations" value={summary.violations} tone="warning" />
      <MetricCard label="Affected elements" value={summary.affectedElements} />
      <MetricCard label="Pages with issues" value={summary.pagesWithIssues} />
      <MetricCard label="Pages with errors" value={summary.pagesWithErrors} tone="danger" />
      <article className="severity-card">
        <span>Severity totals</span>
        <div className="severity-row">
          {severityOrder.map((severity) => (
            <b key={severity} className={`severity-pill ${severity}`}>
              {severity}: {summary.severityTotals[severity] || 0}
            </b>
          ))}
        </div>
      </article>
    </section>
  );
}

function IssueList({ result }) {
  const issues = useMemo(() => flattenIssues(result), [result]);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [pageFilter, setPageFilter] = useState("all");
  const pageOptions = useMemo(
    () => Array.from(new Set(issues.map((issue) => issue.pageUrl))).sort(),
    [issues],
  );

  const filtered = issues.filter((issue) => {
    const severityMatches = severityFilter === "all" || issue.impact === severityFilter;
    const pageMatches = pageFilter === "all" || issue.pageUrl === pageFilter;
    return severityMatches && pageMatches;
  });

  return (
    <section className="panel issues-panel" aria-labelledby="issues-heading">
      <div className="panel-header split-header">
        <div>
          <h2 id="issues-heading">Issues</h2>
          <p>{filtered.length} of {issues.length} rule violations shown</p>
        </div>
        <div className="filters" aria-label="Issue filters">
          <label>
            Severity
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="all">All</option>
              {severityOrder.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </label>
          <label>
            Page
            <select value={pageFilter} onChange={(event) => setPageFilter(event.target.value)}>
              <option value="all">All pages</option>
              {pageOptions.map((page) => (
                <option key={page} value={page}>
                  {page}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="issue-list">
        {filtered.length === 0 ? (
          <p className="empty-state">No issues match the current filters.</p>
        ) : (
          filtered.map((issue) => (
            <article className="issue-card" key={`${issue.pageUrl}-${issue.id}`}>
              <header>
                <div>
                  <span className={`severity-label ${issue.impact || "minor"}`}>{issue.impact || "minor"}</span>
                  <h3>{issue.id}</h3>
                </div>
                <strong>{issue.nodeCount} element{issue.nodeCount === 1 ? "" : "s"}</strong>
              </header>
              <p>{issue.description}</p>
              <a href={issue.pageUrl} target="_blank" rel="noreferrer">
                {issue.pageTitle}
              </a>
              {issue.helpUrl ? (
                <a className="help-link" href={issue.helpUrl} target="_blank" rel="noreferrer">
                  Rule guidance
                </a>
              ) : null}
              <details>
                <summary>Selectors and fixes</summary>
                <ul>
                  {(issue.nodes || []).map((node, index) => (
                    <li key={`${issue.id}-${index}`}>
                      <code>{(node.target || []).join(" > ") || node.html || "Unknown target"}</code>
                      {node.failureSummary ? <span>{node.failureSummary}</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function PageBreakdown({ result }) {
  const pages = getPages(result);

  return (
    <section className="panel pages-panel" aria-labelledby="pages-heading">
      <div className="panel-header">
        <h2 id="pages-heading">Page breakdown</h2>
      </div>
      <div className="page-list">
        {pages.length === 0 ? (
          <p className="empty-state">Run a scan or load demo data to see page-level results.</p>
        ) : (
          pages.map((page) => {
            const count = page.violations?.length || 0;
            const state = page.error ? "error" : count > 0 ? "issues" : "clean";
            return (
              <article className={`page-row ${state}`} key={page.url}>
                <div>
                  <strong>{page.pageTitle || page.url}</strong>
                  <a href={page.url} target="_blank" rel="noreferrer">
                    {page.url}
                  </a>
                  {page.error ? <p className="page-error">{page.error}</p> : null}
                </div>
                <dl>
                  <div>
                    <dt>State</dt>
                    <dd>{state}</dd>
                  </div>
                  <div>
                    <dt>Violations</dt>
                    <dd>{count}</dd>
                  </div>
                  <div>
                    <dt>Load</dt>
                    <dd>{page.loadTimeMs ?? 0}ms</dd>
                  </div>
                </dl>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("Ready");
  const [scanId, setScanId] = useState(null);
  const [events, setEvents] = useState([]);
  const [scanResult, setScanResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const unsubscribeRef = useRef(null);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const refreshScan = async (id) => {
    const scan = await getScan(id);
    const result = toResultPayload(scan);
    if (result?.pages || result?.summary) {
      setScanResult(result);
    }
    if (scan?.events) {
      setEvents(scan.events.map(normalizeEvent));
    }
    if (scan?.status) {
      setStatus(scan.status);
      if (["complete", "completed", "failed", "cancelled"].includes(scan.status)) {
        setIsRunning(false);
      }
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    unsubscribeRef.current?.();
    setIsRunning(true);
    setStatus("Creating scan");
    setEvents([]);
    setScanId(null);

    try {
      const config = {
        url: form.url.trim(),
        level: form.level,
        maxPages: Number(form.maxPages),
        depth: Number(form.depth),
        screenshots: Boolean(form.screenshots),
      };
      const { id } = await createScan(config);
      setScanId(id);
      setStatus("Running");
      unsubscribeRef.current = subscribeToScan(id, {
        onEvent: (nextEvent) => {
          const normalized = normalizeEvent(nextEvent);
          setEvents((current) => [...current, normalized]);
          if (normalized.type === "scan:complete") {
            setStatus("Complete");
            setIsRunning(false);
            refreshScan(id).catch((error) => setStatus(error.message));
          }
        },
        onError: () => {
          setStatus("SSE disconnected. Polling latest scan state.");
          refreshScan(id).catch((error) => setStatus(error.message));
        },
      });
      await refreshScan(id);
    } catch (error) {
      setStatus(error.message);
      setIsRunning(false);
    }
  };

  const loadDemo = () => {
    unsubscribeRef.current?.();
    setScanId("demo");
    setStatus("Demo mode");
    setEvents(sampleEvents);
    setScanResult(sampleResult);
    setIsRunning(false);
    setErrors({});
    setForm((current) => ({ ...current, url: "https://example.com" }));
  };

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Accessibility scan workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">AllySnap</p>
            <h1>Accessibility scan console</h1>
          </div>
          <div className="connection-card" aria-label="Worker connection">
            <span>Worker</span>
            <strong>{API_BASE}</strong>
          </div>
        </header>

        <div className="tool-grid">
          <section className="panel scan-panel" aria-labelledby="scan-heading">
            <div className="panel-header">
              <div>
                <h2 id="scan-heading">Start a scan</h2>
                <p>{scanId ? `Current scan: ${scanId}` : "Configure scope and run the worker."}</p>
              </div>
            </div>
            <ScanForm
              form={form}
              errors={errors}
              isRunning={isRunning}
              onChange={handleChange}
              onSubmit={handleSubmit}
              onDemo={loadDemo}
            />
          </section>

          <ProgressTimeline events={events} status={status} />
        </div>

        <SummaryDashboard result={scanResult} />

        <div className="results-grid">
          <IssueList result={scanResult} />
          <PageBreakdown result={scanResult} />
        </div>
      </section>
    </main>
  );
}
