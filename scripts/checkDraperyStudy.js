// Real TS map and mesher, scoped to the editable drapery study. Outputs stay in the ignored cache.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), crypto = require('crypto'), ts = require('typescript');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'node_modules/.cache/drapery-study');
const args = process.argv.slice(2); let exportMeshes = false, exportSeed = 7391;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--export') exportMeshes = true;
    else if (args[i] === '--seed' && /^\d+$/.test(args[i + 1] || '')) exportSeed = Number(args[++i]);
    else throw Error('Usage: node scripts/checkDraperyStudy.js [--export] [--seed UINT32]');
}
assert(Number.isSafeInteger(exportSeed) && exportSeed >= 0 && exportSeed <= 4294967295, 'Seed must be a uint32');
const modules = new Map();
function load(id) {
    id = path.posix.normalize(id);
    if (!fs.existsSync(path.join(ROOT, id + '.ts'))) id += '/index';
    if (modules.has(id)) return modules.get(id);
    const exports = {}; modules.set(id, exports);
    const source = fs.readFileSync(path.join(ROOT, id + '.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2016, module: ts.ModuleKind.CommonJS } }).outputText;
    // Inspect a completed meshing job before another job reuses its scratch; no production API is added.
    const inspect = id === 'src/world/KarstVolume' ? '\nexports.__draperyTest = () => ({ field: chunkScratch.F, cell: cellVertex });' : '';
    new Function('exports', 'require', code + inspect)(exports, name => load(path.posix.join(path.posix.dirname(id), name)));
    return exports;
}
const core = load('src/core/state'), map = load('src/world/map'), geometry = load('src/world/continuous/Geometry');
const terrainAPI = load('src/world/KarstTerrain'), volume = load('src/world/KarstVolume'), speleothems = load('src/world/KarstSpeleothems');
load('src/core/config').CONFIG.karst.geometryMode = 'volume';
const originalPlan = speleothems.planSpeleothems, CHUNK = volume.VOLUME_CHUNK, NK = volume.VOLUME_Z.length;
const hash = data => crypto.createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
// Whole collision fields from the established seam regression; these include all gameplay geometry.
const baselines = new Map([
    [7391, '310079514742aa94b06af840422b006d7388095a1e12f2fc839d587e6e15a00b'],
    [0, '6bad131bc93e1cdc9d115842611f667340471a16a0d69b6a083548a271a3bc21'],
    [1, '6181cfd1c7e19f454a2562132e5ee1349d0d3bf0277b2837db46d2615e214a7b'],
    [26110941, '422c0723b7a1b5da9f50cb511c285ab19d6e1b1f059a0841bc1d7f44c5cb705c'],
    [4294967295, '93749d54316e01abb2d525e54279b1b46faba1d4a01c65607e2bce9a48dbe08a'],
]);
const report = { scope: 'Actual TS geometry and local study boundaries; no mobile GPU or subjective art acceptance', exportSeed,
    seeds: [], fieldSamples: 0, sharedVertices: 0, nearSurfaceSamples: 0, changedSurfaceSamples: 0, protectedSamples: 0 };
function build(seed, profile) {
    // Set the requested review profile at planning time so even collision construction sees it.
    speleothems.planSpeleothems = (...values) => {
        const study = originalPlan(...values); return study && profile ? { ...study, profile } : study;
    };
    const maze = map.generateMazeMap(seed); core.state.mazeRescue = maze; core.state.screen = 'mazeRescue';
    const random = Math.random; Math.random = () => { throw Error('Drapery geometry must be deterministic'); };
    try { geometry.attachWorldTerrain(maze); } finally { Math.random = random; }
    const t = terrainAPI.getKarstTerrain(maze); assert.equal(t.generation, 'volume'); assert(t.volume.speleothemStudy);
    assert.equal(t.volume.speleothemStudy.profile, profile);
    return { maze, t };
}
function snapshot(t, ci, cj) {
    const job = volume.startVolumeChunk(t, ci, cj); assert(job);
    const mesh = volume.stepVolumeChunk(t, job, Infinity); assert(mesh); assert.equal(mesh.dropped, 0, 'No surface may be dropped');
    assert(mesh.positions.every(Number.isFinite) && mesh.normals.every(Number.isFinite));
    assert.equal(mesh.normals.length, mesh.positions.length); assert.equal(mesh.indices.length % 3, 0);
    assert(mesh.indices.every(index => index < mesh.positions.length / 3));
    const scratch = volume.__draperyTest(), plane = job.ni * job.nj;
    const field = new Float32Array(scratch.field.subarray(0, plane * NK)), vertices = new Map();
    const x0 = Math.max(0, ci * CHUNK - job.i0 - 1), x1 = Math.min(job.ni - 2, Math.min((ci + 1) * CHUNK, t.cols - 1) - job.i0 - 1);
    const y0 = Math.max(0, cj * CHUNK - job.j0 - 1), y1 = Math.min(job.nj - 2, Math.min((cj + 1) * CHUNK, t.rows - 1) - job.j0 - 1);
    for (let k = 0; k < NK - 1; k++) for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const vertex = scratch.cell[i + job.ni * (j + job.nj * k)];
        if (vertex >= 0) vertices.set([job.i0 + i, job.j0 + j, k].join(','), vertex);
    }
    assert.equal(vertices.size, mesh.positions.length / 3);
    return { job, mesh, field, vertices, at: (i, j, k) => field[k * plane + (j - job.j0) * job.ni + i - job.i0] };
}
function region(t) {
    const s = t.volume.speleothemStudy, reach = s.radius * 1.35, size = CHUNK * t.step;
    // Include a ring of unchanged chunks so all outward study boundaries are exercised.
    return { x0: Math.max(0, Math.floor((s.x - reach - t.x) / size) - 1),
        x1: Math.min(Math.floor((t.cols - 2) / CHUNK), Math.floor((s.x + reach - t.x) / size) + 1),
        y0: Math.max(0, Math.floor((s.y - reach - t.y) / size) - 1),
        y1: Math.min(Math.floor((t.rows - 2) / CHUNK), Math.floor((s.y + reach - t.y) / size) + 1) };
}
function compareSeam(t, a, b) {
    const ax = a.job.ci * CHUNK, ay = a.job.cj * CHUNK, bx = b.job.ci * CHUNK, by = b.job.cj * CHUNK;
    const x0 = Math.max(0, ax - 1, bx - 1), x1 = Math.min(t.cols - 1, ax + CHUNK + 1, bx + CHUNK + 1);
    const y0 = Math.max(0, ay - 1, by - 1), y1 = Math.min(t.rows - 1, ay + CHUNK + 1, by + CHUNK + 1);
    for (let k = 0; k < NK; k++) for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const va = a.at(i, j, k), vb = b.at(i, j, k); report.fieldSamples++;
        if (Math.min(Math.abs(va), Math.abs(vb)) < 24) report.nearSurfaceSamples++;
        assert.equal(va, vb, `Shared field differs seed=${t.seed} node=${i},${j},${k}`);
    }
    const shared = (first, second) => {
        const cx = second.job.ci * CHUNK, cy = second.job.cj * CHUNK;
        for (const [cell, ai] of first.vertices) {
            const [i, j] = cell.split(',').map(Number), inside = i >= Math.max(0, cx - 1) && i < Math.min(cx + CHUNK, t.cols - 1)
                && j >= Math.max(0, cy - 1) && j < Math.min(cy + CHUNK, t.rows - 1);
            if (!inside) continue;
            assert(second.vertices.has(cell), 'Neighbor is missing shared surface cell ' + cell);
            const bi = second.vertices.get(cell); report.sharedVertices++;
            for (let axis = 0; axis < 3; axis++) for (const values of ['positions', 'normals']) {
                assert(Math.abs(first.mesh[values][ai * 3 + axis] - second.mesh[values][bi * 3 + axis]) < 1e-5,
                    `Shared ${values} differ seed=${t.seed} cell=${cell}`);
            }
        }
    };
    shared(a, b); shared(b, a);
}
function exportScene(t, chunks, label) {
    const s = t.volume.speleothemStudy;
    fs.writeFileSync(path.join(OUT, `mesh-${label}.json`), JSON.stringify({ version: 1, label, seed: t.seed,
        origin: [s.x, s.y, 0], study: s, meshes: Array.from(chunks, ([name, c]) => ({ name: `chunk_${name.replace(',', '_')}`,
            positions: Array.from(c.mesh.positions), normals: Array.from(c.mesh.normals), indices: Array.from(c.mesh.indices) })) }));
}
fs.mkdirSync(OUT, { recursive: true });
try {
    const seeds = [...baselines.keys()]; if (exportMeshes && !baselines.has(exportSeed)) seeds.push(exportSeed);
    for (const seed of seeds) {
        const before = build(seed), expected = baselines.get(seed) || hash(before.t.field);
        assert.equal(hash(before.t.field), expected, 'Default collision field changed seed=' + seed);
        const area = region(before.t), original = new Map();
        for (let cj = area.y0; cj <= area.y1; cj++) for (let ci = area.x0; ci <= area.x1; ci++) original.set(ci + ',' + cj, snapshot(before.t, ci, cj));
        if (exportMeshes && seed === exportSeed) exportScene(before.t, original, 'before');
        terrainAPI.releaseKarstTerrain(before.maze);
        const folded = build(seed, 'folds'), t = folded.t, s = t.volume.speleothemStudy, chunks = new Map();
        assert.equal(hash(t.field), expected, 'Fold profile changed gameplay collision seed=' + seed); assert.deepEqual(region(t), area);
        let changed = 0;
        for (const [key, old] of original) {
            const [ci, cj] = key.split(',').map(Number), current = snapshot(t, ci, cj); chunks.set(key, current);
            const { job } = current;
            for (let k = 0; k < NK; k++) for (let j = 0; j < job.nj; j++) for (let i = 0; i < job.ni; i++) {
                const n = (k * job.nj + j) * job.ni + i, a = current.field[n], b = old.field[n];
                const x = t.x + (job.i0 + i) * t.step, y = t.y + (job.j0 + j) * t.step, z = volume.VOLUME_Z[k];
                if (speleothems.speleothemWeight(s, x, y, z) === 0) {
                    assert.equal(a, b, `Profile escaped its study mask seed=${seed} point=${x},${y},${z}`); report.protectedSamples++;
                } else if (a !== b && Math.min(Math.abs(a), Math.abs(b)) < 24) { changed++; report.changedSurfaceSamples++; }
            }
        }
        for (const [key, a] of chunks) {
            const [ci, cj] = key.split(',').map(Number);
            for (const neighbor of [(ci + 1) + ',' + cj, ci + ',' + (cj + 1)]) if (chunks.has(neighbor)) compareSeam(t, a, chunks.get(neighbor));
        }
        const first = chunks.values().next().value, repeat = snapshot(t, first.job.ci, first.job.cj);
        for (const key of ['positions', 'normals', 'indices']) assert.equal(hash(repeat.mesh[key]), hash(first.mesh[key]), 'Repeated mesh differs: ' + key);
        assert.equal(hash(repeat.field), hash(first.field), 'Scratch reuse changed repeated field');
        if (exportMeshes && seed === exportSeed) exportScene(t, chunks, 'folds');
        report.seeds.push({ seed, chunks: chunks.size, fieldSHA256: expected, changedSurfaceSamples: changed,
            triangles: Array.from(chunks.values()).reduce((sum, c) => sum + c.mesh.indices.length / 3, 0),
            maximumChunkMs: Math.max(...Array.from(chunks.values(), c => c.mesh.ms)), maximumStepMs: Math.max(...Array.from(chunks.values(), c => c.job.longestStep)) });
        terrainAPI.releaseKarstTerrain(folded.maze);
    }
    assert(report.changedSurfaceSamples > 0, 'No actual surface changed; the fold profile is missing or the test is vacuous');
    assert(report.sharedVertices > 100 && report.nearSurfaceSamples > 1000, 'Study seams must include actual surfaces');
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = String(error.stack || error); process.exitCode = 1; }
finally {
    speleothems.planSpeleothems = originalPlan;
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}
