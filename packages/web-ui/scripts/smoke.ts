import { spawn, type ChildProcess } from "node:child_process";

const port = Number(process.env["WEB_UI_SMOKE_PORT"] ?? 4010);
const baseUrl = `http://127.0.0.1:${port}`;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  return { response, text };
}

async function waitForHealthy(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

function startServer() {
  const child = spawn("node", ["server/dist/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: "inherit",
  });

  return child;
}

async function verifyRoutes() {
  const healthResponse = await fetch(`${baseUrl}/api/health`);
  if (!healthResponse.ok) {
    throw new Error(`/api/health returned ${healthResponse.status}`);
  }

  const healthPayload = (await healthResponse.json()) as {
    success?: boolean;
    data?: { status?: string };
  };

  if (!healthPayload.success || healthPayload.data?.status !== "ok") {
    throw new Error(`/api/health returned unexpected payload: ${JSON.stringify(healthPayload)}`);
  }

  const root = await fetchText("/");
  if (!root.response.ok) {
    throw new Error(`/ returned ${root.response.status}`);
  }

  if (!root.text.includes("<div id=\"root\"></div>")) {
    throw new Error("/ did not return the SPA entry html");
  }

  const deepLink = await fetchText("/chat/smoke-thread");
  if (!deepLink.response.ok) {
    throw new Error(`/chat/smoke-thread returned ${deepLink.response.status}`);
  }

  if (!deepLink.text.includes("<div id=\"root\"></div>")) {
    throw new Error("deep link did not resolve through SPA fallback");
  }

  const assetMatch = root.text.match(/(?:src|href)="(\/assets\/[^"]+)"/);
  if (!assetMatch) {
    throw new Error("Could not find a built asset reference in index.html");
  }

  const assetResponse = await fetch(`${baseUrl}${assetMatch[1]}`);
  if (!assetResponse.ok) {
    throw new Error(`${assetMatch[1]} returned ${assetResponse.status}`);
  }
}

async function stopServer(child: ChildProcess) {
  if (child.killed) {
    return;
  }

  child.kill("SIGTERM");

  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 5_000);
  });
}

async function main() {
  let child: ChildProcess | null = null;

  try {
    child = startServer();
    await waitForHealthy();
    await verifyRoutes();
    console.log(`Smoke checks passed for ${baseUrl}`);
  } finally {
    if (child) {
      await stopServer(child);
    }
  }
}

void main().catch((error) => {
  console.error("Smoke checks failed:", error);
  process.exit(1);
});