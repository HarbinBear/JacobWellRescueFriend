"""Bounded local horizon AO from visible geometry; not a baked flashlight.
Open water does not become an occluder. Sloped faces are measured against their
actual normal in unprojected space so a flat sloping slab does not self-darken.
This remains a visible-depth approximation, not hidden-surface ray tracing.
"""
import math
import numpy as np
from scipy.ndimage import map_coordinates, gaussian_filter


def contact_ao(height,normal,mask,scale,px,py):
    h,w=height.shape
    yy,xx=np.mgrid[0:h,0:w].astype(float)
    occupancy=mask.astype(float)
    occupied_height=height*occupancy
    horizon=np.zeros((h,w),dtype=float)
    for i in range(12):
        angle=(i+.5)*math.tau/12
        dx,dy=math.cos(angle),math.sin(angle)
        blocked=np.zeros((h,w),dtype=float)
        for distance in [4,9,18,34,58]:
            coordinates=[yy+dy*distance*scale,xx+dx*distance*scale]
            # Normalize the same linear coverage as depth: never blend the water's
            # unused depth into an adjacent valid rock sample.
            solid=map_coordinates(occupancy,coordinates,order=1,mode='constant',cval=0)
            sampled=map_coordinates(occupied_height,coordinates,order=1,mode='constant',cval=0)/np.maximum(1e-8,solid)
            dz=sampled-height
            # This is a ray in actual XYZ, not in the projected UV plane.
            vx=dx*distance-px*dz
            vy=dy*distance-py*dz
            dot=(normal[:,:,0]*vx+normal[:,:,1]*vy+normal[:,:,2]*dz)/np.maximum(1e-6,np.sqrt(vx*vx+vy*vy+dz*dz))
            above=np.clip((dot-.10)/.80,0,1)
            # Very distant cliffs must not produce black outlines around everything.
            contribution=above*solid*(.9-.35*distance/58)
            blocked=np.maximum(blocked,contribution)
        horizon+=blocked/12
    result=1-np.clip(horizon*1.65,0,.64)
    result[~mask]=1
    return gaussian_filter(result,.45*scale)
