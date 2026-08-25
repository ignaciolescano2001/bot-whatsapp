import pg from "pg";
import { generateSlots, generateSlotsEnRango } from "./slots";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export interface Peluquero {
  id: string;
  nombre: string;
}

export interface HorarioFijo {
  id: string;
  peluquero_id: string;
  dia_semana: number;
  hora: string;
  cliente_nombre: string | null;
  activo: boolean;
  created_at: string;
}

export interface Servicio {
  id: string;
  nombre: string;
  precio: number;
}

export type ServicioPedido = "corte" | "barba_o_rapado" | "combo" | "rapado_y_barba";

export type TurnoEstado = "pendiente" | "confirmado" | "rechazado" | "cancelado";

export interface Turno {
  id: string;
  peluquero_nombre: string;
  servicio_nombre: string;
  fecha: string;
  hora: string;
  cliente_nombre: string;
  cliente_whatsapp: string;
  estado: TurnoEstado;
  es_fijo?: boolean;
}

export { generateSlots };

export async function listPeluqueros(): Promise<Peluquero[]> {
  const res = await pool.query<Peluquero>(
    `SELECT id, nombre FROM peluqueros WHERE activo = true ORDER BY nombre`,
  );
  return res.rows;
}

export async function listHorariosFijos(
  peluqueroId: string,
): Promise<HorarioFijo[]> {
  const res = await pool.query<HorarioFijo>(
    `SELECT id, peluquero_id, dia_semana, hora, cliente_nombre, activo, created_at
     FROM horarios_fijos
     WHERE peluquero_id = $1
     ORDER BY dia_semana, hora`,
    [peluqueroId],
  );
  return res.rows;
}

export async function createHorarioFijo(input: {
  peluqueroId: string;
  diaSemana: number;
  hora: string;
  clienteNombre: string | null;
}): Promise<HorarioFijo> {
  const res = await pool.query<HorarioFijo>(
    `INSERT INTO horarios_fijos (peluquero_id, dia_semana, hora, cliente_nombre, activo)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, peluquero_id, dia_semana, hora, cliente_nombre, activo, created_at`,
    [input.peluqueroId, input.diaSemana, input.hora, input.clienteNombre],
  );
  return res.rows[0];
}

export async function setHorarioFijoActivo(
  id: string,
  activo: boolean,
): Promise<void> {
  await pool.query(`UPDATE horarios_fijos SET activo = $2 WHERE id = $1`, [
    id,
    activo,
  ]);
}

export async function deleteHorarioFijo(id: string): Promise<void> {
  await pool.query(`DELETE FROM horarios_fijos WHERE id = $1`, [id]);
}

export async function listTurnos(fechaIso: string): Promise<Turno[]> {
  const dow = dowFromFechaIso(fechaIso);

  const [turnosRes, fijosRes] = await Promise.all([
    pool.query<Turno>(
      `SELECT t.id, p.nombre AS peluquero_nombre, s.nombre AS servicio_nombre,
              t.fecha, t.hora, t.cliente_nombre, t.cliente_whatsapp, t.estado
       FROM turnos t
       JOIN peluqueros p ON p.id = t.peluquero_id
       JOIN servicios s ON s.id = t.servicio_id
       WHERE t.fecha = $1 AND t.estado != 'cancelado'`,
      [fechaIso],
    ),
    pool.query<{
      id: string;
      peluquero_nombre: string;
      hora: string;
      cliente_nombre: string | null;
    }>(
      `SELECT hf.id, p.nombre AS peluquero_nombre, hf.hora, hf.cliente_nombre
       FROM horarios_fijos hf
       JOIN peluqueros p ON p.id = hf.peluquero_id
       WHERE hf.dia_semana = $1 AND hf.activo = true`,
      [dow],
    ),
  ]);

  const fijosComoTurnos: Turno[] = fijosRes.rows.map((f) => ({
    id: `fijo:${f.id}`,
    peluquero_nombre: f.peluquero_nombre,
    servicio_nombre: "Turno fijo",
    fecha: fechaIso,
    hora: f.hora,
    cliente_nombre: f.cliente_nombre || "Turno fijo",
    cliente_whatsapp: "",
    estado: "confirmado",
    es_fijo: true,
  }));

  return [...turnosRes.rows, ...fijosComoTurnos].sort((a, b) => {
    if (a.peluquero_nombre !== b.peluquero_nombre) {
      return a.peluquero_nombre.localeCompare(b.peluquero_nombre);
    }
    return a.hora.localeCompare(b.hora);
  });
}

export async function listTurnosSemana(
  desdeIso: string,
  hastaIso: string,
): Promise<Turno[]> {
  const [turnosRes, fijosRes] = await Promise.all([
    pool.query<Turno>(
      `SELECT t.id, p.nombre AS peluquero_nombre, s.nombre AS servicio_nombre,
              to_char(t.fecha, 'YYYY-MM-DD') AS fecha, t.hora, t.cliente_nombre,
              t.cliente_whatsapp, t.estado
       FROM turnos t
       JOIN peluqueros p ON p.id = t.peluquero_id
       JOIN servicios s ON s.id = t.servicio_id
       WHERE t.fecha BETWEEN $1 AND $2 AND t.estado != 'cancelado'`,
      [desdeIso, hastaIso],
    ),
    pool.query<{
      id: string;
      peluquero_nombre: string;
      dia_semana: number;
      hora: string;
      cliente_nombre: string | null;
    }>(
      `SELECT hf.id, p.nombre AS peluquero_nombre, hf.dia_semana, hf.hora, hf.cliente_nombre
       FROM horarios_fijos hf
       JOIN peluqueros p ON p.id = hf.peluquero_id
       WHERE hf.dia_semana IN (2, 3, 4, 5, 6) AND hf.activo = true`,
    ),
  ]);

  const fechasSemana: string[] = [];
  for (
    let d = new Date(desdeIso + "T00:00:00Z");
    d.getTime() <= new Date(hastaIso + "T00:00:00Z").getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    fechasSemana.push(d.toISOString().slice(0, 10));
  }

  const fijosComoTurnos: Turno[] = [];
  for (const fecha of fechasSemana) {
    const dow = dowFromFechaIso(fecha);
    for (const f of fijosRes.rows) {
      if (f.dia_semana !== dow) continue;
      fijosComoTurnos.push({
        id: `fijo:${f.id}:${fecha}`,
        peluquero_nombre: f.peluquero_nombre,
        servicio_nombre: "Turno fijo",
        fecha,
        hora: f.hora,
        cliente_nombre: f.cliente_nombre || "Turno fijo",
        cliente_whatsapp: "",
        estado: "confirmado",
        es_fijo: true,
      });
    }
  }

  return [...turnosRes.rows, ...fijosComoTurnos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    if (a.peluquero_nombre !== b.peluquero_nombre) {
      return a.peluquero_nombre.localeCompare(b.peluquero_nombre);
    }
    return a.hora.localeCompare(b.hora);
  });
}

export async function setTurnoEstado(
  id: string,
  estado: TurnoEstado,
): Promise<void> {
  await pool.query(`UPDATE turnos SET estado = $2 WHERE id = $1`, [id, estado]);
}

export async function listServicios(): Promise<Servicio[]> {
  const res = await pool.query<Servicio>(
    `SELECT id, nombre, precio::float AS precio FROM servicios WHERE activo = true`,
  );
  return res.rows;
}

async function getServiciosMap(): Promise<{ corte: Servicio; barbaORapado: Servicio } | null> {
  const rows = await listServicios();
  const corte = rows.find((s) => s.nombre === "Corte de pelo");
  const barbaORapado = rows.find((s) => s.nombre === "Barba o rapado");
  if (!corte || !barbaORapado) return null;
  return { corte, barbaORapado };
}

// dow según extract(dow) de Postgres: 0 = domingo ... 6 = sábado. Se calcula
// en UTC para no depender de la zona horaria del proceso.
function dowFromFechaIso(fechaIso: string): number {
  const [y, m, d] = fechaIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export type TipoExcepcion = "cerrado" | "peluquero_ausente" | "horario_especial";

export interface ExcepcionAgenda {
  id: string;
  fecha: string;
  tipo: TipoExcepcion;
  peluquero_id: string | null;
  peluquero_nombre: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  motivo: string | null;
  created_at: string;
}

interface ExcepcionRow {
  tipo: TipoExcepcion;
  peluquero_id: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  motivo: string | null;
}

interface ExcepcionesResueltas {
  cerrado: boolean;
  motivoCierre?: string;
  horarioEspecial?: { inicio: string; fin: string; motivo?: string };
  peluquerosAusentes: Map<string, string | null>;
}

// Función pura: no toca la DB, solo interpreta las filas de excepciones de
// un día. Se testea sin necesidad de una conexión real (ver
// scripts/test-excepciones.ts). Idéntica a la de bot/src/agenda.ts.
export function resolverExcepciones(excepciones: ExcepcionRow[]): ExcepcionesResueltas {
  const resultado: ExcepcionesResueltas = { cerrado: false, peluquerosAusentes: new Map() };
  for (const e of excepciones) {
    if (e.tipo === "cerrado") {
      resultado.cerrado = true;
      resultado.motivoCierre = e.motivo ?? undefined;
    } else if (e.tipo === "horario_especial" && e.hora_inicio && e.hora_fin) {
      resultado.horarioEspecial = {
        inicio: e.hora_inicio.slice(0, 5),
        fin: e.hora_fin.slice(0, 5),
        motivo: e.motivo ?? undefined,
      };
    } else if (e.tipo === "peluquero_ausente" && e.peluquero_id) {
      resultado.peluquerosAusentes.set(e.peluquero_id, e.motivo ?? null);
    }
  }
  return resultado;
}

async function getExcepcionesDia(fechaIso: string): Promise<ExcepcionRow[]> {
  const res = await pool.query<ExcepcionRow>(
    `SELECT tipo, peluquero_id, hora_inicio, hora_fin, motivo
     FROM excepciones_agenda WHERE fecha = $1`,
    [fechaIso],
  );
  return res.rows;
}

async function getExcepcionPorId(id: string): Promise<ExcepcionAgenda | null> {
  const res = await pool.query<ExcepcionAgenda>(
    `SELECT e.id, to_char(e.fecha, 'YYYY-MM-DD') AS fecha, e.tipo, e.peluquero_id,
            p.nombre AS peluquero_nombre, e.hora_inicio, e.hora_fin, e.motivo, e.created_at
     FROM excepciones_agenda e
     LEFT JOIN peluqueros p ON p.id = e.peluquero_id
     WHERE e.id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function listExcepciones(): Promise<ExcepcionAgenda[]> {
  const res = await pool.query<ExcepcionAgenda>(
    `SELECT e.id, to_char(e.fecha, 'YYYY-MM-DD') AS fecha, e.tipo, e.peluquero_id,
            p.nombre AS peluquero_nombre, e.hora_inicio, e.hora_fin, e.motivo, e.created_at
     FROM excepciones_agenda e
     LEFT JOIN peluqueros p ON p.id = e.peluquero_id
     ORDER BY e.fecha, e.tipo`,
  );
  return res.rows;
}

export async function listExcepcionesRango(
  desdeIso: string,
  hastaIso: string,
): Promise<ExcepcionAgenda[]> {
  const res = await pool.query<ExcepcionAgenda>(
    `SELECT e.id, to_char(e.fecha, 'YYYY-MM-DD') AS fecha, e.tipo, e.peluquero_id,
            p.nombre AS peluquero_nombre, e.hora_inicio, e.hora_fin, e.motivo, e.created_at
     FROM excepciones_agenda e
     LEFT JOIN peluqueros p ON p.id = e.peluquero_id
     WHERE e.fecha BETWEEN $1 AND $2
     ORDER BY e.fecha, e.tipo`,
    [desdeIso, hastaIso],
  );
  return res.rows;
}

export interface ExcepcionInput {
  fecha: string;
  tipo: TipoExcepcion;
  peluqueroId: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  motivo: string | null;
}

const TIPOS_EXCEPCION: TipoExcepcion[] = ["cerrado", "peluquero_ausente", "horario_especial"];

// Función pura, sin DB: valida el body crudo de POST/PATCH /api/excepciones
// y arma un ExcepcionInput limpio, o devuelve el motivo del rechazo.
export function validarExcepcionInput(
  body: Record<string, unknown>,
): { input: ExcepcionInput } | { error: string } {
  const { fecha, tipo, peluqueroId, horaInicio, horaFin, motivo } = body;

  if (typeof fecha !== "string" || !fecha) {
    return { error: "falta fecha" };
  }
  if (typeof tipo !== "string" || !TIPOS_EXCEPCION.includes(tipo as TipoExcepcion)) {
    return { error: "tipo inválido" };
  }
  if (tipo === "peluquero_ausente" && (typeof peluqueroId !== "string" || !peluqueroId)) {
    return { error: "falta elegir el peluquero ausente" };
  }
  if (tipo === "horario_especial") {
    if (typeof horaInicio !== "string" || !horaInicio || typeof horaFin !== "string" || !horaFin) {
      return { error: "falta hora de inicio o de finalización" };
    }
    if (horaInicio >= horaFin) {
      return { error: "la hora de inicio tiene que ser anterior a la de finalización" };
    }
  }

  return {
    input: {
      fecha,
      tipo: tipo as TipoExcepcion,
      peluqueroId: tipo === "peluquero_ausente" ? (peluqueroId as string) : null,
      horaInicio: tipo === "horario_especial" ? `${horaInicio}:00` : null,
      horaFin: tipo === "horario_especial" ? `${horaFin}:00` : null,
      motivo: typeof motivo === "string" && motivo.trim() ? motivo.trim() : null,
    },
  };
}

export async function createExcepcion(input: ExcepcionInput): Promise<ExcepcionAgenda> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO excepciones_agenda (fecha, tipo, peluquero_id, hora_inicio, hora_fin, motivo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.fecha, input.tipo, input.peluqueroId, input.horaInicio, input.horaFin, input.motivo],
  );
  const creada = await getExcepcionPorId(res.rows[0].id);
  if (!creada) throw new Error("No se pudo leer la excepción recién creada.");
  return creada;
}

export async function updateExcepcion(
  id: string,
  input: ExcepcionInput,
): Promise<ExcepcionAgenda> {
  await pool.query(
    `UPDATE excepciones_agenda
     SET fecha = $2, tipo = $3, peluquero_id = $4, hora_inicio = $5, hora_fin = $6,
         motivo = $7, updated_at = now()
     WHERE id = $1`,
    [id, input.fecha, input.tipo, input.peluqueroId, input.horaInicio, input.horaFin, input.motivo],
  );
  const actualizada = await getExcepcionPorId(id);
  if (!actualizada) throw new Error("No se encontró la excepción a actualizar.");
  return actualizada;
}

export async function deleteExcepcion(id: string): Promise<void> {
  await pool.query(`DELETE FROM excepciones_agenda WHERE id = $1`, [id]);
}

export interface DisponibilidadResult {
  horarios_libres: string[];
  cerrado?: boolean;
  motivo_cierre?: string;
  peluquero_ausente?: boolean;
  motivo_ausencia?: string;
}

export async function consultarDisponibilidad(
  peluqueroId: string,
  fechaIso: string,
): Promise<DisponibilidadResult> {
  const dow = dowFromFechaIso(fechaIso);

  const excepciones = resolverExcepciones(await getExcepcionesDia(fechaIso));

  if (excepciones.cerrado) {
    return { horarios_libres: [], cerrado: true, motivo_cierre: excepciones.motivoCierre };
  }
  if (excepciones.peluquerosAusentes.has(peluqueroId)) {
    return {
      horarios_libres: [],
      peluquero_ausente: true,
      motivo_ausencia: excepciones.peluquerosAusentes.get(peluqueroId) ?? undefined,
    };
  }

  const todos = excepciones.horarioEspecial
    ? generateSlotsEnRango(excepciones.horarioEspecial.inicio, excepciones.horarioEspecial.fin)
    : generateSlots(dow);
  if (todos.length === 0) return { horarios_libres: [] };

  const [ocupadosRes, fijosRes] = await Promise.all([
    pool.query<{ hora: string }>(
      `SELECT hora FROM turnos WHERE peluquero_id = $1 AND fecha = $2 AND estado IN ('pendiente','confirmado')`,
      [peluqueroId, fechaIso],
    ),
    pool.query<{ hora: string }>(
      `SELECT hora FROM horarios_fijos WHERE peluquero_id = $1 AND dia_semana = $2 AND activo = true`,
      [peluqueroId, dow],
    ),
  ]);

  const ocupados = new Set([
    ...ocupadosRes.rows.map((r) => r.hora.slice(0, 5)),
    ...fijosRes.rows.map((r) => r.hora.slice(0, 5)),
  ]);

  return { horarios_libres: todos.filter((t) => !ocupados.has(t)) };
}

export interface CrearTurnoManualInput {
  peluqueroId: string;
  servicio: ServicioPedido;
  fecha: string;
  hora: string;
  clienteNombre: string;
  clienteWhatsapp: string;
}

export type CrearTurnoManualResult =
  | { ok: true }
  | {
      ok: false;
      motivo:
        | "servicios_no_encontrados"
        | "cerrado"
        | "peluquero_ausente"
        | "fuera_de_horario_especial"
        | "ocupado"
        | "horario_fijo"
        | "fuera_de_horario"
        | "error";
      detalle?: string;
    };

export async function crearTurnoManual(
  input: CrearTurnoManualInput,
): Promise<CrearTurnoManualResult> {
  const excepciones = resolverExcepciones(await getExcepcionesDia(input.fecha));
  if (excepciones.cerrado) {
    return { ok: false, motivo: "cerrado", detalle: excepciones.motivoCierre };
  }
  if (excepciones.peluquerosAusentes.has(input.peluqueroId)) {
    return {
      ok: false,
      motivo: "peluquero_ausente",
      detalle: excepciones.peluquerosAusentes.get(input.peluqueroId) ?? undefined,
    };
  }
  if (excepciones.horarioEspecial) {
    const slotsValidos = generateSlotsEnRango(
      excepciones.horarioEspecial.inicio,
      excepciones.horarioEspecial.fin,
    );
    if (!slotsValidos.includes(input.hora.slice(0, 5))) {
      return { ok: false, motivo: "fuera_de_horario_especial" };
    }
  }

  const servicios = await getServiciosMap();
  if (!servicios) return { ok: false, motivo: "servicios_no_encontrados" };
  const { corte, barbaORapado } = servicios;

  const servicioId =
    input.servicio === "barba_o_rapado" || input.servicio === "rapado_y_barba"
      ? barbaORapado.id
      : corte.id;

  try {
    await pool.query(
      `INSERT INTO turnos (peluquero_id, servicio_id, fecha, hora, cliente_nombre, cliente_whatsapp, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmado')`,
      [input.peluqueroId, servicioId, input.fecha, input.hora, input.clienteNombre, input.clienteWhatsapp],
    );
    return { ok: true };
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === "23505") return { ok: false, motivo: "ocupado" };
    if (pgErr.code === "23514" && pgErr.message?.includes("reservado de forma fija")) {
      return { ok: false, motivo: "horario_fijo" };
    }
    if (pgErr.code === "23514") return { ok: false, motivo: "fuera_de_horario" };
    return { ok: false, motivo: "error", detalle: pgErr.message };
  }
}
