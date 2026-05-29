import { createServer } from "node:http";
import { ScanStore } from "./scan-store.js";

const JSON_CONTENT_TYPE = { "content-type": "application/json; charset=utf-8" };
const PRIVATE_IPV4_RANGES = [
  [[10, 0, 0, 0], [10, 255, 255, 255]],
  [[127, 0, 0, 0], [127, 255, 255, 255]],
  [[169, 254, 0, 0], [169, 254, 255, 255]],
  [[172, 16, 0, 0], [172, 31, 255, 255]],
  [[192, 168, 0, 0], [192, 168, 255, 255]],
];

export function createWorkerApp({
  runPipeline,
  allowPrivateHosts = false,
  defaultConfig = {},
  store = new ScanStore(),
} = {}) {
  if (typeof runPipeline !== "function") {
    throw new TypeError("createWorkerApp requires a runPipeline function");
  }

  const app = async (req, res) => {
    try {
      await routeRequest(req, res, { runPipeline, allowPrivateHosts, defaultConfig, store });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Internal server error" });
    }
  };

  app.listen = (...args) => createServer(app).listen(...args);
  app.store = store;
  return app;
}

async function routeRequest(req, res, context) {
  const url = new URL(req.url, "http://worker.local");
  const scanIdMatch = url.pathname.match(/^\/scans\/([^/]+)$/);
  const eventsMatch = url.pathname.match(/^\/scans\/([^/]+)\/events$/);

  if (req.method === "POST" && url.pathname === "/scans") {
    return createScan(req, res, context);
  }

  if (req.method === "GET" && scanIdMatch) {
    return getScan(res, context.store, scanIdMatch[1]);
  }

  if (req.method === "GET" && eventsMatch) {
    return streamEvents(req, res, context.store, eventsMatch[1]);
  }

  if (req.method === "DELETE" && scanIdMatch) {
    return cancelScan(res, context.store, scanIdMatch[1]);
  }

  return sendJson(res, 404, { error: "Not found" });
}

async function createScan(req, res, { runPipeline, allowPrivateHosts, defaultConfig, store }) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Request body must be valid JSON" });
  }

  const config = { ...defaultConfig, ...body };
  const validation = validateConfig(config, { allowPrivateHosts });
  if (!validation.ok) {
    return sendJson(res, 400, { error: validation.error });
  }

  const scan = store.create(config);
  queueMicrotask(() => runScan(scan.id, runPipeline, store));
  return sendJson(res, 202, { id: scan.id, status: scan.status });
}

function getScan(res, store, id) {
  const scan = store.get(id);
  if (!scan) return sendJson(res, 404, { error: "Scan not found" });
  return sendJson(res, 200, presentScan(scan));
}

function cancelScan(res, store, id) {
  const scan = store.cancel(id);
  if (!scan) return sendJson(res, 404, { error: "Scan not found" });
  return sendJson(res, 200, presentScan(scan));
}

async function runScan(id, runPipeline, store) {
  const started = store.setStatus(id, "running");
  if (!started || started.status === "cancelled") return;

  try {
    const result = await runPipeline(started.config, {
      onEvent: (event) => store.addEvent(id, event),
      isCancelled: () => store.get(id)?.cancellationRequested === true,
    });
    store.complete(id, normalizePipelineResult(result));
  } catch (error) {
    store.fail(id, error);
  }
}

function normalizePipelineResult(result) {
  if (typeof result === "number") {
    return { exitCode: result };
  }
  if (result && typeof result === "object") {
    return result;
  }
  return { value: result };
}

function streamEvents(req, res, store, id) {
  const scan = store.get(id);
  if (!scan) return sendJson(res, 404, { error: "Scan not found" });

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  const writeEvent = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  for (const event of scan.events) {
    writeEvent(event);
  }

  if (isTerminal(scan.status)) {
    res.end();
    return;
  }

  const unsubscribeEvent = store.onScanEvent(id, writeEvent);
  const unsubscribeTerminal = store.onScanTerminal(id, () => {
    cleanup();
    res.end();
  });

  const cleanup = () => {
    unsubscribeEvent();
    unsubscribeTerminal();
    req.off("close", cleanup);
  };

  req.on("close", cleanup);
}

function presentScan(scan) {
  const summary = scan.result?.summary ?? null;
  return {
    id: scan.id,
    status: scan.status,
    config: scan.config,
    eventCount: scan.events.length,
    events: scan.events,
    result: scan.result,
    summary,
    error: scan.error,
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt,
    cancellationRequested: scan.cancellationRequested,
  };
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

function validateConfig(config, { allowPrivateHosts }) {
  if (!config.url || typeof config.url !== "string") {
    return { ok: false, error: "Missing required url" };
  }

  let parsed;
  try {
    parsed = new URL(config.url);
  } catch {
    return { ok: false, error: "Invalid url" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "URL protocol must be http or https" };
  }

  if (!allowPrivateHosts && isPrivateHostname(parsed.hostname)) {
    return { ok: false, error: "Private and localhost URLs are disabled" };
  }

  return { ok: true };
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "[::1]") return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;

  const ipv4 = parseIpv4(host);
  if (!ipv4) return false;
  return PRIVATE_IPV4_RANGES.some(([start, end]) => inIpv4Range(ipv4, start, end));
}

function parseIpv4(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => Number(part));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null;
  return bytes;
}

function inIpv4Range(ip, start, end) {
  const value = ipv4ToNumber(ip);
  return value >= ipv4ToNumber(start) && value <= ipv4ToNumber(end);
}

function ipv4ToNumber(ip) {
  return ip.reduce((value, byte) => value * 256 + byte, 0);
}

function isTerminal(status) {
  return ["completed", "failed", "cancelled"].includes(status);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, JSON_CONTENT_TYPE);
  res.end(JSON.stringify(payload));
}
