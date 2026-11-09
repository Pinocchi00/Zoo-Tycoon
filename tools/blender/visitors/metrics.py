"""Compare generated piece counts with the task's starting commit."""

import argparse
import json
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def document(data):
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", default="64d9688")
    parser.add_argument("--max-low-draw-calls", type=int, default=90)
    args = parser.parse_args()
    total = 0
    previous = 0
    casters = 0
    for path in sorted((ROOT / "assets/models/visitors").glob("*.glb")):
        relative = path.relative_to(ROOT).as_posix()
        old = document(subprocess.check_output(["git", "show", f"{args.reference}:{relative}"], cwd=ROOT))
        new = document(path.read_bytes())
        old_count = sum("mesh" in node for node in old["nodes"])
        new_count = sum("mesh" in node for node in new["nodes"])
        total += new_count
        previous += old_count
        casters += sum("mesh" in node and node["name"].endswith(("_head_mesh", "_body_mesh")) for node in new["nodes"])
        print(f"{path.stem}: {old_count} -> {new_count} pieces")
    print(f"draw calls low: {previous} -> {total}; medium (estimate): {total + casters}; high (estimate): {total * 2}")
    if total > args.max_low_draw_calls:
        raise ValueError(f"low quality exceeds {args.max_low_draw_calls} draw calls")


if __name__ == "__main__":
    main()
