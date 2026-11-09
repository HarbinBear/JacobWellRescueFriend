from pathlib import Path
from PIL import Image
import shutil,json
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'design/continuous-world/assets'
OUT=ROOT/'images/shore'
OUT.mkdir(parents=True,exist_ok=True)
for name in ['woodland-native.jpg','woodland-sky-strip.png','shop.png','tent.png','board.png','air.png','fish.png']:
    shutil.copyfile(SOURCE/name,OUT/name)
# Opaque color is clipped by the existing bank collision profile at runtime.
# This keeps the accepted shore image without shipping two large RGBA masks.
for name in ['bank-left','bank-right']:
    Image.open(SOURCE/(name+'.png')).convert('RGB').save(OUT/(name+'.jpg'),quality=94,optimize=True)
# The old night scene remains available; its RGB background needs no PNG alpha.
# Retain the original PNG in the repository but exclude it from the phone pack.
Image.open(ROOT/'images/home/living_room_night.png').convert('RGB').save(ROOT/'images/home/living_room_night.jpg',quality=96,optimize=True)
for name in ['girl_stand','girl_talk','girl_playful']:
    Image.open(ROOT/('images/home/characters/'+name+'.png')).convert('RGB').save(ROOT/('images/home/characters/'+name+'.jpg'),quality=96,optimize=True)
print(json.dumps({'shoreRuntimeBytes':sum(p.stat().st_size for p in OUT.iterdir()),'nightBackgroundBytes':(ROOT/'images/home/living_room_night.jpg').stat().st_size,'sourceArtChanged':False},ensure_ascii=False,indent=2))
