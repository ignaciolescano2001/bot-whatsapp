import { NextRequest, NextResponse } from "next/server";
import { deleteExcepcion, updateExcepcion, validarExcepcionInput } from "@/lib/agenda-db";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const validado = validarExcepcionInput(body ?? {});
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: 400 });
  }

  try {
    const excepcion = await updateExcepcion(id, validado.input);
    return NextResponse.json({ excepcion });
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === "23505") {
      return NextResponse.json(
        { error: "Ya existe una excepción de ese tipo para esa fecha." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "No se pudo actualizar la excepción." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  await deleteExcepcion(id);
  return NextResponse.json({ ok: true });
}
