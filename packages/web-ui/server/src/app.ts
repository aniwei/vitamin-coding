import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { registerRoutes } from "./routes/index.js";
import {
  corsMiddleware,
  secureHeadersMiddleware,
} from "./middlewares/security.js";

export function createApp() {
  const app = new Hono();

  // Global middleware
  app.use("*", secureHeadersMiddleware);
  app.use("*", corsMiddleware);

  // API routes
  registerRoutes(app);

  // Static assets from the Vite build output
  app.use(
    "/assets/*",
    serveStatic({ root: process.env["STATIC_DIR"] ?? "./dist/client" }),
  );

  // SPA fallback – serve index.html for all non-API, non-asset requests
  app.get("*", async (c) => {
    const path = c.req.path;
    if (path.startsWith("/api/")) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "API route not found" } },
        404,
      );
    }

    // Serve index.html for client-side routes
    return serveStatic({
      root: process.env["STATIC_DIR"] ?? "./dist/client",
      path: "index.html",
    })(c, () => Promise.resolve());
  });

  return app;
}

