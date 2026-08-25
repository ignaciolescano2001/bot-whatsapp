-- Excepciones de agenda: cierres puntuales, ausencias de peluquero y
-- horarios especiales. Vive en la misma base Supabase que turnos,
-- horarios_fijos, peluqueros y servicios (SUPABASE_DATABASE_URL).
--
-- El esquema de esta base no se versiona con una herramienta de
-- migraciones (no existe ninguna en el repo) — este archivo es solo
-- referencia de lo que se corrió a mano contra Supabase.

CREATE TABLE excepciones_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('cerrado', 'peluquero_ausente', 'horario_especial')),
  peluquero_id uuid REFERENCES peluqueros(id),
  hora_inicio time,
  hora_fin time,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (tipo = 'peluquero_ausente' AND peluquero_id IS NOT NULL AND hora_inicio IS NULL AND hora_fin IS NULL)
    OR (tipo = 'cerrado' AND peluquero_id IS NULL AND hora_inicio IS NULL AND hora_fin IS NULL)
    OR (tipo = 'horario_especial' AND peluquero_id IS NULL AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_inicio < hora_fin)
  )
);

CREATE UNIQUE INDEX excepciones_agenda_cerrado_unico ON excepciones_agenda (fecha) WHERE tipo = 'cerrado';
CREATE UNIQUE INDEX excepciones_agenda_horario_especial_unico ON excepciones_agenda (fecha) WHERE tipo = 'horario_especial';
CREATE UNIQUE INDEX excepciones_agenda_ausente_unico ON excepciones_agenda (fecha, peluquero_id) WHERE tipo = 'peluquero_ausente';
CREATE INDEX excepciones_agenda_fecha_idx ON excepciones_agenda (fecha);
