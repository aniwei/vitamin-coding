import { httpGet, httpPost, httpDelete } from "../http";
import type { ApiEnvelope } from "../http";

export interface Archive {
  id: string;
  title: string;
  createdAt: string;
}

export interface ArchiveItem {
  id: string;
  archiveId: string;
  content: string;
  createdAt: string;
}

export function getArchives(): Promise<ApiEnvelope<Archive[]>> {
  return httpGet<Archive[]>("/api/archive");
}

export function getArchive(id: string): Promise<ApiEnvelope<Archive>> {
  return httpGet<Archive>(`/api/archive/${id}`);
}

export function createArchive(
  data: Omit<Archive, "id" | "createdAt">,
): Promise<ApiEnvelope<Archive>> {
  return httpPost<Archive>("/api/archive", data);
}

export function deleteArchive(id: string): Promise<ApiEnvelope<void>> {
  return httpDelete<void>(`/api/archive/${id}`);
}

export function getArchiveItems(
  archiveId: string,
): Promise<ApiEnvelope<ArchiveItem[]>> {
  return httpGet<ArchiveItem[]>(`/api/archive/${archiveId}/items`);
}

export function getArchiveItem(
  archiveId: string,
  itemId: string,
): Promise<ApiEnvelope<ArchiveItem>> {
  return httpGet<ArchiveItem>(`/api/archive/${archiveId}/items/${itemId}`);
}
