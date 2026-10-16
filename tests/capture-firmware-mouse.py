"""Capture independent reference reports from the current O2 C functions."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("qmk", type=Path, help="Path to the current QMK firmware checkout")
parser.add_argument("--cc", default="gcc", help="Host C compiler (not the ARM compiler)")
args = parser.parse_args()
compiler = shutil.which(args.cc)
if compiler is None:
    parser.error(f"Host compiler not found: {args.cc}")
firmware = args.qmk / "keyboards/os_keyboard_beta/os_joystick.c"
source = firmware.read_text(encoding="utf-8")
config = (firmware.parent / "o2/config.h").read_text(encoding="utf-8")
if set(re.findall(r"#define JOYSTICK_AXIS_RESOLUTION (\d+)", config)) != {"12"}:
    parser.error("Capture harness requires the current O2 12-bit axis configuration")


def extract(name):
    """Extract the actual C function, retaining nested blocks and integer casts."""
    match = re.search(r"^\w[\w *]*\b" + name + r"\([^\n]*\)\s*\{", source, re.M)
    if match is None:
        raise ValueError(f"Firmware function not found: {name}")
    start = match.start()
    end = source.index("{", start) + 1
    depth = 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


functions = "\n".join(extract(name) for name in (
    "speed_curve_compute_tangents", "speed_curve_lookup", "adc_to_mouse_report"
))
program = """#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#define JOYSTICK_MAX_VALUE 2047L
typedef struct { int16_t x, y; } JS_vals;
typedef struct { int16_t x, y; } report_mouse_t;
uint8_t speed_curve[2][16];
uint8_t mouse_sens[2];
int16_t curve_tangents[2][8];
report_mouse_t local_mouse_report[2];
""" + functions + r"""
int main(void) {
    int sensitivity, byte;
    while (scanf("%d", &sensitivity) == 1) {
        mouse_sens[0] = sensitivity;
        for (int i = 0; i < 16; i++) {
            if (scanf("%d", &byte) != 1) return 2;
            speed_curve[0][i] = byte;
        }
        speed_curve_compute_tangents(0);
        for (int percent = -100; percent <= 100; percent++) {
            int raw = (abs(percent) * JOYSTICK_MAX_VALUE + 99) / 100;
            JS_vals data = {percent < 0 ? -raw : raw, 0};
            adc_to_mouse_report(&data, 0);
            printf("%d%c", local_mouse_report[0].x, percent == 100 ? '\n' : ' ');
        }
    }
    return 0;
}
"""
xs = [0, 36, 73, 109, 146, 182, 219, 255]
curves = {
    "linear": xs + xs,
    "exponential": xs + [round((i / 7) ** 2.5 * 255) for i in range(8)],
    "nonmonotone": xs + [0, 255, 255, 0, 0, 255, 255, 0],
    "zero": xs + [0] * 8,
    "raised-origin": xs + [255] * 8,
    "repeated-x": [0, 0, 10, 10, 100, 100, 255, 255, 0, 20, 0, 200, 0, 50, 250, 255],
    "steep-custom": [0, 1, 2, 3, 4, 5, 6, 255, 0, 255, 0, 254, 1, 255, 0, 255],
}
cases = [
    dict(name=name, curve=curve, sensitivity=sensitivity)
    for name, curve in curves.items()
    for sensitivity in [0, 20, 67, 128, 255]
]
inputs = "\n".join(
    " ".join(map(str, [case["sensitivity"], *case["curve"]])) for case in cases
)
with tempfile.TemporaryDirectory(prefix="via-firmware-fixtures-") as directory:
    directory = Path(directory)
    cfile = directory / "reference.c"
    executable = directory / "reference.exe"
    cfile.write_text(program, encoding="utf-8")
    env = dict(os.environ)
    env["PATH"] = str(Path(compiler).parent) + os.pathsep + env.get("PATH", "")
    subprocess.run(
        [compiler, "-std=c99", str(cfile), "-o", str(executable)],
        check=True, env=env, timeout=30,
    )
    reports = subprocess.run(
        [str(executable)], input=inputs, text=True, stdout=subprocess.PIPE,
        check=True, env=env, timeout=10,
    ).stdout.splitlines()
for case, line in zip(cases, reports, strict=True):
    case["reports"] = [int(value) for value in line.split()]
output = dict(
    source="qmk_firmware/keyboards/os_keyboard_beta/os_joystick.c",
    functionsSha256=hashlib.sha256(functions.encode()).hexdigest(),
    percentages="-100 through 100 inclusive",
    cases=cases,
)
path = Path(__file__).resolve().parent / "fixtures/joystick-mouse.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"Captured {len(cases) * 201} firmware reports in {path}")
