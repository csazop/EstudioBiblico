<#
.SYNOPSIS
    Prepara Estudio Bíblico en Windows 10/11: Python, entorno virtual y dependencias.

.DESCRIPTION
    1. Busca un Python >= 3.10 funcional (lanzador py, PATH e instalaciones conocidas).
       Descarta el alias de Microsoft Store, que no es un Python real.
    2. Si no hay ninguno, instala Python solo para el usuario actual (sin administrador):
       primero con winget y, si no está disponible, con el instalador oficial de
       python.org, tras verificar su firma digital.
    3. Crea (o repara) el entorno virtual .venv e instala requirements.txt.

    Lo invoca run.bat; se puede ejecutar directamente:
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup.ps1 [-Yes]
#>
[CmdletBinding()]
param(
    # Versión que se instala si no hay Python (debe tener instaladores x64/ARM64/x86 en python.org)
    [string] $InstallVersion = '3.13.16',
    # Responder "sí" automáticamente a la pregunta de instalar Python
    [switch] $Yes
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest es muy lento con barra de progreso

$MinVersion = [version] '3.10'
$MaxVersion = [version] '3.15'             # excluido: versiones aún sin binarios de las dependencias
$ProjectDir = Split-Path -Parent $PSScriptRoot
$VenvDir = Join-Path $ProjectDir '.venv'
$VenvPython = Join-Path $VenvDir 'Scripts\python.exe'
$Marker = Join-Path $VenvDir '.instalado'

function Write-Step([string] $Message) { Write-Host "  $Message" }

function Get-PythonVersion([string] $Exe) {
    # Devuelve [version] si $Exe es un Python funcional con venv; $null en otro caso.
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Exe -c "import sys, venv; print('%d.%d.%d' % sys.version_info[:3])" 2>$null
        if ($LASTEXITCODE -eq 0 -and "$out".Trim() -match '^\d+\.\d+\.\d+$') {
            return [version] "$out".Trim()
        }
    } catch { }  # no es un Python ejecutable: se descarta
    return $null
}

function Test-SupportedVersion($Version) {
    return $Version -and $Version -ge $MinVersion -and $Version -lt $MaxVersion
}

function Find-Python {
    $candidates = New-Object System.Collections.Generic.List[string]

    # 1. Lanzador "py" (instalación estándar de python.org)
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        $ErrorActionPreference = 'Continue'
        try {
            $exe = & $launcher.Source -3 -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $exe) { $candidates.Add("$exe".Trim()) }
        } catch { }  # lanzador sin Python 3 registrado
        $ErrorActionPreference = 'Stop'
    }

    # 2. python.exe en el PATH (el alias de Microsoft Store falla en Get-PythonVersion)
    foreach ($cmd in @(Get-Command python.exe -All -ErrorAction SilentlyContinue)) {
        $candidates.Add($cmd.Source)
    }

    # 3. Ubicaciones habituales (por si el PATH de esta consola aún no se actualizó)
    $roots = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Python'),
        $env:ProgramFiles,
        ${env:ProgramFiles(x86)}
    ) | Where-Object { $_ -and (Test-Path $_) }
    foreach ($root in $roots) {
        foreach ($dir in @(Get-ChildItem -Path $root -Filter 'Python3*' -Directory -ErrorAction SilentlyContinue)) {
            $exe = Join-Path $dir.FullName 'python.exe'
            if (Test-Path $exe) { $candidates.Add($exe) }
        }
    }

    $best = $null
    foreach ($exe in ($candidates | Select-Object -Unique)) {
        $version = Get-PythonVersion $exe
        if ((Test-SupportedVersion $version) -and (-not $best -or $version -gt $best.Version)) {
            $best = [pscustomobject] @{ Path = $exe; Version = $version }
        }
    }
    return $best
}

function Get-OsArchitecture {
    # PROCESSOR_ARCHITEW6432 existe cuando PowerShell corre emulado (32 bits en 64)
    $arch = $env:PROCESSOR_ARCHITEW6432
    if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
    switch ($arch) {
        'AMD64' { return 'amd64' }
        'ARM64' { return 'arm64' }
        default { return 'x86' }
    }
}

function Install-PythonWithWinget {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Step 'winget no está disponible en este equipo.'
        return
    }
    $id = 'Python.Python.' + ($InstallVersion -replace '^(\d+\.\d+).*$', '$1')
    Write-Step "Instalando $id con winget (solo para este usuario)..."
    $ErrorActionPreference = 'Continue'
    # | Out-Host: la salida de un programa dentro de una función se sumaría a su valor de retorno
    & $winget.Source install --id $id --exact --source winget --scope user --silent `
        --accept-package-agreements --accept-source-agreements | Out-Host
    Write-Step "winget terminó con código $LASTEXITCODE."
}

function Install-PythonFromPythonOrg {
    $suffix = @{ amd64 = '-amd64'; arm64 = '-arm64'; x86 = '' }[(Get-OsArchitecture)]
    $file = "python-$InstallVersion$suffix.exe"
    $url = "https://www.python.org/ftp/python/$InstallVersion/$file"
    $installer = Join-Path $env:TEMP $file

    Write-Step "Descargando $url"
    # Windows PowerShell 5.1 puede no tener TLS 1.2 activado por defecto
    [Net.ServicePointManager]::SecurityProtocol = `
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing

    try {
        $signature = Get-AuthenticodeSignature -FilePath $installer
        $signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { '' }
        if ($signature.Status -ne 'Valid' -or $signer -notmatch 'Python Software Foundation') {
            throw "La firma digital del instalador no es válida (estado: $($signature.Status)). " +
                  'Por seguridad se canceló la instalación.'
        }
        Write-Step 'Firma digital verificada: Python Software Foundation.'
        Write-Step "Instalando Python $InstallVersion (solo para este usuario, puede tardar unos minutos)..."
        $installArgs = @('/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_launcher=1',
                         'InstallLauncherAllUsers=0', 'Include_test=0', 'Shortcuts=1')
        $process = Start-Process -FilePath $installer -ArgumentList $installArgs -Wait -PassThru
        if ($process.ExitCode -notin 0, 3010) {
            throw "El instalador de Python terminó con código $($process.ExitCode)."
        }
    } finally {
        Remove-Item $installer -Force -ErrorAction SilentlyContinue
    }
}

function Install-Python {
    Write-Host ''
    Write-Host "No se encontró Python $MinVersion o superior en este equipo."
    if (-not $Yes) {
        $answer = Read-Host "¿Desea instalar Python $InstallVersion ahora? (solo para este usuario, sin administrador) [S/N]"
        if ($answer -notmatch '^\s*(s|si|sí|y|yes)\s*$') {
            throw 'Instalación cancelada. Instale Python 3.10+ desde https://www.python.org y vuelva a ejecutar run.bat.'
        }
    }

    try { Install-PythonWithWinget } catch { Write-Step "winget falló: $($_.Exception.Message)" }
    $found = Find-Python
    if ($found) { return $found }

    Write-Step 'Se usará el instalador oficial de python.org.'
    Install-PythonFromPythonOrg
    $found = Find-Python
    if (-not $found) {
        throw 'Python se instaló pero no se pudo localizar. Cierre esta ventana y vuelva a ejecutar run.bat.'
    }
    return $found
}

function Initialize-Venv {
    $venvVersion = if (Test-Path $VenvPython) { Get-PythonVersion $VenvPython } else { $null }
    if (Test-SupportedVersion $venvVersion) {
        Write-Step "Entorno virtual existente: Python $venvVersion"
        return
    }
    if (Test-Path $VenvDir) {
        # .venv dañado (p. ej. se desinstaló el Python con el que se creó)
        Write-Step 'El entorno virtual existente no funciona; se volverá a crear.'
        Remove-Item $VenvDir -Recurse -Force
    }

    $python = Find-Python
    if ($python) {
        Write-Step "Python encontrado: $($python.Version) en $($python.Path)"
    } else {
        $python = Install-Python
        Write-Step "Python instalado: $($python.Version) en $($python.Path)"
    }

    Write-Step 'Creando entorno virtual...'
    & $python.Path -m venv $VenvDir | Out-Host
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $VenvPython)) {
        throw 'No se pudo crear el entorno virtual.'
    }
}

# ── Principal ────────────────────────────────────────────────────────────────
try {
    Write-Host 'Preparando Estudio Bíblico...'
    Initialize-Venv

    Write-Step 'Instalando dependencias...'
    Remove-Item $Marker -Force -ErrorAction SilentlyContinue
    & $VenvPython -m pip install --disable-pip-version-check -r (Join-Path $ProjectDir 'requirements.txt')
    if ($LASTEXITCODE -ne 0) {
        throw 'Falló la instalación de dependencias (¿hay conexión a internet?).'
    }
    Set-Content -Path $Marker -Value 'ok'
    Write-Host 'Listo.'
    exit 0
} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
