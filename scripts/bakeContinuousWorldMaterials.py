from pathlib import Path
from PIL import Image, ImageFilter
import json, math
ROOT=Path(__file__).resolve().parents[1]/'design/continuous-world/assets'
source=Image.open(ROOT/'limestone-material-master.png').convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)
# Blend opposite edges from an immutable copy. Reading already edited pixels
# makes the two sides disagree and introduces a visible tile seam.
original=source.copy();pixels=source.load()
for y in range(1024):
    for x in range(1024):
        blend=max(0,(48-min(x,1023-x))/48)*.5
        if blend:
            a=original.getpixel((x,y));b=original.getpixel((1023-x,y))
            pixels[x,y]=tuple(round(aa*(1-blend)+bb*blend) for aa,bb in zip(a,b))
original=source.copy()
for y in range(1024):
    blend=max(0,(48-min(y,1023-y))/48)*.5
    if not blend:continue
    for x in range(1024):
        a=original.getpixel((x,y));b=original.getpixel((x,1023-y))
        pixels[x,y]=tuple(round(aa*(1-blend)+bb*blend) for aa,bb in zip(a,b))
source.save(ROOT/'limestone-color.jpg',quality=93,optimize=True)
gray=source.convert('L').filter(ImageFilter.GaussianBlur(1.4)).resize((512,512),Image.Resampling.LANCZOS)
height=gray.load();normal=Image.new('RGB',gray.size);n=normal.load()
for y in range(512):
    for x in range(512):
        dx=(height[(x+1)%512,y]-height[(x-1)%512,y])/255*.8
        dy=(height[x,(y+1)%512]-height[x,(y-1)%512])/255*.8
        length=math.sqrt(dx*dx+dy*dy+1)
        n[x,y]=(round((-dx/length*.5+.5)*255),round((-dy/length*.5+.5)*255),round((1/length*.5+.5)*255))
normal.save(ROOT/'limestone-normal.png',optimize=True)
wood=Image.open(ROOT/'woodland-master.png').convert('RGB')
wood.save(ROOT/'woodland-native.jpg',quality=96,optimize=True)
sky=Image.open(ROOT/'woodland-native.jpg').convert('RGBA').crop((0,0,wood.width,64))
alpha=Image.new('L',sky.size);ap=alpha.load()
for y in range(64):
    t=y/63;value=round((t*t*(3-2*t))*255)
    for x in range(sky.width):ap[x,y]=value
sky.putalpha(alpha);sky.save(ROOT/'woodland-sky-strip.png',optimize=True)
manifest=json.loads((ROOT/'manifest.json').read_text())
manifest['version']=2
manifest['materials']={'color':'limestone-color.jpg','normal':'limestone-normal.png','woodland':'woodland-native.jpg'}
manifest['materialRGBABytes']=sum(Image.open(ROOT/f).width*Image.open(ROOT/f).height*4 for f in manifest['materials'].values())
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps(manifest['materials'],ensure_ascii=False));print('材料解码估算：',manifest['materialRGBABytes'])
