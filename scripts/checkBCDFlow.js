// 实际 BCD、连续岸水物理和 HUD 条件；只隔离画布/音频/持久存储。
const fs = require('fs'), path = require('path'), ts = require('typescript'), assert = require('assert/strict');
const ROOT = path.resolve(__dirname, '..'), modules = new Map(), storage = new Map(), noop = () => 0;
global.GameGlobal = {}; global.wx = {};
const visual = new Proxy({}, { get: () => noop });
function load(file) {
    file = path.posix.normalize(file);
    if ((file.startsWith('src/render/') && file !== 'src/render/RenderBCD') || file.startsWith('src/audio/')) return visual;
    if (file === 'src/core/SaveStorage') return { saveJSON: (k, v) => { storage.set(k, JSON.parse(JSON.stringify(v))); return true; },
        loadJSON: k => storage.get(k), removeKey: k => storage.delete(k) };
    if (!fs.existsSync(path.join(ROOT, file + '.ts'))) file += '/index';
    if (modules.has(file)) return modules.get(file).exports;
    const m = { exports: {} }; modules.set(file, m);
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS }
    }).outputText;
    new Function('module', 'exports', 'require', code)(m, m.exports, name => load(path.posix.join(path.posix.dirname(file), name)));
    return m.exports;
}
const { state, player, input } = load('src/core/state'), { CONFIG } = load('src/core/config');
const geometry = load('src/world/continuous/Geometry'), map = load('src/world/map'), bcd = load('src/logic/BCDSystem');
const breath = load('src/logic/BreathSystem'), render = load('src/render/RenderBCD'), drive = load('src/logic/DriveMode');
const runtime = load('src/world/continuous/Runtime');
load('src/extraction/core/ExtractionState').ensureExtractionState();
CONFIG.karst.geometryMode = 'volume'; CONFIG.continuousWorld = true; CONFIG.infiniteO2 = false;
// 隔离呼吸的周期耗气/浮力，只观察BCD；仍使用真实排气粒子推进。
CONFIG.breath.enabled = false;
state.mazeRescue = map.generateMazeMap(26110941); state.screen = 'mazeRescue';
const maze = state.mazeRescue, w = geometry.attachWorldTerrain(maze);
maze.phase = 'play'; maze.startTime = Date.now(); maze.maxDepthAllowed = 120;
state.npc.active = false; state.fishEnemies = [];
const close = (a, b, message) => assert(Math.abs(a - b) < 1e-8, message + ': ' + a + ' / ' + b);
function setup(mode = 'full', location = 'shore') {
    drive.resetDriveInput(); input.move = 0; state.fishBite = null;
    const x = location === 'shore' ? w.originX - 1360 : w.originX;
    const y = location === 'shore' ? geometry.groundAt(x) - geometry.layout.footReach : w.surfaceY + 18;
    Object.assign(player, { x, y, vx: 0, vy: 0, angle: 0, targetAngle: 0, o2: 100, o2Max: 100 });
    Object.assign(w, { wet: geometry.bodyWet(y), headWet: location !== 'shore', grounded: location === 'shore',
        landBlend: location === 'shore' ? 1 : 0, resting: false, panel: null, hidden: false, pendingAction: null });
    CONFIG.bcd.initialFillMode = mode; bcd.resetBCDSystem(); breath.resetBreathSystem();
}
function tick(frames) { for (let i = 0; i < frames; i++) runtime.tickWorld(); }
function bcdOnly(frames) { for (let i = 0; i < frames; i++) bcd.updateBCDSystem(1 / 60); }
const report = {};

// 满气阻碍入水；岸上先排空，再以同一水面位置自然入水，无额外推进力。
setup('full', 'surface'); tick(120); const fullY = player.y;
setup(); const shoreY = player.y; assert(render.isBCDUIVisible(), '岸上必须能看到BCD控制');
bcd.setBCDDeflate(true); tick(360); bcd.releaseBCDControls();
close(bcd.getBCDRuntime().gasNL, 0, '岸上可排空满背心'); close(player.y, shoreY, '岸上排气不能推拉角色');
close(player.o2, 100, '排气不消耗气瓶'); assert.equal(breath.getBreathBubbles().length, 0, '空气中的阀口不生成水泡');
Object.assign(player, { x: w.originX, y: w.surfaceY + 18, vx: 0, vy: 0 });
Object.assign(w, { wet: 1, headWet: true, grounded: false, landBlend: 0 }); tick(120);
assert(player.y > fullY + 30 && player.y > w.surfaceY + 40, '岸上排空后应能自然沉入水下');
report.entry = { fullDepth: fullY - w.surfaceY, ventedDepth: player.y - w.surfaceY };

// 在浅滩和水面仍显示按钮；浮力只跟身体入水比例，与头部开关无关。
for (const offset of [-40, -10, 0, 10, 35]) {
    setup(); player.x = w.originX; player.y = w.surfaceY + offset; w.headWet = false;
    assert(render.isBCDUIVisible(), '浅滩/头出水不能隐藏BCD'); bcd.updateBCDSystem(1 / 60);
    const p = bcd.getBCDRuntime().pressureAtm, wet = geometry.bodyWet(player.y);
    const fullForce = CONFIG.bcd.baseSinkAccel - (bcd.getBCDRuntime().volumeL + CONFIG.bcd.suitLiftSurfaceL / p) * CONFIG.bcd.liftAccelPerLiter;
    close(bcd.computeBCDBuoyancyAccel(), fullForce * wet, '浮力只能按浸水程度作用一次');
}
setup(); player.vy = -8; bcdOnly(60);
assert.equal(bcd.getBCDRuntime().ascentWarn, 0, '岸上运动不能触发失控上浮告警');
close(bcd.computeBCDBuoyancyAccel(), 0, '干身没有BCD浮力');

// 头仍在水面之上、阀口已入水：气泡正常上浮；阀口出水则不再生成。
setup(); Object.assign(player, { x: w.originX, y: w.surfaceY, angle: Math.PI, targetAngle: Math.PI }); input.targetAngle = Math.PI;
bcd.setBCDDeflate(true); bcdOnly(6); const bubbles = breath.getBreathBubbles();
assert(bubbles.length > 0 && bubbles.every(b => b.y > w.surfaceY), '水下阀口应正常排气');
const first = bubbles[0], oldBubbleY = first.y; bcd.releaseBCDControls();
w.grounded = false; w.landBlend = 0; w.headWet = false; tick(1);
assert(first.y < oldBubbleY, '头出水时排气泡仍应运动');
setup(); Object.assign(player, { x: w.originX, y: w.surfaceY, angle: 0 });
bcd.setBCDDeflate(true); bcdOnly(60); assert.equal(breath.getBreathBubbles().length, 0, '阀口在空气中不能冒水泡');

// 岸上充气按帧结账，不能拖到下潜才扣；排空后无气瓶不能凭空充气。
setup('empty'); bcd.setBCDInflate(true); tick(120); bcd.releaseBCDControls();
close(bcd.getBCDRuntime().gasNL, 1, '岸上两秒充气体积'); close(100 - player.o2, .3, '岸上充气消耗气瓶');
close(bcd.consumeBCDO2(), 0, '每帧已结算，不留欠账'); close(bcd.getBCDO2SpentTotal(), .3, '累计耗气与气瓶扣减一致');
setup('empty'); player.o2 = 0; bcd.setBCDInflate(true); tick(60);
close(bcd.getBCDRuntime().gasNL, 0, '空瓶不能充背心'); close(bcd.getBCDO2SpentTotal(), 0, '空瓶不能记虚假消耗');
setup('empty'); player.o2 = .001; bcd.setBCDInflate(true); bcdOnly(60);
close(bcd.getBCDRuntime().gasNL * CONFIG.bcd.o2PerNL, .001, '低余量只充入付得起的气');
close(bcd.consumeBCDO2(), .001, '未结算的余额不能重复使用'); close(bcd.consumeBCDO2(), 0, '消耗不能重复取走');

// 原水下控制：同体积在三倍压力下耗气三倍；双钮排气优先；轻点补足短脉冲。
setup('empty'); player.y = w.surfaceY + 20 * maze.mazeTileSize; bcd.setBCDInflate(true); bcdOnly(60);
close(bcd.getBCDRuntime().volumeL, .5, '水下充气流量保持'); close(bcd.consumeBCDO2(), .45, '深处气压正确计入耗气');
const gasBefore = bcd.getBCDRuntime().gasNL; bcd.setBCDDeflate(true); bcdOnly(12);
assert(bcd.getBCDRuntime().gasNL < gasBefore && !bcd.getBCDRuntime().inflating, '同时按下时排气优先');
close(bcd.consumeBCDO2(), 0, '排气优先不产生充气欠账');
setup('empty'); bcd.setBCDInflate(true); bcd.setBCDInflate(false); bcdOnly(30);
assert(bcd.getBCDRuntime().volumeL > .08 && bcd.getBCDRuntime().volumeL < .11, '轻点仍应补足一次小口充气');
const pulseGas = bcd.getBCDRuntime().gasNL; bcdOnly(30); close(bcd.getBCDRuntime().gasNL, pulseGas, '短脉冲不能持续充气');
w.panel = 'shop'; assert(!render.isBCDUIVisible()); bcd.setBCDInflate(true); bcd.updateBCDSystem(1 / 60);
assert(!bcd.getBCDRuntime().inflateHeld && !bcd.getBCDRuntime().active, '面板阻止遗留充气');
w.panel = null;

// 超深惩罚只放大呼吸，BCD已经按真实气压算过气量。
setup('empty', 'surface'); maze.maxDepthAllowed = 0; const originalConsume = breath.consumeBreathO2;
breath.consumeBreathO2 = () => .04; bcd.setBCDInflate(true); tick(1); breath.consumeBreathO2 = originalConsume;
close(100 - player.o2, bcd.getBCDO2SpentTotal() + .06, '超深倍率不能重复放大BCD气账');

// 无连续岸线的原迷宫保持全身水下行为。
maze.continuous = null; player.y = maze.mazeTileSize * 5; CONFIG.bcd.initialFillMode = 'full'; bcd.resetBCDSystem(); bcd.updateBCDSystem(1 / 60);
assert(bcd.computeBCDBuoyancyAccel() < 0 && render.isBCDUIVisible(), '旧水下模式仍有浮力与控件');
console.log('通过：满气→岸排气→入水、浅滩/水面操作、湿身浮力、阀口气泡、岸上/深处/空瓶气账、原水下短脉冲与双钮优先。');
console.log(JSON.stringify(report, null, 2));
