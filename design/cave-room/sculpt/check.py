from pathlib import Path
import json
import math
import numpy as np
from PIL import Image

OUT=Path(__file__).resolve().parent/'assets'
scene=json.loads((OUT/'scene.json').read_text())
report=json.loads((OUT/'report.json').read_text())
albedo=np.asarray(Image.open(OUT/'room-albedo.png').convert('RGBA'))
normal=np.asarray(Image.open(OUT/'room-normal.png').convert('RGBA'))
detail=np.asarray(Image.open(OUT/'room-detail.png').convert('RGBA'))
assert albedo.shape==normal.shape==detail.shape==(1344,864,4)
assert sum(len(p) for p in scene['shapes'])<=240,'Do not multiply outline cost to manufacture irregularity'
assert len(scene['shapes'])==3
assert (albedo[:,:,3]>0).any() and ((albedo[:,:,3]>0)&(albedo[:,:,3]<255)).any(),'Keep fractional AA coverage'

def inside(poly,x,y):
    hit=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            hit=not hit
    return hit

def edge_distance(poly,x,y):
    best=math.inf
    for a,b in zip(poly,poly[1:]+poly[:1]):
        dx,dy=b[0]-a[0],b[1]-a[1]
        t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy or 1)))
        best=min(best,math.hypot(x-a[0]-dx*t,y-a[1]-dy*t))
    return best

samples=0
for y in range(5,1115,17):
    for x in range(5,715,13):
        if min(edge_distance(p,x,y) for p in scene['shapes'])<2:
            continue
        drawn=albedo[min(1343,int(y*1.2)),min(863,int(x*1.2)),3]>127
        assert drawn==any(inside(p,x,y) for p in scene['shapes']),(x,y)
        samples+=1
# Inverse projection must use the geometry's own depth scale and lamp height.
for h in [8,29,70,110,140,185]:
    for sx,sy,lx,ly in [(402,566,358,772),(290,537,350,684)]:
        lamp=scene['lampHeight']
        px,py=scene['projection']
        actual=(sx-px*h-(lx-px*lamp),sy-py*h-(ly-py*lamp))
        shader=(sx-lx+px*(lamp-h),sy-ly+py*(lamp-h))
        assert max(abs(a-b) for a,b in zip(actual,shader))<1e-9
assert scene['heightScale']>report['heightPercentiles'][-1]
mask=albedo[:,:,3]>250
n=normal[:,:,:3].astype(float)/255*2-1
export=report.get('export')
assert np.percentile(abs(np.linalg.norm(n[mask],axis=1)-1),99)<(.029 if export else .013)
if export:
    assert export['normalAngularMax']<1.8 and export['normalAngularP99']<1.6
    assert export['alphaBits']==export['depthBits']==8
    assert (detail[:,:,1]==0).all(),'Unused channel must not cost entropy or affect lighting'
assert report['meshFaces']>50
assert len(list(OUT.glob('room-*.png')))==4,'No extra runtime image or GPU texture'
print(json.dumps(dict(coverageSamples=samples,outlineVertices=report['outlineVertices'],fractionalCoverage=True,sharedDepthAndNormal=True,faces=report['meshFaces'],scope='Geometry/resource invariants; aesthetic and real-phone acceptance still separate'),indent=2))
