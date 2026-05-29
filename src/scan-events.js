export const SCAN_EVENTS = {
  SCAN_START: "scan:start",
  DISCOVERY_START: "discovery:start",
  DISCOVERY_COMPLETE: "discovery:complete",
  AUDIT_PAGE_START: "audit:page:start",
  AUDIT_PAGE_COMPLETE: "audit:page:complete",
  AUDIT_PAGE_ERROR: "audit:page:error",
  REPORT_COMPLETE: "report:complete",
  SCAN_COMPLETE: "scan:complete",
};

export function createScanEvent(type, payload = {}) {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}
