"""Acceso a datos de notas de estudio y sermones.

Los diccionarios devueltos usan camelCase, igual que la API original en ASP.NET,
para que la interfaz web funcione sin cambios.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from .database import Database, utc_now


class ValidationError(ValueError):
    pass


def _str(data: dict, key: str, default: str = "") -> str:
    value = data.get(key, default)
    return default if value is None else str(value)


def _int(data: dict, key: str, default: int = 1) -> int:
    try:
        return int(data.get(key, default))
    except (TypeError, ValueError):
        raise ValidationError(f"El campo '{key}' debe ser numérico.")


def _date(data: dict, key: str) -> str:
    value = _str(data, key).strip()
    if len(value) < 10:
        raise ValidationError(f"El campo '{key}' debe ser una fecha (AAAA-MM-DD).")
    return value[:10]


def _section_dto(row: sqlite3.Row, section_index: int | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "sectionIndex": row["section_index"] if section_index is None else section_index,
        "version": row["version"],
        "bookName": row["book_name"],
        "bookNumber": row["book_number"],
        "chapter": row["chapter"],
        "verseStart": row["verse_start"],
        "verseEnd": row["verse_end"],
        "content": row["content"],
    }


def _section_values(s: dict) -> tuple:
    return (
        _str(s, "version"),
        _str(s, "bookName"),
        _int(s, "bookNumber"),
        _int(s, "chapter"),
        _int(s, "verseStart"),
        _int(s, "verseEnd"),
        _str(s, "content"),
    )


# ── Notas de estudio ─────────────────────────────────────────────────────────

class StudyNotesRepository:
    def __init__(self, db: Database):
        self.db = db

    def list(self) -> list[dict]:
        rows = self.db.query(
            "SELECT id, title, study_date, updated_at FROM study_notes ORDER BY updated_at DESC"
        )
        return [
            {"id": r["id"], "title": r["title"], "studyDate": r["study_date"],
             "updatedAt": r["updated_at"]}
            for r in rows
        ]

    def get(self, note_id: int) -> dict | None:
        note = self.db.query_one("SELECT * FROM study_notes WHERE id = ?", (note_id,))
        if note is None:
            return None
        sections = self.db.query(
            "SELECT * FROM note_bible_sections WHERE study_note_id = ? ORDER BY section_index",
            (note_id,),
        )
        return {
            "id": note["id"],
            "title": note["title"],
            "studyDate": note["study_date"],
            "comments": note["comments"],
            "createdAt": note["created_at"],
            "updatedAt": note["updated_at"],
            "bibleSections": [_section_dto(s) for s in sections],
        }

    def create(self, data: dict) -> dict:
        now = utc_now()
        with self.db.transaction() as cur:
            cur.execute(
                "INSERT INTO study_notes (title, study_date, comments, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (_str(data, "title", "Sin título"), _date(data, "studyDate"),
                 _str(data, "comments"), now, now),
            )
            note_id = cur.lastrowid
            self._insert_sections(cur, note_id, data.get("bibleSections") or [])
        return self.get(note_id)

    def update(self, note_id: int, data: dict) -> dict | None:
        with self.db.transaction() as cur:
            cur.execute(
                "UPDATE study_notes SET title = ?, study_date = ?, comments = ?, updated_at = ? "
                "WHERE id = ?",
                (_str(data, "title", "Sin título"), _date(data, "studyDate"),
                 _str(data, "comments"), utc_now(), note_id),
            )
            if cur.rowcount == 0:
                return None
            cur.execute("DELETE FROM note_bible_sections WHERE study_note_id = ?", (note_id,))
            self._insert_sections(cur, note_id, data.get("bibleSections") or [])
        return self.get(note_id)

    def delete(self, note_id: int) -> bool:
        with self.db.transaction() as cur:
            cur.execute("DELETE FROM study_notes WHERE id = ?", (note_id,))
            return cur.rowcount > 0

    @staticmethod
    def _insert_sections(cur: sqlite3.Cursor, note_id: int, sections: list[dict]) -> None:
        for s in sections:
            idx = _int(s, "sectionIndex")
            if not 1 <= idx <= 3:
                raise ValidationError("sectionIndex debe estar entre 1 y 3.")
            cur.execute(
                "INSERT INTO note_bible_sections (study_note_id, section_index, version, "
                "book_name, book_number, chapter, verse_start, verse_end, content) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (note_id, idx, *_section_values(s)),
            )


# ── Sermones ─────────────────────────────────────────────────────────────────

class SermonsRepository:
    def __init__(self, db: Database):
        self.db = db

    def list(self) -> list[dict]:
        rows = self.db.query(
            "SELECT id, title, sermon_date, theme, updated_at FROM sermons ORDER BY updated_at DESC"
        )
        return [
            {"id": r["id"], "title": r["title"], "sermonDate": r["sermon_date"],
             "theme": r["theme"], "updatedAt": r["updated_at"]}
            for r in rows
        ]

    def get(self, sermon_id: int) -> dict | None:
        s = self.db.query_one("SELECT * FROM sermons WHERE id = ?", (sermon_id,))
        if s is None:
            return None
        refs = self.db.query(
            "SELECT * FROM sermon_bible_refs WHERE sermon_id = ? ORDER BY id", (sermon_id,)
        )
        return {
            "id": s["id"],
            "title": s["title"],
            "sermonDate": s["sermon_date"],
            "theme": s["theme"],
            "scriptureRef": s["scripture_ref"],
            "introduction": s["introduction"],
            "mainPoints": s["main_points"],
            "conclusion": s["conclusion"],
            "notes": s["notes"],
            "createdAt": s["created_at"],
            "updatedAt": s["updated_at"],
            "bibleRefs": [_section_dto(r, 0) for r in refs],
        }

    @staticmethod
    def _values(data: dict) -> tuple:
        return (
            _str(data, "title", "Sin título"),
            _date(data, "sermonDate"),
            _str(data, "theme"),
            _str(data, "scriptureRef"),
            _str(data, "introduction"),
            _str(data, "mainPoints", "[]") or "[]",
            _str(data, "conclusion"),
            _str(data, "notes"),
        )

    def create(self, data: dict) -> dict:
        now = utc_now()
        with self.db.transaction() as cur:
            cur.execute(
                "INSERT INTO sermons (title, sermon_date, theme, scripture_ref, introduction, "
                "main_points, conclusion, notes, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (*self._values(data), now, now),
            )
            sermon_id = cur.lastrowid
            self._insert_refs(cur, sermon_id, data.get("bibleRefs") or [])
        return self.get(sermon_id)

    def update(self, sermon_id: int, data: dict) -> dict | None:
        with self.db.transaction() as cur:
            cur.execute(
                "UPDATE sermons SET title = ?, sermon_date = ?, theme = ?, scripture_ref = ?, "
                "introduction = ?, main_points = ?, conclusion = ?, notes = ?, updated_at = ? "
                "WHERE id = ?",
                (*self._values(data), utc_now(), sermon_id),
            )
            if cur.rowcount == 0:
                return None
            cur.execute("DELETE FROM sermon_bible_refs WHERE sermon_id = ?", (sermon_id,))
            self._insert_refs(cur, sermon_id, data.get("bibleRefs") or [])
        return self.get(sermon_id)

    def delete(self, sermon_id: int) -> bool:
        with self.db.transaction() as cur:
            cur.execute("DELETE FROM sermons WHERE id = ?", (sermon_id,))
            return cur.rowcount > 0

    @staticmethod
    def _insert_refs(cur: sqlite3.Cursor, sermon_id: int, refs: list[dict]) -> None:
        for r in refs:
            cur.execute(
                "INSERT INTO sermon_bible_refs (sermon_id, version, book_name, book_number, "
                "chapter, verse_start, verse_end, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (sermon_id, *_section_values(r)),
            )
