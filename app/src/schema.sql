CREATE TABLE IF NOT EXISTS topics (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort       INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
  id         SERIAL PRIMARY KEY,
  topic_id   INT REFERENCES topics(id) ON DELETE SET NULL,
  type       TEXT NOT NULL,
  prompt     TEXT NOT NULL,
  objective  TEXT NOT NULL DEFAULT '',          -- Lernziel, fließt in den Weiterbildungsplan ein
  points     NUMERIC NOT NULL DEFAULT 1,
  image      TEXT,                              -- optionales Bild (URL)
  config     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS surveys (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'draft',    -- draft | open | closed
  threshold_low  INT NOT NULL DEFAULT 50,       -- darunter: Schulungsbedarf
  threshold_high INT NOT NULL DEFAULT 75,       -- darunter: Auffrischung
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_questions (
  survey_id   INT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position    INT NOT NULL,
  PRIMARY KEY (survey_id, question_id)
);

CREATE TABLE IF NOT EXISTS participants (
  id           SERIAL PRIMARY KEY,
  survey_id    INT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL DEFAULT '',
  token        TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'invited', -- invited | started | submitted
  started_at   TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS answers (
  participant_id INT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  question_id    INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  response       JSONB,
  auto_score     NUMERIC,                       -- 0..1, NULL = nicht automatisch bewertbar
  manual_score   NUMERIC,                       -- 0..1, vom Ausbilder gesetzt
  comment        TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, question_id)
);

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS time_limit_min INT;                       -- NULL = kein Zeitlimit
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS show_results BOOLEAN NOT NULL DEFAULT false; -- Teilnehmer sehen nach Abgabe ihr Ergebnis

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bearbeitbarer Weiterbildungsplan je Teilnehmer-Ergebnis
CREATE TABLE IF NOT EXISTS plans (
  participant_id INT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  items          JSONB NOT NULL DEFAULT '[]',
  notes          TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     TEXT NOT NULL DEFAULT ''
);

-- Übersetzungen (Oberfläche, Themen, Abfragen, Fragen); Quellsprache ist Deutsch
CREATE TABLE IF NOT EXISTS translations (
  kind        TEXT NOT NULL,                    -- 'ui' | 'topic' | 'survey' | 'question'
  ref_id      INT  NOT NULL,                    -- 0 bei 'ui'
  lang        TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',      -- flache Map: Schlüssel -> übersetzter Text
  source_hash TEXT NOT NULL DEFAULT '',         -- Hash der deutschen Quelltexte zum Zeitpunkt der Übersetzung
  reviewed    BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref_id, lang)
);

-- Einstellungen, die im Admin-Bereich geändert werden (z. B. aktivierte Sprachen)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
