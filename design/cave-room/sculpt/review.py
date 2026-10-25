from pathlib import Path
from PIL import Image
import json
import shutil

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'node_modules/.cache/cave-sculpt-study'
NEW=OUT/'sculpt-depth'
BASE=OUT/'baseline'
OUT.mkdir(parents=True,exist_ok=True)
frames=[]
for i in range(13):
    a=Image.open(BASE/f'turn-{i:02}.png').convert('RGB').resize((300,534),Image.Resampling.LANCZOS)
    b=Image.open(NEW/f'turn-{i:02}.png').convert('RGB').resize((300,534),Image.Resampling.LANCZOS)
    pair=Image.new('RGB',(608,534),(16,23,28))
    pair.paste(a,(0,0));pair.paste(b,(308,0));frames.append(pair)
frames=frames+list(reversed(frames[1:-1]))
frames[0].save(OUT/'turn-comparison.gif',save_all=True,append_images=frames[1:],duration=150,loop=0,optimize=True)
html='''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DEEPTAPE · 厚岩雕刻研究</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#111b20;color:#e0e2d9;font:15px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;line-height:1.7}main{max-width:1050px;margin:auto;padding:48px 24px 70px}header{border-bottom:1px solid #32454d;padding-bottom:28px;margin-bottom:28px}.tag{color:#a4c7c0;font:11px monospace;letter-spacing:2px}h1{font-size:34px;line-height:1.3;margin:14px 0}h2{font-size:21px;margin:0 0 10px}p{color:#afbebf;margin:12px 0}.status{color:#c8bba0}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}button,a.action{font:inherit;text-decoration:none;cursor:pointer;color:#d5e3da;background:#1c3036;border:1px solid #456065;padding:10px 16px;border-radius:4px}button:focus-visible,a:focus-visible{outline:2px solid #e0c8a0;outline-offset:3px}button.active,a.primary{background:#b8cfc6;color:#152b2e;border-color:#b8cfc6}section{margin:28px 0;padding:24px;border:1px solid #2b4149;background:#15232a;border-radius:6px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pair figure{margin:0;text-align:center}figcaption{font-size:13px;color:#b3c2c0;margin-bottom:10px}.pair img{max-width:100%;width:375px;height:auto;background:#050c10}.proof{display:grid;grid-template-columns:1.6fr 1fr;gap:24px;align-items:start}.proof img{width:100%;height:auto}.proof figure{margin:0}.criteria p{margin:16px 0}small{color:#8babae}footer{font-size:12px;color:#8caaaa}a{color:#b6d8cc}@media(max-width:650px){main{padding:28px 14px}h1{font-size:27px}section{padding:16px}.pair{gap:8px}.proof{display:block}.proof figure{margin:20px 0}}
</style></head><body><main>
<header><div class="tag">DEEPTAPE / ROCK SCULPT STUDY</div><h1>先让岩壁成为有厚度的东西。</h1><p>不再用“有法线”当作体积合格。矿物断面方向保留，先把厚断口、凹槽和遮挡做成立，再处理细纹理。</p><p class="status">手机已能跑的 v1.0.20 保留。本页是独立实验，不是美术定稿，也没有替换正式地图。</p><div class="actions"><a class="action primary" href="live/game.html">实际游戏里试跑实验</a><a class="action" href="../../../design/deeptape/game.html">打开原基线游戏</a></div></header>
<section><h2>同源实际画面对照</h2><p>原潜水员、HUD、水体手电和正在运行的游戏模拟。不为实验另加摄影棚灯；视点来自同一洞室位置。</p><div class="actions"><button class="active" data-site="0">断冠</button><button data-site="1">左壁</button><button data-site="2">右壁</button></div><div class="pair" style="margin-top:22px"><figure><figcaption>原基线 · 仍保留在手机版本</figcaption><img id="before" src="baseline/site-0.png" alt="原基线实际游戏"></figure><figure><figcaption>厚岩雕刻实验 · 尚未过美术验收</figcaption><img id="after" src="sculpt-depth/site-0.png" alt="独立雕刻实验实际游戏"></figure></div></section>
<section><h2>不靠花纹证明体积</h2><div class="proof"><figure><figcaption>同位置转灯：左为原基线，右为实验</figcaption><img src="turn-comparison.gif" alt="两个版本实际游戏的转灯对照动画"></figure><figure><figcaption>实验去掉纹理，只留单色材质</figcaption><img src="sculpt-depth/untextured.png" alt="单色材质的实际游戏体积检查"></figure></div><p>法线和高度来自同一份雕刻表面；色图剥离固定明暗。前面和真实侧面的投影共同形成轮廓，碰撞、手电与绳索使用对应轮廓。</p></section>
<section class="criteria"><h2>制作方向与自己的验收门槛</h2><p>造型：硬断口与水蚀凹边混合，大弯、破口和细碎边缘分尺度处理。不是把所有直线都变成均匀波浪，也不是在边缘加随机锯齿。</p><p>体积：突出、内凹、厚侧面和深处岩面形成遮挡。去掉材质后仍要读出厚度，不能靠描一条黑线充当岩块接缝。</p><p>构图：左壁用倾斜长岩带，右壁用悬垂厚块，断冠成为独立地标。保留深黑空腔，不把远景铺成一整面后墙。</p><p>继续改进：实验仍偏光滑，部分转折和局部阴影显得人为。下一步要统一自然断裂与侵蚀的语言，补中尺度凹槽和表面颗粒，并验证多层遮挡；不是再叠一张石头花纹。</p></section>
<footer>已检查：实际游戏转灯/移动/扣氧，轮廓与资源一致性。独立实验不写正常案件存档。使用同样四张图的尺寸与纹理数量，不代表真实手机帧率已验收。当前是单层可见深度烘焙，不是完整实时三维洞穴。</footer>
</main><script>for(const b of document.querySelectorAll('[data-site]'))b.onclick=()=>{for(const a of document.querySelectorAll('[data-site]'))a.classList.toggle('active',a===b);document.getElementById('before').src='baseline/site-'+b.dataset.site+'.png';document.getElementById('after').src='sculpt-depth/site-'+b.dataset.site+'.png';};</script></body></html>'''
(OUT/'index.html').write_text(html)
print('Static sculpt review:',OUT/'index.html')
