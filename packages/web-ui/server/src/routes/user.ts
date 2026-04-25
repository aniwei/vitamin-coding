import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.js";

const user = new Hono();

user.use("*", authMiddleware);

/**
 * GET /api/user/details
 * Get details for the currently authenticated user.
 * TODO(Phase 4): wire to userRepository.getById.
 */
user.get("/details", async (c) => {
  const u = c.var.user;
  return c.json({ success: true, data: { id: u.id, email: u.email, role: u.role } });
});

/**
 * GET /api/user/details/:id
 * Get details for another user (admin only or self).
 * TODO(Phase 4): wire to userRepository.getById + access check.
 */
user.get("/details/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "User detail fetch not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/user/preferences
 * Get preferences for the authenticated user.
 * TODO(Phase 4): wire to userRepository.getPreferences.
 */
user.get("/preferences", async (c) => {
  return c.json({ success: true, data: {} });
});

/**
 * PUT /api/user/preferences
 * Update preferences for the authenticated user.
 * TODO(Phase 4): wire to userRepository.updatePreferences.
 */
user.put("/preferences", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "User preferences update not yet wired" },
    },
    501,
  );
});

export { user as userRouter };
