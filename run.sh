#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Estudio Bíblico — ejecutar desde el código fuente (macOS / Linux)
#  La primera vez crea el entorno virtual e instala dependencias.
#  Uso: ./run.sh [--debug | --browser | --selftest]
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

PY=".venv/bin/python"
if [ ! -x "$PY" ]; then
    command -v python3 >/dev/null || { echo "Instale Python 3.11+ (https://www.python.org)"; exit 1; }
    echo "Creando entorno virtual..."
    python3 -m venv .venv
    # "python -m pip" en lugar de ".venv/bin/pip": el shebang de pip falla en rutas con '#'
    "$PY" -m pip install --upgrade pip
    "$PY" -m pip install -r requirements.txt
fi

exec "$PY" main.py "$@"
