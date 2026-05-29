import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createWorkerApp } from "../src/worker/server.js";

async function withServer(app, fn) {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function readSseEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }

  buffer += decoder.decode();
  return buffer
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      return JSON.parse(dataLine.slice("data: ".length));
    });
}

describe("worker API", () => {
  it("rejects missing, invalid, and private URLs", async () => {
    const app = createWorkerApp({ runPipeline: async () => ({ summary: {} }) });

    await withServer(app, async (baseUrl) => {
      const missing = await fetch(`${baseUrl}/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(missing.status, 400);

      const invalid = await fetch(`${baseUrl}/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "not a url" }),
      });
      assert.equal(invalid.status, 400);

      const privateHost = await fetch(`${baseUrl}/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "http://localhost:3000" }),
      });
      assert.equal(privateHost.status, 400);
    });
  });

  it("creates scans, records pipeline events, and exposes a completed summary", async () => {
    const seenConfigs = [];
    const app = createWorkerApp({
      defaultConfig: { depth: 1 },
      runPipeline: async (config, hooks) => {
        seenConfigs.push(config);
        hooks.onEvent({ type: "page", url: config.url });
        return { summary: { pages: 1, violations: 0 }, reportPaths: { json: "report.json" } };
      },
    });

    await withServer(app, async (baseUrl) => {
      const created = await fetch(`${baseUrl}/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      });

      assert.equal(created.status, 202);
      const body = await created.json();
      assert.match(body.id, /^scan_/);
      assert.equal(body.status, "queued");

      let scan;
      for (let i = 0; i < 20; i += 1) {
        const response = await fetch(`${baseUrl}/scans/${body.id}`);
        scan = await response.json();
        if (scan.status === "completed") break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      assert.equal(scan.status, "completed");
      assert.equal(scan.eventCount, 1);
      assert.deepEqual(scan.summary, { pages: 1, violations: 0 });
      assert.deepEqual(scan.result.reportPaths, { json: "report.json" });
      assert.equal(seenConfigs[0].depth, 1);
      assert.equal(seenConfigs[0].url, "https://example.com");
    });
  });

  it("replays SSE events and closes after completion", async () => {
    const app = createWorkerApp({
      runPipeline: async (_config, hooks) => {
        hooks.onEvent({ type: "started" });
        await new Promise((resolve) => setTimeout(resolve, 10));
        hooks.onEvent({ type: "finished" });
        return { summary: { pages: 2 } };
      },
    });

    await withServer(app, async (baseUrl) => {
      const created = await fetch(`${baseUrl}/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      });
      const { id } = await created.json();

      const stream = await fetch(`${baseUrl}/scans/${id}/events`);
      assert.equal(stream.status, 200);
      assert.equal(stream.headers.get("content-type"), "text/event-stream");

      const events = await readSseEvents(stream);
      assert.deepEqual(
        events.map((event) => event.type),
        ["started", "finished"]
      );
    });
  });

  it("marks running scans as cancelled", async () => {
    let release;
    const app = createWorkerApp({
      runPipeline: async () => {
        await new Promise((resolve) => {
          release = resolve;
        });
        return { summary: { pages: 0 } };
      },
    });

    await withServer(app, async (baseUrl) => {
      const created = await fetch(`${baseUrl}/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      });
      const { id } = await created.json();

      const deleted = await fetch(`${baseUrl}/scans/${id}`, { method: "DELETE" });
      assert.equal(deleted.status, 200);
      assert.equal((await deleted.json()).status, "cancelled");

      const state = await fetch(`${baseUrl}/scans/${id}`);
      assert.equal((await state.json()).status, "cancelled");

      release();
    });
  });
});
