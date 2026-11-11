// 三维洞腔：先由迷宫通路溶蚀出洞腔，再整体长出钟乳石体系；碰撞用的二维密度场是它在游戏平面（z=0）上的切面。
// 场的约定与 KarstTerrain 相同：正值是水，负值是岩石。z 朝屏幕里面。
// 整张地图只计算 z=0 一层；带纵深的网格按镜头附近分块生成，并且拆成很多小步分摊到多帧里，两者走同一段求值代码。
import type { KarstTerrain } from './KarstTerrain';
import { continuousKarstProtection, planKarstChambers, type KarstChamber, type KarstChambers } from './KarstChambers';

export const VOLUME_CHUNK = 48;
const LAYERS = 21, GROW = 1.12, CEILING = 300, FLOOR = 170, MARGIN_TOP = 27, MARGIN_BOTTOM = 16, RING = 2, SEG = 11, CARVE = 30, BODY = 21, SOLID = 32;
// 各层的深度：近处每层 12，越往里越稀。VOLUME_Z[0] 是游戏平面前面的剖面盖层。
export const VOLUME_Z = new Float32Array(LAYERS + 1);
VOLUME_Z[0] = -6; for (let k = 1; k <= LAYERS; k++) VOLUME_Z[k] = 12 * (Math.pow(GROW, k - 1) - 1) / (GROW - 1);
export const VOLUME_DEPTH = VOLUME_Z[LAYERS];

export interface KarstVolumeData {
    seed: number; seam: number; segs: Float32Array; tileSegs: number[][]; tileCols: number; tileRows: number; tileSize: number;
    lanes: (x: number, y: number) => number; bank: ((x: number, y: number) => number) | null;
    carves: number[]; carveBuckets: Map<number, number[]>; drips: ((x: number, z: number, floor: boolean) => number)[];
    rearRegions: KarstChambers;
    stats: { segments: number; backBranches: number; carves: number; filledPockets: number; sliceMs: number; rearProfiles: Record<string, number> };
}
export interface KarstVolumeMesh { positions: Float32Array; normals: Float32Array; indices: Uint16Array; ms: number; dropped: number }
export interface KarstVolumeJob {
    ci: number; cj: number; i0: number; j0: number; ni: number; nj: number; list: number[]; phase: number; k: number;
    P: number[]; I: number[]; positions: Float32Array | null; normals: Float32Array | null; ms: number; longestStep: number; dropped: number;
}
interface Scratch { F: Float32Array; X: Float32Array; Y: Float32Array; Z: Float32Array; RB: Float32Array; done: Uint8Array; P2: Float32Array; B2: Float32Array; flag: Uint8Array;
    LC: Float32Array; LF: Float32Array; RIB: Float32Array; strength: Float32Array; rear: Float32Array | null }

const clamp = (v: number, a = 0, b = 1) => v < a ? a : v > b ? b : v;
function smooth(a: number, b: number, v: number) { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
function hash3(x: number, y: number, z: number, s: number) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519) ^ Math.imul(s, 3266489917);
    h = Math.imul(h ^ h >>> 15, 2246822519); h = Math.imul(h ^ h >>> 13, 3266489917);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function noise3(x: number, y: number, z: number, scale: number, s: number) {
    x /= scale; y /= scale; z /= scale;
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let u = x - xi, v = y - yi, w = z - zi; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
    const a = hash3(xi, yi, zi, s), b = hash3(xi + 1, yi, zi, s), c = hash3(xi, yi + 1, zi, s), d = hash3(xi + 1, yi + 1, zi, s);
    const e = hash3(xi, yi, zi + 1, s), f = hash3(xi + 1, yi, zi + 1, s), g = hash3(xi, yi + 1, zi + 1, s), h = hash3(xi + 1, yi + 1, zi + 1, s);
    const p = a + (b - a) * u, q = c + (d - c) * u, r = e + (f - e) * u, t = g + (h - g) * u;
    const lo = p + (q - p) * v, hi = r + (t - r) * v;
    return (lo + (hi - lo) * w) * 2 - 1;
}
// 钟乳石的落点撒在水平面（x、z）上，所以每个形体都是竖直的。同一个落点上面挂石钟乳、下面长石笋；
// 一部分落点沿裂隙拉长成石幔。相邻形体互相并在一起。
function dripField(C: number, seed: number) {
    const cache = new Map<number, any>();
    const cell = (ix: number, iz: number) => {
        const key = ix * 8192 + iz; let f = cache.get(key);
        if (!f) {
            const h = (n: number) => hash3(ix, iz, n, seed), curtain = h(5) < .35, th = h(7) * 3.1416;
            f = { x: (ix + h(1)) * C, z: (iz + h(2)) * C, amp: .2 + .8 * Math.pow(h(3), 1.5), R: C * (.42 + .5 * h(4)) * (curtain ? .6 : 1), e: curtain ? 2 + 1.4 * h(6) : 1,
                co: Math.cos(th), si: Math.sin(th), power: 1 + 1.2 * h(9), mound: .35 + .5 * h(8) };
            cache.set(key, f);
        }
        return f;
    };
    return (x: number, z: number, floor: boolean) => {
        const cx = Math.floor(x / C), cz = Math.floor(z / C); let best = 0, second = 0;
        for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
            const f = cell(cx + a, cz + b), dx = x - f.x, dz = z - f.z, u = (dx * f.co + dz * f.si) / f.e, v = dz * f.co - dx * f.si;
            const t = Math.hypot(u, v) / (floor ? f.R * 1.35 : f.R); if (t >= 1) continue;
            const val = f.amp * (floor ? Math.pow(1 - t * t, .9) * f.mound : Math.pow(1 - t, f.power));
            if (val > best) { second = best; best = val; } else if (val > second) second = val;
        }
        return best + .5 * second * second / (best + second + 1e-6);
    };
}
function bankField(maze: any) {
    const walls = maze.continuous?.banks || []; if (!walls.length) return null;
    return (x: number, y: number) => {
        let bank = 128;
        for (const wall of walls) {
            const poly = wall.rockPolygon; let inside = false, d = 192;
            for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
                const p = poly[a], q = poly[b];
                if ((p.y > y) !== (q.y > y) && x < (q.x - p.x) * (y - p.y) / (q.y - p.y) + p.x) inside = !inside;
                const dx = q.x - p.x, dy = q.y - p.y, f = clamp(((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1));
                d = Math.min(d, Math.hypot(x - p.x - dx * f, y - p.y - dy * f));
            }
            bank = Math.min(bank, d * (inside ? -1 : 1));
        }
        return bank;
    };
}
// 约束来自迷宫：每个开放格是一段必须走得通的路。格子越靠大厅中间，洞越宽、越往里越深。
function createVolume(t: KarstTerrain, maze: any): KarstVolumeData {
    const ts = maze.mazeTileSize, cols = maze.mazeCols, rows = maze.mazeRows, seam = maze.continuous?.seamY || 1080, first = Math.floor(seam / ts), seed = t.seed;
    const open = (r: number, c: number) => r >= first && r < rows && c >= 0 && c < cols && maze.mazeMap[r]?.[c] === 0;
    const dist = new Uint8Array(cols * rows), at = (r: number, c: number) => r < 0 || c < 0 || r >= rows || c >= cols ? 0 : dist[r * cols + c];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) dist[r * cols + c] = open(r, c) ? 3 : 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; if (dist[i]) dist[i] = Math.min(dist[i], at(r - 1, c) + 1, at(r, c - 1) + 1); }
    for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) { const i = r * cols + c; if (dist[i]) dist[i] = Math.min(dist[i], at(r + 1, c) + 1, at(r, c + 1) + 1); }
    const R = new Float32Array(cols * rows), ZE = new Float32Array(cols * rows), ZA = new Float32Array(cols * rows), LX = new Float32Array(cols * rows), LY = new Float32Array(cols * rows);
    for (let r = first; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c; if (!dist[i]) continue;
        const x = (c + .5) * ts, y = (r + .5) * ts, h = hash3(c, r, 1, seed), h2 = hash3(c, r, 2, seed), d = dist[i];
        const deg = Number(open(r - 1, c)) + Number(open(r + 1, c)) + Number(open(r, c - 1)) + Number(open(r, c + 1));
        R[i] = 42 + 16 * (.5 + .5 * noise3(x, y, 0, 520, seed + 31)) + 6 * h + (deg >= 3 ? 12 : 0) + (d >= 2 ? 38 : 0) + (d >= 3 ? 10 : 0);
        // 大厅往里很深，深到手电照不到底；窄道浅一些，但每一段都不一样。
        ZE[i] = d >= 2 ? 650 + 900 * (.5 + .5 * noise3(x, y, 0, 760, seed + 32)) : deg >= 3 ? 300 + 500 * h2 : 140 + 420 * h2;
        ZA[i] = ZE[i] * .3 * hash3(c, r, 3, seed);
        LX[i] = .26 * noise3(x, y, 0, 640, seed + 35) + .1 * (hash3(c, r, 4, seed) - .5);
        LY[i] = .5 * (.26 * noise3(x, y, 0, 640, seed + 36) + .1 * (hash3(c, r, 5, seed) - .5));
    }
    const segs: number[] = [], tileSegs: number[][] = []; let branches = 0;
    for (let i = 0; i < cols * rows; i++) tileSegs.push([]);
    const add = (a: number, b: number) => {
        const ac = a % cols, ar = (a - ac) / cols, bc = b % cols, br = (b - bc) / cols;
        tileSegs[a].push(segs.length / SEG);
        segs.push((ac + .5) * ts, (ar + .5) * ts, (bc + .5) * ts, (br + .5) * ts, R[a], R[b], ZA[a], ZA[b], (R[a] + R[b]) / (ZE[a] + ZE[b]), (LX[a] + LX[b]) / 2, (LY[a] + LY[b]) / 2);
    };
    for (let r = first; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c; if (!dist[i]) continue;
        const right = open(r, c + 1), down = open(r + 1, c);
        if (right) add(i, i + 1); if (down) add(i, i + cols);
        if (!right && !down) add(i, i);
        // 拐到后面去的支洞：从洞的深处斜着钻进岩石里，始终离游戏平面很远，进不去，只让人觉得那边还有空间。
        if (hash3(c, r, 7, seed) < (dist[i] >= 2 ? .3 : .12)) {
            const h = hash3(c, r, 8, seed), ang = hash3(c, r, 9, seed) * 6.2832, reach = 170 + 210 * h, ra = 42 + 16 * h, za = Math.max(140, ZE[i] * .42);
            tileSegs[i].push(segs.length / SEG); branches++;
            segs.push((c + .5) * ts, (r + .5) * ts, (c + .5) * ts + Math.cos(ang) * reach, (r + .5) * ts + Math.sin(ang) * reach * .6, ra, 52 + 40 * hash3(c, r, 10, seed), za, za + 320 + 340 * h, 1, 0, 0);
        }
    }
    const rearRegions = planKarstChambers(maze), rearProfiles = { flow: 0, terraces: 0, fracture: 0 };
    for (const room of rearRegions.rooms) rearProfiles[room.grammar === 'flow' ? 'flow' : room.grammar === 'fracture' ? 'fracture' : 'terraces']++;
    return { seed, seam, segs: new Float32Array(segs), tileSegs, tileCols: cols, tileRows: rows, tileSize: ts, lanes: continuousKarstProtection(maze), bank: bankField(maze), rearRegions,
        carves: [], carveBuckets: new Map(), drips: [dripField(150, seed + 61), dripField(62, seed + 62), dripField(46, seed + 63)],
        stats: { segments: segs.length / SEG, backBranches: branches, carves: 0, filledPockets: 0, sliceMs: 0, rearProfiles } };
}
// 每个连通区域有自己的后壁规律。深槽与浅壁交替，供灯光带出纵深层次。
function rearProfile(room: KarstChamber, x: number, y: number) {
    const angle = room.inclination, dx = x - room.x, dy = y - room.y;
    const u = dx * Math.cos(angle) + dy * Math.sin(angle), v = -dx * Math.sin(angle) + dy * Math.cos(angle);
    const phase = hash3(room.id, 3, 1, room.seed) * Math.PI * 2;
    if (room.grammar === 'flow') {
        const fold = u / 82 + .55 * Math.sin(v / 190 + phase);
        return 325 + 58 * Math.sin(fold) + 24 * Math.sin(v / 155 + phase) + 12 * noise3(x, y, 0, 65, room.seed);
    }
    if (room.grammar === 'fracture') {
        const fault = u - v * .32 - 42 * Math.sin(v / 220 + phase);
        const slot = Math.exp(-Math.pow(fault / 105, 2));
        return 555 + 290 * slot + 38 * Math.sin(v / 130 + phase) + 18 * noise3(x, y, 0, 95, room.seed);
    }
    const beds = 2 + 1.8 * Math.sin((v + 24 * Math.sin(u / 175)) / 170 + phase);
    const level = Math.floor(beds), terrace = level + smooth(.60, .96, beds - level);
    return 355 + terrace * 54 + 28 * Math.sin(u / 150 + phase) + 12 * noise3(x, y, 0, 72, room.seed);
}
export function sampleVolumeRearDepth(v: KarstVolumeData, x: number, y: number) {
    const regions = v.rearRegions, ts = regions.tileSize, gx = x / ts - .5, gy = y / ts - .5;
    const c = Math.floor(gx), r = Math.floor(gy), ax = (c + .5) * ts, ay = (r + .5) * ts;
    const a = regions.at(ax, ay), b = regions.at(ax + ts, ay), d = regions.at(ax, ay + ts), e = regions.at(ax + ts, ay + ts);
    const p = rearProfile(a, x, y), q = a === b ? p : rearProfile(b, x, y);
    const s = a === d ? p : rearProfile(d, x, y), t = b === e ? q : d === e ? s : rearProfile(e, x, y);
    const tx = smooth(0, 1, gx - c), ty = smooth(0, 1, gy - r);
    const top = p + (q - p) * tx, bottom = s + (t - s) * tx;
    const depth = top + (bottom - top) * ty, far = VOLUME_DEPTH - 14;
    return far + (Math.min(far, depth) - far) * smooth(v.seam + 96, v.seam + 360, y);
}
function carveValue(v: KarstVolumeData, x: number, y: number) {
    const list = v.carveBuckets.get(Math.floor(y / 128) * 4096 + Math.floor(x / 128)); if (!list) return -999;
    let best = -999;
    for (const q of list) {
        const ax = v.carves[q], ay = v.carves[q + 1], dx = v.carves[q + 2] - ax, dy = v.carves[q + 3] - ay, u = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1));
        best = Math.max(best, CARVE - Math.hypot(x - ax - dx * u, y - ay - dy * u));
    }
    return best;
}
function makeScratch(cells: number, columns: number, width: number, height: number): Scratch {
    return { F: new Float32Array(cells), X: new Float32Array(cells), Y: new Float32Array(cells), Z: new Float32Array(cells), RB: new Float32Array(cells), done: new Uint8Array(cells),
        P2: new Float32Array(columns), B2: new Float32Array(columns), flag: new Uint8Array(columns),
        LC: new Float32Array(width), LF: new Float32Array(width), RIB: new Float32Array(width), strength: new Float32Array(height), rear: null };
}
// 求一块区域里某一层的场。i0、j0 是地形格点下标，kk 是层号（0 是 z=0），off 是这一层在数组里的起始偏移。各层互不依赖。
function evaluateLayer(t: KarstTerrain, v: KarstVolumeData, i0: number, j0: number, ni: number, nj: number, kk: number, s: Scratch, list: number[] | Int32Array, off: number) {
    const S = t.step, plane = ni * nj, seed = v.seed, seam = v.seam, segs = v.segs, z = VOLUME_Z[kk + 1], { F, X, Y, Z, RB, done, P2, B2, flag, LC, LF, RIB, strength } = s, end = off + plane;
    F.fill(-192, off, end); RB.fill(0, off, end); done.fill(0, off, end);
    // 一、溶蚀洞腔：沿通路的一串粗细不均的胶囊体，在纵深方向各有进深和歪斜。坐标先做低频扭曲。
    for (let li = 0; li < list.length; li++) {
        const q = list[li] * SEG, ax = segs[q], ay = segs[q + 1], bx = segs[q + 2], by = segs[q + 3], ra = segs[q + 4], rb = segs[q + 5], za = segs[q + 6], zb = segs[q + 7], k = segs[q + 8], lx = segs[q + 9], ly = segs[q + 10];
        const zlo = Math.min(za, zb), zhi = Math.max(za, zb), gap = (z < zlo ? zlo - z : z > zhi ? z - zhi : 0) - 18, far = gap > 0 ? gap * k : 0, rmax = Math.max(ra, rb) + SOLID;
        if (far >= rmax) continue;
        const M = Math.sqrt(rmax * rmax - far * far) + 32, sx = lx * z, sy = ly * z;
        const a0 = Math.max(i0, Math.floor((Math.min(ax, bx) + sx - M - t.x) / S)), a1 = Math.min(i0 + ni - 1, Math.ceil((Math.max(ax, bx) + sx + M - t.x) / S));
        const b0 = Math.max(j0, Math.floor((Math.min(ay, by) + sy - M - t.y) / S)), b1 = Math.min(j0 + nj - 1, Math.ceil((Math.max(ay, by) + sy + M - t.y) / S));
        const ex = bx - ax, ey = by - ay, ez = (zb - za) * k, l2 = ex * ex + ey * ey + ez * ez || 1;
        for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
            const o = off + (i - i0) + ni * (j - j0);
            if (!done[o]) {
                const x = t.x + i * S, y = t.y + j * S, m = 7 * noise3(x, y, z, 85, seed + 4); done[o] = 1;
                X[o] = x + 18 * noise3(x, y, z, 240, seed + 1) + m; Y[o] = y + 16 * noise3(x, y, z, 240, seed + 2) - m; Z[o] = z + 18 * noise3(x, y, z, 240, seed + 3);
            }
            const zz = Z[o], px = X[o] - lx * zz - ax, py = Y[o] - ly * zz - ay, pz = (zz - za) * k;
            let u = (px * ex + py * ey + pz * ez) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
            const dx = px - ex * u, dy = py - ey * u, dz = pz - ez * u, r = ra + (rb - ra) * u, val = r - Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (val > F[o]) { F[o] = val; RB[o] = r; }
        }
    }
    // 这一层每一列的钟乳石长度。落点只跟 x、z 有关，所以整列共用。
    for (let ii = 0; ii < ni; ii++) {
        const x = t.x + (i0 + ii) * S, c0 = v.drips[0](x, z, false), c1 = v.drips[1](x, z, false), c2 = v.drips[2](x, z, false), vary = .45 + .75 * (.5 + .5 * noise3(x, 0, z, 330, seed + 51));
        RIB[ii] = 9 * c1 + 5 * c2; LC[ii] = Math.min(CEILING, (215 * c0 + 90 * c1 + 20 * c2) * vary);
        LF[ii] = Math.min(FLOOR, (120 * v.drips[0](x, z, true) + 50 * v.drips[1](x, z, true) + 10 * v.drips[2](x, z, true)) * vary);
    }
    // 二、溶蚀起伏、洞壁竖棱、与岸坡的衔接、地图边界和最深处的封底。
    const back = VOLUME_DEPTH - 14 - z;
    for (let jj = 0; jj < nj; jj++) for (let ii = 0; ii < ni; ii++) {
        const col = ii + ni * jj, o = off + col, i = i0 + ii, j = j0 + jj, x = t.x + i * S, y = t.y + j * S; let val = F[o];
        if (done[o]) {
            if (!(flag[col] & 1)) { P2[col] = Math.max(v.lanes(x, y), carveValue(v, x, y)); flag[col] |= 1; }
            val += (11 * noise3(X[o], Y[o], Z[o], 120, seed + 11) + 4 * noise3(X[o], Y[o], Z[o], 44, seed + 12)) * clamp((RB[o] - 18) / 50, .2, 1);
            if (val > -30 && RB[o] > 40) val -= RIB[ii] * clamp((RB[o] - 40) / 30) * smooth(seam + 60, seam + 220, y);
        }
        if (v.bank && y < seam + 96) {
            if (!(flag[col] & 2)) { B2[col] = v.bank(x, y); flag[col] |= 2; }
            const b = Math.min(B2[col], 190 + 30 * noise3(x, y, 0, 170, seed + 41) - z); val = b + (val - b) * smooth(seam - 48, seam + 96, y);
        }
        if (i === 0 || i === t.cols - 1 || j === t.rows - 1) val = -192;
        // 只塑形游戏平面后方，旧档碰撞场以及贴近潜水员的网格保持相同。
        if (z > 100) {
            if (!s.rear) s.rear = new Float32Array(s.flag.length);
            if (!(flag[col] & 4)) { s.rear[col] = sampleVolumeRearDepth(v, x, y); flag[col] |= 4; }
            val = Math.min(val, s.rear[col] - z);
        }
        F[o] = Math.min(val, back);
    }
    // 三、钟乳石体系：每一处洞顶往下挂、每一处洞底往上长。开阔处长得大，靠近必须留出的身位处收小。
    for (let ii = 0; ii < ni; ii++) {
        const ceiling = LC[ii], ground = LF[ii]; let edge = 0, has = false, broken = false, last = 0, rock = false;
        for (let jj = 0; jj < nj; jj++) {
            const col = ii + ni * jj, o = off + col, f = F[o], y = t.y + (j0 + jj) * S; strength[jj] = 0;
            if (f <= 0) { rock = true; last = f; has = true; broken = false; continue; }
            if (rock) { edge = y - S + S * last / (last - f); rock = false; }
            if (!has || !(flag[col] & 1)) continue;
            const st = clamp((RB[o] - 58) / 45) * smooth(26, 64, 34 - P2[col]) * smooth(seam + 60, seam + 220, y); strength[jj] = st;
            let val = y - edge - ceiling * st;
            if (broken) val = Math.max(val, S * .5); else if (val >= 0) broken = true;
            if (val < f) F[o] = val;
        }
        has = false; rock = false; broken = false;
        for (let jj = nj - 1; jj >= 0; jj--) {
            const o = off + ii + ni * jj, f = F[o], y = t.y + (j0 + jj) * S;
            if (f <= 0) { rock = true; last = f; has = true; broken = false; continue; }
            if (rock) { edge = y + S - S * last / (last - f); rock = false; }
            if (!has) continue;
            let val = edge - y - ground * strength[jj];
            if (broken) val = Math.max(val, S * .5); else if (val >= 0) broken = true;
            if (val < f) F[o] = val;
        }
    }
    // 四、保底：通路在游戏平面上留出身体净空，往里收成半个管。
    if (z <= 44) for (let col = 0; col < plane; col++) { if (!(flag[col] & 1)) continue; const p = P2[col] - z; if (p > F[off + col]) F[off + col] = p; }
}
// 游戏平面上每格到洞壁的距离，贴着洞壁的格子按过零点取亚格精度。
function waterClearance(F: Float32Array, cols: number, rows: number, S: number) {
    const d = new Float32Array(cols * rows), B = S * 1.4142;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const c = i + cols * j, f = F[c]; if (f <= 0) continue; let best = 1e6;
        if (i > 0 && F[c - 1] <= 0) best = Math.min(best, f / (f - F[c - 1])); if (i < cols - 1 && F[c + 1] <= 0) best = Math.min(best, f / (f - F[c + 1]));
        if (j > 0 && F[c - cols] <= 0) best = Math.min(best, f / (f - F[c - cols])); if (j < rows - 1 && F[c + cols] <= 0) best = Math.min(best, f / (f - F[c + cols]));
        d[c] = best < 1e6 ? best * S : 1e6;
    }
    for (let j = 1; j < rows - 1; j++) for (let i = 1; i < cols - 1; i++) { const c = i + cols * j; if (d[c] > 0) d[c] = Math.min(d[c], d[c - 1] + S, d[c - cols] + S, d[c - cols - 1] + B, d[c - cols + 1] + B); }
    for (let j = rows - 2; j > 0; j--) for (let i = cols - 2; i > 0; i--) { const c = i + cols * j; if (d[c] > 0) d[c] = Math.min(d[c], d[c + 1] + S, d[c + cols] + S, d[c + cols + 1] + B, d[c + cols - 1] + B); }
    return d;
}
// 生成整张地图在游戏平面上的切面，写入 t.field，供碰撞、手电遮挡、绳索和鱼共用。
export function buildVolumeField(t: KarstTerrain, maze: any) {
    const start = Date.now(), v = createVolume(t, maze), cols = t.cols, rows = t.rows, S = t.step, n = cols * rows, ts = maze.mazeTileSize, first = Math.floor(v.seam / ts);
    t.volume = v;
    const all = new Int32Array(v.stats.segments); for (let i = 0; i < all.length; i++) all[i] = i;
    const s = makeScratch(n, n, cols, rows); evaluateLayer(t, v, 0, 0, cols, rows, 0, s, all, 0);
    const F = s.F, clear = waterClearance(F, cols, rows, S), reach = new Uint8Array(n), queue = new Int32Array(n); let head = 0, tail = 0;
    const cellAt = (x: number, y: number) => clamp(Math.round((x - t.x) / S), 0, cols - 1) + cols * clamp(Math.round((y - t.y) / S), 0, rows - 1);
    const push = (c: number) => { if (!reach[c] && clear[c] >= BODY) { reach[c] = 1; queue[tail++] = c; } };
    const flood = () => { while (head < tail) { const c = queue[head++], i = c % cols; if (i > 0) push(c - 1); if (i < cols - 1) push(c + 1); if (c >= cols) push(c - cols); if (c < n - cols) push(c + cols); } };
    // 被钟乳石堵死的格子，从它在迷宫里的上一格开一条刚好过人的路，保证每个开放格都游得到。
    const carve = (ax: number, ay: number, bx: number, by: number) => {
        const q = v.carves.length; v.carves.push(ax, ay, bx, by); v.stats.carves++;
        for (let gy = Math.floor((Math.min(ay, by) - CARVE) / 128); gy <= Math.floor((Math.max(ay, by) + CARVE) / 128); gy++)
            for (let gx = Math.floor((Math.min(ax, bx) - CARVE) / 128); gx <= Math.floor((Math.max(ax, bx) + CARVE) / 128); gx++) {
                const key = gy * 4096 + gx; if (!v.carveBuckets.has(key)) v.carveBuckets.set(key, []); v.carveBuckets.get(key)!.push(q);
            }
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
        const i0 = Math.max(1, Math.floor((Math.min(ax, bx) - CARVE - t.x) / S)), i1 = Math.min(cols - 2, Math.ceil((Math.max(ax, bx) + CARVE - t.x) / S));
        const j0 = Math.max(0, Math.floor((Math.min(ay, by) - CARVE - t.y) / S)), j1 = Math.min(rows - 2, Math.ceil((Math.max(ay, by) + CARVE - t.y) / S));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const x = t.x + i * S, y = t.y + j * S, u = clamp(((x - ax) * dx + (y - ay) * dy) / l2), val = CARVE - Math.hypot(x - ax - dx * u, y - ay - dy * u), c = i + cols * j;
            if (val > F[c]) F[c] = val; if (val > clear[c]) clear[c] = val; if (val >= BODY) push(c);
        }
        flood();
    };
    const ex = maze.exitX, ey = v.seam + ts * .5, mc = maze.mazeCols, mr = maze.mazeRows;
    const open = (r: number, c: number) => r >= first && r < mr && c >= 0 && c < mc && maze.mazeMap[r]?.[c] === 0;
    push(cellAt(ex, ey)); flood(); if (!tail) carve(ex, ey, ex, ey);
    let sc = Math.floor(ex / ts); for (let d = 0; d < 4 && !open(first, sc); d++) sc = open(first, sc - d - 1) ? sc - d - 1 : open(first, sc + d + 1) ? sc + d + 1 : sc;
    if (open(first, sc)) {
        const seen = new Uint8Array(mc * mr), order = new Int32Array(mc * mr), parent = new Int32Array(mc * mr); let qh = 0, qt = 0;
        order[qt++] = first * mc + sc; seen[first * mc + sc] = 1; parent[first * mc + sc] = -1;
        while (qh < qt) {
            const id = order[qh++], c = id % mc, r = (id - c) / mc, x = (c + .5) * ts, y = (r + .5) * ts;
            if (!reach[cellAt(x, y)]) { const p = parent[id]; if (p < 0) carve(ex, ey, x, y); else carve((p % mc + .5) * ts, (Math.floor(p / mc) + .5) * ts, x, y); }
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc, next = nr * mc + nc; if (!open(nr, nc) || seen[next]) continue;
                seen[next] = 1; parent[next] = id; order[qt++] = next;
            }
        }
    }
    // 游戏平面上不留进不去的空腔：和入口不连通的水域一律填成岩石。
    head = 0;
    while (head < tail) {
        const c = queue[head++], i = c % cols;
        for (const o of [i > 0 ? c - 1 : -1, i < cols - 1 ? c + 1 : -1, c - cols, c + cols]) if (o >= 0 && o < n && !reach[o] && F[o] > 0) { reach[o] = 1; queue[tail++] = o; }
    }
    for (let c = 0; c < n; c++) {
        if (F[c] > 0 && !reach[c]) { F[c] = -4; v.stats.filledPockets++; }
        F[c] = clamp(F[c], -192, 192); if (Math.abs(F[c]) < .0001) F[c] = .0001;
    }
    t.field = F; v.stats.sliceMs = Date.now() - start;
}

// 分块网格。同一时间只生成一块：所有分块共用一份临时内存。
let chunkScratch: Scratch | null = null, cellVertex: Int32Array | null = null;
const NK = LAYERS + 1, OFFSET_EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], OFFSET_EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7], corner = new Float64Array(8);
export function startVolumeChunk(t: KarstTerrain, ci: number, cj: number): KarstVolumeJob | null {
    const v = t.volume, c0 = ci * VOLUME_CHUNK, r0 = cj * VOLUME_CHUNK;
    if (!v || ci < 0 || cj < 0 || c0 >= t.cols - 1 || r0 >= t.rows - 1) return null;
    const S = t.step, i0 = Math.max(0, c0 - RING), i1 = Math.min(t.cols - 1, c0 + VOLUME_CHUNK + RING), j0 = Math.max(0, r0 - MARGIN_TOP), j1 = Math.min(t.rows - 1, r0 + VOLUME_CHUNK + MARGIN_BOTTOM);
    const width = VOLUME_CHUNK + RING * 2 + 1, height = VOLUME_CHUNK + MARGIN_TOP + MARGIN_BOTTOM + 1;
    if (!chunkScratch) { chunkScratch = makeScratch(width * height * NK, width * height, width, height); cellVertex = new Int32Array(width * height * NK); }
    chunkScratch.flag.fill(0);
    const pad = 420 + .31 * VOLUME_DEPTH, ts = v.tileSize, list: number[] = [];
    for (let r = Math.max(0, Math.floor((t.y + j0 * S - pad) / ts)); r <= Math.min(v.tileRows - 1, Math.floor((t.y + j1 * S + pad) / ts)); r++)
        for (let c = Math.max(0, Math.floor((t.x + i0 * S - pad) / ts)); c <= Math.min(v.tileCols - 1, Math.floor((t.x + i1 * S + pad) / ts)); c++)
            for (const q of v.tileSegs[r * v.tileCols + c]) list.push(q);
    return { ci, cj, i0, j0, ni: i1 - i0 + 1, nj: j1 - j0 + 1, list, phase: 0, k: 1, P: [], I: [], positions: null, normals: null, ms: 0, longestStep: 0, dropped: 0 };
}
// 推进一小步或几小步，直到超过 deadline（毫秒时间戳）。全部完成时返回网格，否则返回 null。
export function stepVolumeChunk(t: KarstTerrain, job: KarstVolumeJob, deadline: number): KarstVolumeMesh | null {
    const s = chunkScratch!, cell = cellVertex!, F = s.F, { i0, j0, ni, nj } = job, plane = ni * nj, S = t.step;
    const c0 = job.ci * VOLUME_CHUNK, r0 = job.cj * VOLUME_CHUNK, OFF = [0, 1, ni, ni + 1, plane, plane + 1, plane + ni, plane + ni + 1];
    const oi0 = c0 - i0, oi1 = Math.min(c0 + VOLUME_CHUNK, t.cols - 1) - i0, oj0 = r0 - j0, oj1 = Math.min(r0 + VOLUME_CHUNK, t.rows - 1) - j0;
    const vi0 = Math.max(0, oi0 - 1), vi1 = Math.min(ni - 2, oi1 - 1), vj0 = Math.max(0, oj0 - 1), vj1 = Math.min(nj - 2, oj1 - 1);
    for (;;) {
        const began = Date.now();
        if (job.phase === 0) {
            // 逐层求场。z=0 那一层直接取碰撞用的切面，所以看到的洞壁边缘和碰到的是同一条线。
            if (job.k < LAYERS) { evaluateLayer(t, t.volume!, i0, j0, ni, nj, job.k, s, job.list, plane * (job.k + 1)); job.k++; }
            else {
                for (let jj = 0; jj < nj; jj++) for (let ii = 0; ii < ni; ii++) { const f = t.field[(j0 + jj) * t.cols + i0 + ii], col = ii + ni * jj; F[plane + col] = f; F[col] = f < 0 ? -f : Math.max(f, 1); }
                job.phase = 1; job.k = 0;
            }
        } else if (job.phase === 1) {
            // 每个跨过洞壁的小格出一个顶点。
            const k = job.k, P = job.P;
            for (let j = vj0; j <= vj1; j++) for (let i = vi0; i <= vi1; i++) {
                const b = i + ni * (j + nj * k); let positive = 0; cell[b] = -1;
                for (let c = 0; c < 8; c++) { corner[c] = F[b + OFF[c]]; if (corner[c] > 0) positive++; }
                if (positive === 0 || positive === 8) continue;
                let sx = 0, sy = 0, sz = 0, count = 0, fx = 0, fy = 0, flat = 0;
                for (let e = 0; e < 12; e++) {
                    const a = OFFSET_EA[e], c = OFFSET_EB[e], va = corner[a], vc = corner[c]; if ((va > 0) === (vc > 0)) continue;
                    const u = va / (va - vc), ax = a & 1, ay = a >> 1 & 1, az = a >> 2, x = ax + ((c & 1) - ax) * u, y = ay + ((c >> 1 & 1) - ay) * u;
                    sx += x; sy += y; sz += az + ((c >> 2) - az) * u; count++;
                    if (a >= 4 && c >= 4) { fx += x; fy += y; flat++; }
                }
                // 剖面边缘上的顶点只按游戏平面上的过零点定位，和碰撞轮廓重合。
                if (k === 0 && flat) { sx = fx / flat * count; sy = fy / flat * count; }
                cell[b] = P.length / 3; P.push(i + sx / count, j + sy / count, k + sz / count);
            }
            if (++job.k >= NK - 1) { job.phase = 2; job.k = 0; }
        } else if (job.phase === 2) {
            // 相邻顶点连成面。每条格边只归一个分块，所以块与块之间不重不漏。
            const k = job.k, I = job.I;
            const quad = (a: number, b: number, c: number, d: number) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (Math.max(a, b, c, d) > 65535) { job.dropped++; return; } I.push(a, b, c, a, c, d); };
            for (let j = oj0; j < oj1; j++) for (let i = oi0; i < oi1; i++) {
                const b = i + ni * (j + nj * k), w = F[b] > 0;
                if (j > 0 && k > 0 && w !== (F[b + 1] > 0)) quad(cell[b - ni - plane], cell[b - plane], cell[b], cell[b - ni]);
                if (i > 0 && k > 0 && w !== (F[b + ni] > 0)) quad(cell[b - 1 - plane], cell[b - plane], cell[b], cell[b - 1]);
                if (i > 0 && j > 0 && w !== (F[b + plane] > 0)) quad(cell[b - 1 - ni], cell[b - ni], cell[b], cell[b - 1]);
            }
            if (++job.k >= NK - 1) { job.phase = 3; job.k = 0; const count = job.P.length / 3; job.positions = new Float32Array(count * 3); job.normals = new Float32Array(count * 3); }
        } else {
            const P = job.P, count = P.length / 3, positions = job.positions!, normals = job.normals!, h = .6, stop = Math.min(count, job.k + 2500);
            const sample = (x: number, y: number, z: number) => {
                x = clamp(x, 0, ni - 1.001); y = clamp(y, 0, nj - 1.001); z = clamp(z, 0, NK - 1.001);
                const i = x | 0, j = y | 0, k = z | 0, u = x - i, w = y - j, q = z - k, b = i + ni * (j + nj * k);
                const a0 = F[b] + (F[b + 1] - F[b]) * u, a1 = F[b + ni] + (F[b + ni + 1] - F[b + ni]) * u, a2 = F[b + plane] + (F[b + plane + 1] - F[b + plane]) * u, a3 = F[b + plane + ni] + (F[b + plane + ni + 1] - F[b + plane + ni]) * u;
                const lo = a0 + (a1 - a0) * w, hi = a2 + (a3 - a2) * w; return lo + (hi - lo) * q;
            };
            for (let n = job.k; n < stop; n++) {
                const x = P[n * 3], y = P[n * 3 + 1], z = P[n * 3 + 2], k = Math.min(NK - 2, z | 0), dz = VOLUME_Z[k + 1] - VOLUME_Z[k];
                positions[n * 3] = t.x + (i0 + x) * S; positions[n * 3 + 1] = t.y + (j0 + y) * S; positions[n * 3 + 2] = VOLUME_Z[k] + dz * (z - k);
                const gx = (sample(x + h, y, z) - sample(x - h, y, z)) / S, gy = (sample(x, y + h, z) - sample(x, y - h, z)) / S, gz = (sample(x, y, z + h) - sample(x, y, z - h)) / dz, l = Math.hypot(gx, gy, gz) || 1;
                normals[n * 3] = gx / l; normals[n * 3 + 1] = gy / l; normals[n * 3 + 2] = gz / l;
            }
            job.k = stop;
            if (stop >= count) { const took = Date.now() - began; job.ms += took; job.longestStep = Math.max(job.longestStep, took); return { positions, normals, indices: new Uint16Array(job.I), ms: job.ms, dropped: job.dropped }; }
        }
        const now = Date.now(), took = now - began; job.ms += took; job.longestStep = Math.max(job.longestStep, took);
        if (now >= deadline) return null;
    }
}
// 一次算完一块，供检查脚本使用。
export function buildVolumeChunk(t: KarstTerrain, ci: number, cj: number): KarstVolumeMesh | null {
    const job = startVolumeChunk(t, ci, cj); return job ? stepVolumeChunk(t, job, Infinity) : null;
}
