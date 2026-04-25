import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env["PORT"] ?? 4000);

const app = createApp();

serve({
  fetch: app.fetch,
  port,
});

console.log(`Web UI server listening on :${port}`);
