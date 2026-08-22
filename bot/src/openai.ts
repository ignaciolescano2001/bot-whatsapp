import OpenAI from "openai";
import type { Message } from "./db.js";
import { getSystemPrompt } from "./system-prompt.js";
import { consultarDisponibilidad, crearTurno } from "./agenda.js";
import { armarNotificacion, type TipoNotificacion } from "./notificaciones.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const TIPO_ENUM = ["Reclamo", "Consulta"] as const;

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_disponibilidad",
      description:
        "Devuelve los horarios realmente libres de un peluquero para una fecha puntual, consultando la agenda real.",
      parameters: {
        type: "object",
        properties: {
          peluquero: { type: "string", enum: ["Ignacio", "Chino"] },
          fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
        },
        required: ["peluquero", "fecha"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crear_turno",
      description:
        "Reserva un turno en firme si el horario está libre en la agenda real. Usar solo después de confirmar día, hora, servicio, peluquero y nombre con el cliente.",
      parameters: {
        type: "object",
        properties: {
          peluquero: { type: "string", enum: ["Ignacio", "Chino"] },
          servicio: {
            type: "string",
            enum: ["corte", "barba_o_rapado", "combo"],
            description:
              "corte = Corte de pelo. barba_o_rapado = Barba o rapado, sin corte (mismo precio, no combinable con corte porque el rapado reemplaza al corte). combo = corte + barba juntos (NUNCA corte + rapado).",
          },
          fecha: { type: "string", description: "YYYY-MM-DD" },
          hora: { type: "string", description: "HH:MM, en punto o y media" },
          cliente_nombre: { type: "string" },
        },
        required: ["peluquero", "servicio", "fecha", "hora", "cliente_nombre"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_humano",
      description:
        "Deriva la conversación a una persona del local: la pasa a modo Humano y le avisa a Ignacio por WhatsApp. Usar para reclamos, pedidos fuera de lo que el bot maneja, clientes enojados, pedidos de datos personales, o cualquier caso que no se resuelva después de 2 intentos.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: TIPO_ENUM },
          motivo: { type: "string", description: "Resumen en una línea de por qué se deriva." },
          cliente_nombre: {
            type: "string",
            description: "Solo si el cliente lo dio en la charla. No inventes un nombre genérico, omití el campo si no lo tenés.",
          },
          sobre: {
            type: "string",
            enum: ["Ignacio", "Chino"],
            description: "Solo si la derivación es específicamente sobre uno de los peluqueros.",
          },
        },
        required: ["tipo", "motivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notificar_peluquero",
      description:
        "Manda un aviso por WhatsApp a Ignacio sobre algo puntual de él o de Chino (una consulta o reclamo sobre su turno/atención), sin derivar toda la conversación a un humano. La charla sigue en modo automático.",
      parameters: {
        type: "object",
        properties: {
          peluquero: { type: "string", enum: ["Ignacio", "Chino"] },
          tipo: { type: "string", enum: TIPO_ENUM },
          motivo: { type: "string", description: "Resumen en una línea." },
          cliente_nombre: {
            type: "string",
            description: "Solo si el cliente lo dio en la charla. No inventes un nombre genérico, omití el campo si no lo tenés.",
          },
        },
        required: ["peluquero", "tipo", "motivo"],
      },
    },
  },
];

interface ReplyEffects {
  notify: string[];
  switchToHuman: boolean;
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  clienteWhatsapp: string,
  effects: ReplyEffects,
): Promise<unknown> {
  if (name === "consultar_disponibilidad") {
    return consultarDisponibilidad(args.peluquero as string, args.fecha as string);
  }

  if (name === "crear_turno") {
    const result = await crearTurno({
      peluquero: args.peluquero as string,
      servicio: args.servicio as "corte" | "barba_o_rapado" | "combo",
      fecha: args.fecha as string,
      hora: args.hora as string,
      clienteNombre: args.cliente_nombre as string,
      clienteWhatsapp,
    });
    if (result.ok) {
      effects.notify.push(
        armarNotificacion({
          tipo: "Turno nuevo",
          sobre: result.peluquero,
          clienteNombre: (args.cliente_nombre as string) || "sin dato",
          clienteWhatsapp,
          motivo: `Reservó ${result.servicio_label} ($${result.precio})`,
          turno: `${result.peluquero}, ${result.fecha} ${result.hora}`,
        }),
      );
    }
    return result;
  }

  if (name === "derivar_a_humano") {
    effects.switchToHuman = true;
    effects.notify.push(
      armarNotificacion({
        tipo: args.tipo as TipoNotificacion,
        sobre: (args.sobre as string) || "general",
        clienteNombre: (args.cliente_nombre as string) || "sin dato",
        clienteWhatsapp,
        motivo: args.motivo as string,
      }),
    );
    return { ok: true };
  }

  if (name === "notificar_peluquero") {
    effects.notify.push(
      armarNotificacion({
        tipo: args.tipo as TipoNotificacion,
        sobre: args.peluquero as string,
        clienteNombre: (args.cliente_nombre as string) || "sin dato",
        clienteWhatsapp,
        motivo: args.motivo as string,
      }),
    );
    return { ok: true };
  }

  return { ok: false, error: `Herramienta desconocida: ${name}` };
}

export interface GenerateReplyResult {
  reply: string;
  switchToHuman: boolean;
  notify?: string;
}

export async function generateReply(
  history: Message[],
  clienteWhatsapp: string,
): Promise<GenerateReplyResult> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: getSystemPrompt() },
    ...history.map((m): OpenAI.Chat.ChatCompletionMessageParam => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    })),
  ];

  const effects: ReplyEffects = { notify: [], switchToHuman: false };

  for (let step = 0; step < 4; step++) {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
    });

    const choice = completion.choices[0];
    const toolCalls = choice?.message?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      return {
        reply: choice?.message?.content?.trim() || "",
        switchToHuman: effects.switchToHuman,
        notify: effects.notify.length ? effects.notify.join("\n\n") : undefined,
      };
    }

    messages.push(choice.message);

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        // args inválidos, seguimos con objeto vacío
      }
      console.log(`[openai] tool_call ${toolCall.function.name}(${JSON.stringify(args)})`);
      const result = await runTool(toolCall.function.name, args, clienteWhatsapp, effects);
      console.log(`[openai] resultado ${toolCall.function.name} -> ${JSON.stringify(result)}`);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    reply: "Dejame derivarte con una persona del equipo, en un rato te responde.",
    switchToHuman: true,
    notify: effects.notify.length ? effects.notify.join("\n\n") : undefined,
  };
}
