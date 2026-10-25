"""Worn fracture sidewalls. Closed geometry, not a dark outline painted on top.
Input and output vertices are in the same projected (x, y, physical depth) space
as the top faces. Ring offsets are physical XY erosion before projection.
"""
import math
import numpy as np


def sidewall_mesh(perimeter, floor, px, py):
    points=np.asarray(perimeter,dtype=float)
    n=len(points)
    signed=np.sum(points[:,0]*np.roll(points[:,1],-1)-np.roll(points[:,0],-1)*points[:,1])
    tangent=np.roll(points,-1,axis=0)[:,:2]-np.roll(points,1,axis=0)[:,:2]
    outward=np.stack([tangent[:,1],-tangent[:,0]],axis=1)
    if signed<0:outward=-outward
    outward/=np.maximum(1e-8,np.linalg.norm(outward,axis=1))[:,None]
    phases=points[:,0]*.063+points[:,1]*.047
    wear=.5+.5*np.sin(phases)*np.cos(points[:,1]*.081-points[:,0]*.025)
    # Small top rollover, main irregular broken face, then narrower recessed footing.
    profiles=[(0.,0.),(.10,-1.2),(.24,-2.4),(.77,-4.8),(1.,-7.)]
    rings=[]
    for t,recession in profiles:
        z=points[:,2]-(points[:,2]-floor)*t
        if 0<t<1:
            z+=np.sin(phases+1.3*t)*2.0*np.sin(math.pi*t)
        inset=recession*(.55+.8*wear)
        xy=points[:,:2]-np.array([px,py])*(points[:,2]-z)[:,None]+outward*inset[:,None]
        rings.append(np.column_stack([xy,z]))
    faces=[]
    for j in range(len(rings)-1):
        for i in range(n):
            k=(i+1)%n
            a,b,c,d=rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i]
            # Normal changes with unequal depth and recess; the underlying two
            # triangles still form real surface patches, not silhouette-only bevels.
            faces.extend([([d,c,b],j),([d,b,a],j)])
    return faces
