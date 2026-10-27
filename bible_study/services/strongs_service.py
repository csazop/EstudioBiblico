"""Concordancia de Strong (griego/hebreo) con caché en disco."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from ..config import cache_dir
from .http_client import ServiceError, get_text

GREEK_URL = ("https://raw.githubusercontent.com/openscriptures/strongs/master/"
             "greek/strongs-greek-dictionary.js")
HEBREW_URL = ("https://raw.githubusercontent.com/openscriptures/strongs/master/"
              "hebrew/strongs-hebrew-dictionary.js")


class StrongsService:
    def __init__(self, cache_folder: Path | None = None):
        self._cache_folder = cache_folder or cache_dir()
        self._dicts: dict[str, dict] = {}
        self._lock = threading.Lock()

    def lookup(self, code: str) -> dict:
        code = code.strip().upper()
        if code.startswith("G"):
            lang, url = "greek", GREEK_URL
        elif code.startswith("H"):
            lang, url = "hebrew", HEBREW_URL
        else:
            raise ServiceError(400, "El código debe comenzar con G (griego) o H (hebreo). "
                                    "Ej: G2316, H430")

        dictionary = self._ensure(lang, url)
        entry = dictionary.get(code)
        if entry is None:
            raise ServiceError(404, f"No se encontró entrada para '{code}'.")
        return {"code": code, "entry": entry}

    def _ensure(self, lang: str, url: str) -> dict:
        if lang in self._dicts:
            return self._dicts[lang]
        with self._lock:
            if lang in self._dicts:
                return self._dicts[lang]

            cache_file = self._cache_folder / f"strongs-{lang}.json"
            if cache_file.exists():
                data = json.loads(cache_file.read_text(encoding="utf-8"))
            else:
                try:
                    js = get_text(url, timeout=30)
                except ServiceError as e:
                    raise ServiceError(503, "No se pudo cargar el diccionario. "
                                            "Verifique la conexión a internet.") from e
                start, end = js.find("{"), js.rfind("}")
                if start < 0 or end < 0:
                    raise ServiceError(503, "Formato de diccionario no reconocido.")
                data = json.loads(js[start:end + 1])
                cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            self._dicts[lang] = data
            return data
