import json
import struct
from pathlib import Path

path = Path('assets/models/visitors/teen-photographer.glb')
data = path.read_bytes()
json_len = struct.unpack('<I', data[12:16])[0]
json_end = 20 + json_len
binary_start = json_end + (4 - json_len % 4) % 4
body_start = binary_start + 8
gltf = json.loads(data[20:json_end].decode('utf-8'))


def read(acc_index):
    acc = gltf['accessors'][acc_index]
    bv = gltf['bufferViews'][acc['bufferView']]
    tc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    cs = 4
    stride = bv.get('byteStride', cs * tc)
    off = body_start + bv['byteOffset'] + acc.get('byteOffset', 0)
    return [struct.unpack_from('<fff', data, off + i * stride) for i in range(acc['count'])]


hips = next(i for i, n in enumerate(gltf['nodes']) if n['name'] == 'p0_hips')
sit = next(a for a in gltf['animations'] if a['name'] == 'sit')
ch = next(c for c in sit['channels'] if c['target']['node'] == hips and c['target']['path'] == 'translation')
pos = read(sit['samplers'][ch['sampler']]['output'])
print('sit hip y range', min(p[1] for p in pos), max(p[1] for p in pos))
