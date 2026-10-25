"""Sculpted wall study. All runtime maps come from the same visible surface.
No image-generated lighting, brightness-to-normal conversion, or runtime Python.
Run from the repository with the project-local Python environment.
"""
from pathlib import Path
import json
import math
import shutil
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
BASE = json.loads((ROOT / 'design/cave-room/assets/scenes.json').read_text())['scenes'][0]
WW, HH = 720, 1120
W, H, AA = 864, 1344, 3
S = W / WW
HEIGHT_SCALE, LAMP_HEIGHT = 220, 205
PX, PY = .35, -.48


def simplify(points, tolerance=.85):
    if len(points) < 3:
        return points
    p = np.asarray(points)
    a, b = p[0], p[-1]
    v = b - a
    t = np.clip((p - a) @ v / max(1e-9, v @ v), 0, 1)
    distances = np.linalg.norm(p - (a + t[:, None] * v), axis=1)
    k = int(np.argmax(distances))
    if distances[k] <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:k + 1], tolerance)[:-1] + simplify(points[k:], tolerance)


def curved_chain(points, phase):
    """Broad erosion, local chips, and retained fractures, not evenly spaced teeth."""
    points = np.asarray(points, dtype=float)
    out = []
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        prev, following = points[max(0, i - 1)], points[min(len(points) - 1, i + 2)]
        m0, m1 = .68 * (b - prev) / 2, .68 * (following - a) / 2
        count = max(2, math.ceil(np.linalg.norm(b - a) / 5))
        for j in range(count):
            t = j / count
            q = (2*t**3-3*t*t+1)*a + (t**3-2*t*t+t)*m0 + (-2*t**3+3*t*t)*b + (t**3-t*t)*m1
            tangent = b - a
            normal = np.array([-tangent[1], tangent[0]]) / max(1., np.linalg.norm(tangent))
            # Smooth, multi-scale, non-periodic chips; no pixel-sized random displacement.
            chip = math.sin(t*math.pi) * (2.1*math.sin(q[1]*.078+phase) + 1.7*math.sin(q[1]*.137+q[0]*.041))
            q += normal * chip
            out.append([round(float(q[0]), 2), round(float(q[1]), 2)])
    out.append(points[-1].tolist())
    return simplify(out)


left = [[0, 0]] + curved_chain(BASE['shapes'][0][1:-1], .7) + [[0, HH]]
right_chain = list(reversed(BASE['shapes'][1][2:]))
right = [[WW, 0], [WW, HH]] + list(reversed(curved_chain(right_chain, 3.2)))
# The broken crown keeps its projecting nose and fork. Only some corners are eroded.
crown_path = BASE['shapes'][2]
crown = curved_chain(crown_path + crown_path[:1], 1.6)[:-1]
shapes = [left, right, crown]


def coverage(polygons):
    im = Image.new('L', (W*AA, H*AA))
    draw = ImageDraw.Draw(im)
    for p in polygons:
        draw.polygon([(round(x*S*AA), round(y*S*AA)) for x, y in p], fill=255)
    return np.asarray(im.resize((W, H), Image.Resampling.LANCZOS)).copy()


alpha = coverage(shapes)
mask = alpha > 127
Y, X = np.mgrid[0:H, 0:W].astype(float)
X = (X + .5) / S
Y = (Y + .5) / S
inside_left = coverage([left]) > 127
inside_right = coverage([right]) > 127
inside_crown = coverage([crown]) > 127
edge_distance = distance_transform_edt(mask) / S
height = np.full((H, W), -100., dtype=float)
material = np.zeros((H, W, 3), dtype=float)


def mound(cx, cy, rx, ry, angle, amount, power=2):
    u = (X-cx)*math.cos(angle) + (Y-cy)*math.sin(angle)
    v = -(X-cx)*math.sin(angle) + (Y-cy)*math.cos(angle)
    r2 = (u/rx)**2 + (v/ry)**2
    return amount * np.maximum(0, 1-r2)**power


# Art-directed different mass scales and tilted fracture groups. Empty slots are recesses.
# Positive and negative lobes are deliberately not identical centered rock buttons.
features_left = [
    (200, 115, 156, 207, -.18, 54, 1.2), (280, 295, 72, 135, .44, 73, .9),
    (168, 411, 179, 105, -.34, 58, 1.1), (245, 536, 132, 134, -.47, 86, .85),
    (237, 723, 105, 203, .18, 57, 1.1), (144, 919, 176, 120, -.26, 72, 1),
    (247, 1071, 116, 178, .31, 61, 1),
    (258, 207, 95, 26, .13, -53, 1), (240, 447, 131, 24, -.31, -65, 1),
    (224, 646, 116, 25, -.41, -64, 1), (209, 870, 102, 22, .32, -45, 1),
]
features_right = [
    (571, 96, 130, 154, .37, 61, 1), (553, 286, 107, 202, -.21, 70, .8),
    (580, 457, 179, 136, .49, 84, 1.1), (565, 657, 168, 213, -.34, 52, 1.1),
    (534, 865, 115, 138, .23, 86, .9), (550, 1055, 169, 159, -.49, 60, 1),
    (553, 204, 118, 24, .37, -68, 1), (553, 402, 155, 24, -.18, -71, 1),
    (566, 748, 172, 33, -.24, -69, 1), (543, 986, 127, 26, .24, -53, 1),
]
for region, side, features in [(inside_left, 0, features_left), (inside_right, 1, features_right)]:
    bulk = 57 + .06*(X-(270 if side == 0 else 520)) + 17*np.sin(Y*.006 + side*2.1) + 11*np.sin(X*.027 + Y*.014)
    for f in features:
        bulk += mound(*f)
    # Continuous tilted masses reach the silhouette; no distance-to-edge bevel template.
    field = bulk + .65*np.sin(X*.12+Y*.035)*np.sin(Y*.105-X*.022)
    field = np.clip(field, 8, 184)
    height[region] = field[region]
    pigment = np.array([.48, .55, .56]) if side == 0 else np.array([.51, .56, .55])
    broad_pigment = .97 + .045*np.sin(X*.010+Y*.007+side) + .025*np.cos(Y*.039-X*.016)
    material[region] = pigment * broad_pigment[region, None]

# An actual projecting asymmetric 3D wedge at the fork, with its own front and side faces.
# Surfaces are rasterized with Z-buffering, not painted cracks or fake shadow overlays.
height[inside_crown] = 29 + 9*np.sin(X[inside_crown]*.035-Y[inside_crown]*.018)
material[inside_crown] = [.49, .55, .55]


def unproject(q):
    x, y, z = q
    return np.array([x-PX*z, y-PY*z, z], dtype=float)


triangles = []
patch_owner = 0


def triangle(points, pigment, smooth=None, side=False):
    actual = np.array([unproject(p) for p in points])
    normal = np.cross(actual[1]-actual[0], actual[2]-actual[0])
    if normal[2]-PX*normal[0]-PY*normal[1] < 0:
        if side:
            return
        actual = actual[[0, 2, 1]]
        points = [points[0], points[2], points[1]]
        if smooth is not None:
            smooth = smooth[[0, 2, 1]]
        normal *= -1
    length = np.linalg.norm(normal)
    if length < 1e-8:
        return
    normal /= length
    triangles.append((points, normal, pigment, smooth, patch_owner))


def slab(perimeter, heights, floor, pigment, interiors):
    global patch_owner
    cx=float(np.mean(np.array(perimeter)[:,0]))
    patch_owner=0 if cx<350 else 1 if cx>500 else 2
    # No forced high center; separate tilted interior points and perimeter elevations.
    from scipy.spatial import Delaunay
    from scipy.interpolate import RBFInterpolator
    controls=np.array([[p[0],p[1],z] for p,z in zip(perimeter,heights)]+interiors)
    field=RBFInterpolator(controls[:,:2],controls[:,2],kernel='thin_plate_spline',smoothing=10)
    # Curved erosion around an independently tilted slab, with deliberately unequal corners.
    perimeter=curved_chain(perimeter+perimeter[:1], float(controls[0,0])*.01)[:-1]
    top=[[p[0],p[1],float(np.clip(field(np.array([p]))[0],floor+24,185))] for p in perimeter]
    perimeter_count=len(perimeter)
    bounds=np.array(perimeter)
    local=Image.new('L',(W,H))
    ImageDraw.Draw(local).polygon([(round(p[0]*S),round(p[1]*S)) for p in perimeter],fill=255)
    localmask=np.asarray(local)
    for y in np.arange(bounds[:,1].min()+9,bounds[:,1].max()-7,12):
        for x in np.arange(bounds[:,0].min()+9,bounds[:,0].max()-7,12):
            if localmask[min(H-1,max(0,int(y*S))),min(W-1,max(0,int(x*S)))]:
                z=float(np.clip(field(np.array([[x,y]]))[0],floor+24,185))
                z+=.65*math.sin(x*.11+y*.047)*math.sin(y*.12-x*.051)
                top.append([float(x),float(y),z])
    faces = Delaunay(np.array(top)[:, :2]).simplices
    ppath = Image.new('L', (W, H))
    ImageDraw.Draw(ppath).polygon([(round(p[0]*S), round(p[1]*S)) for p in perimeter], fill=255)
    occupancy = np.asarray(ppath)
    shared = np.zeros((len(top),3))
    valid = []
    for face in faces:
        ps = [top[i] for i in face]
        cx, cy = np.mean(np.asarray(ps)[:, :2], axis=0)*S
        if not occupancy[min(H-1,max(0,int(cy))), min(W-1,max(0,int(cx)))]:
            continue
        actual = np.array([unproject(p) for p in ps])
        n = np.cross(actual[1]-actual[0], actual[2]-actual[0])
        if n[2]-PX*n[0]-PY*n[1]<0:
            face=face[[0,2,1]]
            n=-n
        shared[face] += n
        valid.append(face)
    shared /= np.maximum(1e-8,np.linalg.norm(shared,axis=1))[:,None]
    for face in valid:
        triangle([top[i] for i in face], pigment, shared[face])
    # Multi-ring physical erosion replaces the perfectly vertical extruded strips.
    from sidewalls import sidewall_mesh
    for points,ring in sidewall_mesh(top[:len(perimeter)],floor,PX,PY):
        triangle(points,np.array(pigment)*(.985 if ring<2 else .97),side=True)


slab([[411,505],[459,471],[490,490],[493,535],[462,565],[396,572],[376,554]],
     [115,164,136,153,89,127,97], 18, [.52,.58,.57], [[431,516,177],[439,547,132]])
slab([[389,573],[419,558],[458,584],[475,620],[446,637],[409,608],[373,600]],
     [87,110,123,93,61,90,72], 15, [.48,.54,.55], [[419,587,109]])
# Left wall has one long sheared shelf; right wall has a deeper buttress, not the same module.
slab([[126,480],[215,474],[285,498],[287,540],[244,571],[146,551],[106,518]],
     [99,143,125,161,138,107,81], 23, [.52,.57,.55], [[205,520,163],[258,538,156]])
slab([[526,605],[582,589],[645,642],[623,711],[530,723],[481,678]],
     [103,158,168,132,121,77], 26, [.48,.55,.57], [[571,657,181],[520,682,112]])

# The silhouette includes the real projected side geometry, not the old clipping mask.
from shapely.geometry import Polygon
from shapely.ops import unary_union
expanded=[]
from shapely.geometry import Point
from shapely.affinity import scale as scale_polygon
# Sparse authored edge breaks, not a universal wavy edge or random pixel teeth.
edge_breaks=[[(309,531,6,9)],[(458,658,6,7)],[(445,661,8,5),(509,588,5,8)]]
for owner,p in enumerate(shapes):
    faces=[Polygon(np.array(ps)[:,:2]).buffer(0) for ps,n,pigment,smooth,tag in triangles if tag==owner]
    merged=unary_union([Polygon(p).buffer(0)]+faces)
    for cx,cy,rx,ry in edge_breaks[owner]:
        cutter=scale_polygon(Point(cx,cy).buffer(1,resolution=12),rx,ry,origin=(cx,cy))
        merged=merged.difference(cutter)
    merged=merged.simplify(.85,preserve_topology=True)
    if merged.geom_type!='Polygon':
        merged=max(merged.geoms,key=lambda p:p.area)
    expanded.append([[round(x,2),round(y,2)] for x,y in list(merged.exterior.coords)[:-1]])
shapes=expanded
alpha=coverage(shapes)
mask=alpha>127
height[mask&(height<0)]=14
material[mask&(material.sum(axis=2)==0)]=[.48,.54,.55]
# Smooth field normals from the exact unprojected surface; no diffuse-to-height heuristic.
filled = height.copy()
indices = distance_transform_edt(~mask, return_distances=False, return_indices=True)
filled[~mask] = filled[tuple(indices[:, ~mask])]
filled = gaussian_filter(filled, .65)
hy, hx = np.gradient(filled, 1/S)
normal_map = np.stack([-hx, -hy, 1-PX*hx-PY*hy], axis=2)
normal_map /= np.maximum(1e-8, np.linalg.norm(normal_map, axis=2))[:, :, None]
normal_map[~mask] = [0, 0, 1]

for ps, n, pigment, smooth, owner in triangles:
    p = np.array(ps)
    xy = p[:, :2]*S
    lo = np.maximum(0, np.floor(xy.min(axis=0)).astype(int))
    hi = np.minimum([W-1,H-1], np.ceil(xy.max(axis=0)).astype(int))
    if np.any(hi < lo):
        continue
    yy, xx = np.mgrid[lo[1]:hi[1]+1, lo[0]:hi[0]+1].astype(float)
    xx += .5
    yy += .5
    a,b,c = xy
    den = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(den) < 1e-8:
        continue
    w0 = ((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
    w1 = ((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den
    w2 = 1-w0-w1
    z = w0*p[0,2]+w1*p[1,2]+w2*p[2,2]
    sl = np.s_[lo[1]:hi[1]+1,lo[0]:hi[0]+1]
    take = (np.minimum(np.minimum(w0,w1),w2) >= 0) & (z >= height[sl]) & mask[sl]
    height[sl][take] = z[take]
    if smooth is None:
        normal_map[sl][take] = n
    else:
        shading = .08*n + .92*(w0[:,:,None]*smooth[0]+w1[:,:,None]*smooth[1]+w2[:,:,None]*smooth[2])
        shading /= np.maximum(1e-8,np.linalg.norm(shading,axis=2))[:,:,None]
        normal_map[sl][take] = shading[take]
    material[sl][take] = pigment

# Physical geological relief, applied to the same visible depth and normal differential.
from geology import sculpt_relief, displaced_normal
relief, mineral_pigment, fracture_depth = sculpt_relief(X,Y,S)
relief *= mask
relief_for_normal = relief.copy()
relief_for_normal[~mask] = relief_for_normal[tuple(indices[:,~mask])]
normal_map = displaced_normal(normal_map,relief_for_normal,S,PX,PY)
normal_map[~mask] = [0,0,1]
height[mask] += relief[mask]
height[mask] = np.clip(height[mask],4,200)

# AO is geometric cavity/nearby occlusion, stored separately from the neutral material.
nearest_height = height.copy()
nearest_height[~mask] = nearest_height[tuple(indices[:, ~mask])]
broad = gaussian_filter(nearest_height, 9*S)
cavity = np.maximum(0, broad-nearest_height)
from contact_ao import contact_ao
# Physical normal relative horizon: adjacent higher faces create local contact.
horizon_ao=contact_ao(height,normal_map,mask,S,PX,PY)
ao=np.minimum(horizon_ao,np.clip(1-cavity/130,.48,1))
# A few restrained mineral seams follow an actual large groove direction; not thick outlines.
seam_phase = X*.034 + Y*.012 + .24*np.sin(Y*.020)
seam = np.exp(-(np.sin(seam_phase)/.09)**2) * .04
tint = np.stack([seam*.40, seam*.18, -seam*.20], axis=2)
# Retain only the old art's broad pigment chroma, explicitly stripping fixed brightness.
paint=np.asarray(Image.open(ROOT/'design/cave-room/assets/painted-atlas.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS),dtype=float)/255
for k in range(3):
    paint[:,:,k]=gaussian_filter(paint[:,:,k],12*S)
luminance=np.maximum(.08,paint@np.array([.2126,.7152,.0722]))
chroma=np.clip(paint/luminance[:,:,None]*.53,.38,.67)
material=np.clip(material*.58+chroma*.42+tint,0,1)
# Very restrained mineral wear, not an illuminated stone-pattern atlas.
grain=(np.sin(X*.31+Y*.047)*np.sin(Y*.24-X*.017))*.007
material=np.clip(material+mineral_pigment+grain[:,:,None],0,1)
material[~mask] = 0


def write_rgba(name, rgb, a, quantized_channels=()):
    # Bounded quantization; not lossless. Alpha and depth retain all eight bits.
    rgb=np.clip(rgb,0,1).copy()
    for k in quantized_channels:
        rgb[:,:,k]=np.rint(rgb[:,:,k]*63)/63
    data = np.dstack([np.rint(rgb*255).astype(np.uint8), a.astype(np.uint8)])
    Image.fromarray(data).save(OUT/name, optimize=True, compress_level=9)
    return data


write_rgba('room-albedo.png', material, alpha, (0,1,2))
encoded_normal=write_rgba('room-normal.png', normal_map*.5+.5, np.full((H,W),255), (0,1,2))
decoded_normal=encoded_normal[:,:,:3].astype(float)/255*2-1
normal_length=np.linalg.norm(decoded_normal,axis=2)
decoded_normal/=np.maximum(1e-8,normal_length)[:,:,None]
angular_error=np.degrees(np.arccos(np.clip(np.sum(decoded_normal*normal_map,axis=2),-1,1)))[mask]
assert angular_error.max()<1.8,'Normal export must keep bounded angular error'
# G is not read by the renderer. Keep the slot zero instead of redundant cavity data.
# AO is six-bit; depth remains eight-bit with no downsampling or edge thresholding.
detail = np.stack([ao, np.zeros_like(ao), np.clip(height/HEIGHT_SCALE,0,1)], axis=2)
write_rgba('room-detail.png', detail, np.full((H,W),255), (0,))
shutil.copyfile(ROOT/'images/cave-rock/room-back.png', OUT/'room-back.png')
scene = dict(BASE)
scene.update(shapes=shapes, heightScale=HEIGHT_SCALE, lampHeight=LAMP_HEIGHT, projection=[PX,PY])
(OUT/'scene.json').write_text(json.dumps(scene, ensure_ascii=False, separators=(',',':')))
report = dict(outlineVertices=sum(map(len,shapes)), baselineVertices=sum(map(len,BASE['shapes'])),
              heightScale=HEIGHT_SCALE, lampHeight=LAMP_HEIGHT, meshFaces=len(triangles),
              heightPercentiles=np.percentile(height[mask],[1,10,50,90,99]).tolist(),
              normalZPercentiles=np.percentile(normal_map[:,:,2][mask],[10,50,90]).tolist(),
              albedo='restrained neutral pigment; no baked key light or painted stone blocks',
              geometry='worn multi-ring thick sidewalls, finite fractures and normal-relative contact horizons',
              revision='E03-worn-contact',
              ambientOcclusion=dict(directions=12,steps=5,visibleDepthApproximation=True,
                                    percentiles=np.percentile(ao[mask],[1,10,50,90,99]).tolist()),
              reliefRange=np.percentile(relief[mask],[1,10,50,90,99]).tolist(),
              fissureSamples=int(np.count_nonzero((fracture_depth<-5)&mask)),
              export=dict(lossless=False,normalAngularP99=float(np.percentile(angular_error,99)),
                          normalAngularMax=float(angular_error.max()),
                          normalChannels=64,AOChannels=64,depthBits=8,alphaBits=8,unusedGreen=0),
              limits='single visible-depth bake: not full runtime 3D or view-dependent disocclusion',
              bytes=sum(p.stat().st_size for p in OUT.glob('*.png')))
(OUT/'report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2), flush=True)
