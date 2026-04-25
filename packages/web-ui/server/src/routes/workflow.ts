import { Hono } from "hono";
import { authMiddleware } from "../middlewares/auth.js";

const workflow = new Hono();

workflow.use("*", authMiddleware);

/**
 * GET /api/workflow
 * List all workflows for the authenticated user.
 * TODO(Phase 4): wire to workflowRepository.selectAll.
 */
workflow.get("/", async (c) => {
  return c.json({ success: true, data: [] });
});

/**
 * GET /api/workflow/tools
 * List available workflow tools.
 * TODO(Phase 4): wire to workflow tool registry.
 */
workflow.get("/tools", async (c) => {
  return c.json({ success: true, data: [] });
});

/**
 * POST /api/workflow
 * Create or update a workflow.
 * TODO(Phase 4): wire to workflowRepository + permission check.
 */
workflow.post("/", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Workflow create/update not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/workflow/:id
 * Get a single workflow.
 * TODO(Phase 4): wire to workflowRepository.selectById.
 */
workflow.get("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Workflow fetch not yet wired" },
    },
    501,
  );
});

/**
 * PUT /api/workflow/:id
 * Update a workflow.
 * TODO(Phase 4): wire to workflowRepository.update.
 */
workflow.put("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Workflow update not yet wired" },
    },
    501,
  );
});

/**
 * DELETE /api/workflow/:id
 * Delete a workflow.
 * TODO(Phase 4): wire to workflowRepository.delete.
 */
workflow.delete("/:id", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Workflow delete not yet wired" },
    },
    501,
  );
});

/**
 * POST /api/workflow/:id/execute
 * Execute a workflow.
 * TODO(Phase 4): wire to workflow execution engine.
 */
workflow.post("/:id/execute", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Workflow execution not yet wired" },
    },
    501,
  );
});

/**
 * GET /api/workflow/:id/structure
 * Get workflow node/edge structure.
 * TODO(Phase 4): wire to workflowRepository.getStructure.
 */
workflow.get("/:id/structure", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Workflow structure fetch not yet wired" },
    },
    501,
  );
});

/**
 * PUT /api/workflow/:id/structure
 * Update workflow node/edge structure.
 * TODO(Phase 4): wire to workflowRepository.updateStructure.
 */
workflow.put("/:id/structure", async (c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Workflow structure update not yet wired" },
    },
    501,
  );
});

export { workflow as workflowRouter };
