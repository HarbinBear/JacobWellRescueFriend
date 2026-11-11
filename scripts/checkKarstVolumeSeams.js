// Real map/volume pipeline: compare adjacent chunks before probe quantization and after meshing.
// Optional JWR_KARST_VOLUME_SOURCE points at a historical source file to reproduce a regression.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), crypto = require('crypto'), ts = require('typescript');
const ROOT = path.resolve(__dirname, '..'), modules = new Map();
function load(id) {
    id = path.posix.normalize(id);
    if (!fs.existsSync(path.join(ROOT, id + '.ts'))) id += '/index';
    if (modules.has(id)) return modules.get(id);
    const exports = {}; modules.set(id, exports);
    const volume = id === 'src/world/KarstVolume';
    const file = volume && process.env.JWR_KARST_VOLUME_SOURCE || path.join(ROOT, id + '.ts');
    const source = fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }).outputText;
    // Read the completed job's shared scratch before starting another job; no production API or parallel job is added.
    const inspect = volume ? '\nexports.__seamTest = () => ({ field: chunkScratch.F, cell: cellVertex });' : '';
    new Function('exports', 'require', code + inspect)(exports, name => load(path.posix.join(path.posix.dirname(id), name)));
    return exports;
}
const core = load('src/core/state'), map = load('src/world/map'), geometry = load('src/world/continuous/Geometry');
const terrainAPI = load('src/world/KarstTerrain'), volume = load('src/world/KarstVolume');
const { sampleVolumeProbe } = load('src/render/KarstVolumeProbes');
load('src/core/config').CONFIG.karst.geometryMode = 'volume';
const CHUNK = volume.VOLUME_CHUNK, NK = volume.VOLUME_Z.length;
const digest = data => crypto.createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
// Baselines from 0836fa7: the whole gameplay XY field must stay byte-for-byte unchanged.
const baselines = [
    [7391, '310079514742aa94b06af840422b006d7388095a1e12f2fc839d587e6e15a00b'],
    [0, '6bad131bc93e1cdc9d115842611f667340471a16a0d69b6a083548a271a3bc21'],
    [1, '6181cfd1c7e19f454a2562132e5ee1349d0d3bf0277b2837db46d2615e214a7b'],
    [26110941, '422c0723b7a1b5da9f50cb511c285ab19d6e1b1f059a0841bc1d7f44c5cb705c'],
    [4294967295, '93749d54316e01abb2d525e54279b1b46faba1d4a01c65607e2bce9a48dbe08a'],
];
const report = { scope: 'Pure geometry; desktop CPU timings, not WeChat device performance', seeds: [], fieldSamples: 0,
    sharedVertices: 0, probeSamples: 0, nearSurfaceSamples: 0, maximumPositionError: 0, maximumNormalError: 0 };

function snapshot(t, ci, cj) {
    const job = volume.startVolumeChunk(t, ci, cj); assert(job);
    const mesh = volume.stepVolumeChunk(t, job, Infinity); assert(mesh);
    assert.equal(mesh.dropped, 0, 'No surface quad may be dropped');
    const scratch = volume.__seamTest(), plane = job.ni * job.nj;
    const field = new Float32Array(scratch.field.subarray(0, plane * NK));
    const vertices = new Map();
    const i0 = Math.max(0, ci * CHUNK - job.i0 - 1), i1 = Math.min(job.ni - 2, Math.min((ci + 1) * CHUNK, t.cols - 1) - job.i0 - 1);
    const j0 = Math.max(0, cj * CHUNK - job.j0 - 1), j1 = Math.min(job.nj - 2, Math.min((cj + 1) * CHUNK, t.rows - 1) - job.j0 - 1);
    for (let k = 0; k < NK - 1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const vertex = scratch.cell[i + job.ni * (j + job.nj * k)];
        if (vertex >= 0) vertices.set([job.i0 + i, job.j0 + j, k].join(','), vertex);
    }
    assert.equal(vertices.size, mesh.positions.length / 3, 'Every surface-net vertex must have one source cell');
    assert(mesh.positions.every(Number.isFinite)); assert(mesh.normals.every(Number.isFinite));
    return { job, mesh, field, vertices, at: (i, j, k) => field[k * plane + (j - job.j0) * job.ni + i - job.i0] };
}

function compare(t, a, b) {
    const ax = a.job.ci * CHUNK, ay = a.job.cj * CHUNK, bx = b.job.ci * CHUNK, by = b.job.cj * CHUNK;
    // Core plus a one-node halo: these samples feed shared vertices, normals and exported probes.
    const x0 = Math.max(0, ax - 1, bx - 1), x1 = Math.min(t.cols - 1, ax + CHUNK + 1, bx + CHUNK + 1);
    const y0 = Math.max(0, ay - 1, by - 1), y1 = Math.min(t.rows - 1, ay + CHUNK + 1, by + CHUNK + 1);
    for (let k = 0; k < NK; k++) for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const va = a.at(i, j, k), vb = b.at(i, j, k), x = t.x + i * t.step, y = t.y + j * t.step, z = volume.VOLUME_Z[k];
        report.fieldSamples++;
        if (Math.min(Math.abs(va), Math.abs(vb)) < 24) report.nearSurfaceSamples++;
        assert.equal(va, vb, `Field seam seed=${t.seed} point=(${x},${y},${z}) chunks=(${a.job.ci},${a.job.cj})/(${b.job.ci},${b.job.cj})`);
    }
    for (const [cell, ai] of a.vertices) {
        if (!b.vertices.has(cell)) {
            const [i, j] = cell.split(',').map(Number);
            const insideB = i >= Math.max(0, bx - 1) && i < Math.min(bx + CHUNK, t.cols - 1)
                && j >= Math.max(0, by - 1) && j < Math.min(by + CHUNK, t.rows - 1);
            assert(!insideB, 'Shared crossing cell is missing from the neighboring mesh: ' + cell);
            continue;
        }
        const bi = b.vertices.get(cell); report.sharedVertices++;
        for (let axis = 0; axis < 3; axis++) {
            const p = Math.abs(a.mesh.positions[ai * 3 + axis] - b.mesh.positions[bi * 3 + axis]);
            const n = Math.abs(a.mesh.normals[ai * 3 + axis] - b.mesh.normals[bi * 3 + axis]);
            report.maximumPositionError = Math.max(report.maximumPositionError, p);
            report.maximumNormalError = Math.max(report.maximumNormalError, n);
            assert(p < 1e-5, 'Shared mesh vertex position differs: ' + cell);
            assert(n < 1e-5, 'Shared mesh vertex normal differs: ' + cell);
        }
    }
    for (let k = 0; k < NK - 1; k += 3) for (let j = y0; j < y1; j += 5) for (let i = x0; i < x1; i += 5) {
        const x = t.x + (i + .37) * t.step, y = t.y + (j + .61) * t.step, z = volume.VOLUME_Z[k] * .6 + volume.VOLUME_Z[k + 1] * .4;
        const va = sampleVolumeProbe(a.mesh.probe, x, y, z), vb = sampleVolumeProbe(b.mesh.probe, x, y, z);
        assert(Number.isFinite(va) && Number.isFinite(vb)); assert(Math.abs(va - vb) < 1e-5, 'Interpolated probes must agree across chunks');
        report.probeSamples++;
    }
}

for (const [seed, expectedField] of baselines) {
    const maze = map.generateMazeMap(seed); core.state.mazeRescue = maze; core.state.screen = 'mazeRescue';
    const random = Math.random; Math.random = () => { throw Error('Volume geometry must not consume runtime randomness'); };
    try { geometry.attachWorldTerrain(maze); } finally { Math.random = random; }
    const t = terrainAPI.getKarstTerrain(maze); assert.equal(t.generation, 'volume');
    assert.equal(digest(t.field), expectedField, 'Gameplay XY collision field changed for seed=' + seed);
    const lastX = Math.floor((t.cols - 2) / CHUNK), lastY = Math.floor((t.rows - 2) / CHUNK);
    const pairs = [
        [[12, 7], [12, 8]], [[11, 8], [12, 8]], // Reported seam and its perpendicular neighborhood.
        [[0, 0], [1, 0]], [[0, 0], [0, 1]], // Origin: clamped scan margins.
        [[lastX - 1, lastY], [lastX, lastY]], [[lastX, lastY - 1], [lastX, lastY]], // Partial edge chunks.
    ];
    const chunks = new Map();
    const get = ([ci, cj]) => { const key = ci + ',' + cj; if (!chunks.has(key)) chunks.set(key, snapshot(t, ci, cj)); return chunks.get(key); };
    for (const [a, b] of pairs) compare(t, get(a), get(b));
    if (seed === 7391) {
        const i = (7356 - t.x) / t.step, j = (5532 - t.y) / t.step, k = Array.from(volume.VOLUME_Z).indexOf(32);
        assert.equal(get([12, 7]).at(i, j, k), -2.4752771854400635, 'Keep the existing grounded side of the reported seam');
        assert.equal(get([12, 8]).at(i, j, k), get([12, 7]).at(i, j, k));
    }
    const first = get([12, 7]), repeat = snapshot(t, 12, 7);
    assert.equal(digest(repeat.field), digest(first.field), 'Shared scratch must not leak between differently sized jobs');
    assert.equal(digest(repeat.mesh.positions), digest(first.mesh.positions));
    assert.equal(digest(repeat.mesh.normals), digest(first.mesh.normals));
    assert.equal(digest(repeat.mesh.indices), digest(first.mesh.indices));
    report.seeds.push({ seed, chunks: chunks.size, fieldSHA256: expectedField,
        chunkMs: Array.from(chunks.values(), c => c.mesh.ms), longestStepMs: Math.max(...Array.from(chunks.values(), c => c.job.longestStep)) });
    terrainAPI.releaseKarstTerrain(maze);
}
assert(report.sharedVertices > 1000 && report.nearSurfaceSamples > 1000, 'The test must exercise actual zero-crossing surfaces');
console.log(JSON.stringify(report, null, 2));
console.log('通过：五种子XY切面不变、原接缝/原点/末端块的浮点场、共享顶点法线、探针插值与重复生成一致。');
