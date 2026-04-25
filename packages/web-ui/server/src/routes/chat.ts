import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.js";

const chat = new Hono();

// All chat routes require auth
chat.use("*", authMiddleware);

/**
 * POST /api/chat
 * Send a message / start a streaming response.
 * TODO(Phase 4): wire to AI streaming service (Vercel AI SDK / custom stream).
 */
chat.post("/", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Chat streaming not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/chat/models
 * List available AI models.
 * TODO(Phase 4): wire to customModelProvider.
 */
chat.get("/models", async (c) => {
  return c.json({ success: true, data: [] });
});

/**
 * POST /api/chat/title
 * Generate a title for a thread.
 * TODO(Phase 4): wire to title generation service.
 */
chat.post("/title", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Title generation not yet wired" },
    },
    501,
  );
});

/**
 * POST /api/chat/temporary
 * Create a temporary (anonymous) session.
 * TODO(Phase 4): wire to session service.
 */
chat.post("/temporary", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Temporary session not yet wired" },
    },
    501,
  );
});

/**
 * POST /api/chat/export
 * Export a thread to a shareable URL.
 * TODO(Phase 4): wire to export service.
 */
chat.post("/export", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Chat export not yet wired" },
    },
    501,
  );
});

export { chat as chatRouter };
