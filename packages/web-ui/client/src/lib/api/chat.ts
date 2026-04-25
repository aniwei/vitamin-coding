import { httpGet, httpPost } from "../http";
import type { ApiEnvelope } from "../http";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface ChatModel {
  id: string;
  name: string;
  provider: string;
}

export interface ChatTitle {
  title: string;
}

export function getChatModels(): Promise<ApiEnvelope<ChatModel[]>> {
  return httpGet<ChatModel[]>("/api/chat/models");
}

export function sendChatMessage(
  threadId: string,
  message: string,
): Promise<ApiEnvelope<ChatMessage>> {
  return httpPost<ChatMessage>("/api/chat", { threadId, message });
}

export function generateChatTitle(
  threadId: string,
): Promise<ApiEnvelope<ChatTitle>> {
  return httpPost<ChatTitle>("/api/chat/title", { threadId });
}

export function createTemporarySession(): Promise<ApiEnvelope<{ sessionId: string }>> {
  return httpPost<{ sessionId: string }>("/api/chat/temporary");
}

export function exportChat(
  threadId: string,
): Promise<ApiEnvelope<{ url: string }>> {
  return httpPost<{ url: string }>("/api/chat/export", { threadId });
}
