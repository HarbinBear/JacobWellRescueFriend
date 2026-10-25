"""Geological relief, not a brightness pattern or per-pixel random normal.
Returns physical screen-space depth displacement and intrinsic pigment only.
The displacement is applied to every visible surface; normals use its derivative.
"""
import math
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates


def continuous_noise(shape, world_scale, seed, pixels_per_world):
    rng=np.random.default_rng(seed)
    h,w=shape
    cell=max(3,world_scale*pixels_per_world)
    gh,gw=math.ceil(h/cell)+3,math.ceil(w/cell)+3
    field=rng.normal(0,1,(gh,gw))
    yy,xx=np.mgrid[0:h,0:w].astype(float)
    field=map_coordinates(field,[yy/cell+1,xx/cell+1],order=3,mode='reflect')
    field-=field.mean()
    return field/max(.1,field.std())


def fissure(x,y,points,width,depth):
    """Finite winding fractured slot with a tapered end, not endless painted lines."""
    distance=np.full(x.shape,1e6)
    length=sum(math.hypot(b[0]-a[0],b[1]-a[1]) for a,b in zip(points,points[1:]))
    position=np.zeros(x.shape)
    accumulated=0
    for a,b in zip(points,points[1:]):
        dx,dy=b[0]-a[0],b[1]-a[1]
        seg=math.hypot(dx,dy)
        t=np.clip(((x-a[0])*dx+(y-a[1])*dy)/(seg*seg),0,1)
        d=np.hypot(x-a[0]-t*dx,y-a[1]-t*dy)
        closer=d<distance
        position[closer]=(accumulated+t[closer]*seg)/length
        distance=np.minimum(distance,d)
        accumulated+=seg
    end=np.clip(np.minimum(position,1-position)*9,0,1)
    width=width*(.62+.38*np.sin(position*11+.7)**2)
    # Broad erosion into the shoulders, narrow deep core. Geometry supplies darkness.
    shoulder=np.exp(-(distance/(width*2.8))**2)*depth*.27
    core=np.exp(-(distance/width)**2)*depth*.73
    return -(shoulder+core)*end


def sculpt_relief(x,y,scale):
    shape=x.shape
    macro=continuous_noise(shape,47,182,scale)
    middle=continuous_noise(shape,13,54,scale)
    small=continuous_noise(shape,3.5,27,scale)
    grain=continuous_noise(shape,1.25,75,scale)
    wx=x+macro*5.5+middle*1.6
    wy=y+macro*4+middle*1.8
    # Unequal tilted strata, interrupted by fracture zones. No Voronoi stone tiling.
    coordinate=wy*.052+wx*.020+macro*.45
    band=np.sin(coordinate)+.31*np.sin(coordinate*2.23+.8)
    strata=5.1*np.tanh(band*1.7)*( .60+.25*np.tanh(macro*.6))
    relief=strata+middle*1.9+small*.68+grain*.16
    cracks=[
        ([[104,473],[166,488],[204,481],[246,513],[290,520]],3.2,13),
        ([[225,508],[215,542],[233,568],[219,598]],2.3,10),
        ([[116,726],[161,708],[207,719],[240,752],[270,757]],4.1,16),
        ([[207,373],[253,361],[280,395],[275,428]],2.8,12),
        ([[550,430],[574,459],[566,498],[592,537],[630,549]],3.8,17),
        ([[494,652],[544,670],[568,657],[609,677],[644,663]],4.2,16),
        ([[531,843],[568,815],[620,830]],3.1,12),
        ([[399,515],[426,509],[439,530],[472,543]],2.1,9),
        ([[433,529],[427,557],[404,574]],1.6,7),
    ]
    slots=np.zeros(shape)
    for points,width,depth in cracks:
        cut=fissure(wx,wy,points,width,depth)
        slots=np.minimum(slots,cut)
    relief+=slots
    # Water-eroded local cavities, concentrated at broken seams instead of evenly dotted.
    for cx,cy,rx,ry,depth in [(196,506,11,5,7),(225,549,7,12,8),(279,396,7,12,6),
                             (557,654,13,6,9),(584,683,7,10,8),(605,535,6,9,7),
                             (425,523,5,4,5),(454,542,4,7,5)]:
        r=((wx-cx)/rx)**2+((wy-cy)/ry)**2
        relief-=depth*np.exp(-r*1.5)
    relief=gaussian_filter(relief,.42*scale)
    # Darker deposits and ochre mineral chroma are intrinsic material, not fixed key light.
    sediment=np.clip(-slots/20,0,.55)
    pigment=np.stack([macro*.018+middle*.004,macro*.010+middle*.003,macro*.005+middle*.002],axis=2)
    pigment-=sediment[:,:,None]*np.array([.033,.030,.021])
    return relief,pigment,slots


def displaced_normal(normal,displacement,scale,px,py):
    """Exact normal differential under P(x,y,z)=(x+px*z,y+py*z)."""
    dy,dx=np.gradient(displacement,1/scale)
    view=normal[:,:,2]-px*normal[:,:,0]-py*normal[:,:,1]
    n=normal.copy()
    n[:,:,0]-=view*dx
    n[:,:,1]-=view*dy
    n[:,:,2]-=view*(px*dx+py*dy)
    n/=np.maximum(1e-8,np.linalg.norm(n,axis=2))[:,:,None]
    return n
