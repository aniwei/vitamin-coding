import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.js";

const settings = new Hono();

settings.use("*", authMiddleware);

/**
 * GET /api/settings
 * Get application settings for the authenticated user.
 * TODO(Phase 4): wire to settingsRepository.get.
 */
settings.get("/", async (c) => {
  return c.json({ success: true, data: {} });
});

/**
 * PUT /api/settings
 * Update application settings.
 * TODO(Phase 4): wire to settingsRepository.update.
 */
settings.put("/", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Settings update not yet wired" },
    },
    501,
  );
});

export { settings as settingsRouter };
