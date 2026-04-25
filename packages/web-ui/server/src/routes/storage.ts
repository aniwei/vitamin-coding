import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.js";

const storage = new Hono();

storage.use("*", authMiddleware);

/**
 * POST /api/storage/upload-url
 * Generate a pre-signed upload URL.
 * TODO(Phase 4): wire to serverFileStorage.getUploadUrl.
 */
storage.post("/upload-url", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Upload URL generation not yet wired" },
    },
    501,
  );
});

/**
 * POST /api/storage/upload
 * Direct file upload (multipart/form-data).
 * TODO(Phase 4): wire to serverFileStorage.upload.
 */
storage.post("/upload", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "File upload not yet wired" },
    },
    501,
  );
});

/**
 * POST /api/storage/ingest
 * Ingest a previously uploaded file into a thread.
 * TODO(Phase 4): wire to ingestion pipeline.
 */
storage.post("/ingest", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "File ingest not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/storage/:key
 * Get a storage file URL by key.
 * TODO(Phase 4): wire to serverFileStorage.getUrl.
 */
storage.get("/:key{.+}", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Storage file fetch not yet wired" },
    },
    501,
  );
});

export { storage as storageRouter };
