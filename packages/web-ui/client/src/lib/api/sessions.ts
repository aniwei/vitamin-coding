import { httpGet, httpPost, httpDelete } from "../http";
import type { ApiEnvelope } from "../http";

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export function getThreads(): Promise<ApiEnvelope<Thread[]>> {
  return httpGet<Thread[]>("/api/thread");
}

export function createThread(): Promise<ApiEnvelope<Thread>> {
  return httpPost<Thread>("/api/thread");
}

export function deleteThread(id: string): Promise<ApiEnvelope<void>> {
  return httpDelete<void>(`/api/thread/${id}`);
}
