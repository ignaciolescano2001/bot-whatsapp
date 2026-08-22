"use client";

import type { StatusResponse } from "@/lib/types";

export default function ConnectionStatusScreen({
  data,
}: {
  data: StatusResponse | null;
}) {
  const isTwilio = data?.provider === "twilio";

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-neutral-950 px-4 text-center">
      <h1 className="text-2xl font-semibold text-neutral-100">
        {isTwilio ? "Twilio WhatsApp" : "WhatsApp Cloud API"}
      </h1>

      {!data && (
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-100" />
      )}

      {data?.status === "token_invalid" && (
        <p className="max-w-sm text-sm text-red-400">
          {isTwilio
            ? "Las credenciales de Twilio no son válidas o no están configuradas. Revisá TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN."
            : "El token de la Cloud API no es válido o no está configurado. Revisá las variables WHATSAPP_CLOUD_API_TOKEN y WHATSAPP_PHONE_NUMBER_ID."}
        </p>
      )}

      {data?.status === "no_webhook" && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-amber-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            {isTwilio
              ? "Credenciales válidas, esperando el primer mensaje"
              : "Token válido, esperando el primer mensaje"}
          </div>
          <p className="max-w-sm text-sm text-neutral-400">
            {isTwilio
              ? "Todavía no llegó ningún webhook de Twilio. Verificá que la URL del webhook esté configurada en la Sandbox y sea accesible públicamente (ngrok)."
              : "Todavía no llegó ningún webhook de WhatsApp. Verificá que la URL del webhook esté configurada en Meta y sea accesible públicamente."}
          </p>
        </div>
      )}
    </div>
  );
}
