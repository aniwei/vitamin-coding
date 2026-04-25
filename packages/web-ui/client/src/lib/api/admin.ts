import { httpGet, httpPost, httpPut, httpDelete } from "../http";
import type { ApiEnvelope } from "../http";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export function getAdminUsers(): Promise<ApiEnvelope<AdminUser[]>> {
  return httpGet<AdminUser[]>("/api/admin/users");
}

export function getAdminUser(id: string): Promise<ApiEnvelope<AdminUser>> {
  return httpGet<AdminUser>(`/api/admin/users/${id}`);
}

export function createAdminUser(
  data: Omit<AdminUser, "id" | "createdAt">,
): Promise<ApiEnvelope<AdminUser>> {
  return httpPost<AdminUser>("/api/admin/users", data);
}

export function updateAdminUser(
  id: string,
  data: Partial<AdminUser>,
): Promise<ApiEnvelope<AdminUser>> {
  return httpPut<AdminUser>(`/api/admin/users/${id}`, data);
}

export function deleteAdminUser(id: string): Promise<ApiEnvelope<void>> {
  return httpDelete<void>(`/api/admin/users/${id}`);
}
