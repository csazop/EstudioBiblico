"""Proxy de páginas de comentarios bíblicos (BibleHub).

Sirve la página desde el mismo origen que la app para que el modal pueda leer y
traducir su texto. Se eliminan los scripts (anuncios/analítica) y se añade
<base href> para que imágenes, estilos y enlaces apunten al sitio original.
"""

from __future__ import annotations

import html
import re
import urllib.parse

from .http_client import ServiceError, get_text

ALLOWED_HOSTS = {"biblehub.com", "www.biblehub.com"}

_SCRIPT_RE = re.compile(r"<script\b.*?</script\s*>", re.IGNORECASE | re.DOTALL)
_NOSCRIPT_RE = re.compile(r"<noscript\b.*?</noscript\s*>", re.IGNORECASE | re.DOTALL)
_IFRAME_RE = re.compile(r"<iframe\b.*?(</iframe\s*>|/>)", re.IGNORECASE | re.DOTALL)
_BASE_RE = re.compile(r"<base\b[^>]*>", re.IGNORECASE)
_EVENT_ATTR_RE = re.compile(r"""\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)""", re.IGNORECASE)
_HEAD_RE = re.compile(r"<head\b[^>]*>", re.IGNORECASE)


def validate_url(url: str) -> str:
    parts = urllib.parse.urlsplit(url or "")
    if parts.scheme not in ("http", "https") or (parts.hostname or "").lower() not in ALLOWED_HOSTS:
        raise ServiceError(400, "Solo se permiten páginas de biblehub.com.")
    return urllib.parse.urlunsplit(("https", "biblehub.com", parts.path or "/", parts.query, ""))


def sanitize(page: str, base_url: str) -> str:
    for rx in (_SCRIPT_RE, _NOSCRIPT_RE, _IFRAME_RE, _BASE_RE):
        page = rx.sub("", page)
    page = _EVENT_ATTR_RE.sub("", page)
    base = f'<base href="{html.escape(base_url, quote=True)}" target="_blank">'
    match = _HEAD_RE.search(page)
    if match:
        return page[:match.end()] + base + page[match.end():]
    return base + page


class CommentaryService:
    def page(self, url: str) -> str:
        safe_url = validate_url(url)
        return sanitize(get_text(safe_url), safe_url)
