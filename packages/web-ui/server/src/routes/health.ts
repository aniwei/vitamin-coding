import type { Context } from "hono";

export function healthHandler(c: Context) {
  return c.json({ success: true, data: { status: "ok" } });
}
