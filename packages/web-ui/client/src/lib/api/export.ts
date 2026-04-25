import { httpGet, httpPost, httpDelete } from "../http";
import type { ApiEnvelope } from "../http";

export interface ExportRecord {
  id: string;
  threadId: string;
  url: string;
  createdAt: string;
}

export interface ExportComment {
  id: string;
  exportId: string;
  content: string;
  author: string;
  createdAt: string;
}

export function getExports(): Promise<ApiEnvelope<ExportRecord[]>> {
  return httpGet<ExportRecord[]>("/api/export");
}

export function getExport(id: string): Promise<ApiEnvelope<ExportRecord>> {
  return httpGet<ExportRecord>(`/api/export/${id}`);
}

export function createExport(params: {
  threadId: string;
}): Promise<ApiEnvelope<ExportRecord>> {
  return httpPost<ExportRecord>("/api/export", params);
}

export function getExportComments(
  exportId: string,
): Promise<ApiEnvelope<ExportComment[]>> {
  return httpGet<ExportComment[]>(`/api/export/${exportId}/comments`);
}

export function addExportComment(
  exportId: string,
  data: { content: string },
): Promise<ApiEnvelope<ExportComment>> {
  return httpPost<ExportComment>(`/api/export/${exportId}/comments`, data);
}

export function deleteExportComment(
  exportId: string,
  commentId: string,
): Promise<ApiEnvelope<void>> {
  return httpDelete<void>(`/api/export/${exportId}/comments/${commentId}`);
}
