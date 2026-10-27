#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Genera dist/EstudioBiblico.app (macOS) con PyInstaller
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

PY=".venv/bin/python"
[ -x "$PY" ] || python3 -m venv .venv
"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r requirements-dev.txt

ICON_ARGS=()
[ -f assets/app.icns ] && ICON_ARGS=(--icon assets/app.icns)

"$PY" -m PyInstaller --noconfirm --clean --windowed \
    --name EstudioBiblico ${ICON_ARGS[@]+"${ICON_ARGS[@]}"} \
    --osx-bundle-identifier com.estudiobiblico.desktop \
    --add-data "web:web" \
    --collect-all webview \
    main.py

echo
echo "Listo: dist/EstudioBiblico.app"
echo "Validar arranque: dist/EstudioBiblico.app/Contents/MacOS/EstudioBiblico --selftest"
