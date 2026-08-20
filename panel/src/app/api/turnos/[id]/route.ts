import { NextRequest, NextResponse } from "next/server";
import { setTurnoEstado, type TurnoEstado } from "@/lib/agenda-db";

interface Ctx {
  params: Promise<{ id: string }>;
}

const ESTADOS_VALIDOS: TurnoEstado[] = [
  "pendiente",
  "confirmado",
  "rechazado",
  "cancelado",
];

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  if (!ESTADOS_VALIDOS.includes(body?.estado)) {
    return NextResponse.json({ error: "estado inválido" }, { status: 400 });
  }
  await setTurnoEstado(id, body.estado);
  return NextResponse.json({ ok: true });
}
