import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.js";

const exportRouter = new Hono();

// Most export routes require auth; the public detail view (GET /:id) does not
exportRouter.get("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Export fetch not yet wired" },
    },
    501,
  );
});

exportRouter.get("/:id/comments", async (c) => {
  return c.json({ success: true, data: [] });
});

exportRouter.post("/:id/comments", authMiddleware, async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Export comment create not yet wired" },
    },
    501,
  );
});

exportRouter.delete("/:id/comments/:commentId", authMiddleware, async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Export comment delete not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/export
 * List exports for the authenticated user.
 * TODO(Phase 4): wire to exportRepository.selectAll.
 */
exportRouter.get("/", authMiddleware, async (c) => {
  return c.json({ success: true, data: [] });
});

/**
 * POST /api/export
 * Create an export record from a thread.
 * TODO(Phase 4): wire to exportService.create.
 */
exportRouter.post("/", authMiddleware, async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Export create not yet wired" },
    },
    501,
  );
});

export { exportRouter };
