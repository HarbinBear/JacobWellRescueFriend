from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import json, math, random

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets'
OUT.mkdir(exist_ok=True)
LAYOUT = json.loads((ROOT / 'layout.json').read_text())
random.seed(261109)

def bank(nodes):
    result = []
    for i in range(len(nodes) - 1):
        a, b = nodes[i], nodes[i + 1]
        p, q = nodes[max(0, i - 1)], nodes[min(len(nodes) - 1, i + 2)]
        dx = b[0] - a[0]
        m0 = (b[1] - p[1]) / (b[0] - p[0] or 1)
        m1 = (q[1] - a[1]) / (q[0] - a[0] or 1)
        steps = max(1, math.ceil(abs(dx) / 8))
        for j in range(steps):
            t = j / steps
            y = (2*t**3-3*t*t+1)*a[1] + (t**3-2*t*t+t)*dx*m0 + (-2*t**3+3*t*t)*b[1] + (t**3-t*t)*dx*m1
            result.append((a[0]+dx*t, max(min(a[1],b[1]),min(max(a[1],b[1]),y))))
    result.append(tuple(nodes[-1]))
    return result

def ground(points, x):
    for a, b in zip(points, points[1:]):
        if min(a[0], b[0]) <= x <= max(a[0], b[0]):
            return a[1] + (b[1]-a[1])*(x-a[0])/(b[0]-a[0] or 1)
    return 1080

def rock_plate(name, points, edge):
    x0, x1 = math.floor(min(p[0] for p in points)), math.ceil(max(p[0] for p in points))
    y0, y1 = math.floor(min(p[1] for p in points))-4, LAYOUT['seamY']
    w, h = x1-x0+1, y1-y0+1
    mask = Image.new('L', (w*2,h*2)); md=ImageDraw.Draw(mask)
    poly=[((x-x0)*2,(y-y0)*2) for x,y in points]+[((edge-x0)*2,(y1-y0)*2)]
    md.polygon(poly, fill=255);mask=mask.resize((w,h),Image.Resampling.LANCZOS)
    im=Image.new('RGB',(w,h)); px=im.load()
    coarse=Image.effect_noise((max(2,w//45),max(2,h//45)),24).resize((w,h),Image.Resampling.BICUBIC)
    middle=Image.effect_noise((max(2,w//6),max(2,h//6)),18).resize((w,h),Image.Resampling.BICUBIC)
    grain=Image.effect_noise((w,h),9)
    cp,mp,gp=coarse.load(),middle.load(),grain.load()
    floors=[ground(points,x+x0) for x in range(w)]
    for y in range(h):
        wy=y+y0
        wet=max(0,min(1,(wy-555)/160))
        deep=max(0,min(1,(wy-790)/360))
        for x in range(w):
            relief=wy-floors[x]
            lip=math.exp(-max(0,relief)/20)*20-math.exp(-max(0,relief-28)**2/220)*12
            strata=math.sin((wy+math.sin(x/150)*13)/23)*4+math.sin(wy/67+x/340)*5
            noise=(cp[x,y]-128)*.33+(mp[x,y]-128)*.23+(gp[x,y]-128)*.32
            n=noise+strata+lip
            base=(185*(1-wet)+91*wet,169*(1-wet)+127*wet,130*(1-wet)+118*wet)
            px[x,y]=tuple(max(0,min(255,int((v+n)*(1-deep*.25)))) for v in base)
    d=ImageDraw.Draw(im,'RGBA')
    for i in range(14):
        sy=540+i*37+random.uniform(-12,12)
        path=[]
        for x in range(0,w,12):
            yy=sy+math.sin(x/180+i*1.7)*11+math.sin(x/31+i)*2
            path.append((x,yy-y0))
        d.line(path, fill=(31,53,48,30+int(i*.7)), width=random.choice([1,2,3]))
        d.line([(x,y+3) for x,y in path],fill=(229,220,184,30),width=1)
    for i in range(max(10,w//75)):
        x=random.uniform(0,w);gy=floors[min(w-1,int(x))]-y0
        yy=gy+random.uniform(23,max(24,h-gy));length=random.uniform(20,95)
        d.line([(x,yy),(x-5,yy+length*.3),(x+6,yy+length*.6),(x+3,yy+length)],fill=(29,47,42,85),width=2)
        d.line([(x+2,yy),(x-3,yy+length*.3)],fill=(235,218,170,70),width=1)
    rim=[(x-x0,y-y0) for x,y in points]
    for i in range(len(points)-1):
        ax,ay=points[i];bx,by=points[i+1]
        dx,dy=bx-ax,by-ay;length=math.hypot(dx,dy) or 1
        nx,ny=(-dy/length,dx/length) if dx>0 else (dy/length,-dx/length)
        width=18+8*math.sin(i*.063)+4*math.sin(i*.19)
        wet=max(0,min(1,(ay-560)/130))
        light=max(.15,min(1,.55+ny*.34-nx*.22))
        color=(int((230*(1-wet)+105*wet)*light),int((210*(1-wet)+151*wet)*light),int((155*(1-wet)+133*wet)*light),220)
        lip=[(ax-x0,ay-y0),(bx-x0,by-y0),(bx-x0+nx*width,by-y0+ny*width),(ax-x0+nx*width,ay-y0+ny*width)]
        d.polygon(lip,fill=color)
        d.line([(ax-x0+nx*(width+3),ay-y0+ny*(width+3)),(bx-x0+nx*(width+3),by-y0+ny*(width+3))],fill=(34,59,47,90),width=3)
    d.line(rim,fill=(201,211,148,150),width=2)
    for y in range(max(0,h-86),h):
        alpha=int(((y-(h-86))/86)**1.7*210)
        d.line([(0,y),(w,y)],fill=(25,52,44,alpha),width=1)
    for x in range(0,w,7):
        gy=floors[x]-y0
        if gy+y0>566:continue
        d.ellipse((x-4,gy-3,x+8,gy+random.uniform(1,8)),fill=random.choice([(71,93,52,220),(106,125,64,230),(146,153,86,160)]))
        if random.random()<.22:d.line([(x,gy),(x-2,gy-10),(x-7,gy-4)],fill=(89,107,54,200),width=2)
    rgba=im.convert('RGBA');rgba.putalpha(mask)
    rgba.save(OUT/(name+'.png'),optimize=True)
    return {'file':name+'.png','x':x0,'y':y0,'width':w,'height':h}

S=3

def sprite(name,w,h,paint):
    im=Image.new('RGBA',(w*S,h*S));d=ImageDraw.Draw(im)
    def polygon(p,fill,outline=None):
        pts=[(int(x*S),int(y*S)) for x,y in p];d.polygon(pts,fill=fill)
        if outline:d.line(pts+[pts[0]],fill=outline,width=2*S,joint='curve')
    def rect(box,fill):d.rectangle(tuple(int(v*S) for v in box),fill=fill)
    def line(p,fill,width=1):d.line([(int(x*S),int(y*S)) for x,y in p],fill=fill,width=max(1,int(width*S)),joint='curve')
    def ellipse(box,fill):d.ellipse(tuple(int(v*S) for v in box),fill=fill)
    paint(polygon,rect,line,ellipse)
    noise=Image.effect_noise(im.size,10).convert('RGB');np=noise.load();ip=im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=ip[x,y]
            if a:
                n=(np[x,y][0]-128)*.5
                ip[x,y]=(int(max(0,min(255,r+n))),int(max(0,min(255,g+n))),int(max(0,min(255,b+n))),a)
    im=im.resize((w,h),Image.Resampling.LANCZOS);im.save(OUT/(name+'.png'),optimize=True)
    return {'file':name+'.png','width':w,'height':h}

def shop(p,r,l,e):
    e((18,159,242,173),(15,35,29,48))
    r((30,48,221,158),(71,72,49,255));r((38,48,212,153),(54,60,43,255))
    for x in range(39,210,14):l([(x,50),(x,152)],(100,94,60,255),2)
    p([(12,48),(46,8),(192,8),(248,48),(248,58),(12,58)],(112,134,95,255),(66,88,61,255))
    p([(15,46),(47,10),(191,10),(232,45)],(163,175,127,255))
    for x in range(42,233,24):l([(x,45),(x+7,57)],(83,116,83,255),2)
    l([(46,10),(191,10)],(220,218,170,255),2)
    r((24,57,33,163),(153,129,82,255));r((222,57,232,163),(151,126,83,255))
    for x in [24,224]:l([(x+2,57),(x+2,159)],(206,178,116,255),2)
    r((37,73,216,77),(145,125,77,255));r((37,111,216,116),(143,119,75,255))
    for x in [48,67,179,198]:
        r((x,84,x+10,111),(164,178,157,255));e((x,79,x+10,89),(209,218,194,255));r((x+4,76,x+6,82),(131,115,65,255))
        r((x+1,101,x+9,105),(93,119,94,255))
    p([(95,82),(110,77),(122,82),(130,100),(121,105),(116,93),(116,135),(101,135),(101,93),(95,106),(88,101)],(33,51,49,255))
    l([(107,81),(107,125)],(101,131,107,255),2)
    for x in [145,164]:e((x,94,x+14,103),(20,36,31,255));l([(x,97),(x+14,97)],(178,191,154,255),2)
    p([(39,135),(215,135),(220,162),(33,162)],(131,103,60,255),(83,70,42,255))
    r((29,131,224,139),(193,155,96,255));l([(35,139),(216,139)],(69,58,35,255),2)
    for x in range(44,214,24):l([(x,142),(x,160)],(100,77,46,255),1)
    r((53,50,192,68),(228,212,162,255));r((57,52,188,66),(214,201,156,255))
    l([(69,49),(69,37)],(72,77,51,255),1);l([(176,49),(176,37)],(72,77,51,255),1)
    r((232,78,239,91),(78,91,57,255));e((230,72,241,84),(236,208,131,255))

def tent(p,r,l,e):
    e((12,135,250,151),(12,34,29,48))
    p([(14,132),(48,34),(122,8),(201,35),(248,132)],(91,124,97,255),(49,84,67,255))
    p([(48,34),(122,8),(201,35),(190,53),(70,53)],(143,162,119,255))
    p([(48,34),(70,53),(48,132),(14,132)],(117,140,104,255))
    p([(122,29),(192,52),(222,132),(63,132),(86,52)],(111,140,105,255))
    p([(111,61),(152,61),(174,132),(88,132)],(26,51,43,255))
    p([(107,61),(89,132),(68,132),(84,52)],(137,158,117,255))
    p([(153,61),(173,132),(195,132),(188,54)],(72,106,81,255))
    l([(122,10),(122,43)],(205,215,173,255),2)
    for x in [16,67,194,246]:l([(x,131),(x-12,144)],(128,140,104,255),1);r((x-15,142,x-10,145),(113,111,75,255))
    for x in [65,191]:l([(x,64),(x-6,131)],(168,182,135,255),1)
    r((111,38,140,58),(232,225,189,255));r((122,41,129,55),(172,95,58,255));r((116,45,136,51),(172,95,58,255))
    r((197,111,249,124),(118,145,111,255));l([(203,124),(200,141)],(80,92,72,255),3);l([(242,124),(245,141)],(80,92,72,255),3)
    e((146,85,157,98),(207,180,137,255));r((142,98,160,126),(194,198,157,255));l([(146,125),(145,141)],(56,77,68,255),4);l([(157,125),(159,141)],(56,77,68,255),4)
    l([(144,104),(134,117)],(194,198,157,255),4);l([(158,104),(163,119)],(194,198,157,255),4)

def board(p,r,l,e):
    e((10,130,100,144),(13,29,22,48));r((20,48,28,138),(106,92,58,255));r((79,48,87,138),(107,91,57,255))
    p([(4,33),(24,15),(85,15),(104,33)],(119,139,92,255),(69,97,63,255));l([(25,17),(82,17)],(193,201,142,255),2)
    r((12,35,97,106),(138,116,72,255));r((18,41,91,99),(231,223,183,255))
    l([(37,45),(35,55),(44,66),(38,74),(50,83),(56,97)],(95,124,94,255),3)
    l([(37,58),(57,59),(64,70),(77,69)],(116,142,109,255),2);l([(46,81),(70,86),(78,94)],(123,144,105,255),2)
    for x,y in [(37,48),(44,67),(55,90),(77,69)]:e((x-2,y-2,x+2,y+2),(176,115,66,255))
    l([(19,44),(87,44)],(190,181,132,255),1);r((32,28,78,36),(223,211,160,255))

def air(p,r,l,e):
    e((6,124,93,135),(13,29,22,48));r((13,40,20,130),(100,96,65,255));r((79,40,86,130),(98,93,61,255))
    r((10,47,89,52),(176,159,101,255));r((9,119,90,126),(167,139,84,255))
    for x in [25,43,62]:
        r((x,78,x+14,120),(150,173,158,255));e((x,72,x+14,86),(186,204,182,255));r((x+5,68,x+9,76),(109,102,65,255))
        r((x+1,100,x+13,107),(83,116,94,255));l([(x+3,84),(x+3,115)],(209,220,191,255),2)
    l([(44,68),(43,41),(66,35),(76,59),(65,65)],(41,57,43,255),3)
    e((37,29,53,45),(175,166,115,255));e((40,32,50,42),(234,224,178,255));l([(45,38),(49,35)],(93,113,75,255),1)
    p([(4,30),(10,13),(87,13),(94,30)],(150,167,112,255),(90,121,79,255));r((17,20,82,34),(220,209,155,255))

def fish(p,r,l,e):
    e((9,99,147,111),(13,29,22,48));r((18,31,26,107),(149,117,68,255));r((128,31,136,107),(149,117,68,255))
    p([(2,31),(17,8),(131,8),(151,31),(147,38),(5,38)],(115,151,142,255),(70,115,105,255))
    r((11,77,141,100),(139,112,71,255));r((7,72,145,79),(191,153,93,255));r((38,53,114,70),(219,207,161,255))
    l([(24,39),(137,74)],(96,110,89,255),2);l([(135,39),(20,74)],(96,110,89,255),2)

left=rock_plate('bank-left',bank(LAYOUT['leftBank']),LAYOUT['minX'])
right=rock_plate('bank-right',bank(LAYOUT['rightBank']),LAYOUT['maxX'])
props={
    'shop':sprite('shop',260,176,shop),
    'tent':sprite('tent',266,153,tent),
    'board':sprite('board',110,148,board),
    'air':sprite('air',100,140,air),
    'fish':sprite('fish',156,116,fish)
}
master=OUT/'woodland-master.png'
if master.exists():
    bg=Image.open(master).convert('RGB');bg.thumbnail((1792,1024));bg.save(OUT/'woodland.jpg',quality=90,optimize=True)
else:
    raise RuntimeError('Missing generated woodland background plate')
texture=Image.effect_noise((256,256),19).convert('RGB');d=ImageDraw.Draw(texture)
for i in range(14):
    y=i*21
    d.line([(0,y),(75,y+5),(170,y-3),(256,y+4)],fill=(94,94,94),width=2)
texture.save(OUT/'rock-grain.jpg',quality=85,optimize=True)
manifest={'version':1,'banks':[left,right],'props':props,'background':'woodland.jpg','source':'Shared layout.json plus independent distant woodland painting; generated master is not a runtime texture.'}
manifest['runtimeBytes']=sum(p.stat().st_size for p in OUT.iterdir() if p.name not in ['woodland-master.png','manifest.json'])
manifest['decodedRGBABytes']=sum(Image.open(p).width*Image.open(p).height*4 for p in OUT.iterdir() if p.suffix in ['.png','.jpg'] and p.name!='woodland-master.png')
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps(manifest,ensure_ascii=False,indent=2))
