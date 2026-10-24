from pathlib import Path
from PIL import Image
import json

ROOT=Path(__file__).resolve().parent / "assets"
geometry=Image.open(ROOT/'room-albedo.png').convert('RGBA')
geometry.save(ROOT/'room-geometry-albedo.png')
paint=Image.open(ROOT/'painted-atlas.png').convert('RGB').resize(geometry.size,Image.Resampling.LANCZOS)
# Preserve the exact existing collision silhouette and its fractional AA coverage.
color=Image.blend(geometry.convert('RGB'),paint,.80).convert('RGBA')
color.putalpha(geometry.getchannel('A'))
color.save(ROOT/'room-albedo.png')
assert list(color.getchannel('A').getdata())==list(geometry.getchannel('A').getdata())
(ROOT/'asset-pipeline.json').write_text(json.dumps(dict(normalSource='projected 3D surface geometry baked offline; not diffuse brightness',diffuseSource='offline image-generated stylized diffuse art blended into the same canonical coverage mask',diffuseMayContain='painted crevices and fixed local AO, not physically complete relightable albedo',limits='Fine painted structure need not exactly match coarse geometric normals; large-scale mesh relief and collider remain authoritative',coverageUnchanged=True,size=geometry.size),indent=2))
print('Attached offline painted diffuse to the exact geometry coverage:',geometry.size)
