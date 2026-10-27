## Estudio Bíblico — Versión de escritorio (Python · Windows y macOS)

Versión de escritorio de la plataforma de estudio bíblico. Reemplaza la arquitectura
Docker (Nginx + ASP.NET Core + PostgreSQL) por **una sola aplicación Python**:

| Original (web)            | Versión escritorio                                   |
|---------------------------|------------------------------------------------------|
| PostgreSQL 16 (servidor)  | **SQLite** — un archivo local, sin motor ni servicio |
| ASP.NET Core 9 Web API    | Servidor Python interno (solo `127.0.0.1`, puerto libre) |
| Nginx + navegador         | Ventana de escritorio: **pywebview** (WebView2 / WKWebView) o **Edge en modo aplicación** (Windows ARM) |
| Docker Compose            | `run.bat` / `EstudioBiblico.exe` · `run.sh` / `EstudioBiblico.app` |

La interfaz (HTML/JS/CSS) es la misma, así que se conservan todas las funciones:
notas de estudio, preparación de sermones, 17 versiones bíblicas (español, inglés,
griego y hebreo), concordancia Strong, traducción, corrector ortográfico,
exportación a PDF y generador de video.

## Windows 10/11 (x64 y ARM64)

### Requisitos
- **Python**: no hace falta instalarlo a mano. Si `run.bat` no encuentra Python 3.10–3.14,
  ofrece instalar **Python 3.13** solo para el usuario actual, sin permisos de administrador.
  Lo hace con **winget** o, si no está disponible, con el instalador oficial de python.org
  (x64, ARM64 o x86 según el equipo). Antes de ejecutar ese instalador **verifica su firma
  digital** (Python Software Foundation).
- **Microsoft Edge**, que ya viene con Windows 11 y Windows 10.
- Conexión a internet para consultar textos bíblicos, Strong y traducción.
  Los capítulos ya consultados quedan en caché y se pueden leer sin conexión.

### Ejecutar
- Copie la carpeta `python-desktop` a un disco local, p. ej. `C:\EstudioBiblico`.
  No la ejecute desde una carpeta compartida de la VM.
- Ejecute **`run.bat`** con doble clic. La primera vez hace lo siguiente (`scripts\setup.ps1`):
  1. Busca Python con el lanzador `py`, el PATH y las carpetas habituales. Ignora el alias
     de Microsoft Store, que no es un Python real.
  2. Si no lo encuentra, pregunta y lo instala.
  3. Crea el entorno `.venv` e instala las dependencias.
- Si el entorno se daña (p. ej. se desinstaló Python), `run.bat` lo detecta y lo recrea.
- Para la instalación sin preguntas:
  `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -Yes`.

```bat
run.bat --setup        :: solo prepara el entorno (Python + dependencias)
run.bat --selftest     :: valida el arranque y cierra (código 0 = OK)
run.bat --debug        :: con consola y registro detallado
run.bat --browser      :: abrir en el navegador normal
diagnostico.bat        :: genera diagnostico.txt (sistema + autoprueba + app.log)
```

### Motor de ventana
La app elige el motor automáticamente. Se puede forzar con `--window`:

| Equipo | Motor por defecto | Respaldo automático |
|---|---|---|
| Windows x64 | `webview`: ventana nativa pywebview + WebView2 | `edge` |
| **Windows ARM64** | **`edge`**: Edge en modo aplicación, sin barra de navegador | `webview` |
| macOS | `webview` (WKWebView) | — |

**Por qué Edge en ARM64:** en Windows, pywebview depende de `pythonnet` para cargar .NET.
Su cargador (`clr_loader`) solo incluye `ClrLoader.dll` para x86/amd64, así que con un
Python ARM64 nativo **no puede abrir la ventana**. Por eso en ARM64 no se instala pywebview
y se usa Edge (`msedge --app`). Edge es nativo ARM64 y no necesita .NET. La ventana es
independiente, tiene su propio icono en la barra de tareas y la app termina al cerrarla.
Usa un perfil propio en la carpeta de datos (`edge-profile\`).

**Máquinas virtuales:** si se detecta una VM (QEMU/UTM, VMware, VirtualBox, Parallels,
Hyper-V), se desactiva la aceleración por GPU para evitar ventanas en blanco.
Para forzar el comportamiento: `--gpu` / `--no-gpu`.

### Errores
Sin consola (doble clic), los errores de arranque se muestran en un cuadro de diálogo
y se registran en `%LOCALAPPDATA%\EstudioBiblico\app.log`. Solo puede haber una
instancia abierta a la vez.

### Generar el ejecutable (.exe)

```bat
build_exe.bat
```

- Produce `dist\EstudioBiblico\EstudioBiblico.exe`, para x64 o ARM64 según el Python usado.
- Para distribuir, copie la carpeta `dist\EstudioBiblico` completa. El equipo destino no necesita Python.
- Opcional: coloque `assets\app.ico` para usarlo como icono.

## macOS (11 Big Sur o superior)

Requiere Python 3.11+ (python.org o Homebrew). WKWebView viene con el sistema.

```bash
./run.sh              # primera vez: crea .venv e instala pywebview + pyobjc
./run.sh --selftest   # valida el arranque y cierra (código 0 = OK)
./build_app.sh        # genera dist/EstudioBiblico.app
```

Opcional: `assets/app.icns` como icono. La app no está firmada con un certificado
de desarrollador: si se copia a otro Mac, la primera vez ábrala con clic derecho → *Abrir*.

## Validar el arranque

`--selftest` abre la ventana real y espera a que cargue la página. Comprueba que la
interfaz se renderizó, que Bootstrap cargó y que la API responde. En modo Edge verifica
que la página ejecutó su JavaScript y llamó a la API. Registra el resultado en `app.log`,
cierra y devuelve código 0 (OK) o 1 (fallo):

```
Autoprueba: {'title': 'Estudio Bíblico – Dashboard', 'navbar': True, 'bootstrap': True, 'versions': 17, 'notes': 2}
AUTOPRUEBA: OK
```

Funciona igual con `python main.py`, `EstudioBiblico.exe` y `EstudioBiblico.app/Contents/MacOS/EstudioBiblico`.

## Datos

Carpeta de datos: Windows `%LOCALAPPDATA%\EstudioBiblico\` · macOS `~/Library/Application Support/EstudioBiblico/`

| Elemento                 | Archivo dentro de la carpeta de datos |
|--------------------------|---------------------------------------|
| Base de datos            | `bible_study.db`                      |
| Diccionarios Strong      | `cache/`                              |
| Registro de errores      | `app.log`                             |

- **Respaldo**: cierre la aplicación y copie `bible_study.db`.
- **Modo portable** (p. ej. en USB): defina la variable de entorno
  `BIBLE_STUDY_DATA_DIR` con la carpeta deseada.
- La base se crea automáticamente al primer arranque con datos de ejemplo.
  Se puede abrir con cualquier visor SQLite (p. ej. *DB Browser for SQLite*).

## Estructura

```
python-desktop/
├── main.py                     # Punto de entrada
├── run.bat / run.sh            # Ejecutar en Windows / macOS (crea .venv)
├── diagnostico.bat             # Informe de diagnóstico (Windows)
├── scripts/setup.ps1           # Windows: detecta/instala Python, crea .venv, dependencias
├── build_exe.bat               # Empaquetar .exe (Windows)
├── build_app.sh                # Empaquetar .app (macOS)
├── requirements.txt            # pywebview (excepto Windows ARM64), certifi
├── requirements-dev.txt        # + pyinstaller
├── assets/                     # Iconos opcionales (app.ico / app.icns)
├── bible_study/
│   ├── app.py                  # Arranque: BD + servidor + ventana, instancia única
│   ├── desktop.py              # Motores de ventana: pywebview / Edge modo app
│   ├── platform_info.py        # Arquitectura real, detección de VM, ruta de Edge
│   ├── config.py               # Rutas (datos, recursos, PyInstaller)
│   ├── database.py             # Esquema SQLite, transacciones, datos iniciales
│   ├── repositories.py         # CRUD de notas y sermones
│   ├── server.py               # API REST /api/* + archivos estáticos
│   └── services/
│       ├── http_client.py      # HTTP con biblioteca estándar
│       ├── bible_service.py    # bolls.life / getbible.net + caché
│       ├── strongs_service.py  # Concordancia Strong (caché en disco)
│       └── translation_service.py
├── web/                        # Interfaz (copiada de frontend/wwwroot)
└── tests/test_api.py           # python -m unittest discover -s tests
```

## API interna

Mismas rutas que la API original (`/api/studynotes`, `/api/sermons`,
`/api/bible/versions`, `/api/bible/{version}/books`,
`/api/bible/{version}/{libro}/{capítulo}?from=&to=`, `/api/bible/strongs/{código}`,
`/api/translation/translate`). Solo escucha en `127.0.0.1`, rechaza peticiones con
un `Host` distinto de localhost y exige JSON en las escrituras.

## Pruebas

```bat
.venv\Scripts\python -m unittest discover -s tests -v
```
