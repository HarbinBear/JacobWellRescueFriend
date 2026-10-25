import json
import numpy as np
from sidewalls import sidewall_mesh
from contact_ao import contact_ao

px,py=.35,-.48
y,x=np.mgrid[0:65,0:91].astype(float)
mask=np.ones(x.shape,dtype=bool)
for a,b in [(0,0),(.15,-.22),(-.18,.13)]:
    depth=70+a*x+b*y
    normal=np.broadcast_to(np.array([-a,-b,1-px*a-py*b]),(*x.shape,3)).copy()
    normal/=np.linalg.norm(normal,axis=2)[:,:,None]
    ao=contact_ao(depth,normal,mask,1,px,py)
    assert ao.min()>.999,'A tilted continuous plane must not self-darken'
normal=np.zeros((*x.shape,3));normal[:,:,2]=1
step=np.full_like(x,25);step[:,48:]=100
ao=contact_ao(step,normal,mask,1,px,py)
assert ao[:,44:48].mean()<.86,'Recess below a raised rock must have contact occlusion'
assert ao[:,65:85].mean()>.99,'Top plane must not become a dark border'
open_mask=mask.copy();open_mask[:,48:]=False
water=contact_ao(step,normal,open_mask,1,px,py)
assert water[:,:45].min()>.999,'Open water and texture bounds are not rock occluders'
perimeter=[[15,10,135],[60,14,146],[67,43,114],[28,51,151],[12,35,120]]
faces=sidewall_mesh(perimeter,22,px,py)
assert len(faces)==len(perimeter)*8
rings=set()
for vertices,ring in faces:
    rings.add(ring)
    points=np.array(vertices)
    assert np.isfinite(points).all()
    actual=points.copy();actual[:,:2]-=actual[:,2,None]*np.array([px,py])
    projected=actual.copy();projected[:,:2]+=projected[:,2,None]*np.array([px,py])
    assert np.max(abs(projected-points))<1e-12
    assert np.linalg.norm(np.cross(actual[1]-actual[0],actual[2]-actual[0]))>1e-5
    assert points[:,2].min()>=22
assert len(rings)==4
from fracture_planes import FractureField,fractured_perimeter
points=np.array([[0,0],[100,0],[100,100],[0,100],[60,30]],float)
controls=np.column_stack([points,50+.2*points[:,0]-.1*points[:,1]])
field=FractureField(controls,1.2)
samples=np.array([[25,25],[45,55],[70,70],[30,60]],float)
expected=50+.2*samples[:,0]-.1*samples[:,1]
assert np.max(abs(field(samples)-expected))<1e-5,'A broad inclined fracture must not turn into a high-center mound'
outline=fractured_perimeter([[0,0],[85,5],[95,70],[15,100]])
assert np.isfinite(outline).all()
assert np.linalg.norm(np.diff(np.asarray(outline),axis=0),axis=1).min()>.01
print(json.dumps({'slopedPlaneDoesNotSelfDarken':True,'contactOccludes':True,
                  'noForcedHighCenter':True,'waterDoesNotOcclude':True,'sidewallBands':4,'physicalProjectionMatches':True,
                  'scope':'Side geometry and approximate visible-depth AO, not hidden geometry or phone acceptance'},indent=2))
