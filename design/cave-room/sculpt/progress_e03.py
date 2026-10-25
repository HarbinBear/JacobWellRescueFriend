from pathlib import Path
from PIL import Image,ImageDraw
import json

ROOT=Path(__file__).resolve().parents[3]
CACHE=ROOT/'node_modules/.cache'
STUDY=CACHE/'cave-sculpt-study'
OLD=STUDY/'sculpt-e02-refined'
NEW=STUDY/'sculpt-e03-refined'
OUT=CACHE/'cave-forward-e03'
OUT.mkdir(parents=True,exist_ok=True)
frames=[]
for i in range(13):
    pair=Image.new('RGB',(608,534),(16,25,30))
    for offset,folder in [(0,OLD),(308,NEW)]:
        frame=Image.open(folder/f'turn-{i:02}.png').convert('RGB').resize((300,534),Image.Resampling.LANCZOS)
        pair.paste(frame,(offset,0))
    frames.append(pair)
frames+=list(reversed(frames[1:-1]))
frames[0].save(OUT/'turn.gif',save_all=True,append_images=frames[1:],duration=150,loop=0,optimize=True)
# Keep a compact actual-game visual anchor in Git, in addition to source/maps.
REFERENCE=Path(__file__).resolve().parent/'reference-e03'
REFERENCE.mkdir(exist_ok=True)
sheet=Image.new('RGB',(900,570),(16,25,30))
draw=ImageDraw.Draw(sheet)
for i in range(3):
    for row,folder in enumerate([OLD,NEW]):
        im=Image.open(folder/f'site-{i}.png').convert('RGB').resize((150,267),Image.Resampling.LANCZOS)
        x=i*300+row*150;sheet.paste(im,(x,28))
        draw.text((x+6,7),('E02' if row==0 else 'E03')+' / SITE '+str(i),fill=(196,217,203))
        detail=Image.open(folder/f'site-{i}.png').convert('RGB').crop((210,20,750,520)).resize((300,278),Image.Resampling.LANCZOS)
        if row==1:sheet.paste(detail,(i*300,292))
sheet.save(REFERENCE/'actual-game-comparison.png',optimize=True)
report=json.loads((Path(__file__).resolve().parent/'assets/report.json').read_text())
(REFERENCE/'scope.json').write_text(json.dumps({'old':'cave/sculpt-e02','new':'cave/sculpt-e03',
 'sites':[0,1,2],'scope':'Actual running game; top row full screenshots, bottom E03 detail; fixed observation placement, simulation not paused; desktop, not phone acceptance',
 'assetBytes':report['bytes'],'limitations':'Single visible-depth bake, not full realtime 3D'},indent=2))
html='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DEEPTAPE · E03厚岩进展</title><style>
*{box-sizing:border-box}body{margin:0;background:#111c22;color:#e1e2d9;font:15px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;line-height:1.75}main{max-width:1040px;margin:auto;padding:46px 22px}h1{font-size:32px;line-height:1.35}h2{font-size:21px;margin-top:0}p,small{color:#a9beba}section{padding:24px;border:1px solid #34505a;background:#182930;margin:24px 0;border-radius:5px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pair figure{margin:0;text-align:center}.pair img{width:375px;max-width:100%;height:auto}figcaption{font-size:13px;color:#b2c6bf;margin-bottom:12px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}button,a.action{padding:10px 15px;color:#d2e3d9;background:#213b40;border:1px solid #54756f;border-radius:3px;text-decoration:none;cursor:pointer;font:inherit}button.active,a.primary{color:#142d2c;background:#b6cec0}button:focus-visible,a:focus-visible{outline:2px solid #dfcba1;outline-offset:3px}.proof{display:grid;grid-template-columns:1.6fr 1fr;gap:24px}.proof figure{margin:0}.proof img{width:100%;height:auto}.versions{display:flex;gap:16px;flex-wrap:wrap}footer{font-size:12px;color:#8aa5a4}a{color:#b8d7c6}@media(max-width:640px){main{padding:26px 12px}h1{font-size:27px}section{padding:16px}.pair{gap:8px}.proof{display:block}.proof figure{margin-bottom:20px}}
</style></head><body><main><small>DEEPTAPE / E03 / E02 CHECKPOINT PRESERVED</small><h1>锁住这一轮进步，再推进厚岩结构。</h1><p>你认可的E02已留独立提交和回退点。本轮又做了侧面接触版、宽断面版和边界收敛版，分别留存，不把几遍试验混成同一个入口。</p><div class="actions"><a class="action primary" href="../cave-versions/sculpt-e03/source/node_modules/.cache/cave-sculpt-study/live/game.html">进入E03实际游戏</a><a class="action" href="../cave-versions/index.html">全部保留版本</a><a class="action" href="../cave-forward/index.html">上一轮E02进展页</a></div><p>手机仍是已跑通的v1.0.20。新版本是独立美术实验，不冒充手机已验证或最终定稿。</p>
<section><h2>同观察点实际游戏对照</h2><p>左E02，右E03。不是新写的展示渲染器，继续使用游戏原HUD、潜水员、氧气、浮力与水体手电。观察位置初始化相同，模拟持续运行，泡泡与呼吸不会像素对齐。</p><div class="actions"><button class="active" data-site="0">断冠</button><button data-site="1">左壁长倾面</button><button data-site="2">右壁破肩</button></div><div class="pair"><figure><figcaption>E02 · 你认可进步的回退版</figcaption><img id="old" src="../cave-sculpt-study/sculpt-e02-refined/site-0.png" alt="E02实际游戏"></figure><figure><figcaption>E03 · 宽断面、磨损侧面和接触层次</figcaption><img id="new" src="../cave-sculpt-study/sculpt-e03-refined/site-0.png" alt="E03实际游戏"></figure></div></section>
<section><h2>转灯与去色图检查</h2><div class="proof"><figure><figcaption>实际手电转动：左E02，右E03</figcaption><img src="turn.gif" alt="E02和E03转灯对照"></figure><figure><figcaption>E03统一单色，检验结构而非石纹</figcaption><img src="../cave-sculpt-study/sculpt-e03-refined/untextured.png" alt="E03单色受光"></figure></div></section>
<section><h2>这轮做了什么</h2><p>宽断面不再统一向中心鼓起，以手工不等高结构面和小范围磨损支持大形；左右岩壁与断冠的破肩和倾向分别组织。厚侧面由多段真实几何连接，露出的唇口、断面和根部有不同转折。</p><p>接触遮挡从同份可见深度和实际法线离线生成，斜平面不会自黑，水域不被当成遮挡物；它不是画死的手电阴影。凹口顶面增加真实多边形裁剪与无漏面校验，但不能声称原画面所有人为碎折都是三角面越界造成。</p><p>新增的结构、侧面与遮挡都是离线烘焙，没有追加运行图片或GPU采样次数。四图约1.33MiB，手机原包约7.75MiB未变；法线和材质仍是误差受控的有损导出，高度与边缘覆盖率保留8位。</p></section>
<section><h2>验收与未完成部分</h2><p>实际游戏进入、移动、开始和结束铺绳、绳段避岩、退出恢复；无performance、资源释放及上下文恢复均有检查。手机GPU与连续帧率尚未验收，不用桌面测试代替手机结论。</p><p>这不是最终美术。断面层次更明确，但侧面仍有人工折面，深处岩体与近景的整体衔接还需推进；仍是单层可见深度烘焙，不是完整实时3D。下一轮继续以整体构造与多层遮挡为主，不靠增加纹理细节盖住问题。</p><div class="versions"><a href="../cave-versions/sculpt-e02/source/node_modules/.cache/cave-sculpt-study/live/game.html">E02回退版</a><a href="../cave-versions/sculpt-e03-contact/source/node_modules/.cache/cave-sculpt-study/live/game.html">E03侧面接触版</a><a href="../cave-versions/sculpt-e03-masses/source/node_modules/.cache/cave-sculpt-study/live/game.html">E03宽断面版</a><a href="../cave-versions/sculpt-e03/source/node_modules/.cache/cave-sculpt-study/live/game.html">E03当前版</a></div></section>
<footer>每版源码与四张资产来自其固定Git标签，各自有独立实际游戏入口；不是几版共用当前贴图。旧标签不移动，手机基线与私人配置不改。所有提交本地留存，未推送远端；缓存不是备份，可从固定标签重建。</footer></main><script>for(const b of document.querySelectorAll('[data-site]'))b.onclick=()=>{for(const a of document.querySelectorAll('[data-site]'))a.classList.toggle('active',a===b);document.getElementById('old').src='../cave-sculpt-study/sculpt-e02-refined/site-'+b.dataset.site+'.png';document.getElementById('new').src='../cave-sculpt-study/sculpt-e03-refined/site-'+b.dataset.site+'.png';};</script></body></html>'''
(OUT/'index.html').write_text(html)
print(OUT/'index.html')
