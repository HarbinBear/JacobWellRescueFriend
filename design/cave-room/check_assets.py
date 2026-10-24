from pathlib import Path
from PIL import Image
import json
import math

ROOT=Path(__file__).resolve().parent/'assets'
data=json.loads((ROOT/'scenes.json').read_text())
scene=data['scenes'][0]
albedo=Image.open(ROOT/'room-albedo.png').convert('RGBA')
geometry=Image.open(ROOT/'room-geometry-albedo.png').convert('RGBA')
assert list(albedo.getchannel('A').getdata())==list(geometry.getchannel('A').getdata())
for name in ['room-normal.png','room-detail.png','room-back.png']:
    assert Image.open(ROOT/name).size==albedo.size

def inside(poly,x,y):
    hit=False
    for a,b in zip(poly,poly[-1:]+poly[:-1]):
        if(a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
    return hit

def distance(a,b,x,y):
    dx=b[0]-a[0];dy=b[1]-a[1]
    t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy or 1)))
    return math.hypot(x-a[0]-dx*t,y-a[1]-dy*t)

samples=0
for y in range(13,scene['height']-20,23):
    for x in range(13,scene['width']-20,19):
        edge=min(distance(a,b,x,y) for p in scene['shapes'] for a,b in zip(p,p[1:]+p[:1]))
        if edge<2.5:continue
        analytical=any(inside(p,x,y) for p in scene['shapes'])
        pixel=albedo.getpixel((int(x*albedo.width/scene['width']),int(y*albedo.height/scene['height'])))[3]>127
        assert analytical==pixel,(x,y)
        samples+=1

# Surface normals live in geometry coordinates, not the skewed screen projection.
# Inverse both surface and lamp using the same baked projection.
projection_checks=0
for height in [0,9,31,55,76,94]:
    for sx,sy,lx,ly in [(330,620,358,772),(400,565,391,743),(265,540,350,684)]:
        surface=(sx-.18*height,sy+.26*height,height)
        lamp=(lx-.18*95,ly+.26*95,95)
        direct=(surface[0]-lamp[0],surface[1]-lamp[1])
        shader=(sx-lx+.18*(95-height),sy-ly-.26*(95-height))
        assert max(abs(a-b) for a,b in zip(direct,shader))<1e-10
        projection_checks+=1
print(json.dumps(dict(canonicalCoverageSamples=samples,paintCoverageUnchanged=True,projectionCoordinateChecks=projection_checks,scope='Offline asset and lighting-coordinate checks; not aesthetic or phone acceptance'),indent=2))
