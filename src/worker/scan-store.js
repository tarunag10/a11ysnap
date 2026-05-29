import { EventEmitter } from "node:events";

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export class ScanStore {
  constructor({ idPrefix = "scan" } = {}) {
    this.idPrefix = idPrefix;
    this.nextId = 1;
    this.scans = new Map();
    this.events = new EventEmitter();
  }

  create(config) {
    const now = new Date().toISOString();
    const id = `${this.idPrefix}_${this.nextId++}`;
    const scan = {
      id,
      status: "queued",
      config,
      events: [],
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      cancellationRequested: false,
    };

    this.scans.set(id, scan);
    this.emit(id, "changed", this.snapshot(id));
    return this.snapshot(id);
  }

  get(id) {
    return this.snapshot(id);
  }

  setStatus(id, status) {
    const scan = this.scans.get(id);
    if (!scan || TERMINAL_STATUSES.has(scan.status)) return this.snapshot(id);

    scan.status = status;
    this.touch(scan);
    this.emit(id, "changed", this.snapshot(id));
    return this.snapshot(id);
  }

  addEvent(id, event) {
    const scan = this.scans.get(id);
    if (!scan) return null;

    const storedEvent = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };
    scan.events.push(storedEvent);
    this.touch(scan);
    this.emit(id, "event", storedEvent);
    this.emit(id, "changed", this.snapshot(id));
    return storedEvent;
  }

  complete(id, result) {
    const scan = this.scans.get(id);
    if (!scan || scan.status === "cancelled") return this.snapshot(id);

    scan.status = "completed";
    scan.result = result;
    scan.error = null;
    this.touch(scan);
    this.emit(id, "changed", this.snapshot(id));
    this.emit(id, "terminal", this.snapshot(id));
    return this.snapshot(id);
  }

  fail(id, error) {
    const scan = this.scans.get(id);
    if (!scan || scan.status === "cancelled") return this.snapshot(id);

    scan.status = "failed";
    scan.error = serializeError(error);
    this.touch(scan);
    this.emit(id, "changed", this.snapshot(id));
    this.emit(id, "terminal", this.snapshot(id));
    return this.snapshot(id);
  }

  cancel(id) {
    const scan = this.scans.get(id);
    if (!scan) return null;

    scan.cancellationRequested = true;
    if (ACTIVE_STATUSES.has(scan.status)) {
      scan.status = "cancelled";
    }
    this.touch(scan);
    this.emit(id, "changed", this.snapshot(id));
    this.emit(id, "terminal", this.snapshot(id));
    return this.snapshot(id);
  }

  onScanEvent(id, listener) {
    const eventName = `${id}:event`;
    this.events.on(eventName, listener);
    return () => this.events.off(eventName, listener);
  }

  onScanTerminal(id, listener) {
    const eventName = `${id}:terminal`;
    this.events.on(eventName, listener);
    return () => this.events.off(eventName, listener);
  }

  touch(scan) {
    scan.updatedAt = new Date().toISOString();
  }

  emit(id, type, payload) {
    this.events.emit(`${id}:${type}`, payload);
  }

  snapshot(id) {
    const scan = this.scans.get(id);
    if (!scan) return null;

    return {
      ...scan,
      config: { ...scan.config },
      events: scan.events.map((event) => ({ ...event })),
      result: cloneValue(scan.result),
      error: cloneValue(scan.error),
    };
  }
}

function serializeError(error) {
  if (!error) return { message: "Unknown error" };
  return {
    message: error.message || String(error),
    name: error.name || "Error",
  };
}

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}
