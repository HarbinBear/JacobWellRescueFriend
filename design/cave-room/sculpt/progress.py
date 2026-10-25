from pathlib import Path
from PIL import Image
import json

ROOT=Path(__file__).resolve().parents[3]
CACHE=ROOT/'node_modules/.cache'
STUDY=CACHE/'cave-sculpt-study'
OLD=STUDY/'sculpt-depth'
NEW=STUDY/'sculpt-e02-refined'
OUT=CACHE/'cave-forward'
OUT.mkdir(parents=True,exist_ok=True)
frames=[]
for i in range(13):
    a=Image.open(OLD/f'turn-{i:02}.png').convert('RGB').resize((300,534),Image.Resampling.LANCZOS)
    b=Image.open(NEW/f'turn-{i:02}.png').convert('RGB').resize((300,534),Image.Resampling.LANCZOS)
    pair=Image.new('RGB',(608,534),(16,25,30));pair.paste(a,(0,0));pair.paste(b,(308,0));frames.append(pair)
frames+=list(reversed(frames[1:-1]))
frames[0].save(OUT/'turn.gif',save_all=True,append_images=frames[1:],duration=150,loop=0,optimize=True)
html='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DEEPTAPE · E02进展与版本留存</title><style>
*{box-sizing:border-box}body{margin:0;background:#111c22;color:#e1e2d9;font:15px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;line-height:1.75}main{max-width:1040px;margin:auto;padding:46px 22px}h1{font-size:32px;line-height:1.35}h2{font-size:21px;margin-top:0}p,small{color:#a9beba}section{padding:24px;border:1px solid #34505a;background:#182930;margin:24px 0;border-radius:5px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pair figure{margin:0;text-align:center}.pair img{width:375px;max-width:100%;height:auto}figcaption{font-size:13px;color:#b2c6bf;margin-bottom:12px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}button,a.action{padding:10px 15px;color:#d2e3d9;background:#213b40;border:1px solid #54756f;border-radius:3px;text-decoration:none;cursor:pointer;font:inherit}button.active,a.primary{color:#142d2c;background:#b6cec0}button:focus-visible,a:focus-visible{outline:2px solid #dfcba1;outline-offset:3px}.proof{display:grid;grid-template-columns:1.6fr 1fr;gap:24px}.proof figure{margin:0}.proof img{width:100%;height:auto}footer{font-size:12px;color:#8aa5a4}a{color:#b8d7c6}@media(max-width:640px){main{padding:26px 12px}h1{font-size:27px}section{padding:16px}.pair{gap:8px}.proof{display:block}.proof figure{margin-bottom:20px}}
</style></head><body><main><small>DEEPTAPE / E02 / PRESERVED CHECKPOINTS</small><h1>继续厚岩方向，旧版全部留下。</h1><p>先把大形保住，再让凹槽与有限裂缝参与受光。第一遍细碎凹凸太多，已独立留档；当前E02收敛版减少微起伏，保留主裂缝、局部破口与克制的层理。</p><div class="actions"><a class="action primary" href="../cave-versions/sculpt-e02/source/node_modules/.cache/cave-sculpt-study/live/game.html">实际游戏试跑E02</a><a class="action" href="../cave-versions/index.html">打开所有保留版本</a></div><p>手机仍保留已跑通的v1.0.20。本轮是独立实验，不冒充最终美术或真机性能验收。</p>
<section><h2>同观察点的实际游戏对照</h2><p>左侧是E01，右侧是E02。仍使用游戏的潜水员、HUD、水体手电和正常模拟；按同观察点初始化，模拟持续运行，不是像素级冻结截图。</p><div class="actions"><button class="active" data-site="0">断冠</button><button data-site="1">左壁</button><button data-site="2">右壁</button></div><div class="pair"><figure><figcaption>E01 · 原厚断面实验，固定回退点</figcaption><img id="old" src="../cave-sculpt-study/sculpt-depth/site-0.png" alt="E01实际游戏"></figure><figure><figcaption>E02 · 收敛后的凹槽与断口实验</figcaption><img id="new" src="../cave-sculpt-study/sculpt-e02-refined/site-0.png" alt="E02实际游戏"></figure></div></section>
<section><h2>转灯与单色检查</h2><div class="proof"><figure><figcaption>转动实际手电：左E01，右E02</figcaption><img src="turn.gif" alt="E01和E02转灯对照"></figure><figure><figcaption>E02去掉颜色纹理，观察凹槽与厚面</figcaption><img src="../cave-sculpt-study/sculpt-e02-refined/untextured.png" alt="E02单色受光验证"></figure></div><p>主裂缝是有限终止的真实深度槽，不是画死的黑线；新增起伏用相同表面的导数更新法线。轮廓局部破损也同步到实际碰撞、手电、锚点和绳索。</p></section>
<section><h2>当前结论与下一步</h2><p>这版缓解了过于光滑的表面，但整体断面和侧面的自然节奏仍未定稿。下一步继续优先组织岩体层次、断口与遮挡，而不是加更多纹理盖住问题。</p><p>实验四图约1.18MiB，未新增图片数量或解码内存。法线与材质采用有损但误差受控导出，高度与抗锯齿透明覆盖率仍保留8位精度。手机包体没有改变；大小通过不代表手机GPU帧率通过。</p><p>原美术、手机基线、E01、E02初稿和E02收敛版分别有Git提交与命名回退点。版本目录从各自标签重建独立资源，不共用当前贴图，也不切换工作分支。</p></section><footer>所有回退点为本地Git留存，未推送远端。缓存不是备份，可从固定标签重建。当前仍是单层可见深度烘焙，不是完整实时3D洞穴。</footer>
</main><script>for(const b of document.querySelectorAll('[data-site]'))b.onclick=()=>{for(const a of document.querySelectorAll('[data-site]'))a.classList.toggle('active',a===b);document.getElementById('old').src='../cave-sculpt-study/sculpt-depth/site-'+b.dataset.site+'.png';document.getElementById('new').src='../cave-sculpt-study/sculpt-e02-refined/site-'+b.dataset.site+'.png';};</script></body></html>'''
(OUT/'index.html').write_text(html)
print(OUT/'index.html')
