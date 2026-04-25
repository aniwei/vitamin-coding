import { Hono } from "hono";

const SERVICE_ORIGIN =
  process.env["CODING_SERVICE_URL"] ??
  process.env["NEXT_PUBLIC_CODING_SERVICE_URL"] ??
  "http://localhost:8080";

const codingService = new Hono();

/**
 * ALL /api/coding-service/:path*
 * Reverse-proxy to the coding service, forwarding all methods and headers.
 * Mimics the legacy Next.js catch-all route handler behaviour.
 */
codingService.all("/*", async (c) => {
  const subpath = c.req.path.replace(/^\//, "");
  const url = new URL("/" + subpath, SERVICE_ORIGIN);

  // Forward query string
  const searchParams = new URL(c.req.url).searchParams;
  searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const method = c.req.method;

  const forwardHeaders = new Headers();
  for (const [key, value] of Object.entries(c.req.header())) {
    if (key.toLowerCase() !== "host") {
      forwardHeaders.set(key, value);
    }
  }

  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await c.req.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: forwardHeaders,
      body: body ? Buffer.from(body) : undefined,
    });

    const responseBody = await upstream.arrayBuffer();
    return new Response(responseBody, {
      status: upstream.status,
      headers: upstream.headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return c.json(
      {
        success: false,
        error: { code: "UPSTREAM_ERROR", message },
      },
      502,
    );
  }
});

export { codingService as codingServiceRouter };
