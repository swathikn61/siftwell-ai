"""
Pull comparable numbers out of free-text specifications.

    parse_size_gb("1 TB NVMe SSD")                -> 1024.0
    parse_battery("5,000 mAh")                    -> Battery(5000.0, "mah")
    parse_processor("16-core CPU, up to 5.2 GHz") -> Processor(cores=16, max_ghz=5.2)
    parse_display('16" 3200×2000 mini-LED, 165 Hz') -> Display(16.0, 3200, 2000, 165, "mini-led")
    parse_graphics("Dedicated GPU, 8 GB")         -> Graphics(dedicated=True, vram_gb=8.0)

Every parser returns None (or None fields) when the text doesn't contain the
information, so the comparison never guesses.
"""

import re
from dataclasses import dataclass

_NUMBER = r"(\d+(?:\.\d+)?)"


def parse_size_gb(text: str | None) -> float | None:
    """Memory/storage in GB. Returns None if no 'GB'/'TB' amount is found."""
    if not text:
        return None
    m = re.search(_NUMBER + r"\s*(TB|GB)\b", text, re.IGNORECASE)
    if not m:
        return None
    value = float(m.group(1))
    return value * 1024 if m.group(2).upper() == "TB" else value


@dataclass(frozen=True)
class Battery:
    value: float
    unit: str  # "mah" (phones) or "wh" (laptops)


def parse_battery(text: str | None) -> Battery | None:
    if not text:
        return None
    m = re.search(_NUMBER + r"\s*(mAh|Wh)\b", text.replace(",", ""), re.IGNORECASE)
    return Battery(float(m.group(1)), m.group(2).lower()) if m else None


@dataclass(frozen=True)
class Processor:
    cores: int | None
    max_ghz: float | None


_CORE_WORDS = {"dual": 2, "quad": 4, "hexa": 6, "octa": 8, "deca": 10}


def parse_processor(text: str | None) -> Processor | None:
    if not text:
        return None
    cores = None
    if m := re.search(r"(\d+)\s*-?\s*core", text, re.IGNORECASE):
        cores = int(m.group(1))
    elif m := re.search(r"\b(dual|quad|hexa|octa|deca)\s*-?\s*core", text, re.IGNORECASE):
        cores = _CORE_WORDS[m.group(1).lower()]
    ghz = float(m.group(1)) if (m := re.search(_NUMBER + r"\s*GHz", text, re.IGNORECASE)) else None
    return Processor(cores, ghz)


@dataclass(frozen=True)
class Display:
    size_in: float | None
    width: int | None
    height: int | None
    refresh_hz: int | None
    panel: str | None  # "oled", "mini-led", "ips", "lcd", ...

    @property
    def pixels(self) -> int | None:
        return self.width * self.height if self.width and self.height else None


_NAMED_RESOLUTIONS = {"4k": (3840, 2160), "uhd": (3840, 2160), "qhd": (2560, 1440), "fhd": (1920, 1080)}
_PANELS = ["mini-led", "amoled", "oled", "ips", "va", "lcd"]  # checked in this order


def parse_display(text: str | None) -> Display | None:
    if not text:
        return None
    size = float(m.group(1)) if (m := re.search(_NUMBER + r'\s*(?:"|”|inch|in\b)', text, re.IGNORECASE)) else None
    width = height = None
    if m := re.search(r"(\d{3,4})\s*[×x]\s*(\d{3,4})", text):
        width, height = int(m.group(1)), int(m.group(2))
    else:
        for name, (w, h) in _NAMED_RESOLUTIONS.items():
            if re.search(rf"\b{name}\b", text, re.IGNORECASE):
                width, height = w, h
                break
    refresh = int(m.group(1)) if (m := re.search(r"(\d{2,3})\s*Hz", text, re.IGNORECASE)) else None
    lower = text.lower()
    panel = next((p for p in _PANELS if p in lower), None)
    if panel == "amoled":
        panel = "oled"
    return Display(size, width, height, refresh, panel)


@dataclass(frozen=True)
class Graphics:
    dedicated: bool | None  # None = can't tell
    vram_gb: float | None


def parse_graphics(text: str | None) -> Graphics | None:
    if not text:
        return None
    lower = text.lower()
    if any(word in lower for word in ("dedicated", "discrete", "rtx", "gtx", "radeon rx")):
        dedicated: bool | None = True
    elif "integrated" in lower:
        dedicated = False
    else:
        dedicated = None
    return Graphics(dedicated, parse_size_gb(text) if dedicated else None)
