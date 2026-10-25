"""Broad fracture planes with localized worn seams, not radial button mounds.
The controlling heights are authored independently. A linear plane complex is
rounded only over a small physical radius; it is then sampled as real geometry.
"""
import math
import numpy as np
from scipy.interpolate import LinearNDInterpolator,NearestNDInterpolator
from scipy.ndimage import gaussian_filter,map_coordinates


def fractured_perimeter(points):
    points=np.asarray(points,dtype=float)
    result=[]
    n=len(points)
    for i,q in enumerate(points):
        a=points[(i-1)%n];b=points[(i+1)%n]
        la,lb=np.linalg.norm(q-a),np.linalg.norm(b-q)
        # Some hard shears remain; erosion varies between corners, never a
        # universal low-poly-to-wavy filter.
        hard=math.sin(q[0]*.029+q[1]*.017)>.36
        r=0 if hard else min(7.,la*.14,lb*.17)
        before=q+(a-q)*(r/max(1e-8,la))
        after=q+(b-q)*(r/max(1e-8,lb))
        if r:
            for t in [0,.25,.5,.75,1]:
                p=(1-t)**2*before+2*(1-t)*t*q+t*t*after
                result.append(p.tolist())
        else:result.append(q.tolist())
        end=b+(q-b)*(0 if math.sin(b[0]*.029+b[1]*.017)>.36 else min(7.,lb*.14,np.linalg.norm(points[(i+2)%n]-b)*.17)/max(1e-8,lb))
        tangent=end-after
        normal=np.array([-tangent[1],tangent[0]])/max(1e-8,np.linalg.norm(tangent))
        broken=math.sin((q[0]+b[0])*.016+(q[1]+b[1])*.023)>.25
        for j in range(1,max(2,math.ceil(np.linalg.norm(tangent)/9))):
            count=max(2,math.ceil(np.linalg.norm(tangent)/9))
            t=j/count
            chip=(-2.6*math.exp(-((t-.43)/.13)**2) if broken else .55*math.sin(math.pi*t))
            p=after+tangent*t+normal*chip
            result.append(p.tolist())
    return result


class FractureField:
    def __init__(self,controls,scale):
        controls=np.asarray(controls,dtype=float)
        self.origin=np.floor(controls[:,:2].min(axis=0)-18)
        size=np.ceil(controls[:,:2].max(axis=0)-self.origin+19)
        self.scale=scale
        h,w=int(size[1]*scale)+1,int(size[0]*scale)+1
        y,x=np.mgrid[0:h,0:w].astype(float)
        x=x/scale+self.origin[0];y=y/scale+self.origin[1]
        linear=LinearNDInterpolator(controls[:,:2],controls[:,2])
        nearest=NearestNDInterpolator(controls[:,:2],controls[:,2])
        value=linear(x,y)
        # Outside the control hull, use the closest height only at small eroded
        # perimeter extensions, not an extrapolated cubic dome.
        outside=~np.isfinite(value);value[outside]=nearest(x[outside],y[outside])
        value=gaussian_filter(value,2.2*scale)
        self.value=value

    def __call__(self,points):
        points=np.asarray(points)
        return map_coordinates(self.value,[(points[:,1]-self.origin[1])*self.scale,
                                            (points[:,0]-self.origin[0])*self.scale],order=1,mode='nearest')
