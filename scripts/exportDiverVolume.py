"""Export a Blender character study without changing or saving its source scene.

Usage:
  blender -b /path/to/character.blend --python \
    scripts/exportDiverVolume.py -- --output node_modules/.cache/diver-volume/asset

DVOL v1 is little endian. Its 40-byte header is <4sHHII6f: magic, version,
vertex stride, vertex count, index count, minimum XYZ and maximum XYZ.
Each 24-byte vertex is <3f3h3B3x: world position, normalized signed-16 normal,
linear unsigned-8 RGB, and padding. Uint16 triangle indices follow vertices.
The active dependency graph supplies evaluated meshes and corner normals;
render visibility flags determine which collection objects are included.
"""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
import tempfile

import bpy


VERSION = 1
HEADER = struct.Struct("<4sHHII6f")
VERTEX = struct.Struct("<3f3h3B3x")
MAX_VERTICES = 65536
MAX_TRIANGLES = 100000
ROOT = Path(__file__).resolve().parents[1]


def positive_int(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return number


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True,
                        help="output directory inside the ignored node_modules/.cache")
    parser.add_argument("--name", default="diver-study", help="output basename")
    parser.add_argument("--collection", default="DIVER_EXPORT")
    parser.add_argument("--max-vertices", type=positive_int, default=MAX_VERTICES)
    parser.add_argument("--max-triangles", type=positive_int, default=MAX_TRIANGLES)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", args.name):
        parser.error("--name must be a plain ASCII filename without an extension")
    if args.max_vertices > MAX_VERTICES:
        parser.error(f"--max-vertices cannot exceed Uint16 capacity ({MAX_VERTICES})")
    if args.max_triangles > MAX_TRIANGLES:
        parser.error(f"--max-triangles cannot exceed {MAX_TRIANGLES}")
    args.output = Path(args.output).resolve()
    cache = (ROOT / "node_modules" / ".cache").resolve()
    if not args.output.is_relative_to(cache):
        parser.error("--output must be inside this project's ignored node_modules/.cache")
    return args


def finite(values, label):
    values = tuple(float(value) for value in values)
    if not all(math.isfinite(value) for value in values):
        raise ValueError(f"{label}: contains NaN or infinity")
    return values


def render_meshes(collection):
    """Include an object if at least one visible path under the export root reaches it."""
    found = {}

    def visit(current):
        if current.hide_render:
            return
        for obj in current.objects:
            if obj.type == "MESH" and not obj.hide_render:
                found[obj.as_pointer()] = obj
        for child in current.children:
            visit(child)

    visit(collection)
    return sorted(found.values(), key=lambda obj: obj.name_full)


def material_color(obj, index):
    if index >= len(obj.material_slots) or obj.material_slots[index].material is None:
        raise ValueError(f"{obj.name}: triangle uses missing material slot {index}")
    material = obj.material_slots[index].material
    rgba = finite(material.diffuse_color, f"{obj.name}/{material.name}: diffuse_color")
    if any(value < 0 or value > 1 for value in rgba):
        raise ValueError(f"{obj.name}/{material.name}: diffuse_color must be in [0, 1]")
    if abs(rgba[3] - 1) > 1e-6:
        raise ValueError(f"{obj.name}/{material.name}: DVOL v1 only supports opaque materials")
    # Blender's material diffuse_color is scene-linear; never apply display gamma.
    rgb = tuple(round(value * 255) for value in rgba[:3])
    return rgb, {"slot": index, "name": material.name, "linearRGB": list(rgba[:3])}


def encode_vertex(position, normal, color, label):
    p = finite(position, f"{label}: position")
    n = finite(normal, f"{label}: normal")
    length = math.sqrt(sum(value * value for value in n))
    if length < 1e-12:
        raise ValueError(f"{label}: zero-length transformed normal")
    n = tuple(value / length for value in n)
    packed_normal = tuple(round(value * 32767) for value in n)
    decoded_length = math.sqrt(sum((value / 32767) ** 2 for value in packed_normal))
    if abs(decoded_length - 1) > 1e-4:
        raise ValueError(f"{label}: invalid quantized normal")
    try:
        encoded = VERTEX.pack(*(0.0 if value == 0 else value for value in p),
                              *packed_normal, *color)
    except (OverflowError, struct.error) as error:
        raise ValueError(f"{label}: vertex does not fit the DVOL format") from error
    decoded_position = finite(struct.unpack_from("<3f", encoded), f"{label}: float32 position")
    return encoded, decoded_position


def triangle_area_squared(points):
    a, b, c = points
    ab = tuple(b[i] - a[i] for i in range(3))
    ac = tuple(c[i] - a[i] for i in range(3))
    cross = (ab[1] * ac[2] - ab[2] * ac[1],
             ab[2] * ac[0] - ab[0] * ac[2],
             ab[0] * ac[1] - ab[1] * ac[0])
    return sum(value * value for value in cross)


def collect(args):
    collection = bpy.data.collections.get(args.collection)
    if collection is None:
        raise ValueError(f"missing export collection: {args.collection}")
    objects = render_meshes(collection)
    if not objects:
        raise ValueError(f"{args.collection}: no render-visible MESH objects")
    depsgraph = bpy.context.evaluated_depsgraph_get()
    vertex_ids, vertex_bytes, positions, indices, sources = {}, [], [], [], []

    for source in objects:
        obj = source.evaluated_get(depsgraph)
        matrix = obj.matrix_world.copy()
        finite((value for row in matrix for value in row), f"{source.name}: world matrix")
        determinant = matrix.to_3x3().determinant()
        if not math.isfinite(determinant) or abs(determinant) < 1e-12:
            raise ValueError(f"{source.name}: singular world transform")
        normal_matrix = matrix.to_3x3().inverted().transposed()
        mesh = obj.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        if mesh is None:
            raise ValueError(f"{source.name}: evaluated mesh is unavailable")
        index_start, vertex_start = len(indices), len(vertex_bytes)
        materials = {}
        try:
            mesh.calc_loop_triangles()
            if len(indices) // 3 + len(mesh.loop_triangles) > args.max_triangles:
                raise ValueError(f"triangle budget exceeded ({args.max_triangles})")
            corner_normals = mesh.corner_normals
            if len(corner_normals) != len(mesh.loops):
                raise ValueError(f"{source.name}: missing evaluated corner normals")
            for triangle in mesh.loop_triangles:
                material_index = triangle.material_index
                if material_index not in materials:
                    materials[material_index] = material_color(obj, material_index)
                color = materials[material_index][0]
                # Reflection reverses geometric winding. Restore it while using the
                # inverse-transpose normal transform, including non-uniform scales.
                loops = list(triangle.loops)
                if determinant < 0:
                    loops[1], loops[2] = loops[2], loops[1]
                face_indices, face_positions = [], []
                for loop_index in loops:
                    vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
                    encoded, point = encode_vertex(
                        matrix @ vertex.co, normal_matrix @ corner_normals[loop_index].vector,
                        color, f"{source.name}/triangle {triangle.index}")
                    identifier = vertex_ids.get(encoded)
                    if identifier is None:
                        identifier = len(vertex_bytes)
                        if identifier >= args.max_vertices:
                            raise ValueError(f"vertex budget exceeded ({args.max_vertices})")
                        vertex_ids[encoded] = identifier
                        vertex_bytes.append(encoded)
                        positions.append(point)
                    face_indices.append(identifier)
                    face_positions.append(point)
                area = triangle_area_squared(face_positions)
                if len(set(face_indices)) != 3 or not math.isfinite(area) or area <= 1e-20:
                    raise ValueError(f"{source.name}/triangle {triangle.index}: degenerate triangle")
                indices.extend(face_indices)
        finally:
            obj.to_mesh_clear()
        sources.append({"object": source.name, "indexStart": index_start,
                        "indexCount": len(indices) - index_start,
                        "verticesAdded": len(vertex_bytes) - vertex_start,
                        "mirrored": determinant < 0,
                        "materials": [materials[key][1] for key in sorted(materials)]})

    vertex_count, index_count = len(vertex_bytes), len(indices)
    if not vertex_count or not index_count or index_count % 3:
        raise ValueError("export must contain at least one valid triangle")
    if vertex_count > MAX_VERTICES or max(indices) >= vertex_count:
        raise ValueError("indices exceed the vertex buffer or Uint16 capacity")
    bounds_min = [min(point[i] for point in positions) for i in range(3)]
    bounds_max = [max(point[i] for point in positions) for i in range(3)]
    header = HEADER.pack(b"DVOL", VERSION, VERTEX.size, vertex_count, index_count,
                         *bounds_min, *bounds_max)
    index_bytes = struct.pack(f"<{index_count}H", *indices)
    binary = header + b"".join(vertex_bytes) + index_bytes
    index_offset = HEADER.size + vertex_count * VERTEX.size
    if len(binary) != index_offset + index_count * 2:
        raise ValueError("internal DVOL byte count mismatch")
    manifest = {
        "format": "DVOL", "version": VERSION, "endianness": "little",
        "binary": args.name + ".bin", "byteLength": len(binary),
        "sha256": hashlib.sha256(binary).hexdigest(),
        "vertexCount": vertex_count, "indexCount": index_count,
        "triangleCount": index_count // 3,
        "bounds": {"min": bounds_min, "max": bounds_max},
        "vertexBuffer": {"byteOffset": HEADER.size, "byteStride": VERTEX.size,
                         "attributes": {
                             "position": {"byteOffset": 0, "components": 3, "type": "float32"},
                             "normal": {"byteOffset": 12, "components": 3, "type": "int16",
                                        "normalized": True, "divisor": 32767},
                             "color": {"byteOffset": 18, "components": 3, "type": "uint8",
                                       "normalized": True, "colorSpace": "linear",
                                       "source": "material.diffuse_color"}}},
        "indexBuffer": {"byteOffset": index_offset, "type": "uint16", "topology": "triangles"},
        "coordinateSpace": "Blender world; no axis conversion",
        "source": {"blend": Path(bpy.data.filepath).name if bpy.data.filepath else None,
                   "collection": args.collection, "blenderVersion": bpy.app.version_string,
                   "depsgraphMode": depsgraph.mode, "objects": sources},
        "limits": {"vertices": args.max_vertices, "triangles": args.max_triangles},
    }
    return binary, manifest


def atomic_write(path, data):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".dvol-", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main():
    args = arguments()
    binary, manifest = collect(args)
    args.output.mkdir(parents=True, exist_ok=True)
    atomic_write(args.output / (args.name + ".bin"), binary)
    atomic_write(args.output / (args.name + ".json"),
                 (json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
    print(json.dumps({"status": "exported", "output": str(args.output),
                      "name": args.name, "vertices": manifest["vertexCount"],
                      "triangles": manifest["triangleCount"], "bytes": len(binary)}))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError) as error:
        print(f"DVOL export failed: {error}", file=sys.stderr)
        raise SystemExit(1)
