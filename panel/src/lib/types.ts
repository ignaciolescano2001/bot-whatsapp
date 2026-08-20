export interface StatusResponse {
  status: "ok" | "token_invalid" | "no_webhook";
  phone?: string | null;
  lastWebhookAt?: string | null;
  updatedAt: string;
}
