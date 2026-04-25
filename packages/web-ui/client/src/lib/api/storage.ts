import { httpGet, httpPost } from "../http";
import type { ApiEnvelope } from "../http";

export interface UploadUrlResponse {
  uploadUrl: string;
  fileKey: string;
}

export interface UploadResponse {
  fileKey: string;
  url: string;
}

export function getUploadUrl(params: {
  filename: string;
  contentType: string;
}): Promise<ApiEnvelope<UploadUrlResponse>> {
  return httpPost<UploadUrlResponse>("/api/storage/upload-url", params);
}

export function uploadFile(
  formData: FormData,
): Promise<ApiEnvelope<UploadResponse>> {
  return fetch("/api/storage/upload", {
    method: "POST",
    body: formData,
  }).then((r) => r.json()) as Promise<ApiEnvelope<UploadResponse>>;
}

export function ingestFile(params: {
  fileKey: string;
  threadId?: string;
}): Promise<ApiEnvelope<void>> {
  return httpPost<void>("/api/storage/ingest", params);
}

export function getStorageFile(fileKey: string): Promise<ApiEnvelope<{ url: string }>> {
  return httpGet<{ url: string }>(`/api/storage/${encodeURIComponent(fileKey)}`);
}
