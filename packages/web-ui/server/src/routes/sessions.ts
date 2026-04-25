import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.js";

const sessions = new Hono();

sessions.use("*", authMiddleware);

/**
 * GET /api/thread
 * List threads for the authenticated user.
 * TODO(Phase 4): wire to chatRepository.selectThreadsByUserId.
 */
sessions.get("/", async (c) => {
  return c.json({ success: true, data: [] });
});

/**
 * POST /api/thread
 * Create a new thread.
 * TODO(Phase 4): wire to chatRepository.insertThread.
 */
sessions.post("/", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Thread creation not yet wired" },
    },
    501,
  );
});

/**
 * DELETE /api/thread/:id
 * Delete a thread by ID.
 * TODO(Phase 4): wire to chatRepository.deleteThread.
 */
sessions.delete("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Thread deletion not yet wired" },
    },
    501,
  );
});

export { sessions as sessionsRouter };
