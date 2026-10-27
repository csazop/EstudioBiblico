"""Rutas y parámetros de configuración de la aplicación."""

from __future__ import annotations

import os
import sys
from pathlib import Path

APP_DIR_NAME = "EstudioBiblico"

BOLLS_BASE_URL = os.environ.get("BIBLE_BOLLS_URL", "https://bolls.life")
GETBIBLE_BASE_URL = os.environ.get("BIBLE_GETBIBLE_URL", "https://api.getbible.net/v2")

HTTP_TIMEOUT = 15  # segundos


def resource_dir() -> Path:
    """Carpeta raíz de los recursos (compatible con PyInstaller)."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def web_dir() -> Path:
    return resource_dir() / "web"


def data_dir() -> Path:
    """Carpeta de datos del usuario.

    Windows: %LOCALAPPDATA%\\EstudioBiblico
    macOS:   ~/Library/Application Support/EstudioBiblico
    Linux:   ~/.estudiobiblico
    Se puede sobrescribir con la variable de entorno BIBLE_STUDY_DATA_DIR
    (útil para una instalación portable, p. ej. en una memoria USB).
    """
    override = os.environ.get("BIBLE_STUDY_DATA_DIR")
    if override:
        path = Path(override)
    elif sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        path = Path(base) / APP_DIR_NAME
    elif sys.platform == "darwin":
        path = Path.home() / "Library" / "Application Support" / APP_DIR_NAME
    else:
        path = Path.home() / f".{APP_DIR_NAME.lower()}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def db_path() -> Path:
    return data_dir() / "bible_study.db"


def cache_dir() -> Path:
    path = data_dir() / "cache"
    path.mkdir(parents=True, exist_ok=True)
    return path
