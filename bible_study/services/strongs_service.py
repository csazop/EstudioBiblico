"""Concordancia de Strong (griego/hebreo) con caché en disco."""

from __future__ import annotations

import html
import json
import re
import threading
from pathlib import Path

from ..config import cache_dir
from .http_client import ServiceError, get_text

GREEK_URL = ("https://raw.githubusercontent.com/openscriptures/strongs/master/"
             "greek/strongs-greek-dictionary.js")
HEBREW_URL = ("https://raw.githubusercontent.com/openscriptures/strongs/master/"
              "hebrew/strongs-hebrew-dictionary.js")
# Versión española de BibleHub: cada entrada indica cómo la traduce la RV1909
RV1909_URL = "https://bibliaparalela.com/{lang}/{num}.htm"

_CODE_RE = re.compile(r"^([GH])0*(\d{1,4})$")
_RV1909_RE = re.compile(r"RVR 1909 Número de Palabras:\s*(?:</span>)?(.*?)(?:<br|<span|<div|</p)",
                        re.IGNORECASE | re.DOTALL)
_USAGE_RE = re.compile(r"([^,()]+?)\s*\((\d+)\)")


class StrongsService:
    def __init__(self, cache_folder: Path | None = None):
        self._cache_folder = cache_folder or cache_dir()
        self._dicts: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._rv1909: dict[str, list] | None = None
        self._rv1909_lock = threading.Lock()

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

    def rv1909_usage(self, code: str) -> dict:
        """Palabras con que la RV1909 traduce el código, con su número de apariciones."""
        match = _CODE_RE.match(code.strip().upper())
        if not match:
            raise ServiceError(400, "El código debe comenzar con G (griego) o H (hebreo). "
                                    "Ej: G2316, H430")
        prefix, num = match.groups()
        code = f"{prefix}{num}"
        cache_file = self._cache_folder / "strongs-rv1909.json"

        with self._rv1909_lock:
            if self._rv1909 is None:
                try:
                    self._rv1909 = json.loads(cache_file.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    self._rv1909 = {}
            if code in self._rv1909:
                return {"code": code, "usage": self._rv1909[code]}

        lang = "greek" if prefix == "G" else "hebrew"
        try:
            page = get_text(RV1909_URL.format(lang=lang, num=num), timeout=20)
        except ServiceError as e:
            if e.status != 404:
                raise ServiceError(503, "No se pudo consultar el uso en la RV1909. "
                                        "Verifique la conexión a internet.") from e
            page = ""
        usage = self._parse_rv1909(page)

        with self._rv1909_lock:
            self._rv1909[code] = usage
            cache_file.write_text(json.dumps(self._rv1909, ensure_ascii=False), encoding="utf-8")
        return {"code": code, "usage": usage}

    @staticmethod
    def _parse_rv1909(page: str) -> list[dict]:
        match = _RV1909_RE.search(page)
        if not match:
            return []
        text = html.unescape(re.sub(r"<[^>]+>", "", match.group(1)))
        usage = []
        for word, count in _USAGE_RE.findall(text):
            word = " ".join(word.split()).strip(" .;")
            if word:
                usage.append({"word": word.lower() if word.isupper() else word,
                              "count": int(count)})
        return usage

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
