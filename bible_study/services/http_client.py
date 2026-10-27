"""Cliente HTTP mínimo basado en la biblioteca estándar (sin dependencias)."""

from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from ..config import HTTP_TIMEOUT

USER_AGENT = "Mozilla/5.0 (compatible; BibleStudyDesktop/1.0)"


class ServiceError(Exception):
    """Error al consultar un servicio externo; lleva el código HTTP a devolver."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _ssl_context() -> ssl.SSLContext:
    # certifi (si está instalado) evita problemas de certificados en algunos Windows/PyInstaller.
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


_SSL = _ssl_context()


def get_text(url: str, timeout: float = HTTP_TIMEOUT) -> str:
    return _fetch(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout)


def post_form(url: str, fields: dict[str, str], timeout: float = HTTP_TIMEOUT) -> str:
    data = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    })
    return _fetch(req, timeout)


def _fetch(req: urllib.request.Request, timeout: float) -> str:
    url = req.full_url
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise ServiceError(e.code, f"HTTP {e.code} al consultar {url}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ServiceError(503, f"Error de conexión: {e}") from e


def get_json(url: str, timeout: float = HTTP_TIMEOUT) -> Any:
    return json.loads(get_text(url, timeout))
