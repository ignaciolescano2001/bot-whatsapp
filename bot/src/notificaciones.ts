export type TipoNotificacion = "Reclamo" | "Consulta" | "Turno nuevo";

export interface NotificacionInput {
  tipo: TipoNotificacion;
  sobre: string;
  clienteNombre: string;
  clienteWhatsapp: string;
  motivo: string;
  turno?: string;
}

export function armarNotificacion(input: NotificacionInput): string {
  const lineas = [
    `🔔 ${input.tipo}`,
    `Sobre: ${input.sobre}`,
    `Cliente: ${input.clienteNombre} — ${input.clienteWhatsapp}`,
    `Motivo: ${input.motivo}`,
  ];
  if (input.turno) {
    lineas.push(`Turno relacionado: ${input.turno}`);
  }
  return lineas.join("\n");
}
