const fs = require('fs'), path = require('path'), ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []);
}
function build(review = process.argv.includes('--karst')) {
    const OUT = path.join(ROOT, review ? 'node_modules/.cache/karst-review/live' : 'node_modules/.cache/continuous-gameplay');
    const fixtures = ['continuousGameplayFixtures.ts'].concat(review ? ['karstReviewFixtures.ts'] : []);
    const files = [path.join(ROOT, 'game.ts'), ...walk(path.join(ROOT, 'src')), ...fixtures.map(f => path.join(ROOT, 'scripts', f))];
    const factories = files.map(file => {
        const id = '/' + path.relative(ROOT, file).split(path.sep).join('/').slice(0, -3), source = fs.readFileSync(file, 'utf8');
        const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
        return JSON.stringify(id) + ':function(module,exports,require){' + code + '}';
    });
    const bundle = `(()=>{const factories={${factories.join(',')}},cache=new Map();function load(id,from='/game'){if(id[0]==='.')id=from.slice(0,from.lastIndexOf('/')+1)+id;const parts=[];for(const p of id.split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}id='/'+parts.join('/');if(!factories[id])id+='/index';if(!factories[id])throw Error('Missing module '+id);if(!cache.has(id)){const module={exports:{}};cache.set(id,module);factories[id](module,module.exports,name=>load(name,id))}return cache.get(id).exports;}
 const {CONFIG}=load('/src/core/config');CONFIG.audio.cloud.enabled=false;load('/game');
 const core=load('/src/core/state'),runtime=load('/src/world/continuous/Runtime'),geometry=load('/src/world/continuous/Geometry'),save=load('/src/world/continuous/WorldSave'),render=load('/src/world/continuous/RenderWorld'),hud=load('/src/world/continuous/WorldHUD');
 window.DeepTapeGame={...core,music:load('/src/audio/AdaptiveMusic'),world:{runtime:{...runtime,...load('/scripts/continuousGameplayFixtures')},geometry,save,render,hud,layout:geometry.layout,queries:load('/src/world/continuous/Routes')},cave:{karst:load('/src/render/RenderKarst'),terrain:load('/src/world/KarstTerrain'),light:load('/src/render/RenderLight'),draw:load('/src/render/Render').draw,config:CONFIG,collision:load('/src/logic/Collision').checkMazeCollision,geometry:load('/src/world/RockGeometry')},ui:{inventory:load('/src/extraction/render/InventoryHUD'),bagPage:load('/src/extraction/render/BagFullPage'),layout:load('/src/core/UILayout').getUILayout,orientation:load('/src/render/RenderOrientation').getScreenOrientationButton,bcdRuntime:load('/src/logic/BCDSystem').getBCDRuntime,decoRuntime:load('/src/logic/DecompressionSystem').getDecoRuntime,menu:load('/src/render/RenderMenu').getMenuButtonRects,menuConfirm:load('/src/render/RenderMenu').getNewGameConfirmRects},camera:load('/src/logic/CameraLogic'),interactions:{rope:load('/src/logic/Rope'),wheel:load('/src/logic/RopeWheel'),targets:load('/src/logic/ActionTargets'),work:load('/src/logic/Interaction'),fishGeometry:load('/src/logic/FishGeometry'),layout:load('/src/logic/InteractionLayout')},menu:runtime.exitContinuousWorld,start:()=>load('/src/logic/MazeLogic').resetMazeLogic(),source:'actual-mobile-src'${review ? ",review:load('/scripts/karstReviewFixtures')" : ''}};
 })();`;
    new Function(bundle); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'game-runtime.js'), bundle);
    const prefix = path.relative(OUT, ROOT).split(path.sep).join('/') + '/';
    let html = fs.readFileSync(path.join(ROOT, 'design/continuous-world/preview.html'), 'utf8').replaceAll('__ROOT_PREFIX__', prefix).replaceAll('shore-world-review/', review ? 'karst-gameplay-review/' : 'continuous-gameplay-review/');
    html = html.replace('<title>林泉营地 M2 · 连续岩壁与稳定性</title>', review ? '<title>水下溶洞 · 当前手机版实装评审</title>' : '<title>林泉营地 · 手机版主流程</title>')
        .replace('M2：原画构图、连续石灰岩、光照与深洞稳定性。', '手机版主流程：连续溶洞、同源法线与水下光路；原潜水员及岸水玩法。')
        .replace('独立实验，未替换手机已跑通的版本。', '直接编译当前 game.ts 和 src，不做临时源码替换。')
        .replace('新版测试档直接重开，不做旧档迁移。', '从主菜单进入营地；保留同种子与原墙面引用。');
    if (review) {
        const aside = `<aside><small>KARST / ACTUAL GAME</small><h1>岩壁，不再是<br>一排圆石。</h1><p class="rule">连续岩体、非对称沉积。<br>近处显色，远处蓝绿衰减。<br>黑暗仍是黑暗。</p><p>当前手机版代码与贴图，非另一套演示。<br>模拟持续运行；WASD 或拖动游动。<br>下方定位按钮仅供浏览器美术评审。</p><button onclick="DeepTapeGame.review.inspectKarstSite(0)">观察主沉积</button><button onclick="DeepTapeGame.review.inspectKarstSite(1)">观察另一洞室</button><button onclick="DeepTapeGame.review.inspectKarstSite(2)">观察洞道转折</button><button onclick="DeepTapeGame.review.rotateKarstLight(-.16)">向左转灯</button><button onclick="DeepTapeGame.review.rotateKarstLight(.16)">向右转灯</button><button onclick="DeepTapeGame.review.freezeKarstReview()">定格 / 继续游动</button><button onclick="DeepTapeGame.cave.karst.inspectKarst(0)">正常矿物材质</button><button onclick="DeepTapeGame.cave.karst.inspectKarst(1)">单色体积检查</button><button onclick="DeepTapeGame.state.flashlightOn=!DeepTapeGame.state.flashlightOn">开关手电</button><button id="menu">返回游戏主菜单</button><output id="phase" role="status">当前版水下评审</output><p class="quiet">2.5D 同源高度与法线，不是全三维路径追踪。<br>手机 GPU 与主观美术仍需真机验收。<br>没有额外铺一堵抢眼的背景墙。</p><button id="overview" hidden></button><button id="save" hidden></button><button id="tow" hidden></button><button id="medical" hidden></button></aside>`;
        html = html.replace(/<aside>[\s\S]*?<\/aside>/, aside).replace('</style>', 'body{background:#091415;color:#cad9d2}p{color:#91aaa0}small{color:#bda77f}button{background:#122523;color:#d3dfd8;border-color:#3a5350}button:hover{background:#203b36}output{color:#93b7ad;border-color:#304842}.phone{border-color:#314d44;box-shadow:0 20px 70px #0007}.quiet{color:#769388}</style>');
        html = html.replace('</body>', '<script>DeepTapeGame.start();DeepTapeGame.review.inspectKarstSite(0);</script></body>');
    }
    fs.writeFileSync(path.join(OUT, 'game.html'), html);
    const report = { source: 'Actual mobile game.ts + src, no terrain/render source adapters', modules: files.length - fixtures.length,
        entry: path.relative(ROOT, path.join(OUT, 'game.html')), testFixturesOutsideMobilePack: true, packageBytes: require('./checkPackageBudget').audit().bytes };
    fs.writeFileSync(path.join(OUT, 'build.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); return report;
}
if (require.main === module) build();
module.exports = { build };
