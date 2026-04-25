import { httpGet } from "../http";

type HealthPayload = {
  status: "ok";
};

export function getHealth() {
  return httpGet<HealthPayload>("/api/health");
}
