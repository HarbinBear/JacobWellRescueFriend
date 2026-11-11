// 纯 CPU 网格和投影检查；不伪造绳网捕获，也不代替实际游戏的灯光/交互验收。
const fs = require('fs'), path = require('path'), ts = require('typescript'), assert = require('assert/strict');
const ROOT = path.resolve(__dirname, '..'), modules = new Map();
function load(file) {
    file = path.posix.normalize(file);
    if (!fs.existsSync(path.join(ROOT, file + '.ts'))) file += '/index';
    if (modules.has(file)) return modules.get(file).exports;
    const m = { exports: {} }; modules.set(file, m);
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText;
    new Function('module', 'exports', 'require', code)(m, m.exports, name => load(path.posix.join(path.posix.dirname(file), name)));
    return m.exports;
}
const { buildFishVolumeMesh, supportsFishVolume } = load('src/render/FishVolumeMesh');
const geometry = load('src/logic/FishGeometry');
const { CONFIG } = load('src/core/config');
function fish(kind, overrides = {}) {
    return Object.freeze({ kind, x: 0, y: 0, vx: 0, vy: 0, angle: 0, targetAngle: 0,
        state: 'roam', stateTimer: 12, animTime: .37, stunFrames: 0, stunUntil: 0, bound: false, dead: false,
        netGraceFrames: 0, lungeCharge: 0, biteCount: 0, dyingTimer: 0, dyingAlpha: 1, dyingRoll: 0,
        lightFrames: 0, lightTargetX: 0, lightTargetY: 0, roamTargetX: 40, roamTargetY: 0, roamTimer: 0,
        circleAngle: 0, circleRadius: 100, fearTimer: 0, fearDir: 0, hitFleeTimer: 0, hitFleeDir: 0,
        hitFleePhase: 0, hitFleeNextDirTimer: 0, alertIcon: '', alertIconColor: '#fff', alertTimer: 0,
        denX: 0, denY: 0, denRadius: 200, ...overrides });
}
function checkMesh(mesh, count) {
    assert.equal(mesh.fishCount, count);
    assert(mesh.positions instanceof Float32Array && mesh.normals instanceof Float32Array && mesh.colors instanceof Float32Array);
    assert(mesh.indices instanceof Uint16Array);
    assert.equal(mesh.positions.length % 3, 0);
    assert.equal(mesh.normals.length, mesh.positions.length);
    assert.equal(mesh.colors.length, mesh.positions.length);
    assert.equal(mesh.indices.length % 3, 0);
    const vertices = mesh.positions.length / 3;
    assert(vertices <= 65536, 'Uint16 批次不能溢出顶点范围');
    if (count) assert(vertices > 20 && mesh.indices.length > 60, '鱼体必须具有可绘制的实体网格');
    else assert.equal(vertices + mesh.indices.length, 0, '不支持/已移除的鱼不能留下旧网格');
    for (const value of mesh.positions) assert(Number.isFinite(value), '顶点必须为有限数');
    for (let i = 0; i < mesh.normals.length; i += 3) {
        const n = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
        assert(Number.isFinite(n) && Math.abs(n - 1) < .015, '灯光法线必须有限且归一化');
    }
    for (const value of mesh.colors) assert(Number.isFinite(value) && value >= 0 && value <= 1, '线性底色必须位于0–1');
    for (const index of mesh.indices) assert(index < vertices, '三角形不能引用批次以外的顶点');
    return { vertices, triangles: mesh.indices.length / 3 };
}
const close = (actual, expected, tolerance, message) => assert(Math.abs(actual - expected) <= tolerance,
    message + ': ' + actual + ' / ' + expected);
// 用洞腔相机的透视关系检验实体轮廓与仍在z=0的互动点是否分离。
function project(x, y, z, camera) {
    const scale = camera.D / (camera.D + z) * camera.zoom;
    return { x: camera.width / 2 + (x - camera.x) * scale, y: camera.height / 2 + (y - camera.y) * scale };
}
const states = ['roam', 'inspect', 'approach', 'detect', 'stalk', 'circle', 'lunge', 'bite', 'devour',
    'retreat', 'flee', 'fear', 'hit', 'returning', 'stunned', 'bound'];
const report = { supported: [], poses: 0, strained: 0, projections: 0 };
for (const kind of ['piranha', 'curious']) {
    assert(supportsFishVolume(fish(kind)));
    const resting = buildFishVolumeMesh([fish(kind)], 0), counts = checkMesh(resting, 1);
    let zmin = Infinity, zmax = -Infinity;
    for (let i = 2; i < resting.positions.length; i += 3) { zmin = Math.min(zmin, resting.positions[i]); zmax = Math.max(zmax, resting.positions[i]); }
    assert(zmin < -CONFIG.fishEnemy.size * .05 && zmax > CONFIG.fishEnemy.size * .05, '鱼体应在交互平面两侧都有真实厚度');
    assert(zmax - zmin < CONFIG.fishEnemy.size * 2, '厚度不能远超现有平面鱼体尺寸');
    report.supported.push({ kind, ...counts, zRange: [zmin, zmax], depth: zmax - zmin });
    for (const state of states) for (const animTime of [0, 1.27, 7.9]) {
        const item = fish(kind, { state, animTime, lungeCharge: state === 'lunge' ? 1 : 0,
            stunFrames: state === 'stunned' ? 240 : 0, bound: state === 'bound' || state === 'stunned' });
        const before = JSON.stringify(item);
        checkMesh(buildFishVolumeMesh(Object.freeze([item]), .41), 1);
        assert.equal(JSON.stringify(item), before, '绘制不能改动鱼的AI、物理或绑缚状态');
        report.poses++;
    }
    const animated = buildFishVolumeMesh([fish(kind, { animTime: 1.9 })], 0);
    assert.notDeepEqual(animated.positions, resting.positions, '活鱼的身体或鱼鳍应随动画相位变化');
    const restrained = fish(kind, { bound: true, state: 'bound' }), beforeStrain = JSON.stringify(restrained);
    const relaxed = buildFishVolumeMesh([restrained], 0);
    for (const strength of [-1, -.4, .4, 1]) {
        const strained = buildFishVolumeMesh([restrained], 0, item => { assert.equal(item, restrained); return strength; });
        checkMesh(strained, 1);
        assert.notDeepEqual(strained.positions, relaxed.positions, '真实受力应能改变实体鱼姿态');
        assert.equal(JSON.stringify(restrained), beforeStrain, '受力外观不能改变绑缚或互动状态');
        report.strained++;
    }
    for (const angle of [0, Math.PI / 2, -.73, Math.PI]) {
        const item = fish(kind, { x: 6132.25, y: 1776.5, angle, targetAngle: angle }), moved = buildFishVolumeMesh([item], 0);
        checkMesh(moved, 1); assert.equal(moved.positions.length, resting.positions.length);
        const c = Math.cos(angle), s = Math.sin(angle);
        for (let i = 0; i < moved.positions.length; i += 3) {
            const x = resting.positions[i], y = resting.positions[i + 1];
            close(moved.positions[i], item.x + x * c - y * s, .001, '鱼体不能偏离物理x');
            close(moved.positions[i + 1], item.y + x * s + y * c, .001, '鱼体不能偏离物理y');
            close(moved.positions[i + 2], resting.positions[i + 2], .0001, 'XY转向不能改变交互深度');
            // 法线由世界坐标Float32顶点重算，细鳍在大坐标下会有少量舍入差异。
            close(moved.normals[i], resting.normals[i] * c - resting.normals[i + 1] * s, .002, '法线必须随鱼转向');
            close(moved.normals[i + 1], resting.normals[i] * s + resting.normals[i + 1] * c, .002, '法线必须随鱼转向');
            close(moved.normals[i + 2], resting.normals[i + 2], .002, 'XY转向应保留法线纵深分量');
        }
        for (const camera of [{ width: 375, height: 667, D: 900, zoom: .7, x: item.x - 80, y: item.y + 40 },
            { width: 1440, height: 880, D: 1400, zoom: 1.2, x: item.x + 130, y: item.y - 50 }]) {
            const projected = [];
            for (let i = 0; i < moved.positions.length; i += 3) projected.push(project(moved.positions[i], moved.positions[i + 1], moved.positions[i + 2], camera));
            assert(projected.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), '横竖屏投影不能出现无穷点');
            const bounds = { left: Math.min(...projected.map(p => p.x)), right: Math.max(...projected.map(p => p.x)),
                top: Math.min(...projected.map(p => p.y)), bottom: Math.max(...projected.map(p => p.y)) };
            for (const point of [item, geometry.fishHeadPoint(item), geometry.fishKnotPoint(item)]) {
                const p = project(point.x, point.y, 0, camera);
                const margin = CONFIG.fishEnemy.size * .4 * camera.zoom;
                assert(p.x >= bounds.left - margin && p.x <= bounds.right + margin && p.y >= bounds.top - margin && p.y <= bounds.bottom + margin,
                    '头部/绑结不能脱离可见鱼体');
                report.projections++;
            }
        }
    }
}
for (const item of [fish('rammer'), fish('provoked'), fish('shoal'), fish('piranha', { dead: true }), fish('curious', { state: 'dying' })]) {
    assert.equal(supportsFishVolume(item), false, '首版不支持的鱼应保留原绘制路径');
    checkMesh(buildFishVolumeMesh([item], 0), 0);
}
checkMesh(buildFishVolumeMesh([], 0), 0);
checkMesh(buildFishVolumeMesh([fish('piranha'), fish('rammer'), fish('curious'), fish('piranha', { dead: true })], 0), 2);
const crowded = buildFishVolumeMesh(Array.from({ length: 200 }, (_, i) => fish('curious', { x: i * 40 })), 0);
assert(crowded.fishCount > 0 && crowded.fishCount < 200, '过大的批次应有限截断，不能绕回Uint16索引');
checkMesh(crowded, crowded.fishCount);
console.log('通过：两种实体鱼、96种状态/相位组合、XY旋转与横竖屏互动投影、旧路径过滤；未运行浏览器。');
console.log(JSON.stringify(report, null, 2));
