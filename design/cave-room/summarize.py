from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

WORKSPACE=Path(__file__).resolve().parents[2]
ROOT=(WORKSPACE/(sys.argv[1] if len(sys.argv)>1 else 'node_modules/.cache/cave-room-preview')).resolve()
if WORKSPACE not in ROOT.parents:
    raise ValueError('Output must remain inside the workspace')
font_path='/System/Library/Fonts/STHeiti Medium.ttc'
font=lambda n:ImageFont.truetype(font_path,n)
labels=['洞口看断冠','靠近左侧岩体','右侧回看']
canvas=Image.new('RGB',(1215,818),'#10181c');draw=ImageDraw.Draw(canvas)
draw.text((12,10),'保留岩体基线：投影受光与计算范围优化',font=font(24),fill='#dedbcf')
draw.text((12,43),'同一洞室、原配色与贴图 / 实际游戏画面 / 非美术定稿',font=font(13),fill='#aab8b0')
for i,label in enumerate(labels):
    draw.text((i*405+8,78),label,font=font(19),fill='#d1c4a7')
    image=Image.open(ROOT/('site-'+str(i)+'.png')).convert('RGB').resize((390,694),Image.Resampling.LANCZOS)
    canvas.paste(image,(i*405+8,112))
canvas.save(ROOT/'room-comparison.png')
frames=[Image.open(ROOT/('motion-'+str(i).zfill(2)+'.png')).convert('RGB').resize((375,667),Image.Resampling.LANCZOS) for i in range(12)]
frames+=frames[-2:0:-1]
frames[0].save(ROOT/'moving-light.gif',save_all=True,append_images=frames[1:],duration=110,loop=0,optimize=True)
print('Updated actual runtime gallery, preserving committed reference images:',ROOT)
