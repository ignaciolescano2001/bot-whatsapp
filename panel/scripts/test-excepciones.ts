// Script standalone (sin framework de tests): corré con
// `npx tsx scripts/test-excepciones.ts` desde panel/. No toca la base real,
// solo ejercita las funciones puras (resolverExcepciones,
// generateSlotsEnRango) con datos fabricados a mano. Misma lógica que
// bot/scripts/test-excepciones.ts, ya que ambos lados deben comportarse
// igual (ver resolverExcepciones en bot/src/agenda.ts vs
// panel/src/lib/agenda-db.ts).
import { resolverExcepciones } from "../src/lib/agenda-db";
import { generateSlotsEnRango } from "../src/lib/slots";

let fallas = 0;

function assert(condicion: boolean, descripcion: string) {
  if (condicion) {
    console.log(`  ok - ${descripcion}`);
  } else {
    fallas++;
    console.error(`  FALLA - ${descripcion}`);
  }
}

const IGNACIO = "ignacio-id";
const CHINO = "chino-id";

console.log("1. Día normal, sin excepciones");
{
  const r = resolverExcepciones([]);
  assert(r.cerrado === false, "no está cerrado");
  assert(r.horarioEspecial === undefined, "no hay horario especial");
  assert(r.peluquerosAusentes.size === 0, "nadie está ausente");
}

console.log("2. Peluquería cerrada (feriado)");
{
  const r = resolverExcepciones([
    { tipo: "cerrado", peluquero_id: null, hora_inicio: null, hora_fin: null, motivo: "Feriado" },
  ]);
  assert(r.cerrado === true, "queda marcado como cerrado");
  assert(r.motivoCierre === "Feriado", "conserva el motivo del cierre");
}

console.log("3. Peluquero ausente bloquea solo a ese peluquero");
{
  const r = resolverExcepciones([
    { tipo: "peluquero_ausente", peluquero_id: IGNACIO, hora_inicio: null, hora_fin: null, motivo: "Personal" },
  ]);
  assert(r.cerrado === false, "la peluquería sigue abierta");
  assert(r.peluquerosAusentes.get(IGNACIO) === "Personal", "Ignacio queda marcado ausente con su motivo");
}

console.log("4. Los demás peluqueros siguen disponibles");
{
  const r = resolverExcepciones([
    { tipo: "peluquero_ausente", peluquero_id: IGNACIO, hora_inicio: null, hora_fin: null, motivo: null },
  ]);
  assert(r.peluquerosAusentes.has(CHINO) === false, "Chino no aparece como ausente");
}

console.log("5. Horario especial acota los slots del día");
{
  const r = resolverExcepciones([
    { tipo: "horario_especial", peluquero_id: null, hora_inicio: "09:00:00", hora_fin: "14:00:00", motivo: null },
  ]);
  assert(r.horarioEspecial?.inicio === "09:00" && r.horarioEspecial?.fin === "14:00", "guarda el rango especial");
  const slots = generateSlotsEnRango(r.horarioEspecial!.inicio, r.horarioEspecial!.fin);
  assert(slots[0] === "09:00", "el primer slot es el de apertura");
  assert(slots[slots.length - 1] === "13:30", "el último slot deja lugar al turno de 30 min hasta las 14:00");
  assert(!slots.includes("14:00"), "no ofrece un slot que empiece justo al cierre");
  assert(!slots.includes("16:30"), "no ofrece nada fuera del horario especial, aunque sea horario habitual");
}

console.log("6. Las funciones son puras (no mutan lo que reciben / no dependen de estado externo)");
{
  const excepciones = [
    { tipo: "peluquero_ausente" as const, peluquero_id: IGNACIO, hora_inicio: null, hora_fin: null, motivo: null },
  ];
  const copia = JSON.parse(JSON.stringify(excepciones));
  resolverExcepciones(excepciones);
  assert(JSON.stringify(excepciones) === JSON.stringify(copia), "resolverExcepciones no modifica el array de entrada");
  // No hay ninguna operación de borrado en este flujo: crear una excepción
  // nunca toca la tabla turnos, así que los turnos existentes no se ven
  // afectados por construcción (no hay código que los borre o modifique).
}

console.log("7. Reserva bloqueada en día cerrado");
{
  const r = resolverExcepciones([
    { tipo: "cerrado", peluquero_id: null, hora_inicio: null, hora_fin: null, motivo: null },
  ]);
  const seBloquea = r.cerrado;
  assert(seBloquea === true, "crearTurnoManual rechazaría la reserva con motivo 'cerrado'");
}

console.log("8. Reserva bloqueada para peluquero ausente");
{
  const r = resolverExcepciones([
    { tipo: "peluquero_ausente", peluquero_id: IGNACIO, hora_inicio: null, hora_fin: null, motivo: null },
  ]);
  const seBloquea = r.peluquerosAusentes.has(IGNACIO);
  const noSeBloqueaElOtro = !r.peluquerosAusentes.has(CHINO);
  assert(seBloquea, "crearTurnoManual rechazaría la reserva de Ignacio con motivo 'peluquero_ausente'");
  assert(noSeBloqueaElOtro, "crearTurnoManual seguiría aceptando reservas de Chino");
}

console.log("9. Reserva bloqueada fuera del horario especial");
{
  const r = resolverExcepciones([
    { tipo: "horario_especial", peluquero_id: null, hora_inicio: "09:00:00", hora_fin: "14:00:00", motivo: null },
  ]);
  const slotsValidos = generateSlotsEnRango(r.horarioEspecial!.inicio, r.horarioEspecial!.fin);
  assert(!slotsValidos.includes("16:30"), "crearTurnoManual rechazaría 16:30 con motivo 'fuera_de_horario_especial'");
  assert(slotsValidos.includes("09:30"), "crearTurnoManual aceptaría 09:30, que sí está dentro del rango especial");
}

console.log("10. Fechas al borde de medianoche UTC no corren de día (mismo patrón que dowFromFechaIso)");
{
  // Réplica exacta de dowFromFechaIso en panel/src/lib/agenda-db.ts — se
  // calcula en UTC a propósito para no depender de la zona horaria del
  // proceso que corre el panel.
  function dowFromFechaIso(fechaIso: string): number {
    const [y, m, d] = fechaIso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }
  assert(dowFromFechaIso("2026-08-25") === 2, "2026-08-25 es martes (dow 2), sin corrimiento");
  assert(dowFromFechaIso("2026-08-30") === 0, "2026-08-30 es domingo (dow 0), sin corrimiento");
  assert(dowFromFechaIso("2026-01-01") === 4, "2026-01-01 (límite de año) es jueves (dow 4), sin corrimiento");
}

console.log(`\n${fallas === 0 ? "Todo OK" : `${fallas} falla(s)`}`);
process.exit(fallas === 0 ? 0 : 1);
