"""Detección de plataforma: arquitectura real del SO, máquina virtual y navegador Edge."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"

_IMAGE_FILE_MACHINE = {0x014C: "x86", 0x8664: "AMD64", 0xAA64: "ARM64", 0x01C4: "ARM"}

_VM_MARKERS = ("qemu", "utm", "vmware", "virtualbox", "vbox", "parallels", "kvm", "xen",
               "virtual machine", "hyper-v", "bochs")


@lru_cache(maxsize=None)
def os_arch() -> str:
    """Arquitectura nativa del sistema operativo.

    En Windows ARM, un Python x64 emulado ve "AMD64" en platform.machine();
    IsWow64Process2 devuelve la arquitectura real de la máquina.
    """
    if IS_WINDOWS:
        try:
            import ctypes
            from ctypes import wintypes

            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            fn = kernel32.IsWow64Process2
            fn.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.USHORT),
                           ctypes.POINTER(wintypes.USHORT)]
            fn.restype = wintypes.BOOL
            kernel32.GetCurrentProcess.restype = wintypes.HANDLE
            process_machine, native_machine = wintypes.USHORT(), wintypes.USHORT()
            if fn(kernel32.GetCurrentProcess(), ctypes.byref(process_machine),
                  ctypes.byref(native_machine)):
                return _IMAGE_FILE_MACHINE.get(native_machine.value, platform.machine())
        except (AttributeError, OSError):
            pass  # Windows 10 antiguo sin IsWow64Process2
        return os.environ.get("PROCESSOR_ARCHITEW6432") or platform.machine()
    return platform.machine()


def python_arch() -> str:
    """Arquitectura del proceso Python actual (puede diferir de os_arch si está emulado)."""
    return platform.machine()


def is_windows_arm() -> bool:
    return IS_WINDOWS and os_arch().upper() == "ARM64"


@lru_cache(maxsize=None)
def vm_description() -> str | None:
    """Fabricante/modelo si se detecta una máquina virtual; None si parece hardware real."""
    texts: list[str] = []
    if IS_WINDOWS:
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                r"HARDWARE\DESCRIPTION\System\BIOS") as key:
                for name in ("SystemManufacturer", "SystemProductName", "BIOSVendor"):
                    try:
                        texts.append(str(winreg.QueryValueEx(key, name)[0]))
                    except OSError:
                        pass
        except OSError:
            pass
    elif IS_MAC:
        try:
            out = subprocess.run(["sysctl", "-n", "kern.hv_vmm_present"], capture_output=True,
                                 text=True, timeout=3).stdout.strip()
            if out == "1":
                return "macOS virtualizado"
        except (OSError, subprocess.SubprocessError):
            pass
    else:
        for f in ("sys_vendor", "product_name"):
            try:
                texts.append(Path(f"/sys/class/dmi/id/{f}").read_text().strip())
            except OSError:
                pass

    joined = " ".join(texts)
    return joined if any(m in joined.lower() for m in _VM_MARKERS) else None


def find_edge() -> str | None:
    """Ruta de msedge.exe (o, en su defecto, Chrome). Solo Windows."""
    if not IS_WINDOWS:
        return None
    candidates: list[Path] = []
    try:
        import winreg

        for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            for exe in ("msedge.exe", "chrome.exe"):
                try:
                    with winreg.OpenKey(hive, r"SOFTWARE\Microsoft\Windows\CurrentVersion"
                                              rf"\App Paths\{exe}") as key:
                        candidates.append(Path(winreg.QueryValueEx(key, "")[0]))
                except OSError:
                    pass
    except ImportError:
        pass
    for env in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"):
        base = os.environ.get(env)
        if base:
            candidates.append(Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    for env in ("ProgramFiles", "LOCALAPPDATA"):
        base = os.environ.get(env)
        if base:
            candidates.append(Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe")

    # Edge primero: viene preinstalado en Windows 10/11
    candidates.sort(key=lambda p: p.name.lower() != "msedge.exe")
    for path in candidates:
        if path.is_file():
            return str(path)
    return shutil.which("msedge") or shutil.which("chrome")


def summary() -> str:
    vm = vm_description()
    return (f"{platform.platform()} | SO {os_arch()} | Python {platform.python_version()} "
            f"{python_arch()} | VM: {vm or 'no'}")
