import { Hono } from "hono";
import { healthHandler } from "./health.js";
import { chatRouter } from "./chat.js";
import { sessionsRouter } from "./sessions.js";
import { mcpRouter } from "./mcp.js";
import { workflowRouter } from "./workflow.js";
import { userRouter } from "./user.js";
import { adminRouter } from "./admin.js";
import { archiveRouter } from "./archive.js";
import { storageRouter } from "./storage.js";
import { exportRouter } from "./export.js";
import { settingsRouter } from "./settings.js";
import { codingServiceRouter } from "./coding-service.js";

export function registerRoutes(app: Hono) {
  // Diagnostic
  app.get("/api/health", healthHandler);

  // Feature routes
  app.route("/api/chat", chatRouter);
  app.route("/api/thread", sessionsRouter);
  app.route("/api/mcp", mcpRouter);
  app.route("/api/workflow", workflowRouter);
  app.route("/api/user", userRouter);
  app.route("/api/admin", adminRouter);
  app.route("/api/archive", archiveRouter);
  app.route("/api/storage", storageRouter);
  app.route("/api/export", exportRouter);
  app.route("/api/settings", settingsRouter);
  app.route("/api/coding-service", codingServiceRouter);
}

