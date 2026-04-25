import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.js";

const archive = new Hono();

archive.use("*", authMiddleware);

/**
 * GET /api/archive
 * List archives for the authenticated user.
 * TODO(Phase 4): wire to archiveRepository.selectAll.
 */
archive.get("/", async (c) => {
  return c.json({ success: true, data: [] });
});

/**
 * POST /api/archive
 * Create an archive.
 * TODO(Phase 4): wire to archiveRepository.insert.
 */
archive.post("/", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Archive create not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/archive/:id
 * Get a single archive.
 * TODO(Phase 4): wire to archiveRepository.selectById.
 */
archive.get("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Archive fetch not yet wired" },
    },
    501,
  );
});

/**
 * DELETE /api/archive/:id
 * Delete an archive.
 * TODO(Phase 4): wire to archiveRepository.delete.
 */
archive.delete("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Archive delete not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/archive/:id/items
 * List items in an archive.
 * TODO(Phase 4): wire to archiveRepository.selectItems.
 */
archive.get("/:id/items", async (c) => {
  return c.json({ success: true, data: [] });
});

/**
 * GET /api/archive/:id/items/:itemId
 * Get a single archive item.
 * TODO(Phase 4): wire to archiveRepository.selectItemById.
 */
archive.get("/:id/items/:itemId", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Archive item fetch not yet wired" },
    },
    501,
  );
});

export { archive as archiveRouter };
