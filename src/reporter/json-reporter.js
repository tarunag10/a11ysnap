import { generateSummary } from "./html-reporter.js";

export function generateJsonReport(results) {
  const summary = generateSummary(results);
  return JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      summary,
      pages: results,
    },
    null,
    2
  );
}
