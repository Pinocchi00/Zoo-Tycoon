"""Quick check that the exported walk clip keeps the hips rest height."""
import json
import struct
import sys
from pathlib import Path

path = Path(sys.argv[-1])
data = path.read_bytes()
magic, version, length = struct.unpack("<4sII", data[:12])
json_len, json_type = struct.unpack("<II", data[12:20])
json_end = 20 + json_len
# Round up to 4-byte boundary for the binary chunk.
binary_start = json_end + (4 - json_len % 4) % 4
bin_chunk_header = data[binary_start : binary_start + 8]
bin_len, bin_type = struct.unpack("<II", bin_chunk_header)
body_start = binary_start + 8

gltf = json.loads(data[20:json_end].decode("utf-8"))


def read_accessor(acc_index):
    acc = gltf["accessors"][acc_index]
    bv = gltf["bufferViews"][acc["bufferView"]]
    comp_type = acc["componentType"]
    count = acc["count"]
    type_name = acc["type"]
    component_size = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[comp_type]
    type_components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[type_name]
    stride = bv.get("byteStride", component_size * type_components)
    offset = body_start + bv["byteOffset"] + acc.get("byteOffset", 0)
    fmt = {5126: "f", 5125: "I", 5123: "H", 5121: "B"}[comp_type] * type_components
    values = []
    for i in range(count):
        values.append(struct.unpack_from("<" + fmt, data, offset + i * stride))
    return values


nodes = gltf["nodes"]
hips_index = next(i for i, n in enumerate(nodes) if n["name"] == "p0_hips")
walk = next(a for a in gltf["animations"] if a["name"] == "walk")
for ch in walk["channels"]:
    if ch["target"]["node"] == hips_index and ch["target"]["path"] == "translation":
        sampler = walk["samplers"][ch["sampler"]]
        times = read_accessor(sampler["input"])
        positions = read_accessor(sampler["output"])
        print("hips rest node translation:", nodes[hips_index].get("translation", [0, 0, 0]))
        print("walk sampled hip translations:", list(zip(times, positions))[:5])
        ys = [p[1] for _, p in zip(times, positions)]
        print("walk hip y range:", min(ys), max(ys))
