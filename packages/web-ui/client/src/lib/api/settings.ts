import { httpGet, httpPut } from "../http";
import type { ApiEnvelope } from "../http";

export interface AppSettings {
  [key: string]: unknown;
}

export function getSettings(): Promise<ApiEnvelope<AppSettings>> {
  return httpGet<AppSettings>("/api/settings");
}

export function updateSettings(
  data: Partial<AppSettings>,
): Promise<ApiEnvelope<AppSettings>> {
  return httpPut<AppSettings>("/api/settings", data);
}
