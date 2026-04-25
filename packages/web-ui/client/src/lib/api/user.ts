import { httpGet, httpPut } from "../http";
import type { ApiEnvelope } from "../http";

export interface UserDetails {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface UserPreferences {
  language: string;
  theme: string;
  settings: Record<string, unknown>;
}

export function getUserDetails(): Promise<ApiEnvelope<UserDetails>> {
  return httpGet<UserDetails>("/api/user/details");
}

export function getUserDetailsById(id: string): Promise<ApiEnvelope<UserDetails>> {
  return httpGet<UserDetails>(`/api/user/details/${id}`);
}

export function getUserPreferences(): Promise<ApiEnvelope<UserPreferences>> {
  return httpGet<UserPreferences>("/api/user/preferences");
}

export function updateUserPreferences(
  data: Partial<UserPreferences>,
): Promise<ApiEnvelope<UserPreferences>> {
  return httpPut<UserPreferences>("/api/user/preferences", data);
}
