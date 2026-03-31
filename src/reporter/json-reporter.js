import { generateSummary } from "./html-reporter.js";

export function generateJsonReport(results) {
  const summary = generateSummary(results);
  return JSON.stringify({ summary, pages: results }, null, 2);
}
