import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function generateSummary(results) {
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let totalViolations = 0;
  let totalNodes = 0;
  let pagesWithViolations = 0;
  let pagesWithErrors = 0;

  for (const page of results) {
    if (page.violations.length > 0) pagesWithViolations++;
    if (page.error) pagesWithErrors++;
    for (const v of page.violations) {
      totalViolations++;
      totalNodes += v.nodes.length;
      if (bySeverity[v.impact] !== undefined) {
        bySeverity[v.impact]++;
      }
    }
  }

  return {
    totalPages: results.length,
    totalViolations,
    totalNodes,
    pagesWithViolations,
    pagesWithErrors,
    bySeverity,
  };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function imageToBase64(filePath) {
  try {
    const data = await readFile(filePath);
    return `data:image/png;base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}

function renderNode(node, screenshotDataUrl) {
  let html = `<div class="node-item">`;
  html += `<div class="node-html">${escapeHtml(node.html)}</div>`;
  html += `<div class="selector">Selector: ${escapeHtml(node.target.join(" > "))}</div>`;
  if (node.failureSummary) {
    html += `<div class="fix-summary">${escapeHtml(node.failureSummary)}</div>`;
  }
  if (screenshotDataUrl) {
    html += `<img class="screenshot-thumb" src="${screenshotDataUrl}" alt="Element screenshot" onclick="openLightbox(this.src)">`;
  }
  html += `</div>`;
  return html;
}

async function renderViolation(violation) {
  let nodesHtml = "";
  for (const node of violation.nodes) {
    const dataUrl = node.screenshotPath ? await imageToBase64(node.screenshotPath) : null;
    nodesHtml += renderNode(node, dataUrl);
  }

  return `<div class="violation-card" data-severity="${violation.impact}">
    <div class="violation-header" onclick="toggleViolation(this)">
      <div>
        <strong>${escapeHtml(violation.id)}</strong> — ${escapeHtml(violation.description)}
        <span style="color:#888; font-size:12px;">(${violation.nodes.length} element${violation.nodes.length === 1 ? "" : "s"})</span>
      </div>
      <span class="badge badge-${violation.impact}">${violation.impact}</span>
    </div>
    <div class="violation-body">
      <p><a href="${escapeHtml(violation.helpUrl)}" target="_blank">Learn more &rarr;</a></p>
      <p style="margin-top:4px; font-size:12px; color:#888;">WCAG: ${violation.wcagTags.join(", ")}</p>
      ${nodesHtml}
    </div>
  </div>`;
}

export async function generateHtmlReport(results, outputDir, level) {
  const summary = generateSummary(results);
  const templatePath = path.join(__dirname, "template.html");
  let template = await readFile(templatePath, "utf-8");

  // Build all-violations view
  const allViolations = [];
  for (const page of results) {
    for (const v of page.violations) {
      allViolations.push(v);
    }
  }
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  allViolations.sort((a, b) => (order[a.impact] ?? 4) - (order[b.impact] ?? 4));

  let violationsHtml = "";
  for (const v of allViolations) {
    violationsHtml += await renderViolation(v);
  }

  // Build pages view
  let pagesHtml = "";
  for (const page of results) {
    pagesHtml += `<div class="page-section">`;
    pagesHtml += `<h3>${escapeHtml(page.pageTitle || page.url)}</h3>`;
    pagesHtml += `<p style="font-size:13px;color:#888;">URL: ${escapeHtml(page.url)} | Load: ${page.loadTimeMs}ms | Violations: ${page.violations.length}</p>`;
    if (page.error) {
      pagesHtml += `<p style="color:#d32f2f;"><strong>Scan error:</strong> ${escapeHtml(page.error)}</p>`;
    } else if (page.violations.length === 0) {
      pagesHtml += `<p style="color:green;">No violations found.</p>`;
    }
    for (const v of page.violations) {
      pagesHtml += await renderViolation(v);
    }
    pagesHtml += `</div>`;
  }

  template = template
    .replaceAll("{{TIMESTAMP}}", new Date().toISOString())
    .replaceAll("{{LEVEL}}", level)
    .replaceAll("{{TOTAL_PAGES}}", String(summary.totalPages))
    .replaceAll("{{CRITICAL}}", String(summary.bySeverity.critical))
    .replaceAll("{{SERIOUS}}", String(summary.bySeverity.serious))
    .replaceAll("{{MODERATE}}", String(summary.bySeverity.moderate))
    .replaceAll("{{MINOR}}", String(summary.bySeverity.minor))
    .replaceAll("{{TOTAL_VIOLATIONS}}", String(summary.totalViolations))
    .replaceAll("{{VIOLATIONS_HTML}}", violationsHtml)
    .replaceAll("{{PAGES_HTML}}", pagesHtml);

  return template;
}
