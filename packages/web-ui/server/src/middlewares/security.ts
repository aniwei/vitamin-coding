import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

const CLIENT_ORIGIN =
  process.env["CLIENT_ORIGIN"] ?? "http://localhost:5173";

/**
 * CORS – allow requests from the Vite dev server and production origin.
 */
export const corsMiddleware: MiddlewareHandler = cors({
  origin: [CLIENT_ORIGIN],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 3600,
});

/**
 * Secure headers – sets CSP, X-Frame-Options, HSTS, etc.
 */
export const secureHeadersMiddleware: MiddlewareHandler = secureHeaders({
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
});
