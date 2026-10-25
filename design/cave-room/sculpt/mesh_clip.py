"""Clip top triangles to the actual slab, not just the triangle centroid.
A Delaunay mesh is not constrained by a concave boundary. Intersect first,
triangulate the intersection, and keep height/normal barycentric continuity.
"""
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import triangulate


def clipped_top(points,normals,boundary):
    points=np.asarray(points,dtype=float)
    normals=np.asarray(normals,dtype=float)
    footprint=Polygon(points[:,:2])
    if not footprint.is_valid or footprint.area<1e-8:return []
    part=footprint.intersection(boundary)
    if part.is_empty or part.area<1e-8:return []
    barycentric=np.linalg.inv(np.vstack([points[:,:2].T,np.ones(3)]))
    safe=part.buffer(1e-7)
    pieces=[part] if part.geom_type=='Polygon' and len(part.exterior.coords)==4 and not part.interiors else triangulate(part)
    result=[]
    for piece in pieces:
        if piece.area<1e-8 or not safe.covers(piece):continue
        xy=np.asarray(piece.exterior.coords)[:3]
        weights=np.column_stack([xy,np.ones(3)])@barycentric.T
        vertices=np.column_stack([xy,weights@points[:,2]])
        shading=weights@normals
        shading/=np.maximum(1e-8,np.linalg.norm(shading,axis=1))[:,None]
        result.append((vertices.tolist(),shading))
    area=sum(Polygon(np.asarray(p)[:,:2]).area for p,n in result)
    assert abs(area-part.area)<max(1e-5,part.area*1e-6),'Clipped top must cover its own actual footprint without gaps'
    return result
