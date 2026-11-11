const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const moduleUnderTest = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../src/render/KarstVolumeStreaming.ts'), 'utf8');
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleUnderTest.exports);
const { planVolumeChunks } = moduleUnderTest.exports;
const terrain = { x: 0, y: 900, step: 12, cols: 1005, rows: 925 }, size = 48 * terrain.step;
const view = { x: 6000, y: 2400, halfW: 280, halfH: 500, aheadX: 0, aheadY: 0 };
const light = { x: 6000, y: 2400, radius: 780 };
const plan = planVolumeChunks(terrain, 48, view, light, 40);
assert(plan.some(r => r.shadow && !r.visible), '竖屏外仍需准备会遮挡手电的洞壁');
assert(plan.some(r => r.priority === 2), '静止时应预热视野外的转向余量');
assert(plan.length <= 40 && new Set(plan.map(r => r.id)).size === plan.length);
const next = planVolumeChunks(terrain, 48, { ...view, x: view.x + 180 }, light, 40);
assert(next.filter(r => r.visible).every(r => plan.some(p => p.id === r.id)), '预热区应覆盖短距离游动后刚进入视野的块');
const moving = planVolumeChunks(terrain, 48, { ...view, aheadX: size }, light, 40);
assert(moving.some(r => r.priority === 2 && r.ci > Math.max(...plan.filter(p => p.visible).map(p => p.ci))), '预测区应向实际移动方向伸出');
const farView = { ...view, halfW: 1400, halfH: 1500 };
const wide = planVolumeChunks(terrain, 48, farView, light, 40);
for (let y = farView.y - farView.halfH; y <= farView.y + farView.halfH; y += 50) {
    for (let x = farView.x - farView.halfW; x <= farView.x + farView.halfW; x += 50) {
        const id = Math.floor((y - terrain.y) / size) * 4096 + Math.floor(x / size);
        assert(wide.some(r => r.id === id && r.visible), '大视锥不能被缓存预算截断');
    }
}
const edge = planVolumeChunks(terrain, 48, { ...view, x: 0, y: 900 }, { x: 0, y: 900, radius: 0 }, 40);
assert(edge.every(r => r.ci >= 0 && r.cj >= 0 && r.ci * 48 < terrain.cols - 1 && r.cj * 48 < terrain.rows - 1));
assert(edge.every(r => !r.shadow), '关灯后应释放阴影专用需求');
console.log('通过：屏幕外阴影块、静止预热、移动预测、远镜头完整覆盖与地图边界。');
