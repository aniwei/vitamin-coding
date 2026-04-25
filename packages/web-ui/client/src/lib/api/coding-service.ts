import type { ApiEnvelope } from "../http";

/**
 * Proxy requests to the coding service via server gateway.
 * All methods/paths are forwarded as-is.
 */
export async function codingServiceRequest<T>(
  method: string,
  subpath: string,
  body?: unknown,
): Promise<ApiEnvelope<T>> {
  const path = `/api/coding-service/${subpath.replace(/^\//, "")}`;
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return (await response.json()) as ApiEnvelope<T>;
}

export function codingServiceGet<T>(subpath: string): Promise<ApiEnvelope<T>> {
  return codingServiceRequest<T>("GET", subpath);
}

export function codingServicePost<T>(
  subpath: string,
  body?: unknown,
): Promise<ApiEnvelope<T>> {
  return codingServiceRequest<T>("POST", subpath, body);
}
