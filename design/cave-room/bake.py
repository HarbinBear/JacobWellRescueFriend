from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math, random, json
from raster import bake_solid

ROOT=Path(__file__).resolve().parent / "assets"
WW,HH=720,1120
W,H=864,1344
S=W/WW
AA=3
BASALT=[[.54,.60,.60],[.61,.63,.58],[.55,.56,.56],[.54,.59,.65]]

LEFT=[[0,0],[331,0],[314,103],[344,177],[303,231],[331,302],[294,363],[323,423],[282,481],[310,527],[280,571],[305,616],[274,665],[286,708],[260,754],[258,830],[295,901],[275,960],[310,1030],[290,1120],[0,1120]]
RIGHT=[[720,0],[720,1120],[452,1120],[458,1036],[437,977],[460,913],[431,848],[451,796],[431,749],[471,707],[453,663],[494,635],[479,585],[523,553],[490,493],[513,425],[477,365],[504,300],[476,234],[510,151],[476,84],[518,0]]
# Jutting fragments form a split crown above a fork, not an isolated panel.
LANDMARK=[[493,460],[467,462],[450,481],[407,506],[395,541],[363,552],[357,582],[371,604],[406,615],[423,642],[449,631],[473,650],[493,620],[512,583],[502,533],[527,504]]
SHAPES=[LEFT,RIGHT,LANDMARK]
BACKS=[[[331,112],[359,135],[397,190],[414,254],[400,331],[414,371],[401,428],[381,453],[365,405],[369,356],[351,330],[358,263],[334,225],[345,178]],
       [[428,426],[449,409],[475,415],[468,451],[440,478],[415,479],[422,453]],
       [[336,909],[367,886],[396,902],[414,947],[403,1004],[372,1031],[369,1089],[331,1120],[311,1120],[340,1075],[344,1010],[368,977],[359,943]]]

# Width, direction, overlap and fracture rhythm vary. They are attached to continuous walls.
MODULES=[
 ('left-0', [252,50],130,139,-.19,18),('left-1',[250,183],128,138,.34,33),
 ('left-2',[249,312],123,167,-.30,49),('left-3',[236,450],135,144,.25,73),
 ('left-4',[245,567],121,148,-.29,88),('left-5',[217,705],142,133,.20,105),
 ('left-6',[207,815],138,171,-.40,120),('left-7',[241,958],146,147,.38,139),('left-8',[234,1100],148,133,-.33,150),
 ('right-0',[560,48],163,143,.20,190),('right-1',[556,179],154,170,-.39,203),
 ('right-2',[553,328],157,151,.26,229),('right-3',[566,462],152,163,-.24,245),
 ('right-4',[567,602],156,152,.49,266),('right-5',[541,724],158,150,-.18,291),
 ('right-6',[525,850],168,147,.26,309),('right-7',[538,979],162,162,-.42,327),('right-8',[525,1110],168,157,.15,340),
 # Smaller embedded fragments are not identical scaled copies of wall chunks.
 ('chip-left',[296,628],72,91,-.39,360),('chip-right',[471,676],66,106,.30,384),
 ('crown-a',[470,521],116,117,-.36,401),('crown-b',[420,566],102,73,.20,424),
 ('crown-c',[443,609],67,76,-.40,450)
]

def inside(poly,x,y):
 hit=False
 for a,b in zip(poly,poly[-1:]+poly[:-1]):
  if(a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
 return hit

def randpoly(cx,cy,w,h,ang,seed):
 r=random.Random(seed);n=r.choice([7,8,9,10]);result=[]
 for i in range(n):
  a=(i/n)*math.tau+r.uniform(-.11,.11);rx=w*.5*r.uniform(.79,1.09);ry=h*.5*r.uniform(.80,1.09)
  x=math.cos(a)*rx;y=math.sin(a)*ry
  result.append([cx+x*math.cos(ang)-y*math.sin(ang),cy+x*math.sin(ang)+y*math.cos(ang)])
 return result

def circumcircle(a,b,c):
 ax,ay=a[:2];bx,by=b[:2];cx,cy=c[:2]
 den=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by))
 if abs(den)<1e-7:return None
 aa=ax*ax+ay*ay;bb=bx*bx+by*by;cc=cx*cx+cy*cy
 x=(aa*(by-cy)+bb*(cy-ay)+cc*(ay-by))/den
 y=(aa*(cx-bx)+bb*(ax-cx)+cc*(bx-ax))/den
 return x,y,(x-ax)**2+(y-ay)**2

def delaunay(points):
 pts=[(-10000,-10000),(20000,-10000),(0,20000)]+[(p[0],p[1]) for p in points];tri=[(0,1,2)]
 for k in range(3,len(pts)):
  bad=[]
  for t in tri:
   c=circumcircle(*(pts[v] for v in t))
   if c and (pts[k][0]-c[0])**2+(pts[k][1]-c[1])**2<c[2]+1e-5:bad.append(t)
  edge={}
  for t in bad:
   for a,b in [(t[0],t[1]),(t[1],t[2]),(t[2],t[0])]:
    e=tuple(sorted((a,b)));edge[e]=edge.get(e,0)+1
  tri=[t for t in tri if t not in bad]
  tri.extend((a,b,k) for (a,b),count in edge.items() if count==1)
 return [tuple(v-3 for v in t) for t in tri if min(t)>=3]

def rgba_image():return Image.new('RGBA',(W*AA,H*AA))
def toscreen(points):return [(round(x*S*AA),round(y*S*AA)) for x,y,*_ in points]
def clamp(v):return max(0,min(255,round(v)))

mask=Image.new('L',(W*AA,H*AA));d=ImageDraw.Draw(mask)
for p in SHAPES:d.polygon(toscreen(p),fill=255)
mask=mask.resize((W,H),Image.Resampling.LANCZOS)
backmask=Image.new('L',(W*AA,H*AA));d=ImageDraw.Draw(backmask)
for p in BACKS:d.polygon(toscreen(p),fill=255)
backmask=backmask.resize((W,H),Image.Resampling.LANCZOS)
base=rgba_image();normals=rgba_image();detail=rgba_image()
bd=ImageDraw.Draw(base);nd=ImageDraw.Draw(normals);dd=ImageDraw.Draw(detail)
# Continuous, irregular backing mass, not black gaps between floating stones.
bd.rectangle((0,0,W*AA,H*AA),fill=(70,83,86,255));nd.rectangle((0,0,W*AA,H*AA),fill=(134,147,250,255));dd.rectangle((0,0,W*AA,H*AA),fill=(163,31,112,255))
meshes=[];triangles=0;all_normals=[]
for name,c,w,h,ang,seed in MODULES:
 r=random.Random(seed);p=randpoly(*c,w,h,ang,seed)
 points=[]
 slopex=r.uniform(-.33,.33);slopey=r.uniform(-.38,.38);phase=r.uniform(0,math.tau)
 def elevation(x,y):return max(9,min(94,42+slopex*(x-c[0])+slopey*(y-c[1])+18*math.sin(x*.016+y*.024+phase)+8*math.cos(x*.027-y*.018+seed)))
 for x,y in p:points.append([x,y,elevation(x,y)])
 for j in range(r.randint(5,8)):
  x=c[0]+r.uniform(-.33,.33)*w;y=c[1]+r.uniform(-.35,.35)*h
  if inside(p,x,y):points.append([x,y,elevation(x,y)])
 faces=delaunay(points);valid=[]
 for t in faces:
  ps=[points[v] for v in t]
  if not inside(p,sum(v[0] for v in ps)/3,sum(v[1] for v in ps)/3):continue
  if any(not inside(p,(ps[j][0]+ps[(j+1)%3][0])*.5,(ps[j][1]+ps[(j+1)%3][1])*.5) for j in range(3)):continue
  valid.append(t)
 # Contact shadows are soft but bounded to the actual wall; dark crease is underneath, not wireframe on every triangle.
 shadow=Image.new('RGBA',(W*AA,H*AA));sd=ImageDraw.Draw(shadow)
 sd.polygon([(x+3*AA,y+4*AA) for x,y in toscreen([[v[0]+v[2]*.18,v[1]-v[2]*.26] for v in points[:len(p)]])],fill=(1,5,9,190));shadow=shadow.filter(ImageFilter.GaussianBlur(2.6*AA));base.alpha_composite(shadow);bd=ImageDraw.Draw(base)
 pigment=BASALT[seed%len(BASALT)];pigment=[a*r.uniform(.93,1.08) for a in pigment]
 faces3d=[([points[v] for v in t],False) for t in valid]
 for j in range(len(p)):
  a0,b0=points[j],points[(j+1)%len(p)];a1=[a0[0],a0[1],0];b1=[b0[0],b0[1],0]
  faces3d.extend([([a1,b1,b0],True),([a1,b0,a0],True)])
 x0,y0,patches,count=bake_solid(faces3d,pigment,S)
 for target,patch in zip([base,normals,detail],patches):
  resized=patch.resize((patch.width*AA,patch.height*AA),Image.Resampling.NEAREST)
  target.paste(resized,(x0*AA,y0*AA),resized.getchannel("A"))
 triangles+=count
 meshes.append(dict(name=name,polygon=p,vertices=points,faces=valid))

for label,im in [('albedo',base),('normal',normals),('detail',detail)]:
 im=im.resize((W,H),Image.Resampling.LANCZOS)
 if label=='albedo':im.putalpha(mask)
 im.save(ROOT/('room-'+label+'.png'))
# A separate far layer is sparse attached surfaces with empty holes; never a full rear wall.
back=Image.new('RGBA',(W,H));d=ImageDraw.Draw(back)
for j,p in enumerate(BACKS):
 pts=[(round(x*S),round(y*S)) for x,y in p]
 d.polygon(pts,fill=(17+j*3,30+j*3,35+j*4,255))
 for k in range(1,len(p)-1):
  d.polygon([pts[0],pts[k],pts[k+1]],fill=(19+(k%3)*3,31+(k%3)*3,37+(k%3)*3,255))
back.putalpha(backmask);back.save(ROOT/'room-back.png')
scene=dict(id='room',name='断冠双岔洞',width=WW,height=HH,theme=[1,1,1],player=[358,772],aim=[402,566],shapes=SHAPES,background=BACKS,variant=0,variantId='D-room',sentence='上方的断冠把路线劈成两道；一侧是嵌岩和窄缝，另一侧是更深的黑腔。',sites=[dict(name='洞口看断冠',player=[358,772],aim=[402,566]),dict(name='靠近左侧岩体',player=[350,684],aim=[305,569]),dict(name='右侧回看',player=[391,743],aim=[460,685])])
(ROOT/'scenes.json').write_text(json.dumps(dict(width=WW,height=HH,textureWidth=W,textureHeight=H,scenes=[scene],meshes=meshes,normalTriangles=triangles,coverageSupersample=AA),ensure_ascii=False),encoding='utf8')
# Diagnostic only: explicit normal visualization, not an alternate beauty render.
proof=Image.open(ROOT/'room-normal.png');proof.putalpha(mask);proof.save(ROOT/'normal-proof.png')
print('Baked single complete chamber:',len(meshes),'sculpted modules',triangles,'noncoplanar triangles',W,H,flush=True)
