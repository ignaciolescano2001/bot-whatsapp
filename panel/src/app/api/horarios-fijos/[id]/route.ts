import { NextRequest, NextResponse } from "next/server";
import { deleteHorarioFijo, setHorarioFijoActivo } from "@/lib/agenda-db";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  if (typeof body?.activo !== "boolean") {
    return NextResponse.json({ error: "falta activo" }, { status: 400 });
  }
  await setHorarioFijoActivo(id, body.activo);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  await deleteHorarioFijo(id);
  return NextResponse.json({ ok: true });
}
