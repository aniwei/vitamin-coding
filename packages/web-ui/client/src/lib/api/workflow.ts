import { httpGet, httpPost, httpPut, httpDelete } from "../http";
import type { ApiEnvelope } from "../http";

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
}

export interface WorkflowStructure {
  nodes: unknown[];
  edges: unknown[];
}

export interface WorkflowTool {
  name: string;
  description: string;
}

export function getWorkflows(): Promise<ApiEnvelope<Workflow[]>> {
  return httpGet<Workflow[]>("/api/workflow");
}

export function getWorkflow(id: string): Promise<ApiEnvelope<Workflow>> {
  return httpGet<Workflow>(`/api/workflow/${id}`);
}

export function createWorkflow(
  data: Omit<Workflow, "id" | "status" | "createdAt">,
): Promise<ApiEnvelope<Workflow>> {
  return httpPost<Workflow>("/api/workflow", data);
}

export function updateWorkflow(
  id: string,
  data: Partial<Workflow>,
): Promise<ApiEnvelope<Workflow>> {
  return httpPut<Workflow>(`/api/workflow/${id}`, data);
}

export function deleteWorkflow(id: string): Promise<ApiEnvelope<void>> {
  return httpDelete<void>(`/api/workflow/${id}`);
}

export function executeWorkflow(
  id: string,
  input: Record<string, unknown>,
): Promise<ApiEnvelope<{ executionId: string }>> {
  return httpPost<{ executionId: string }>(`/api/workflow/${id}/execute`, input);
}

export function getWorkflowStructure(
  id: string,
): Promise<ApiEnvelope<WorkflowStructure>> {
  return httpGet<WorkflowStructure>(`/api/workflow/${id}/structure`);
}

export function updateWorkflowStructure(
  id: string,
  structure: WorkflowStructure,
): Promise<ApiEnvelope<WorkflowStructure>> {
  return httpPut<WorkflowStructure>(`/api/workflow/${id}/structure`, structure);
}

export function getWorkflowTools(): Promise<ApiEnvelope<WorkflowTool[]>> {
  return httpGet<WorkflowTool[]>("/api/workflow/tools");
}
