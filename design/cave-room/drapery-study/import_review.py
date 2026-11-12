"""Inspect exact runtime cave meshes in a separate Blender background process.

Example (all output belongs in the ignored cache):
  Blender -b --factory-startup --python design/cave-room/drapery-study/import_review.py -- \
    --input node_modules/.cache/drapery-study/mesh.json \
    --output-prefix node_modules/.cache/drapery-study/inspection --render

JSON v1: {version, label, seed, origin:[x,y,z], study:{x,y,radius,minY},
          meshes:[{name,positions:[x,y,z,...],normals:[nx,ny,nz,...],indices:[i,j,k,...]}]}
Positions are absolute game coordinates. Optional --target uses the same coordinates;
--span is the vertical orthographic frame height in game units. The importer only
changes coordinates, aligns face winding with the supplied runtime normals, and
assigns a neutral inspection material. It never subdivides,
smooths positions, or writes a game asset. Blender lights are inspection lights,
not a reproduction of the game flashlight or its illumination.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output-prefix', type=Path, required=True)
    parser.add_argument('--target', type=float, nargs=3)
    parser.add_argument('--span', type=float, default=700.0)
    parser.add_argument('--width', type=int, default=1200)
    parser.add_argument('--height', type=int, default=900)
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if args.span <= 0 or args.width < 64 or args.height < 64:
        parser.error('span must be positive; image dimensions must be at least 64')
    return args


def finite_triples(values, label):
    if not isinstance(values, list) or len(values) % 3 or not all(
        isinstance(v, (float, int)) and math.isfinite(v) for v in values
    ):
        raise ValueError(label + ' must contain finite numeric xyz triples')
    return list(zip(values[::3], values[1::3], values[2::3]))


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def main():
    args = arguments()
    raw = args.input.read_bytes()
    data = json.loads(raw)
    if data.get('version') != 1 or not data.get('meshes'):
        raise ValueError('Expected mesh JSON version 1 with nonempty meshes')
    origin = data.get('origin', [data['study']['x'], data['study']['y'], 0])
    finite_triples(origin, 'origin')
    if len(origin) != 3:
        raise ValueError('origin must have three components')
    # Right-handed basis change: game x/right, y/down, z/depth -> Blender x/right,
    # y/depth, z/up. Scale units only, preserving geometric shape.
    def position(p):
        return ((p[0] - origin[0]) / 100, (p[2] - origin[2]) / 100, -(p[1] - origin[1]) / 100)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'Medium High Contrast' if 'Medium High Contrast' in [
        item.identifier for item in scene.view_settings.bl_rna.properties['look'].enum_items
    ] else 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.world = bpy.data.worlds.new('Inspection background')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.045, .055, .065, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .3
    material = bpy.data.materials.new('Neutral clay - inspection only')
    material.diffuse_color = (.29, .31, .32, 1)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.29, .31, .32, 1)
    bsdf.inputs['Roughness'].default_value = .86

    collection = bpy.data.collections.new('Exact runtime surface - no subdivision')
    scene.collection.children.link(collection)
    counts = []
    for number, chunk in enumerate(data['meshes']):
        name = chunk.get('name', f'chunk_{number}')
        vertices = finite_triples(chunk['positions'], name + '.positions')
        normals = finite_triples(chunk['normals'], name + '.normals')
        indices = chunk['indices']
        if len(normals) != len(vertices) or len(indices) % 3 or not all(
            isinstance(i, int) and not isinstance(i, bool) and 0 <= i < len(vertices) for i in indices
        ):
            raise ValueError(name + ': mismatched normals or invalid triangle indices')
        if not vertices:
            continue
        # The runtime uses supplied normals and two-sided rendering. Blender's
        # custom-normal encoding follows each polygon's hemisphere, so align
        # winding first. No vertices or triangle connectivity are changed.
        triangles, winding_flips = [], 0
        for a, b, c in zip(indices[::3], indices[1::3], indices[2::3]):
            cross = (Vector(vertices[b]) - Vector(vertices[a])).cross(Vector(vertices[c]) - Vector(vertices[a]))
            normal = Vector(normals[a]) + Vector(normals[b]) + Vector(normals[c])
            if cross.dot(normal) < 0:
                b, c = c, b
                winding_flips += 1
            triangles.append((a, b, c))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([position(p) for p in vertices], [], triangles)
        mesh.update()
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        mesh.normals_split_custom_set_from_vertices([(n[0], n[2], -n[1]) for n in normals])
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj.data.materials.append(material)
        obj['runtime_mesh'] = True
        counts.append({'name': name, 'vertices': len(vertices), 'triangles': len(indices) // 3,
                       'winding_flips_to_match_runtime_normals': winding_flips})

    target_game = args.target or [data['study']['x'], data['study']['y'] - 100, 200]
    target = Vector(position(target_game))
    frame = args.span / 100
    distance = max(15, frame * 2.5)
    cameras = []
    for name, direction in [('front', (0, -1, 0)), ('oblique', (.58, -1, .18))]:
        camera_data = bpy.data.cameras.new(name)
        camera_data.type = 'ORTHO'
        # Blender ortho_scale spans the horizontal dimension for landscape output.
        camera_data.ortho_scale = frame * max(1, args.width / args.height)
        camera_data.clip_start = .01
        camera_data.clip_end = max(500, distance * 10)
        camera = bpy.data.objects.new(name, camera_data)
        scene.collection.objects.link(camera)
        camera.location = target + Vector(direction).normalized() * distance
        point_at(camera, target)
        cameras.append(camera)

    for name, offset, power, size in [
        ('Broad key', (-4, -6, 7), 1400, 5),
        ('Low fill', (5, -4, 1), 350, 4),
        ('Depth rim', (1, 5, 5), 800, 4),
    ]:
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = power
        light_data.shape = 'DISK'
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        scene.collection.objects.link(light)
        light.location = target + Vector(offset)
        point_at(light, target)

    scene.camera = cameras[0]
    scene['source_json'] = str(args.input.resolve())
    scene['source_sha256'] = hashlib.sha256(raw).hexdigest()
    scene['source_label'] = data.get('label', '')
    scene['seed'] = str(data.get('seed', ''))
    scene['game_origin'] = origin
    scene['inspection_only'] = 'Exact runtime geometry; neutral studio lighting; not an authored source model or game screenshot'
    note = bpy.data.texts.new('READ ME - inspection scope')
    note.write(json.dumps({
        'scope': scene['inspection_only'], 'source': scene['source_json'],
        'sha256': scene['source_sha256'], 'origin': origin,
        'coordinate_transform': 'Blender = (game.x-origin.x, game.z-origin.z, -(game.y-origin.y)) / 100',
        'target_game': target_game, 'vertical_span_game': args.span, 'chunks': counts,
    }, indent=2, ensure_ascii=False))
    prefix = args.output_prefix.resolve()
    prefix.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
    bpy.ops.wm.save_as_mainfile(filepath=str(prefix) + '.blend')
    outputs = []
    if args.render:
        for camera in cameras:
            scene.camera = camera
            scene.render.filepath = str(prefix) + '-' + camera.name + '.png'
            bpy.ops.render.render(write_still=True)
            outputs.append(scene.render.filepath)
    report = {'blend': str(prefix) + '.blend', 'images': outputs, 'chunks': counts,
              'source_sha256': scene['source_sha256'], 'target_game': target_game,
              'vertical_span_game': args.span, 'scope': scene['inspection_only']}
    Path(str(prefix) + '-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
