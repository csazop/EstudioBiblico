"""Traducción español → otros idiomas (Google sin clave; MyMemory como respaldo).

También traduce lotes de textos desde cualquier idioma (detección automática), usado
para los comentarios bíblicos que se muestran en inglés.
"""

from __future__ import annotations

import json
import time
import urllib.parse

from .http_client import ServiceError, get_text, post_form

SUPPORTED_LANGUAGES = {
    "en": "English", "fr": "French", "de": "German", "it": "Italian", "pt": "Portuguese",
    "ru": "Russian", "tl": "Tagalog", "ja": "Japanese", "zh": "Chinese", "ko": "Korean",
}


BATCH_TARGETS = {"es": "Spanish", **SUPPORTED_LANGUAGES}
BATCH_MAX_CHARS = 5000
BATCH_MAX_ITEMS = 300
GOOGLE_URL = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t"


class TranslationService:
    def translate_batch(self, texts: list, target: str = "es", source: str = "auto") -> dict:
        """Traduce una lista de textos cortos conservando el orden (1 petición por lote)."""
        if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
            raise ServiceError(400, "'texts' debe ser una lista de cadenas.")
        if target not in BATCH_TARGETS:
            raise ServiceError(400, f"Idioma '{target}' no soportado.")
        if source != "auto" and source not in BATCH_TARGETS:
            raise ServiceError(400, f"Idioma de origen '{source}' no soportado.")
        if len(texts) > BATCH_MAX_ITEMS:
            raise ServiceError(400, f"Máximo {BATCH_MAX_ITEMS} textos por lote.")
        # Cada elemento ocupa una línea: los saltos internos se aplanan.
        items = [" ".join(t.split()) for t in texts]
        if sum(len(t) + 1 for t in items) > BATCH_MAX_CHARS:
            raise ServiceError(400, f"El lote supera {BATCH_MAX_CHARS} caracteres.")

        result = self._google_batch(items, target, source)
        if result is None:
            raise ServiceError(503, "No se pudo traducir el texto. Inténtalo de nuevo en unos momentos.")
        translations, detected = result
        return {"translations": translations, "targetLanguage": target,
                "detectedLanguage": detected}

    @classmethod
    def _google_batch(cls, items: list[str], target: str, source: str
                      ) -> tuple[list[str], str] | None:
        if not any(items):
            return list(items), source
        joined = cls._google_post("\n".join(items), target, source)
        if joined is None:
            return None
        text, detected = joined
        lines = text.split("\n")
        if len(lines) == len(items):
            return [t.strip() if o else o for t, o in zip(lines, items)], detected
        # Google fusionó o partió líneas: se traduce elemento por elemento.
        out = []
        for item in items:
            one = cls._google_post(item, target, source) if item else None
            out.append(one[0].strip() if one else item)
        return out, detected

    @staticmethod
    def _google_post(text: str, target: str, source: str) -> tuple[str, str] | None:
        url = f"{GOOGLE_URL}&sl={source}&tl={target}"
        try:
            data = json.loads(post_form(url, {"q": text}, timeout=20))
            translated = "".join(s[0] or "" for s in data[0] if isinstance(s, list) and s)
            detected = data[2] if len(data) > 2 and isinstance(data[2], str) else source
            return translated, detected
        except (ServiceError, ValueError, TypeError, IndexError):
            return None

    def translate(self, text: str, target: str) -> dict:
        if not text or not text.strip():
            raise ServiceError(400, "El texto no puede estar vacío.")
        if target not in SUPPORTED_LANGUAGES:
            raise ServiceError(400, f"Idioma '{target}' no soportado.")

        text = text.strip()[:4500]

        result = self._google(text, target) or self._mymemory(text[:490], target)
        if not result:
            raise ServiceError(503, "No se pudo traducir el texto. Ambos servicios no "
                                    "respondieron. Inténtalo de nuevo en unos momentos.")
        return {
            "translatedText": result,
            "targetLanguage": target,
            "targetLanguageName": SUPPORTED_LANGUAGES[target],
        }

    @staticmethod
    def _google(text: str, target: str) -> str | None:
        url = ("https://translate.googleapis.com/translate_a/single?client=gtx&sl=es"
               f"&tl={target}&dt=t&q={urllib.parse.quote(text)}")
        try:
            data = json.loads(get_text(url))
            segments = data[0]
            translated = "".join(s[0] or "" for s in segments if isinstance(s, list) and s)
            return translated.strip() and translated or None
        except (ServiceError, ValueError, TypeError, IndexError):
            return None

    @staticmethod
    def _mymemory(text: str, target: str) -> str | None:
        url = ("https://api.mymemory.translated.net/get"
               f"?q={urllib.parse.quote(text)}&langpair=es|{target}")
        for attempt in range(2):
            try:
                data = json.loads(get_text(url, timeout=10))
                if int(data.get("responseStatus", 0)) != 200:
                    return None
                return data["responseData"]["translatedText"]
            except ServiceError as e:
                if attempt == 0:
                    time.sleep(3 if e.status == 429 else 2)
                    continue
                return None
            except (ValueError, KeyError, TypeError):
                return None
        return None
