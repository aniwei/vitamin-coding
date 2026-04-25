import { httpGet, httpPost, httpPut, httpDelete } from "../http";
import type { ApiEnvelope } from "../http";

export interface McpServer {
  id: string;
  name: string;
  url: string;
  status: string;
  createdAt: string;
}

export interface McpServerCustomization {
  server: string;
  customizations: Record<string, unknown>;
}

export interface McpToolCustomization {
  server: string;
  tool: string;
  customizations: Record<string, unknown>;
}

export function getMcpList(): Promise<ApiEnvelope<McpServer[]>> {
  return httpGet<McpServer[]>("/api/mcp/list");
}

export function getMcpServer(id: string): Promise<ApiEnvelope<McpServer>> {
  return httpGet<McpServer>(`/api/mcp/${id}`);
}

export function createMcpServer(
  data: Omit<McpServer, "id" | "status" | "createdAt">,
): Promise<ApiEnvelope<McpServer>> {
  return httpPost<McpServer>("/api/mcp", data);
}

export function updateMcpServer(
  id: string,
  data: Partial<McpServer>,
): Promise<ApiEnvelope<McpServer>> {
  return httpPut<McpServer>(`/api/mcp/${id}`, data);
}

export function deleteMcpServer(id: string): Promise<ApiEnvelope<void>> {
  return httpDelete<void>(`/api/mcp/${id}`);
}

export function getServerCustomization(
  server: string,
): Promise<ApiEnvelope<McpServerCustomization>> {
  return httpGet<McpServerCustomization>(
    `/api/mcp/server-customizations/${server}`,
  );
}

export function updateServerCustomization(
  server: string,
  data: Record<string, unknown>,
): Promise<ApiEnvelope<McpServerCustomization>> {
  return httpPut<McpServerCustomization>(
    `/api/mcp/server-customizations/${server}`,
    data,
  );
}

export function getToolCustomization(
  server: string,
  tool: string,
): Promise<ApiEnvelope<McpToolCustomization>> {
  return httpGet<McpToolCustomization>(
    `/api/mcp/tool-customizations/${server}/${tool}`,
  );
}

export function updateToolCustomization(
  server: string,
  tool: string,
  data: Record<string, unknown>,
): Promise<ApiEnvelope<McpToolCustomization>> {
  return httpPut<McpToolCustomization>(
    `/api/mcp/tool-customizations/${server}/${tool}`,
    data,
  );
}
