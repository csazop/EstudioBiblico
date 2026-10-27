"""Ventanas de escritorio.

Dos motores:
- pywebview: ventana nativa (WebView2 en Windows x64, WKWebView en macOS).
- Edge en modo aplicación (`msedge --app`): ventana propia sin barra de navegador.
  Es el motor por defecto en Windows ARM64, donde pythonnet (requerido por
  pywebview en Windows) no puede cargar .NET: clr_loader solo trae ClrLoader.dll
  para x86/amd64. También se usa como respaldo si pywebview falla en Windows.
"""

from __future__ import annotations

import logging
import os
import subprocess
import threading
from pathlib import Path
from typing import Callable

from . import APP_NAME, __version__
from . import platform_info as pi

log = logging.getLogger(__name__)

WINDOW_SIZE = (1366, 860)

# Comprobación ejecutada dentro de la página: interfaz renderizada, librerías CDN y API.
SELFTEST_JS = """
(async () => {
  const r = await fetch('/api/bible/versions');
  const versions = r.ok ? (await r.json()).length : 0;
  const notes = (await (await fetch('/api/studynotes')).json()).length;
  return {
    title: document.title,
    navbar: !!document.querySelector('.navbar'),
    bootstrap: typeof bootstrap !== 'undefined',
    versions, notes,
  };
})()
"""

# Peticiones que hace el dashboard al cargar: prueban que la página ejecutó su JS.
DASHBOARD_PATHS = {"/api/studynotes", "/api/sermons"}


class BackendUnavailable(Exception):
    """El motor de ventana no se puede usar en este equipo (se intenta el siguiente)."""


def choose_backend(requested: str) -> list[str]:
    """Orden de motores a intentar para --window=<requested>."""
    if requested != "auto":
        return [requested]
    if pi.is_windows_arm():
        return ["edge", "webview"]
    if pi.IS_WINDOWS:
        return ["webview", "edge"]
    return ["webview"]


# ── pywebview ────────────────────────────────────────────────────────────────

def run_webview(url: str, *, data_dir: Path, on_close: Callable[[], None], debug: bool,
                selftest: bool, disable_gpu: bool) -> bool:
    try:
        import webview
    except ImportError as e:
        raise BackendUnavailable(f"pywebview no está instalado ({e})") from e

    if disable_gpu and pi.IS_WINDOWS:
        # WebView2 lee esta variable al crear el navegador
        os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = "--disable-gpu"

    # Permite descargar los PDF (jsPDF) y los videos (.webm) generados por la interfaz.
    if hasattr(webview, "settings"):
        webview.settings["ALLOW_DOWNLOADS"] = True
        webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True

    window = webview.create_window(
        title=f"{APP_NAME} {__version__}",
        url=url,
        width=WINDOW_SIZE[0],
        height=WINDOW_SIZE[1],
        min_size=(1024, 680),
        text_select=True,
        zoomable=True,
    )
    # En macOS, Cmd+Q y Ctrl+C terminan el proceso desde Cocoa sin volver de
    # webview.start(); el evento `closing` sí se emite en todos los casos.
    window.events.closing += on_close

    storage = data_dir / "webview"
    storage.mkdir(exist_ok=True)
    outcome = {"ok": not selftest}
    try:
        webview.start(
            _webview_selftest if selftest else None,
            (window, outcome) if selftest else None,
            debug=debug and not selftest,
            private_mode=False,
            storage_path=str(storage),
        )
    except Exception as e:  # pythonnet/.NET/WebView2 ausentes o incompatibles
        if window.events.shown.is_set():
            raise
        raise BackendUnavailable(f"pywebview no pudo abrir la ventana: {e}") from e
    return outcome["ok"]


def _webview_selftest(window, outcome: dict) -> None:
    """Valida el arranque y cierra la ventana (se ejecuta en un hilo aparte)."""
    try:
        if not window.events.loaded.wait(45):
            raise TimeoutError("la página no terminó de cargar en 45 s")
        # pywebview solo resuelve promesas cuando se pasa un callback
        done = threading.Event()
        holder: dict = {}

        def on_result(value):
            holder["result"] = value
            done.set()

        window.evaluate_js(SELFTEST_JS, on_result)
        if not done.wait(30):
            raise TimeoutError("la comprobación JS no respondió en 30 s")
        result = holder.get("result") or {}
        log.info("Autoprueba: %s", result)
        if result and not result.get("bootstrap"):
            log.warning("Bootstrap (CDN) no cargó: ¿sin conexión a internet?")
        outcome["ok"] = bool(result.get("navbar")) and result.get("versions", 0) > 0
    except Exception:  # noqa: BLE001
        log.exception("Autoprueba fallida")
    finally:
        window.destroy()


# ── Edge en modo aplicación ──────────────────────────────────────────────────

def run_edge(url: str, *, data_dir: Path, wait_for_requests: Callable[[set, float], bool],
             selftest: bool, disable_gpu: bool) -> bool:
    exe = pi.find_edge()
    if not exe:
        raise BackendUnavailable("no se encontró Microsoft Edge ni Google Chrome")

    # Perfil propio: el proceso lanzado es el navegador principal y no termina
    # hasta que se cierra la ventana (con el perfil por defecto delegaría en otra instancia).
    profile = data_dir / "edge-profile"
    profile.mkdir(exist_ok=True)
    args = [
        exe,
        f"--app={url}",
        f"--user-data-dir={profile}",
        f"--window-size={WINDOW_SIZE[0]},{WINDOW_SIZE[1]}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--disable-features=msEdgeSidebarV2,msHubApps,msImplicitSignin",
    ]
    if disable_gpu:
        args.append("--disable-gpu")

    log.info("Abriendo ventana con %s", Path(exe).name)
    flags = subprocess.CREATE_NO_WINDOW if pi.IS_WINDOWS else 0
    proc = subprocess.Popen(args, creationflags=flags)

    # Esperar a que la página cargue, vigilando si Edge muere antes (perfil dañado, política, etc.)
    loaded = False
    for _ in range(120):  # hasta 60 s: la primera vez Edge crea el perfil y en una VM tarda
        if wait_for_requests(DASHBOARD_PATHS, 0.5):
            loaded = True
            break
        if proc.poll() is not None:
            break
    alive = proc.poll() is None

    if selftest:
        log.info("Autoprueba (Edge): página cargada=%s, proceso activo=%s", loaded, alive)
        _terminate(proc)
        return loaded and alive

    if not loaded and not alive:
        raise BackendUnavailable(f"{Path(exe).name} se cerró sin cargar la página "
                                 f"(código {proc.returncode})")
    if not loaded:
        log.warning("La página aún no termina de cargar; se mantiene la ventana abierta")
    proc.wait()
    return True


def _terminate(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(10)
    except subprocess.TimeoutExpired:
        proc.kill()
