"""Arranque de la aplicación de escritorio."""

from __future__ import annotations

import argparse
import logging
import sys
import threading
import webbrowser
from typing import IO

from . import APP_NAME, __version__
from . import platform_info as pi
from .config import data_dir, db_path, web_dir
from .database import Database
from .desktop import BackendUnavailable, choose_backend, run_edge, run_webview
from .server import LocalServer

log = logging.getLogger("bible_study")


def _setup_logging(debug: bool) -> None:
    handlers: list[logging.Handler] = [
        logging.FileHandler(data_dir() / "app.log", encoding="utf-8"),
    ]
    if sys.stderr is not None:  # con pythonw / .exe sin consola stderr es None
        try:
            sys.stderr.reconfigure(errors="replace")  # consolas Windows sin UTF-8
        except (AttributeError, ValueError):
            pass
        handlers.append(logging.StreamHandler())
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=handlers,
    )


def _show_error(message: str) -> None:
    """Muestra el error aunque no haya consola (pythonw / .exe en Windows)."""
    if sys.stderr is not None:
        print(message, file=sys.stderr)
    if pi.IS_WINDOWS:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, message, APP_NAME, 0x10)  # MB_ICONERROR
        except Exception:  # noqa: BLE001
            pass


# ── Instancia única ──────────────────────────────────────────────────────────

_lock_file: IO | None = None


def _acquire_single_instance() -> bool:
    """Evita dos instancias (en modo Edge compartirían perfil y la segunda se cerraría)."""
    global _lock_file
    _lock_file = open(data_dir() / "app.lock", "a+")
    try:
        if pi.IS_WINDOWS:
            import msvcrt
            _lock_file.seek(0)
            msvcrt.locking(_lock_file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(_lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


# ── Principal ────────────────────────────────────────────────────────────────

def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="EstudioBiblico", description=APP_NAME)
    parser.add_argument("--window", choices=["auto", "webview", "edge", "browser"],
                        default="auto",
                        help="Motor de ventana: auto (por defecto), webview (pywebview), "
                             "edge (Edge en modo aplicación) o browser (navegador)")
    parser.add_argument("--browser", action="store_const", const="browser", dest="window",
                        help="Atajo de --window browser")
    gpu = parser.add_mutually_exclusive_group()
    gpu.add_argument("--no-gpu", dest="gpu", action="store_false", default=None,
                     help="Desactivar aceleración por GPU (se hace solo en máquinas virtuales)")
    gpu.add_argument("--gpu", dest="gpu", action="store_true",
                     help="Forzar aceleración por GPU aunque se detecte una máquina virtual")
    parser.add_argument("--port", type=int, default=0, help="Puerto local (por defecto: libre)")
    parser.add_argument("--debug", action="store_true", help="Registro detallado y DevTools")
    parser.add_argument("--selftest", action="store_true",
                        help="Abrir la ventana, validar interfaz y API, y cerrar (código 0 = OK)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        return _main(argv)
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        log.exception("Error fatal")
        _show_error(f"No se pudo iniciar {APP_NAME}:\n\n{e}\n\n"
                    f"Detalles en: {data_dir() / 'app.log'}")
        return 1


def _main(argv: list[str] | None) -> int:
    args = _parse_args(argv)
    _setup_logging(args.debug)
    log.info("%s %s — datos en %s", APP_NAME, __version__, data_dir())
    log.info("Plataforma: %s", pi.summary())

    if not _acquire_single_instance():
        _show_error(f"{APP_NAME} ya está abierto.")
        return 1

    disable_gpu = (pi.vm_description() is not None) if args.gpu is None else not args.gpu
    if disable_gpu:
        log.info("Aceleración por GPU desactivada")

    db = Database(db_path())
    server = LocalServer(db, web_dir(), port=args.port)
    server.start()

    closed = threading.Event()

    def shutdown() -> None:
        """Detiene el servidor y cierra la BD una sola vez, venga de donde venga el cierre."""
        if closed.is_set():
            return
        closed.set()
        server.stop()
        db.close()
        log.info("Aplicación cerrada")

    ok = False
    try:
        if args.window == "browser":
            webbrowser.open(server.url)
            print(f"{APP_NAME} en {server.url}  (Ctrl+C para salir)")
            server.wait()
            ok = True
        else:
            ok = _open_window(args, server, shutdown, disable_gpu)
    except KeyboardInterrupt:
        ok = True
    finally:
        shutdown()

    if args.selftest:
        print("AUTOPRUEBA:", "OK" if ok else "FALLIDA")
    return 0 if ok else 1


def _open_window(args: argparse.Namespace, server: LocalServer, shutdown,
                 disable_gpu: bool) -> bool:
    errors: list[str] = []
    for backend in choose_backend(args.window):
        log.info("Motor de ventana: %s", backend)
        try:
            if backend == "webview":
                return run_webview(server.url, data_dir=data_dir(), on_close=shutdown,
                                   debug=args.debug, selftest=args.selftest,
                                   disable_gpu=disable_gpu)
            return run_edge(server.url, data_dir=data_dir(),
                            wait_for_requests=server.tracker.wait_for,
                            selftest=args.selftest, disable_gpu=disable_gpu)
        except BackendUnavailable as e:
            log.warning("Motor '%s' no disponible: %s", backend, e)
            errors.append(f"• {backend}: {e}")

    raise RuntimeError("No hay ningún motor de ventana disponible.\n" + "\n".join(errors) +
                       "\n\nPuede usar el modo navegador: main.py --browser")
