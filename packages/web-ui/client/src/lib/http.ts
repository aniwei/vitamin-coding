export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiError;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiEnvelope<T>> {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return (await response.json()) as ApiEnvelope<T>;
}

export function httpGet<T>(path: string): Promise<ApiEnvelope<T>> {
  return request<T>("GET", path);
}

export function httpPost<T>(path: string, body?: unknown): Promise<ApiEnvelope<T>> {
  return request<T>("POST", path, body);
}

export function httpPut<T>(path: string, body?: unknown): Promise<ApiEnvelope<T>> {
  return request<T>("PUT", path, body);
}

export function httpDelete<T>(path: string, body?: unknown): Promise<ApiEnvelope<T>> {
  return request<T>("DELETE", path, body);
}
