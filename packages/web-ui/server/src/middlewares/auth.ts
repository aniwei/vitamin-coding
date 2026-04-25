import type { Context, MiddlewareHandler, Next } from "hono";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/**
 * Auth middleware.
 * Reads the session cookie / Authorization bearer token, validates it,
 * and sets `c.var.user` for downstream handlers.
 *
 * NOTE: Real session validation (better-auth / DB lookup) will be wired
 * in Phase 4 when the auth service is integrated. This stub enforces the
 * 401 boundary so that unauthenticated requests are rejected correctly.
 */
export const authMiddleware: MiddlewareHandler = async (
  c: Context,
  next: Next,
) => {
  // Check Authorization header (Bearer token) OR session cookie
  const authHeader = c.req.header("Authorization");
  const sessionCookie = getCookie(c, "auth_session");

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : sessionCookie;

  if (!token) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      },
      401,
    );
  }

  // TODO(Phase 4): validate token against session store / better-auth
  // For now, decode a minimal payload stub so the route layer can reference c.var.user
  // This will be replaced with real validation.
  const user = decodeSessionToken(token);
  if (!user) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid or expired session" },
      },
      401,
    );
  }

  c.set("user", user);
  await next();
};

/**
 * Admin-only guard – must be composed after authMiddleware.
 */
export const adminMiddleware: MiddlewareHandler = async (
  c: Context,
  next: Next,
) => {
  const user = c.var.user;
  if (!user || user.role !== "admin") {
    return c.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Admin permission required" },
      },
      403,
    );
  }
  await next();
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCookie(c: Context, name: string): string | undefined {
  const header = c.req.header("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

/**
 * Minimal stub decoder.
 * Replace with `better-auth` session lookup in Phase 4.
 */
function decodeSessionToken(token: string): AuthUser | null {
  try {
    // Attempt base64-encoded JSON (dev convenience format)
    const json = Buffer.from(token, "base64url").toString("utf8");
    const obj = JSON.parse(json) as unknown;
    if (
      obj !== null &&
      typeof obj === "object" &&
      "id" in obj &&
      "email" in obj &&
      "role" in obj
    ) {
      return obj as AuthUser;
    }
    return null;
  } catch {
    return null;
  }
}
