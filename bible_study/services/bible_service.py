"""Consulta de textos bíblicos (bolls.life y getbible.net) con caché local en SQLite."""

from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from ..config import BOLLS_BASE_URL, GETBIBLE_BASE_URL
from ..database import Database, utc_now
from .http_client import ServiceError, get_text

VERSIONS: list[dict[str, Any]] = [
    # ── Español ──
    {"id": "rv1960", "name": "Reina Valera 1960 (RV1960)", "lang": "es", "source": "bolls"},
    {"id": "lbla", "name": "La Biblia de las Américas (LBLA)", "lang": "es", "source": "bolls"},
    {"id": "nvi", "name": "Nueva Versión Internacional (NVI)", "lang": "es", "source": "bolls"},
    {"id": "ntv", "name": "Nueva Traducción Viviente (NTV)", "lang": "es", "source": "bolls"},
    # ── English ──
    {"id": "kjv", "name": "King James Version (KJV)", "lang": "en", "source": "bolls"},
    {"id": "nkjv", "name": "New King James Version (NKJV)", "lang": "en", "source": "bolls"},
    {"id": "esv", "name": "English Standard Version (ESV)", "lang": "en", "source": "bolls"},
    {"id": "nasb", "name": "New American Standard Bible (NASB)", "lang": "en", "source": "bolls"},
    {"id": "lsb", "name": "Legacy Standard Bible (LSB)", "lang": "en", "source": "bolls"},
    {"id": "nlt", "name": "New Living Translation (NLT)", "lang": "en", "source": "bolls"},
    {"id": "niv", "name": "New International Version (NIV)", "lang": "en", "source": "bolls"},
    # ── Griego / Hebreo ──
    {"id": "tischendorf", "name": "Griego NT – Tischendorf 8ª Ed.", "lang": "grc",
     "source": "getbible", "ntOnly": True},
    {"id": "tisch-s", "name": "Griego NT – Tischendorf con Strong's ★", "lang": "grc",
     "source": "bolls", "ntOnly": True, "strongs": True},
    {"id": "gnt-parallel", "name": "Griego NT + Español (Tischendorf / RV1960)", "lang": "grc",
     "source": "parallel", "ntOnly": True},
    {"id": "lxx", "name": "Septuaginta – Griego AT (LXX)", "lang": "el", "source": "getbible"},
    {"id": "codex", "name": "Texto Hebreo Masorético (WLC/Codex)", "lang": "he",
     "source": "getbible"},
    {"id": "wlca", "name": "Hebreo AT – Westminster Leningrad con Strong's ★", "lang": "he",
     "source": "bolls", "otOnly": True, "strongs": True},
]

# IDs de bolls.life (sensibles a mayúsculas)
BOLLS_MAP = {
    "rv1960": "RV1960", "lbla": "LBLA", "nvi": "NVI", "ntv": "NTV",
    "kjv": "KJV", "nkjv": "NKJV", "esv": "ESV", "nasb": "NASB", "lsb": "LSB",
    "nlt": "NLT", "niv": "NIV2011",
    "tisch-s": "TISCH", "wlca": "WLCa",
}

GETBIBLE_MAP = {"tischendorf": "tischendorf", "lxx": "lxx", "codex": "codex"}

NT_ONLY = {"tischendorf", "gnt-parallel", "tisch-s"}
OT_ONLY = {"wlca"}
# Versiones cuyo texto lleva etiquetas <S>NNNN</S> de Strong's (no se deben eliminar)
STRONGS_TAGGED = {"tisch-s", "wlca", "kjv"}

HTML_TAG_RE = re.compile(r"<[^>]+>")
NON_STRONGS_TAG_RE = re.compile(r"<(?!/?S>)[^>]+>")


class BibleService:
    def __init__(self, db: Database):
        self.db = db

    # ── Caché ────────────────────────────────────────────────────────────────
    def _fetch_cached(self, url: str) -> str:
        """Descarga `url`; si falla la red, usa la copia guardada en la base de datos."""
        try:
            text = get_text(url)
        except ServiceError:
            row = self.db.query_one("SELECT payload FROM bible_cache WHERE cache_key = ?", (url,))
            if row:
                return row["payload"]
            raise
        with self.db.transaction() as cur:
            cur.execute(
                "INSERT OR REPLACE INTO bible_cache (cache_key, payload, fetched_at) "
                "VALUES (?, ?, ?)",
                (url, text, utc_now()),
            )
        return text

    # ── API pública ──────────────────────────────────────────────────────────
    @staticmethod
    def versions() -> list[dict]:
        return VERSIONS

    def books(self, version: str) -> Any:
        if version in BOLLS_MAP:
            url = f"{BOLLS_BASE_URL}/get-books/{BOLLS_MAP[version]}/"
        elif version in GETBIBLE_MAP:
            url = f"{GETBIBLE_BASE_URL}/{GETBIBLE_MAP[version]}/books.json"
        elif version == "gnt-parallel":
            url = f"{GETBIBLE_BASE_URL}/tischendorf/books.json"
        else:
            raise ServiceError(400, f"Versión '{version}' no reconocida")
        return json.loads(self._fetch_cached(url))

    def chapter(self, version: str, book: int, chapter: int,
                verse_from: int = 1, verse_to: int = 999) -> list[dict]:
        if version in NT_ONLY and book < 40:
            raise ServiceError(400, "Esta versión solo contiene el Nuevo Testamento "
                                    "(Mateo – Apocalipsis).")
        if version in OT_ONLY and book > 39:
            raise ServiceError(400, "Esta versión solo contiene el Antiguo Testamento "
                                    "(Génesis – Malaquías).")

        if version in BOLLS_MAP:
            data = self._bolls_chapter(BOLLS_MAP[version], book, chapter)
            tag_re = NON_STRONGS_TAG_RE if version in STRONGS_TAGGED else HTML_TAG_RE
            return [
                {"verse": v["verse"], "text": tag_re.sub("", v.get("text") or "").strip()}
                for v in data
                if verse_from <= v["verse"] <= verse_to
            ]

        if version in GETBIBLE_MAP:
            data = self._getbible_chapter(GETBIBLE_MAP[version], book, chapter)
            verses = [
                {"verse": int(v["verse"]), "text": v.get("text")}
                for v in data.get("verses", [])
            ]
            return sorted(
                (v for v in verses if verse_from <= v["verse"] <= verse_to),
                key=lambda v: v["verse"],
            )

        if version == "gnt-parallel":
            return self._parallel(book, chapter, verse_from, verse_to)

        raise ServiceError(400, f"Versión '{version}' no reconocida")

    # ── Fuentes ──────────────────────────────────────────────────────────────
    def _bolls_chapter(self, bolls_id: str, book: int, chapter: int) -> list[dict]:
        url = f"{BOLLS_BASE_URL}/get-chapter/{bolls_id}/{book}/{chapter}/"
        return json.loads(self._fetch_cached(url))

    def _getbible_chapter(self, gb_id: str, book: int, chapter: int) -> dict:
        url = f"{GETBIBLE_BASE_URL}/{gb_id}/{book}/{chapter}.json"
        return json.loads(self._fetch_cached(url))

    def _parallel(self, book: int, chapter: int, verse_from: int, verse_to: int) -> list[dict]:
        """Griego (Tischendorf) + español (RV1960), descargados en paralelo."""
        with ThreadPoolExecutor(max_workers=2) as pool:
            grc_future = pool.submit(self._getbible_chapter, "tischendorf", book, chapter)
            es_future = pool.submit(self._bolls_chapter, "RV1960", book, chapter)
            grc, es = grc_future.result(), es_future.result()

        grc_map = {
            int(v["verse"]): v.get("text") or ""
            for v in grc.get("verses", [])
            if verse_from <= int(v["verse"]) <= verse_to
        }
        es_map = {
            int(v["verse"]): v.get("text") or ""
            for v in es
            if verse_from <= int(v["verse"]) <= verse_to
        }
        return [
            {"verse": n, "text": grc_map[n], "translation": es_map.get(n, "")}
            for n in sorted(grc_map)
        ]
