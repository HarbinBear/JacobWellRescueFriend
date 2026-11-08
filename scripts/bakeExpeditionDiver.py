from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import random,json
ROOT=Path(__file__).resolve().parents[1]/'design/continuous-world/assets'
random.seed(26110912)
parts={}
def make(name,w,h,paint):
    scale=4
    im=Image.new('RGBA',(w*scale,h*scale));d=ImageDraw.Draw(im)
    def poly(p,c):d.polygon([(int(x*scale),int(y*scale)) for x,y in p],fill=c)
    def rect(b,c,r=0):
        box=tuple(int(x*scale) for x in b)
        if r:d.rounded_rectangle(box,radius=int(r*scale),fill=c)
        else:d.rectangle(box,fill=c)
    def line(p,c,width=1):d.line([(int(x*scale),int(y*scale)) for x,y in p],fill=c,width=max(1,int(width*scale)),joint='curve')
    def ellipse(b,c):d.ellipse(tuple(int(x*scale) for x in b),fill=c)
    paint(poly,rect,line,ellipse)
    px=im.load();noise=Image.effect_noise(im.size,12).load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]
            if a:
                v=(noise[x,y]-128)*.38;px[x,y]=(max(0,min(255,int(r+v))),max(0,min(255,int(g+v))),max(0,min(255,int(b+v))),a)
    im.save(ROOT/('diver-'+name+'.png'),optimize=True);parts[name]={'file':'diver-'+name+'.png','width':w,'height':h,'scale':scale}

def head(p,r,l,e):
    p([(7,8),(23,5),(31,13),(31,28),(26,37),(14,39),(8,31),(6,20)],'#bc8c66')
    p([(15,8),(25,9),(28,17),(29,28),(24,34),(17,35),(13,28),(13,16)],'#d8ad80')
    p([(27,19),(34,25),(29,27),(29,31),(25,34),(23,31)],'#d1a277')
    e((6,20,13,29),'#b88260');l([(10,23),(11,27)],'#895c48',1)
    p([(5,21),(3,13),(7,5),(16,2),(23,3),(29,7),(32,15),(27,17),(26,11),(21,12),(16,8),(13,13),(9,13),(9,21)],'#293b35')
    p([(5,12),(10,5),(21,4),(26,8),(13,7),(8,15)],'#3f5143');l([(9,6),(19,4)],'#7b7d5c',1)
    p([(16,28),(26,29),(28,32),(24,36),(18,36),(13,32)],'#8b7660')
    l([(25,31),(29,31)],'#6b4d3b',1);l([(23,32),(26,33)],'#dcac7b',1)
    r((19,17,31,24),'#364f46',3);r((21,18,30,23),'#a3c3ae',2)
    l([(22,18),(28,18)],'#d9e5c9',1);l([(25,21),(28,21)],'#435d49',1)
    l([(7,19),(21,20)],'#557667',2);r((13,37,23,45),'#c0976b',2)

def torso(p,r,l,e):
    p([(15,3),(27,3),(34,10),(43,14),(42,40),(36,53),(9,53),(5,39),(5,16),(11,10)],'#223b36')
    p([(10,14),(17,9),(28,9),(35,16),(34,43),(28,50),(12,47)],'#547561')
    p([(6,15),(11,12),(13,43),(7,39)],'#b18a52');p([(34,13),(40,17),(39,40),(34,44)],'#a68550')
    p([(17,4),(23,8),(28,4),(29,11),(24,15),(15,9)],'#324b41')
    l([(20,12),(22,45)],'#b4aa7b',1.5);l([(23,13),(24,45)],'#233b33',1)
    r((10,27,18,37),'#728167',2);l([(11,28),(18,28)],'#b1ad78',1)
    r((27,23,34,34),'#657d64',2);l([(28,25),(34,25)],'#b1ad78',1)
    r((9,45,36,51),'#283e35',1);r((20,46,25,50),'#cfbc83',1)
    l([(11,16),(11,24)],'#a4ad82',1);l([(33,15),(33,21)],'#a4ad82',1)
    r((25,34,34,42),'#2b4940',1);l([(28,37),(33,37)],'#c1ad6f',1)
    e((4,15,11,27),'#344d41');e((34,16,42,28),'#405c49')

def upperarm(p,r,l,e):
    p([(3,2),(13,2),(17,8),(15,28),(11,33),(3,31),(1,24)],'#365347')
    p([(3,4),(10,3),(11,29),(5,30)],'#6a8062');r((3,6,15,11),'#ac8954',2)
    l([(4,13),(4,24)],'#a5ad83',1);p([(11,21),(15,19),(14,29),(10,32)],'#2d493e')

def forearm(p,r,l,e):
    p([(3,2),(12,2),(14,8),(11,29),(3,29),(1,10)],'#36574a')
    p([(4,4),(8,4),(8,24),(4,27)],'#6d8468');r((3,21,11,27),'#213d35',1)
    r((7,17,14,23),'#b5b18a',1);r((8,18,13,22),'#344b3c',1);l([(9,19),(12,19)],'#ccd9ba',1)

def hand(p,r,l,e):
    p([(3,1),(9,1),(12,5),(11,13),(8,15),(3,13),(1,7)],'#c49d72');p([(4,3),(9,3),(10,11),(7,13),(4,11)],'#d8b284')
    l([(7,6),(11,8)],'#9b775b',1)

def thigh(p,r,l,e):
    p([(4,2),(18,2),(20,10),(16,32),(7,35),(2,25)],'#2e4b3e')
    p([(6,3),(11,3),(10,31),(6,29)],'#657e5f');p([(14,6),(18,8),(15,26),(12,28)],'#415e48')
    r((11,8,19,19),'#748169',2);l([(12,9),(18,9)],'#ada77b',1)
    l([(5,5),(4,20)],'#91a17a',1)

def calf(p,r,l,e):
    p([(4,2),(15,2),(16,9),(11,32),(4,32),(2,13)],'#2a483b')
    p([(5,5),(9,3),(10,24),(6,28)],'#5b775a');r((3,3,15,10),'#405e47',3)
    l([(4,7),(12,6)],'#7d926c',1);r((4,27,11,33),'#223e34',1)

def tank(p,r,l,e):
    r((5,6,19,48),'#a4b7a1',6);e((5,3,19,15),'#c5d0b6');r((10,1,14,7),'#a28d57',1)
    r((5,23,19,29),'#435f4c');r((5,39,19,44),'#455f49');l([(8,12),(8,44)],'#d8dcc0',2);l([(18,12),(18,41)],'#78917a',1)
    l([(12,3),(25,8),(27,16),(22,26)],'#374f41',2)

def fin(p,r,l,e):
    p([(2,6),(9,2),(18,3),(24,6),(40,7),(50,12),(48,17),(22,17),(12,15),(3,14)],'#294b40')
    p([(17,5),(25,9),(44,10),(48,12),(43,15),(24,14)],'#587a64');l([(19,8),(44,12)],'#9aa887',1)
    r((2,6,13,14),'#3c5b4b',3);l([(5,7),(10,7)],'#b3b78b',1)

for name,w,h,fn in [('head',38,46,head),('torso',46,56,torso),('upperarm',18,35,upperarm),('forearm',16,33,forearm),('hand',14,17,hand),('thigh',22,37,thigh),('calf',18,36,calf),('tank',29,52,tank),('fin',54,20,fin)]:make(name,w,h,fn)
(ROOT/'diver-rig.json').write_text(json.dumps({'version':1,'bodyHeightWorld':83,'parts':parts,'production':'Single layered humanoid asset rig, authored limb motion, fins keep physical size until explicitly unequipped.'},ensure_ascii=False,indent=2))
manifest_path=ROOT/'manifest.json'
manifest=json.loads(manifest_path.read_text())
manifest['runtimeAssets']=['woodland-native.jpg','woodland-sky-strip.png','limestone-color.jpg','limestone-normal.png','shop.png','tent.png','board.png','air.png','fish.png']+[p['file'] for p in parts.values()]
manifest['runtimeBytes']=sum((ROOT/f).stat().st_size for f in manifest['runtimeAssets'])
manifest['decodedRGBABytes']=sum(Image.open(ROOT/f).width*Image.open(ROOT/f).height*4 for f in manifest['runtimeAssets'])
manifest['sourcesNotRuntime']=['woodland-master.png','limestone-material-master.png']
manifest['retainedFallbackAssets']=['bank-left.png','bank-right.png','woodland.jpg','rock-grain.jpg']
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('潜水员贴图层生成：',list(parts))
