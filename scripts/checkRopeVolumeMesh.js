// 真实管网格与静态缓冲契约；GL仅记录上传，不代替浏览器的光照/遮挡验收。
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const ROOT = path.resolve(__dirname, '..'), modules = new Map();
function load(id) {
    id = path.posix.normalize(id);
    if (modules.has(id)) return modules.get(id).exports;
    const m = { exports: {} }; modules.set(id, m);
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, id + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('module', 'exports', 'require', code)(m, m.exports, name => load(path.posix.join(path.posix.dirname(id), name)));
    return m.exports;
}
const meshAPI = load('src/render/RopeVolumeMesh'), { RopeVolumePass } = load('src/render/RopeVolumePass');
const { getRopeNet } = load('src/logic/RopeNet');
const { getWovenPath } = load('src/render/RopeVisualPath');
const dynamics = load('src/logic/RopeDynamics');
const { buildRopeVolumeMesh, ROPE_VOLUME_RADIUS: radius, ROPE_VOLUME_SIDES: sides,
    ROPE_VOLUME_STEP: step, ROPE_VOLUME_MAX_RINGS: maxRings, ROPE_VOLUME_MAX_VERTICES: maxVertices } = meshAPI;
const rope = points => ({ path: points.map(([x, y]) => ({ x, y })), startWall: {}, endWall: {}, mode: 'tight' });
const close = (a, b, eps = .001) => assert(Math.abs(a - b) <= eps, `${a} / ${b}`);
function check(mesh) {
    const p = mesh.positions, n = mesh.normals, c = mesh.colors, ix = mesh.indices;
    assert(p instanceof Float32Array && n instanceof Float32Array && c instanceof Float32Array && ix instanceof Uint16Array);
    assert.equal(p.length % 3, 0); assert.equal(n.length, p.length); assert.equal(c.length, p.length);
    assert.equal(ix.length % 3, 0); assert(p.length / 3 <= maxVertices);
    for (const value of p) assert(Number.isFinite(value));
    for (const value of c) assert(Number.isFinite(value) && value >= 0 && value <= 1);
    for (const i of ix) assert(i < p.length / 3, '索引不能溢出或指向另一批次');
    for (let i = 0; i < n.length; i += 3) close(Math.hypot(n[i], n[i + 1], n[i + 2]), 1, 1e-5);
    for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i] * 3, b = ix[i + 1] * 3, d = ix[i + 2] * 3;
        const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const v = [p[d] - p[a], p[d + 1] - p[a + 1], p[d + 2] - p[a + 2]];
        const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const outward = f[0] * (n[a] + n[b] + n[d]) + f[1] * (n[a + 1] + n[b + 1] + n[d + 1]) +
            f[2] * (n[a + 2] + n[b + 2] + n[d + 2]);
        assert(outward > 0, '侧面及两端封口绕序必须朝外，不能以翻面照明掩盖');
    }
    for (const range of mesh.ranges) {
        assert.equal(range.vertexCount, range.ringCount * sides + 2 * (sides + 1));
        const centres = [];
        for (let ring = 0; ring < range.ringCount; ring++) {
            const centre = [0, 0, 0];
            for (let j = 0; j < sides; j++) for (let k = 0; k < 3; k++) centre[k] += p[(range.vertexStart + ring * sides + j) * 3 + k] / sides;
            close(centre[2], 0, 1e-6); centres.push(centre);
        }
        const source = range.visualPath;
        close(centres[0][0], source[0].x); close(centres[0][1], source[0].y);
        close(centres[centres.length - 1][0], source[source.length - 1].x);
        close(centres[centres.length - 1][1], source[source.length - 1].y);
        for (const point of source) assert(centres.some(c => Math.hypot(c[0] - point.x, c[1] - point.y) < .001),
            '每个原始转折及端点必须完整保留');
    }
}

const straight = rope([[6000, 1800], [6602.62, 1800]]);
const corner = rope([[6100, 1900], [6170, 1900], [6170, 1980], [6230, 2040]]);
const duplicate = rope([[0, 50], [0, 50], [45, 50]]);
for (const source of [straight, corner, duplicate]) {
    source.path.forEach(Object.freeze); Object.freeze(source.path); Object.freeze(source);
    const before = JSON.stringify(source), mesh = buildRopeVolumeMesh([source]);
    assert.equal(mesh.ropes[0], source); assert.equal(mesh.rejected.length, 0); check(mesh);
    assert.equal(JSON.stringify(source), before, '网格不能修改真实绳路径或墙锚');
    close(Math.min(...mesh.positions.filter((_, i) => i % 3 === 2)), -radius, 1e-6);
    close(Math.max(...mesh.positions.filter((_, i) => i % 3 === 2)), radius, 1e-6);
}
check(buildRopeVolumeMesh([straight, corner]));
const invalid = [rope([[0, 60], [0, 60]]), rope([[0, 60], [NaN, 60]]),
    rope([[0, 60], [20, 60], [0, 60]]), { ...straight, startLoose: true }, { ...straight, endLoose: true },
    { ...straight, endWall: null }, rope([[0, 60], [step * maxRings, 60]])];
for (const source of invalid) {
    const mesh = buildRopeVolumeMesh([source]); check(mesh);
    assert.equal(mesh.ropes.length, 0); assert.equal(mesh.positions.length, 0); assert.equal(mesh.indices.length, 0);
    assert.equal(mesh.rejected.length, 1, '不支持或超长必须明确整根回退，不能留下半根');
}
const largeA = rope([[0, 200], [(maxRings - 2) * step, 200]]);
const largeB = rope([[0, 220], [(maxRings - 2) * step, 220]]);
const budget = buildRopeVolumeMesh([largeA, largeB, duplicate]);
check(budget); assert(budget.ropes.includes(largeA) && budget.ropes.includes(duplicate));
assert(!budget.ropes.includes(largeB)); assert(budget.rejected.some(r => r.rope === largeB && r.reason === 'budget'));

function mockGL() {
    const records = { buffers: [], uploads: [], draws: [], deleted: [], enabled: [], pointers: [] };
    const gl = { ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, STATIC_DRAW: 35044, FLOAT: 5126,
        TRIANGLES: 4, UNSIGNED_SHORT: 5123,
        createBuffer() { const buffer = {}; records.buffers.push(buffer); return buffer; },
        deleteBuffer(buffer) { records.deleted.push(buffer); },
        bindBuffer() {},
        bufferData(target, data, usage) { records.uploads.push({ target, data: data.slice(), usage }); },
        enableVertexAttribArray(i) { records.enabled.push(i); }, disableVertexAttribArray() {},
        vertexAttribPointer(...args) { records.pointers.push(args); },
        drawElements(...args) { records.draws.push(args); },
    };
    return { gl, records };
}
const { gl, records } = mockGL(), pass = new RopeVolumePass(gl);
assert.equal(records.buffers.length, 4);
let source = rope([[-1000, 100], [1000, 100]]), sources = [source];
const prepare = (enabled = true, x = 0, y = 100, light = { x: 0, y: 100, radius: 0 }, surface = 0, time = 0) =>
    pass.prepare(sources, time, x, y, 20, 20, enabled, light, surface);
prepare(); assert(pass.contains(source), '两端都在屏外但线段穿过视口，整根仍应进入三维');
assert.equal(pass.count, 1); assert.equal(pass.builds, 1); assert.equal(records.uploads.length, 4);
assert(records.uploads.every(u => u.usage === gl.STATIC_DRAW));
const revision = pass.revision, bytes = pass.bytes;
assert.equal(bytes, records.uploads.reduce((n, u) => n + u.data.byteLength, 0));
prepare(true, 5, 105, { x: 10, y: 100, radius: 300 }, 0, 100);
sources = sources.slice(); source.path = source.path.map(p => ({ ...p })); prepare();
assert.equal(pass.builds, 1); assert.equal(pass.revision, revision); assert.equal(records.uploads.length, 4,
    '时间、镜头小移、数组换引用和相同点内容不能触发上传');
source.path[1].y += 20; prepare(); assert.equal(pass.builds, 2); assert.equal(records.uploads.length, 8);
pass.draw(); assert.equal(records.draws.length, 1); assert.deepEqual(records.enabled.slice(-3), [0, 1, 2]);
const pointers = records.pointers.length; pass.draw(true); assert.equal(records.pointers.length, pointers + 1);
prepare(false); assert.equal(pass.count, 0); assert(!pass.contains(source));
pass.draw(); assert.equal(records.draws.length, 2, '关闭后不能继续画旧buffer');
prepare(); assert.equal(pass.count, 1);
const original = source; source = { ...source }; sources = [source]; prepare();
assert(pass.contains(source) && !pass.contains(original), '替换整根对象后membership不能残留');

sources = [rope([[100, 200], [200, 200]])]; prepare(true, 0, 100, { x: 150, y: 200, radius: 10 });
assert.equal(pass.count, 1, '屏外但在手电范围中的整根必须参与阴影');
prepare(true, 0, 100); assert.equal(pass.count, 0, '关掉屏外灯光需求应恢复二维资格');
sources = [rope([[-200, 100], [100, 400]])]; prepare();
assert.equal(pass.count, 0, '仅包围盒相交、线段未穿视口不能算入镜');
sources = [rope([[-20, 1], [20, 100]])]; prepare(); assert.equal(pass.count, 0, '跨水面的整根保留二维，不能截半根');

const a = rope([[-40, 100], [40, 100]]), b = rope([[-30, 140], [30, 140]]);
sources = [a, b]; prepare(); assert.equal(pass.count, 2);
getRopeNet(sources); // 预热现有按数组长度缓存，再原地改点：Pass必须独立刷新交叉判断。
b.path[0].x = 0; b.path[0].y = 70; b.path[1].x = 0; b.path[1].y = 130;
prepare(); assert.equal(pass.count, 2); assert(pass.contains(a) && pass.contains(b), '新增交叉后两根必须同时保留三维');
const crossedBuilds = pass.builds;
prepare(true, 0, 100, { x: 0, y: 100, radius: 0 }, 0, 1000);
assert.equal(pass.builds, crossedBuilds, '静止交叉网不能随时间重建');
b.path[0].x = -30; b.path[0].y = 140; b.path[1].x = 30; b.path[1].y = 140;
prepare(); assert.equal(pass.count, 2, '解除交叉后整根可重新进入静态管体');
b.startLoose = true; prepare(); assert.equal(pass.count, 1); assert(!pass.contains(b));
const uploads = records.uploads.length;
b.path[0].y = 500; b.path[1].y = 500; prepare();
assert.equal(records.uploads.length, uploads, '未纳入三维的绳发生变化，不应重传未变的可见绳');
sources = [rope(Array.from({ length: 2050 }, (_, i) => [i * 2, 100]))]; prepare();
assert.equal(pass.count, 0); assert.equal(pass.fallbackReason, 'topology-budget', '交叉扫描超预算也要有可观察的完整回退原因');
// Shared sampling inserts the exact crossing in every strand and keeps the gameplay arrays untouched.
const crossA = rope([[-140, 150], [140, 150]]), crossB = rope([[3.33, 50], [3.33, 250]]);
const tied = { ...rope([[3.33, 150], [130, 240]]), startWall: null, startOnRope: true };
const bothTied = { ...rope([[3.33, 150], [130, 150]]), startWall: null, endWall: null,
    startOnRope: true, endOnRope: true };
const crossSources = [crossA, crossB, tied, bothTied], crossNet = getRopeNet(crossSources);
assert.equal(crossNet.woven.size, 4);
const beforeNet = JSON.stringify(crossSources);
const visualPaths = new Map(crossSources.map((r, i) => [r, getWovenPath(crossNet, i, r.path)]));
for (const [r, sampled] of visualPaths) {
    assert(sampled.some(p => Math.hypot(p.x - 3.33, p.y - 150) < 1e-8), '分支共享精确结点');
    assert.equal(getWovenPath(crossNet, crossSources.indexOf(r), r.path), sampled, '静态采样按网与绳索缓存');
    assert.equal(getWovenPath(crossNet, crossSources.indexOf(r), r.path, 2), null, '超采样预算不能分配完整长绳');
}
const wovenMesh = buildRopeVolumeMesh(crossSources, visualPaths); check(wovenMesh);
assert.equal(wovenMesh.ropes.length, 4); assert.equal(wovenMesh.rejected.length, 0);
assert.equal(JSON.stringify(crossSources), beforeNet);
assert(wovenMesh.colors[0] > .75 && wovenMesh.colors[1] > .5 && wovenMesh.colors[2] < .06,
    '指南绳使用高可见黄色线性反照率，亮度仍由共用照明决定');
sources = crossSources; prepare(true, 0, 150);
assert.equal(pass.count, 4); assert.equal(pass.fallbackReason, '');
const restUploads = records.uploads.length;
const restRevision = pass.revision;
for (let i = 0; i < 8; i++) prepare(true, 0, 150, { x: 0, y: 150, radius: 0 }, 0, i / 60);
assert.equal(records.uploads.length, restUploads); assert.equal(pass.revision, restRevision);

// Real RopeDynamics contact supplies the rendering pose, including fixed wall pins and attached tips.
const mover = { x: 3.33, y: 154, vx: 0, vy: 24 };
const hit = dynamics.moveThroughNet(crossNet, mover, { x: 3.33, y: 130 }, 7, 8,
    { x: 0, y: 8 }, () => true);
assert(hit, '实际越网运动必须发生接触');
const pose = (point, index) => dynamics.deformNetPoint(crossNet, point, index);
const posedPaths = new Map(crossSources.map((r, i) => [r, visualPaths.get(r).map(point => pose(point, i))]));
assert([...posedPaths].some(([r, points]) => points.some((point, i) =>
    Math.hypot(point.x - visualPaths.get(r)[i].x, point.y - visualPaths.get(r)[i].y) > .01)), '真实受力需形成可见位移');
const posedMesh = buildRopeVolumeMesh(crossSources, posedPaths); check(posedMesh);
assert.equal(posedMesh.ropes.length, 4, '真实变形的完整交叉网仍保持三维');
const preparePose = () => pass.prepare(sources, 0, 0, 150, 200, 200, true, { x: 0, y: 150, radius: 0 }, 0, pose);
preparePose(); assert.equal(pass.count, 4);
const posedUpload = records.uploads[records.uploads.length - 4].data;
assert.deepEqual(posedUpload, posedMesh.positions, 'GPU上传的中心必须严格来自真实动力学采样');
const posedBuilds = pass.builds; preparePose();
assert.equal(pass.builds, posedBuilds, '接触存在但实际姿态未改变时不能重建');
dynamics.stepNetMotion(crossNet); dynamics.stepNetMotion(crossNet); preparePose();
assert.equal(pass.builds, posedBuilds + 1, '实际弹性回弹后必须刷新管体');
assert.equal(JSON.stringify(crossSources), beforeNet, '受力采样不能写回存档/碰撞路径');
dynamics.releaseNetBody(crossNet, mover);
for (let i = 0; i < 300; i++) dynamics.stepNetMotion(crossNet);
preparePose(); const settledBuilds = pass.builds;
for (let i = 0; i < 8; i++) { dynamics.stepNetMotion(crossNet); preparePose(); }
assert.equal(pass.builds, settledBuilds, '接触消散且绳网静止后必须回到缓存');

// Invalid members must not renumber the original indices passed to the real deformation provider.
const bad = rope([[0, 100], [NaN, 200]]);
sources = [bad, ...crossSources];
const seenIndices = new Set();
pass.prepare(sources, 0, 0, 150, 200, 200, true, { x: 0, y: 150, radius: 0 }, 0,
    (point, index) => { seenIndices.add(index); return pose(point, index - 1); });
assert.deepEqual([...seenIndices], [1, 2, 3, 4]); assert.equal(pass.count, 4);
sources = [crossA]; prepare(true, 0, 150);
assert.equal(pass.count, 1); assert(pass.contains(crossA));
for (const removed of [crossB, tied, bothTied]) assert(!pass.contains(removed), '删绳后不得残留membership');
const hugeCrossing = rope([[-10000, 150], [10000, 150]]);
sources = [hugeCrossing, crossB]; prepare(true, 0, 150);
assert.equal(pass.count, 1); assert(pass.contains(crossB)); assert(!pass.contains(hugeCrossing));
assert.equal(pass.fallbackReason, 'path-budget'); assert.equal(pass.rejected, 1,
    '单根采样超预算只回退该绳，正常交叉伙伴仍绘制三维');
const limitedBuilds = pass.builds; prepare(true, 0, 150); assert.equal(pass.builds, limitedBuilds);
sources = []; prepare(); assert.equal(pass.count, 0); assert.equal(pass.bytes, 0); assert.equal(pass.fallbackReason, '');
const beforeEmptyDraw = records.draws.length; pass.draw();
assert.equal(records.draws.length, beforeEmptyDraw, '删除最后一根后不能画旧GPU buffer');
pass.dispose(); pass.dispose(); assert.equal(records.deleted.length, 4);
assert.equal(pass.count, 0); assert.equal(pass.bytes, 0); assert(!pass.contains(a));
const draws = records.draws.length; pass.draw(); assert.equal(records.draws.length, draws);
const typical = buildRopeVolumeMesh([straight]);
console.log('通过：z=0完整管体、黄色反照率、交叉/绳端附着四绳网、真实动力学GPU坐标、静止缓存、预算回退与删除无残影。');
console.log(JSON.stringify({ sampleLength: 602.62, vertices: typical.positions.length / 3,
    triangles: typical.indices.length / 3, radius, sides, passBuilds: pass.builds }, null, 2));
