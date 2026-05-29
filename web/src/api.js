export const API_BASE = (import.meta.env.VITE_WORKER_URL || "http://localhost:4317").replace(
  /\/$/,
  "",
);

async function parseResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.error ||
      data?.message ||
      data?.errors?.join?.(", ") ||
      `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function createScan(config) {
  const response = await fetch(`${API_BASE}/scans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await parseResponse(response);
  const id = data?.id || data?.scanId || data?.scan?.id;

  if (!id) {
    throw new Error("Worker did not return a scan ID.");
  }

  return { id, data };
}

export async function getScan(id) {
  const response = await fetch(`${API_BASE}/scans/${encodeURIComponent(id)}`);
  return parseResponse(response);
}

export function subscribeToScan(id, handlers = {}) {
  const source = new EventSource(`${API_BASE}/scans/${encodeURIComponent(id)}/events`);
  const handleMessage = (event) => {
    let payload = event.data;
    try {
      payload = JSON.parse(event.data);
    } catch {
      payload = { message: event.data };
    }
    handlers.onEvent?.({
      type: event.type === "message" ? payload.type || payload.event || "message" : event.type,
      payload,
      receivedAt: new Date().toISOString(),
    });
  };

  source.onmessage = handleMessage;
  source.onerror = (event) => handlers.onError?.(event);

  [
    "scan:start",
    "discovery:start",
    "discovery:complete",
    "audit:page:start",
    "audit:page:complete",
    "audit:page:error",
    "report:complete",
    "scan:complete",
  ].forEach((eventName) => source.addEventListener(eventName, handleMessage));

  return () => source.close();
}
