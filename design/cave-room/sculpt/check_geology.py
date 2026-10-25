import json
import numpy as np
from geology import fissure,displaced_normal,sculpt_relief

for scale in [1,1.2,2]:
    y,x=np.mgrid[0:80*scale,0:120*scale].astype(float)
    y/=scale
    x/=scale
    px,py=.35,-.48
    old_h=.24*x-.31*y
    old_n=np.stack([np.full(x.shape,-.24),np.full(x.shape,.31),np.full(x.shape,1-px*.24+py*.31)],axis=2)
    old_n/=np.linalg.norm(old_n,axis=2)[:,:,None]
    extra=1.8*np.sin(x*.067)+.6*np.cos(y*.11)
    new_n=displaced_normal(old_n,extra,scale,px,py)
    dy,dx=np.gradient(old_h+extra,1/scale)
    expected=np.stack([-dx,-dy,1-px*dx-py*dy],axis=2)
    expected/=np.linalg.norm(expected,axis=2)[:,:,None]
    assert np.max(abs(new_n-expected))<1e-12
    unchanged=displaced_normal(old_n,np.full(x.shape,5.),scale,px,py)
    assert np.max(abs(old_n-unchanged))<1e-12
x=np.array([[10,40,65,95,120]],float)
y=np.full_like(x,30)
cut=fissure(x,y,[[30,30],[90,30]],4,14)
assert cut[0,2]<-10
assert abs(cut[0,0])<1e-6 and abs(cut[0,-1])<1e-6,'Finite fissures must terminate'
y,x=np.mgrid[0:240,0:240].astype(float)
a,p,c=sculpt_relief(x,y,1)
b,q,d=sculpt_relief(x,y,1)
assert np.array_equal(a,b) and np.array_equal(p,q) and np.array_equal(c,d),'Bake must be reproducible'
assert np.max(abs(p))<.15,'Pigment must not bake a strong fixed key light'
print(json.dumps({'normalDerivative':'Matches actual projected depth derivative at three resolutions','finiteFissure':True,'reproducible':True,'scope':'Geometry math, not art or phone performance acceptance'},indent=2))
