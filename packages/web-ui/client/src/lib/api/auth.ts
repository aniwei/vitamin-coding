import { httpGet, httpPost } from "../http";
import type { ApiEnvelope } from "../http";

export interface AuthSession {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  token: string;
  expiresAt: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface SignUpParams {
  name: string;
  email: string;
  password: string;
}

export function signIn(
  params: SignInParams,
): Promise<ApiEnvelope<AuthSession>> {
  return httpPost<AuthSession>("/api/auth/sign-in", params);
}

export function signUp(
  params: SignUpParams,
): Promise<ApiEnvelope<AuthSession>> {
  return httpPost<AuthSession>("/api/auth/sign-up", params);
}

export function signOut(): Promise<ApiEnvelope<void>> {
  return httpPost<void>("/api/auth/sign-out");
}

export function getSession(): Promise<ApiEnvelope<AuthSession>> {
  return httpGet<AuthSession>("/api/auth/session");
}
