"""Servidor HTTP local (solo 127.0.0.1) que expone la misma API REST que el
backend ASP.NET original y sirve la interfaz web empaquetada.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import re
import socket
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable

from .database import Database
from .repositories import SermonsRepository, StudyNotesRepository, ValidationError
from .services.bible_service import BibleService
from .services.commentary_service import CommentaryService
from .services.http_client import ServiceError
from .services.strongs_service import StrongsService
from .services.translation_service import TranslationService

log = logging.getLogger(__name__)

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


class Response:
    def __init__(self, status: int = 200, body: Any = None, raw: str | None = None,
                 html: str | None = None):
        self.status = status
        self.body = body
        self.raw = raw  # texto plano (mensajes de error)
        self.html = html  # página HTML (proxy de comentarios)


class ApiError(Exception):
    def __init__(self, status: int, message: str = ""):
        super().__init__(message)
        self.status = status
        self.message = message


Handler = Callable[..., Response]


class Api:
    """Rutas /api/* — mismas URLs y formato JSON (camelCase) que la API original."""

    def __init__(self, db: Database):
        self.notes = StudyNotesRepository(db)
        self.sermons = SermonsRepository(db)
        self.bible = BibleService(db)
        self.strongs = StrongsService()
        self.translation = TranslationService()
        self.commentary = CommentaryService()

        self.routes: list[tuple[str, re.Pattern, Handler]] = []
        r = self._route
        # Notas de estudio
        r("GET", r"/api/studynotes", lambda q, b: Response(body=self.notes.list()))
        r("POST", r"/api/studynotes", lambda q, b: Response(201, self.notes.create(b)))
        r("GET", r"/api/studynotes/(\d+)", lambda q, b, i: self._found(self.notes.get(int(i))))
        r("PUT", r"/api/studynotes/(\d+)",
          lambda q, b, i: self._found(self.notes.update(int(i), b)))
        r("DELETE", r"/api/studynotes/(\d+)",
          lambda q, b, i: self._deleted(self.notes.delete(int(i))))
        # Sermones
        r("GET", r"/api/sermons", lambda q, b: Response(body=self.sermons.list()))
        r("POST", r"/api/sermons", lambda q, b: Response(201, self.sermons.create(b)))
        r("GET", r"/api/sermons/(\d+)", lambda q, b, i: self._found(self.sermons.get(int(i))))
        r("PUT", r"/api/sermons/(\d+)",
          lambda q, b, i: self._found(self.sermons.update(int(i), b)))
        r("DELETE", r"/api/sermons/(\d+)",
          lambda q, b, i: self._deleted(self.sermons.delete(int(i))))
        # Biblia
        r("GET", r"/api/bible/versions", lambda q, b: Response(body=self.bible.versions()))
        r("GET", r"/api/bible/strongs/([^/]+)",
          lambda q, b, code: Response(body=self.strongs.lookup(urllib.parse.unquote(code))))
        r("GET", r"/api/bible/([\w-]+)/books",
          lambda q, b, v: Response(body=self.bible.books(v)))
        r("GET", r"/api/bible/([\w-]+)/(\d+)/(\d+)", self._chapter)
        # Traducción
        r("POST", r"/api/translation/translate", self._translate)
        r("POST", r"/api/translation/batch", self._translate_batch)
        # Comentarios bíblicos (proxy de BibleHub para poder traducirlos)
        r("GET", r"/api/commentary/page",
          lambda q, b: Response(html=self.commentary.page(q.get("url", [""])[0])))

    def _route(self, method: str, pattern: str, handler: Handler) -> None:
        self.routes.append((method, re.compile(f"^{pattern}/?$", re.IGNORECASE), handler))

    @staticmethod
    def _found(obj: Any) -> Response:
        if obj is None:
            raise ApiError(404, "No encontrado")
        return Response(body=obj)

    @staticmethod
    def _deleted(ok: bool) -> Response:
        if not ok:
            raise ApiError(404, "No encontrado")
        return Response(204)

    def _chapter(self, q: dict, b: Any, version: str, book: str, chapter: str) -> Response:
        def qint(name: str, default: int) -> int:
            try:
                return int(q.get(name, [default])[0])
            except ValueError:
                raise ApiError(400, f"Parámetro '{name}' inválido")
        return Response(body=self.bible.chapter(
            version, int(book), int(chapter), qint("from", 1), qint("to", 999)))

    def _translate(self, q: dict, b: Any) -> Response:
        b = b or {}
        return Response(body=self.translation.translate(
            str(b.get("text") or ""), str(b.get("targetLanguage") or "")))

    def _translate_batch(self, q: dict, b: Any) -> Response:
        b = b or {}
        return Response(body=self.translation.translate_batch(
            b.get("texts"), str(b.get("targetLanguage") or "es"),
            str(b.get("sourceLanguage") or "auto")))

    def dispatch(self, method: str, path: str, query: dict, body: Any) -> Response:
        path_matched = False
        for m, pattern, handler in self.routes:
            match = pattern.match(path)
            if not match:
                continue
            path_matched = True
            if m == method:
                return handler(query, body, *match.groups())
        raise ApiError(405 if path_matched else 404,
                       "Método no permitido" if path_matched else "Ruta no encontrada")


class RequestTracker:
    """Registra las rutas atendidas con éxito (usado por la autoprueba de arranque)."""

    def __init__(self) -> None:
        self._seen: set[str] = set()
        self._cond = threading.Condition()

    def record(self, path: str) -> None:
        with self._cond:
            self._seen.add(path.rstrip("/").lower() or "/")
            self._cond.notify_all()

    def wait_for(self, paths: set[str], timeout: float) -> bool:
        with self._cond:
            return self._cond.wait_for(lambda: paths <= self._seen, timeout)


def make_handler(api: Api, web_root: Path, allowed_hosts: set[str],
                 tracker: RequestTracker) -> type:
    web_root = web_root.resolve()

    class RequestHandler(BaseHTTPRequestHandler):
        server_version = "BibleStudyDesktop/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt: str, *args: Any) -> None:
            log.debug("%s - %s", self.address_string(), fmt % args)

        # ── utilidades ───────────────────────────────────────────────────────
        def _send(self, status: int, payload: bytes, content_type: str,
                  headers: dict[str, str] | None = None) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)

        def _send_text(self, status: int, text: str) -> None:
            self._send(status, text.encode("utf-8"), "text/plain; charset=utf-8")

        def _host_ok(self) -> bool:
            # Protección contra DNS rebinding: solo se aceptan peticiones dirigidas a localhost.
            return self.headers.get("Host", "") in allowed_hosts

        # ── verbos ───────────────────────────────────────────────────────────
        def do_GET(self) -> None:
            self._handle()

        def do_HEAD(self) -> None:
            self._handle()

        def do_POST(self) -> None:
            self._handle()

        def do_PUT(self) -> None:
            self._handle()

        def do_DELETE(self) -> None:
            self._handle()

        def _handle(self) -> None:
            if not self._host_ok():
                self._send_text(403, "Host no permitido")
                return
            parsed = urllib.parse.urlsplit(self.path)
            if parsed.path.startswith("/api/"):
                self._handle_api(parsed)
            elif self.command in ("GET", "HEAD"):
                self._serve_static(urllib.parse.unquote(parsed.path))
            else:
                self._send_text(405, "Método no permitido")

        def _read_json(self) -> Any:
            length = int(self.headers.get("Content-Length") or 0)
            if length == 0:
                return None
            ctype = self.headers.get("Content-Type", "")
            if "application/json" not in ctype:
                # Exigir JSON obliga a los sitios externos a pasar por un preflight CORS
                # que este servidor nunca aprueba (protección CSRF).
                raise ApiError(415, "Se requiere Content-Type: application/json")
            try:
                return json.loads(self.rfile.read(length).decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                raise ApiError(400, "JSON inválido")

        def _handle_api(self, parsed: urllib.parse.SplitResult) -> None:
            try:
                body = self._read_json() if self.command in ("POST", "PUT") else None
                query = urllib.parse.parse_qs(parsed.query)
                resp = api.dispatch(self.command, parsed.path, query, body)
                tracker.record(parsed.path)
            except ApiError as e:
                resp = Response(e.status, raw=e.message)
            except ServiceError as e:
                resp = Response(e.status, raw=e.message)
            except ValidationError as e:
                resp = Response(400, raw=str(e))
            except Exception as e:  # noqa: BLE001
                log.exception("Error no controlado en %s %s", self.command, self.path)
                resp = Response(500, raw=f"Error interno: {e}")

            if resp.status == 204:
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()
            elif resp.raw is not None:
                self._send_text(resp.status, resp.raw)
            elif resp.html is not None:
                # Página externa: sin scripts y solo incrustable en la propia app.
                self._send(resp.status, resp.html.encode("utf-8"), "text/html; charset=utf-8", {
                    "Content-Security-Policy": "script-src 'none'; object-src 'none'; "
                                               "frame-ancestors 'self'",
                    "X-Content-Type-Options": "nosniff",
                })
            else:
                payload = json.dumps(resp.body, ensure_ascii=False).encode("utf-8")
                self._send(resp.status, payload, "application/json; charset=utf-8")

        def _serve_static(self, url_path: str) -> None:
            rel = url_path.lstrip("/") or "index.html"
            candidates = [web_root / rel, web_root / f"{rel}.html", web_root / rel / "index.html"]
            for candidate in candidates:
                try:
                    resolved = candidate.resolve()
                except OSError:
                    continue
                # Impide salir de la carpeta web (path traversal)
                if web_root not in resolved.parents and resolved != web_root:
                    continue
                if resolved.is_file():
                    ctype = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
                    if ctype.startswith("text/") or ctype == "application/javascript":
                        ctype += "; charset=utf-8"
                    self._send(200, resolved.read_bytes(), ctype)
                    return
            self._send_text(404, "No encontrado")

    return RequestHandler


def find_free_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


class LocalServer:
    """Servidor en un hilo de fondo; se detiene al cerrar la aplicación."""

    def __init__(self, db: Database, web_root: Path, host: str = "127.0.0.1", port: int = 0):
        self.host = host
        self.port = port or find_free_port(host)
        allowed = {f"{h}:{self.port}" for h in ("127.0.0.1", "localhost")}
        self.tracker = RequestTracker()
        handler = make_handler(Api(db), web_root, allowed, self.tracker)
        self.httpd = ThreadingHTTPServer((self.host, self.port), handler)
        self.httpd.daemon_threads = True
        self._thread: threading.Thread | None = None

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}/"

    def start(self) -> None:
        self._thread = threading.Thread(target=self.httpd.serve_forever, daemon=True,
                                        name="local-api")
        self._thread.start()
        log.info("Servidor local escuchando en %s", self.url)

    def wait(self) -> None:
        # join con timeout para que Ctrl+C funcione también en Windows
        while self._thread and self._thread.is_alive():
            self._thread.join(0.5)

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
