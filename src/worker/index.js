import { fileURLToPath } from "node:url";
import { ScanStore } from "./scan-store.js";
import { createWorkerApp } from "./server.js";

export { ScanStore, createWorkerApp };

export async function startWorkerServer({
  port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "127.0.0.1",
  allowPrivateHosts = process.env.ALLYSNAP_ALLOW_PRIVATE_HOSTS === "true",
  defaultConfig = {},
} = {}) {
  const { runPipeline } = await import("../pipeline.js");
  const app = createWorkerApp({ runPipeline, allowPrivateHosts, defaultConfig });
  const server = app.listen(port, host, () => {
    const address = server.address();
    const boundPort = typeof address === "object" && address ? address.port : port;
    console.log(`AllySnap worker listening on http://${host}:${boundPort}`);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startWorkerServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
