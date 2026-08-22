export interface StatusResponse {
  status: "ok" | "token_invalid" | "no_webhook";
  provider: "meta" | "twilio";
  phone?: string | null;
  lastWebhookAt?: string | null;
  updatedAt: string;
}
