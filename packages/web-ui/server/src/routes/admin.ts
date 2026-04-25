import { Hono } from "hono";
import { authMiddleware, adminMiddleware } from "../middlewares/auth.js";

const admin = new Hono();

// All admin routes require auth + admin role
admin.use("*", authMiddleware);
admin.use("*", adminMiddleware);

/**
 * GET /api/admin/users
 * List all users (admin only).
 * TODO(Phase 4): wire to userRepository.selectAll.
 */
admin.get("/users", async (c) => {
  return c.json({ success: true, data: [] });
});

/**
 * GET /api/admin/users/:id
 * Get a user by ID (admin only).
 * TODO(Phase 4): wire to userRepository.getById.
 */
admin.get("/users/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Admin user fetch not yet wired" },
    },
    501,
  );
});

/**
 * POST /api/admin/users
 * Create a user (admin only).
 * TODO(Phase 4): wire to userRepository.insert.
 */
admin.post("/users", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Admin user create not yet wired" },
    },
    501,
  );
});

/**
 * PUT /api/admin/users/:id
 * Update a user (admin only).
 * TODO(Phase 4): wire to userRepository.update.
 */
admin.put("/users/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Admin user update not yet wired" },
    },
    501,
  );
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user (admin only).
 * TODO(Phase 4): wire to userRepository.delete.
 */
admin.delete("/users/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Admin user delete not yet wired" },
    },
    501,
  );
});

export { admin as adminRouter };
