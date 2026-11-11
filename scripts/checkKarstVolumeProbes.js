const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const moduleUnderTest = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../src/render/KarstVolumeProbes.ts'), 'utf8');
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleUnderTest.exports);
const { sampleVolumeProbe, raycastVolumeProbe } = moduleUnderTest.exports;
function field(x, y, step, cols, rows, z, sample) {
    const values = new Int8Array(cols * rows * z.length);
    for (let k = 0; k < z.length; k++) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
        values[(k * rows + j) * cols + i] = Math.round(Math.max(-127, Math.min(127, sample(x + i * step, y + j * step, z[k]))));
    return { x, y, step, cols, rows, z: new Float32Array(z), values };
}
const linear = field(-20, -20, 4, 11, 11, [-6, 0, 12, 40], (x, y, z) => 3 + x + y + z);
for (const [x, y, z] of [[-19, 3, -2], [7, 11, 26], [20, 20, 40]])
    assert(Math.abs(sampleVolumeProbe(linear, x, y, z) - (3 + x + y + z)) < 1e-5, '三线性插值必须使用真实的非均匀z间距');
assert(Number.isNaN(sampleVolumeProbe(linear, 21, 0, 0)), '缺失区域应保持未知');
const wall = field(0, -40, 4, 41, 21, [-6, 0, 12, 40, 80], (x, y, z) => 83 - x);
const sampleWall = (x, y, z) => sampleVolumeProbe(wall, x, y, z);
const hit = raycastVolumeProbe(sampleWall, 10, 0, 12, 1, 0, 0, 140);
assert(hit && Math.abs(hit.distance - 73) < .1 && hit.nx < -.999 && Math.abs(hit.ny) < 1e-5, '命中点与水域朝向法线应来自同一密度场');
assert.equal(raycastVolumeProbe(sampleWall, 10, 0, 12, 1, 0, 0, 50), null, '范围外的墙不能成为回光源');
assert.equal(raycastVolumeProbe(sampleWall, 100, 0, 12, 1, 0, 0, 100), null, '位于岩石内的无效光源不能穿墙');
assert.equal(raycastVolumeProbe(() => 40, 0, 0, 0, 1, 0, 0, 100), null, '空水中不能凭空生成回光');
assert.equal(raycastVolumeProbe(x => 30 + x, 0, 0, 0, 1, 0, 0, 100), null, '角色背后的墙不能被朝前的光线命中');
assert.equal(raycastVolumeProbe((x, y, z) => x > 45 && x < 70 ? NaN : sampleWall(x, y, z), 10, 0, 12, 1, 0, 0, 140), null,
    '射线不能跨过尚未生成的块去猜后壁落点');
const obstacle = field(0, -40, 4, 41, 21, [-6, 0, 12, 24, 40, 80], (x, y, z) => Math.min(120 - x, Math.hypot(x - 62, y, z - 24) - 14));
const foreground = raycastVolumeProbe((x, y, z) => sampleVolumeProbe(obstacle, x, y, z), 10, 0, 24, 1, 0, 0, 140);
assert(foreground && Math.abs(foreground.x - 48) < .1 && foreground.nx < -.99, '前方石笋必须挡住更远后壁');
const left = field(0, -40, 4, 18, 21, [-6, 0, 12, 40], (x, y, z) => 95 - x);
const right = field(60, -40, 4, 26, 21, [-6, 0, 12, 40], (x, y, z) => 95 - x);
const seam = raycastVolumeProbe((x, y, z) => sampleVolumeProbe(x < 64 ? left : right, x, y, z), 10, 0, 12, 1, 0, 0, 140);
assert(seam && Math.abs(seam.x - 95) < .1, '连续采样应跨过分块边界抵达真实墙面');
console.log('通过：非均匀纵深三线性插值、真实命中与法线、范围限制、未知块终止、前方岩体遮挡及跨块连续性。');
