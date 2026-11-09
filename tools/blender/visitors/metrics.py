"""Compare generated piece counts with the task's starting commit."""

import json
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def document(data):
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


def main():
    total = 0
    for path in sorted((ROOT / "assets/models/visitors").glob("*.glb")):
        relative = path.relative_to(ROOT).as_posix()
        old = document(subprocess.check_output(["git", "show", f"499c7e1:{relative}"], cwd=ROOT))
        new = document(path.read_bytes())
        old_count = sum("mesh" in node for node in old["nodes"])
        new_count = sum("mesh" in node for node in new["nodes"])
        total += new_count
        print(f"{path.stem}: {old_count} -> {new_count} pieces")
    print(f"draw calls low: 160 -> {total}; medium: 182 -> {total + 22}; high: 320 -> {total * 2}")
    if total > 90:
        raise ValueError("low quality exceeds 90 draw calls")


if __name__ == "__main__":
    main()
