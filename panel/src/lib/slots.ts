// Mismos horarios que bot/src/agenda.ts, para que un horario fijo cargado
// acá siempre caiga en un slot que el bot realmente puede llegar a ofrecer.
// dia_semana sigue la convención de Postgres extract(dow): 0=domingo..6=sábado.
function getHoursForDow(dow: number): [number, number, number, number][] {
  if (dow >= 2 && dow <= 5) return [[9, 30, 13, 0], [16, 30, 21, 0]];
  if (dow === 6) return [[9, 0, 16, 0]];
  return [];
}

export function generateSlots(dow: number): string[] {
  const slots: string[] = [];
  for (const [h1, m1, h2, m2] of getHoursForDow(dow)) {
    let cur = h1 * 60 + m1;
    const end = h2 * 60 + m2;
    while (cur + 30 <= end) {
      const h = Math.floor(cur / 60);
      const m = cur % 60;
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      cur += 30;
    }
  }
  return slots;
}

// Igual que generateSlots pero para un rango de horas arbitrario (usado por
// las excepciones de "horario especial"), no atado a getHoursForDow.
export function generateSlotsEnRango(horaInicio: string, horaFin: string): string[] {
  const [h1, m1] = horaInicio.split(":").map(Number);
  const [h2, m2] = horaFin.split(":").map(Number);
  const slots: string[] = [];
  let cur = h1 * 60 + m1;
  const end = h2 * 60 + m2;
  while (cur + 30 <= end) {
    const h = Math.floor(cur / 60);
    const m = cur % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    cur += 30;
  }
  return slots;
}

export const DIAS_ABIERTOS: { value: number; label: string }[] = [
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

export function labelDia(dow: number): string {
  return DIAS_ABIERTOS.find((d) => d.value === dow)?.label ?? `Día ${dow}`;
}
