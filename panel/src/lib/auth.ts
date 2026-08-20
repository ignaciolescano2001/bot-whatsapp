export const SESSION_COOKIE_NAME = "panel_session";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(data: string): Promise<string | null> {
  const secret = process.env.PANEL_SESSION_SECRET;
  if (!secret) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return toHex(signature);
}

// Comparación en tiempo constante para no filtrar por timing cuánto matchea.
function constantTimeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.PANEL_PASSWORD;
  if (!expected) return false;
  return constantTimeEqual(candidate, expected);
}

export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = await hmac(String(expiresAt));
  if (!signature) {
    throw new Error("PANEL_SESSION_SECRET no está configurada");
  }
  return `${expiresAt}.${signature}`;
}

export async function isValidSessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;

  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = await hmac(expiresAtRaw);
  if (!expected) return false;

  return constantTimeEqual(expected, signature);
}
