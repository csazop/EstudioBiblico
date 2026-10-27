"""Base de datos local SQLite (archivo único, sin servidor)."""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS study_notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL DEFAULT 'Sin título',
    study_date  TEXT NOT NULL DEFAULT (date('now', 'localtime')),
    comments    TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_bible_sections (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    study_note_id  INTEGER NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
    section_index  INTEGER NOT NULL CHECK (section_index BETWEEN 1 AND 3),
    version        TEXT NOT NULL DEFAULT '',
    book_name      TEXT NOT NULL DEFAULT '',
    book_number    INTEGER NOT NULL DEFAULT 1,
    chapter        INTEGER NOT NULL DEFAULT 1,
    verse_start    INTEGER NOT NULL DEFAULT 1,
    verse_end      INTEGER NOT NULL DEFAULT 1,
    content        TEXT NOT NULL DEFAULT '',
    UNIQUE (study_note_id, section_index)
);

CREATE TABLE IF NOT EXISTS sermons (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL DEFAULT 'Sin título',
    sermon_date   TEXT NOT NULL DEFAULT (date('now', 'localtime')),
    theme         TEXT NOT NULL DEFAULT '',
    scripture_ref TEXT NOT NULL DEFAULT '',
    introduction  TEXT NOT NULL DEFAULT '',
    main_points   TEXT NOT NULL DEFAULT '[]',
    conclusion    TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sermon_bible_refs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sermon_id    INTEGER NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
    version      TEXT NOT NULL DEFAULT '',
    book_name    TEXT NOT NULL DEFAULT '',
    book_number  INTEGER NOT NULL DEFAULT 1,
    chapter      INTEGER NOT NULL DEFAULT 1,
    verse_start  INTEGER NOT NULL DEFAULT 1,
    verse_end    INTEGER NOT NULL DEFAULT 1,
    content      TEXT NOT NULL DEFAULT ''
);

-- Caché de capítulos descargados: permite leer sin conexión lo ya consultado.
CREATE TABLE IF NOT EXISTS bible_cache (
    cache_key   TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,
    fetched_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

SEED_NOTES = [
    ("El Sermón del Monte", "2026-05-01",
     "Estudio inicial de Mateo 5-7. Las bienaventuranzas representan el carácter del ciudadano "
     "del reino. Reflexionar sobre la sal y la luz del mundo.",
     [(1, "rv1960", "Mateo", 40, 5, 1, 12)]),
    ("La Creación", "2026-05-05",
     "Génesis 1 revela el poder soberano de Dios. \"En el principio\" - no hay explicación del "
     "origen de Dios, simplemente existe. Dios habla y todo cobra existencia.",
     [(1, "rv1960", "Génesis", 1, 1, 1, 31)]),
]

SEED_SERMON = (
    "Vivir por Fe", "2026-05-10", "La fe como fundamento de la vida cristiana", "Hebreos 11:1-6",
    "La fe no es simplemente creer en la existencia de Dios; es una confianza activa que "
    "transforma cada área de nuestra vida.",
    '[{"title":"¿Qué es la fe?","content":"Hebreos 11:1 define la fe como la certeza de lo que se '
    'espera, la convicción de lo que no se ve."},{"title":"Ejemplos de fe","content":"Abel, Enoc, '
    'Noé, Abraham - todos actuaron basados en la confianza en la Palabra de Dios."},{"title":"La '
    'vida de fe hoy","content":"Aplicaciones prácticas: decisiones laborales, relaciones, finanzas '
    '- todo filtrado a través de la fe."}]',
    "Dios nos llama a vivir cada día por fe, no por vista. Esta semana, identifica un área donde "
    "necesitas confiar más plenamente en Dios.",
    "Incluir testimonio personal de cómo la fe cambió una situación difícil.",
)


def utc_now() -> str:
    """Marca de tiempo ISO-8601 en UTC (formato que entiende `new Date()` en JS)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class Database:
    """Envoltorio fino sobre sqlite3, seguro para uso desde varios hilos."""

    def __init__(self, path: Path | str):
        self.path = str(path)
        self._lock = threading.RLock()
        # isolation_level=None → autocommit; las transacciones se abren explícitamente.
        self._conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._initialize()

    def _initialize(self) -> None:
        with self._lock:
            self._conn.executescript(SCHEMA)
        with self.transaction() as cur:
            seeded = cur.execute("SELECT value FROM app_meta WHERE key = 'seeded'").fetchone()
            if not seeded:
                self._seed(cur)
                cur.execute("INSERT INTO app_meta (key, value) VALUES ('seeded', '1')")

    @staticmethod
    def _seed(cur: sqlite3.Cursor) -> None:
        now = utc_now()
        for title, date, comments, sections in SEED_NOTES:
            cur.execute(
                "INSERT INTO study_notes (title, study_date, comments, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (title, date, comments, now, now),
            )
            note_id = cur.lastrowid
            for sec in sections:
                cur.execute(
                    "INSERT INTO note_bible_sections (study_note_id, section_index, version, "
                    "book_name, book_number, chapter, verse_start, verse_end) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (note_id, *sec),
                )
        cur.execute(
            "INSERT INTO sermons (title, sermon_date, theme, scripture_ref, introduction, "
            "main_points, conclusion, notes, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (*SEED_SERMON, now, now),
        )

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Cursor]:
        with self._lock:
            cur = self._conn.cursor()
            try:
                cur.execute("BEGIN")
                yield cur
                cur.execute("COMMIT")
            except Exception:
                cur.execute("ROLLBACK")
                raise
            finally:
                cur.close()

    def query(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    def query_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute(sql, params).fetchone()

    def close(self) -> None:
        with self._lock:
            self._conn.close()
