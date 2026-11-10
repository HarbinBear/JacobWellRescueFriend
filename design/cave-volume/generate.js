// 三维洞腔生成小样 S03：洞腔先由溶蚀形成，洞壁再整体长出钟乳石体系；水上地面和水下洞腔是同一个场。
// 场的约定：正值是水或空气，负值是岩石。坐标：x 向右，y 向下，z 朝屏幕里面；z=0 是游戏平面，y=SURFACE 是水面。
(function (root) {
'use strict';
const S = 10, W = 1800, H = 1400, ZMAX = 360, BODY = 18, PROTECT = 28, SURFACE = 200, GROUND = 148;
const NX = W / S + 1, NY = H / S + 1, NZ = ZMAX / S + 2, NXY = NX * NY; // k=0 是剖面盖层，k=1 是 z=0
const zOf = k => (k - 1) * S, clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;

function rng(seed) {
    let a = seed >>> 0;
    return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash3(x, y, z, s) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519) ^ Math.imul(s, 3266489917);
    h = Math.imul(h ^ h >>> 15, 2246822519); h = Math.imul(h ^ h >>> 13, 3266489917);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function noise3(x, y, z, scale, s) {
    x /= scale; y /= scale; z /= scale;
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let u = x - xi, v = y - yi, w = z - zi; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
    const a = hash3(xi, yi, zi, s), b = hash3(xi + 1, yi, zi, s), c = hash3(xi, yi + 1, zi, s), d = hash3(xi + 1, yi + 1, zi, s);
    const e = hash3(xi, yi, zi + 1, s), f = hash3(xi + 1, yi, zi + 1, s), g = hash3(xi, yi + 1, zi + 1, s), h = hash3(xi + 1, yi + 1, zi + 1, s);
    const p = a + (b - a) * u, q = c + (d - c) * u, r = e + (f - e) * u, t = g + (h - g) * u;
    const lo = p + (q - p) * v, hi = r + (t - r) * v;
    return (lo + (hi - lo) * w) * 2 - 1;
}
function smax(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * .25; }
function smooth(a, b, v) { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

// 约束一：路线图。一串必须走得通的路点，有岔路、回环、死胡同；最上面接一个水面入口。它不规定哪里是洞室、哪里是通道。
function planRoutes(rand) {
    const COLS = 4, ROWS = 3, x0 = 250, y0 = SURFACE + 260, cw = (W - 500) / COLS, ch = (H - y0 - 200) / ROWS, nodes = [], edges = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
        nodes.push({ id: nodes.length, c, r, x: x0 + (c + .5) * cw + (rand() - .5) * cw * .6, y: y0 + (r + .5) * ch + (rand() - .5) * ch * .5, links: [] });
    const at = (c, r) => c < 0 || r < 0 || c >= COLS || r >= ROWS ? null : nodes[r * COLS + c];
    const link = (a, b, loop) => { edges.push({ a: a.id, b: b.id, loop, points: [] }); a.links.push(b.id); b.links.push(a.id); };
    const top = at(1 + Math.floor(rand() * 2), 0), seen = new Set([top.id]), open = [top];
    while (open.length) {
        const pick = rand() < .55 ? open.length - 1 : Math.floor(rand() * open.length), n = open[pick];
        const next = [at(n.c + 1, n.r), at(n.c - 1, n.r), at(n.c, n.r + 1), at(n.c, n.r - 1)].filter(m => m && !seen.has(m.id));
        if (!next.length) { open.splice(pick, 1); continue; }
        const m = next[Math.floor(rand() * next.length)]; seen.add(m.id); link(n, m, false); open.push(m);
    }
    for (let tries = 0, added = 0; tries < 60 && added < 3; tries++) {
        const n = nodes[Math.floor(rand() * nodes.length)], m = rand() < .5 ? at(n.c + 1, n.r) : at(n.c, n.r + 1);
        if (m && !n.links.includes(m.id)) { link(n, m, true); added++; }
    }
    const pool = { id: nodes.length, c: top.c, r: -1, x: clamp(top.x + (rand() - .5) * 160, 660, W - 420), y: SURFACE + 85, links: [], pool: true };
    nodes.push(pool); link(pool, top, false);
    const far = new Map([[pool.id, 0]]), from = new Map(), queue = [pool.id];
    while (queue.length) {
        const id = queue.shift();
        for (const e of edges) {
            if (e.loop) continue;
            const o = e.a === id ? e.b : e.b === id ? e.a : -1;
            if (o < 0 || far.has(o)) continue;
            far.set(o, far.get(id) + Math.hypot(nodes[o].x - nodes[id].x, nodes[o].y - nodes[id].y)); from.set(o, id); queue.push(o);
        }
    }
    let target = pool; for (const n of nodes) if (far.get(n.id) > far.get(target.id)) target = n;
    const main = []; for (let id = target.id; id !== undefined; id = from.get(id)) main.unshift(id);
    return { nodes, edges, start: pool.id, target: target.id, main };
}

// 宽窄由一张空间上连续的“开阔度”决定：开阔的地方相邻路线会并成大厅，其余地方只留窄缝。
function widthAt(x, y, seed) {
    const n = .5 + .5 * noise3(x, y, 0, 300, seed + 31) + .2 * noise3(x, y, 0, 120, seed + 32);
    return 34 + 14 * (.5 + .5 * noise3(x, y, 0, 85, seed + 33)) + 105 * smooth(.58, .86, n);
}
// 溶蚀出来的原始洞腔：沿路线的一串粗细不均的胶囊体，在朝屏幕里面的方向上各有进深和歪斜；另有几条拐到后面去的支洞。
function layRoutes(plan, rand, seed) {
    const { nodes, edges } = plan, pool = nodes[plan.start], goal = nodes[plan.target], groups = [], spine = [], extra = [];
    for (const e of edges) {
        const a = nodes[e.a], b = nodes[e.b], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), bend = (rand() - .5) * (a.pool || b.pool ? 60 : 170);
        const mx = (a.x + b.x) / 2 - dy / len * bend, my = (a.y + b.y) / 2 + dx / len * bend, lx = (rand() - .5) * .5, ly = (rand() - .5) * .4, k = .42 + rand() * .3, zf = .25 + rand() * .7, N = 16, segs = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N, u = 1 - t, x = u * u * a.x + 2 * u * t * mx + t * t * b.x, y = u * u * a.y + 2 * u * t * my + t * t * b.y;
            const r = Math.max(widthAt(x, y, seed), 135 - Math.hypot(x - pool.x, y - pool.y) / 1.6, 58 - Math.hypot(x - goal.x, y - goal.y) / 3);
            const p = { x, y, r, z: Math.max(0, Math.min(r * zf, (r - 27) / k)) }, prev = e.points[e.points.length - 1];
            if (prev) {
                segs.push({ ax: prev.x, ay: prev.y, bx: x, by: y, ra: prev.r, rb: r, za: prev.z, zb: p.z, k, lx, ly });
                for (let q = 1, steps = Math.max(1, Math.ceil(Math.hypot(x - prev.x, y - prev.y) / 20)); q <= steps; q++) { const f = q / steps; spine.push({ x: prev.x + (x - prev.x) * f, y: prev.y + (y - prev.y) * f, r: prev.r + (r - prev.r) * f }); }
            } else spine.push(p);
            e.points.push(p);
        }
        groups.push(segs);
    }
    const cands = spine.filter(p => p.r > 44 && p.y > SURFACE + 240), starts = [];
    for (let n = 0; n < 60 && starts.length < 6 && cands.length; n++) {
        const p = cands[Math.floor(rand() * cands.length)]; if (starts.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 250)) continue;
        const ang = rand() * 6.2832, reach = 150 + rand() * 170, ex = p.x + Math.cos(ang) * reach, ey = p.y + Math.sin(ang) * reach * .6, r0 = Math.min(p.r * .7, 60), r1 = 55 + rand() * 45, wob = (rand() - .5) * 60, segs = [];
        let prev = null;
        for (let i = 0; i <= 5; i++) {
            const t = i / 5, s = t * t * (3 - 2 * t), q = { x: p.x + (ex - p.x) * s, y: p.y + (ey - p.y) * s + Math.sin(t * 3.1416) * wob, z: p.r * .5 + (310 - p.r * .5) * t, r: r0 + (r1 - r0) * t };
            if (prev) segs.push({ ax: prev.x, ay: prev.y, bx: q.x, by: q.y, ra: prev.r, rb: q.r, za: prev.z, zb: q.z, k: 1, lx: 0, ly: 0 });
            prev = q; extra.push(q);
        }
        groups.push(segs); starts.push(p);
    }
    return { groups, spine, extra, branches: starts.length };
}

// 钟乳石的落点：在水平面（x、z）上撒点，所以每个形体都是竖直的。同一个落点上面挂石钟乳、下面长石笋，长到一起就是石柱；
// 一部分落点沿裂隙拉长成石幔。相邻的形体互相并在一起，不是一个个单独摆上去的。
function dripField(C, seed) {
    const cache = new Map();
    const cell = (ix, iz) => {
        const key = ix * 4096 + iz; let f = cache.get(key);
        if (!f) {
            const h = n => hash3(ix, iz, n, seed), curtain = h(5) < .35, th = h(7) * 3.1416;
            f = { x: (ix + h(1)) * C, z: (iz + h(2)) * C, amp: .2 + .8 * Math.pow(h(3), 1.5), R: C * (.42 + .5 * h(4)) * (curtain ? .6 : 1), e: curtain ? 2 + 1.4 * h(6) : 1,
                co: Math.cos(th), si: Math.sin(th), power: 1 + 1.2 * h(9), mound: .35 + .5 * h(8) };
            cache.set(key, f);
        }
        return f;
    };
    return (x, z, floor) => {
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

// 洞壁上一个挨一个的鼓包：像龟壳、像流石，鼓包之间是凹缝，竖向拉长。它改的是洞壁本身，不是往上贴东西。
function lobeField(seed) {
    const C = 66, SY = .55, nx = Math.ceil(W / C) + 4, ny = Math.ceil(H * SY / C) + 4, nz = Math.ceil(ZMAX / C) + 5, pts = new Float32Array(nx * ny * nz * 3);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = (i + nx * (j + ny * k)) * 3; pts[o] = (i - 2 + hash3(i, j, k, seed)) * C; pts[o + 1] = (j - 2 + hash3(i, j, k, seed + 1)) * C; pts[o + 2] = (k - 2 + hash3(i, j, k, seed + 2)) * C; }
    return (x, y, z) => {
        y *= SY; const ci = Math.floor(x / C) + 2, cj = Math.floor(y / C) + 2, ck = Math.floor(z / C) + 2; let d1 = 1e9, d2 = 1e9;
        for (let c = ck - 1; c <= ck + 1; c++) { if (c < 0 || c >= nz) continue; for (let b = cj - 1; b <= cj + 1; b++) { if (b < 0 || b >= ny) continue; for (let a = ci - 1; a <= ci + 1; a++) { if (a < 0 || a >= nx) continue;
            const o = (a + nx * (b + ny * c)) * 3, dx = x - pts[o], dy = y - pts[o + 1], dz = z - pts[o + 2], d = dx * dx + dy * dy + dz * dz; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; } } }
        return 15 * smooth(0, .5, (Math.sqrt(d2) - Math.sqrt(d1)) / C) - 6;
    };
}

// 游戏平面上每一格到洞壁的距离。贴着洞壁的格子按场的过零点取亚格精度，所以边缘不是一格一格的台阶。
function distance(slice, water) {
    const d = new Float32Array(NXY), A = S, B = S * 1.4142, inside = c => (slice[c] > 0) === water;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const c = i + NX * j; if (!inside(c)) continue;
        const f = Math.abs(slice[c]); let best = 1e6;
        if (i > 0 && !inside(c - 1)) best = Math.min(best, f / (f + Math.abs(slice[c - 1])));
        if (i < NX - 1 && !inside(c + 1)) best = Math.min(best, f / (f + Math.abs(slice[c + 1])));
        if (j > 0 && !inside(c - NX)) best = Math.min(best, f / (f + Math.abs(slice[c - NX])));
        if (j < NY - 1 && !inside(c + NX)) best = Math.min(best, f / (f + Math.abs(slice[c + NX])));
        d[c] = best < 1e6 ? best * S : 1e6;
    }
    for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) { const c = i + NX * j; d[c] = Math.min(d[c], d[c - 1] + A, d[c - NX] + A, d[c - NX - 1] + B, d[c - NX + 1] + B); }
    for (let j = NY - 2; j > 0; j--) for (let i = NX - 2; i > 0; i--) { const c = i + NX * j; d[c] = Math.min(d[c], d[c + 1] + A, d[c + NX] + A, d[c + NX + 1] + B, d[c + NX - 1] + B); }
    return d;
}

function buildMesh(F) {
    const cell = new Int32Array(NXY * NZ).fill(-1), P = [], I = [], v = new Float64Array(8);
    const OFF = [0, 1, NX, NX + 1, NXY, NXY + 1, NXY + NX, NXY + NX + 1], EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
    for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
        const b = i + NX * (j + NY * k); let positive = 0;
        for (let c = 0; c < 8; c++) { v[c] = F[b + OFF[c]]; if (v[c] > 0) positive++; }
        if (positive === 0 || positive === 8) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
            const a = EA[e], c = EB[e], va = v[a], vc = v[c];
            if ((va > 0) === (vc > 0)) continue;
            const t = va / (va - vc), ax = a & 1, ay = a >> 1 & 1, az = a >> 2;
            sx += ax + ((c & 1) - ax) * t; sy += ay + ((c >> 1 & 1) - ay) * t; sz += az + ((c >> 2) - az) * t; n++;
        }
        cell[b] = P.length / 3; P.push((i + sx / n) * S, (j + sy / n) * S, (k - 1 + sz / n) * S);
    }
    const quad = (a, b, c, d) => { if (a >= 0 && b >= 0 && c >= 0 && d >= 0) I.push(a, b, c, a, c, d); };
    for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
        const b = i + NX * (j + NY * k), s = F[b] > 0;
        if (j && k && s !== (F[b + 1] > 0)) quad(cell[b - NX - NXY], cell[b - NXY], cell[b], cell[b - NX]);
        if (i && k && s !== (F[b + NX] > 0)) quad(cell[b - 1 - NXY], cell[b - NXY], cell[b], cell[b - 1]);
        if (i && j && s !== (F[b + NXY] > 0)) quad(cell[b - 1 - NX], cell[b - NX], cell[b], cell[b - 1]);
    }
    const sample = (x, y, z) => {
        x = x < 0 ? 0 : x > NX - 1.001 ? NX - 1.001 : x; y = y < 0 ? 0 : y > NY - 1.001 ? NY - 1.001 : y; z = z < 0 ? 0 : z > NZ - 1.001 ? NZ - 1.001 : z;
        const i = x | 0, j = y | 0, k = z | 0, u = x - i, w = y - j, t = z - k, b = i + NX * (j + NY * k);
        const a0 = F[b] + (F[b + 1] - F[b]) * u, a1 = F[b + NX] + (F[b + NX + 1] - F[b + NX]) * u;
        const a2 = F[b + NXY] + (F[b + NXY + 1] - F[b + NXY]) * u, a3 = F[b + NXY + NX] + (F[b + NXY + NX + 1] - F[b + NXY + NX]) * u;
        const lo = a0 + (a1 - a0) * w, hi = a2 + (a3 - a2) * w; return lo + (hi - lo) * t;
    };
    const positions = new Float32Array(P), normals = new Float32Array(P.length), h = .6;
    for (let n = 0; n < P.length; n += 3) {
        const x = P[n] / S, y = P[n + 1] / S, z = P[n + 2] / S + 1;
        const gx = sample(x + h, y, z) - sample(x - h, y, z), gy = sample(x, y + h, z) - sample(x, y - h, z), gz = sample(x, y, z + h) - sample(x, y, z - h), l = Math.hypot(gx, gy, gz) || 1;
        normals[n] = gx / l; normals[n + 1] = gy / l; normals[n + 2] = gz / l;
    }
    return { positions, normals, indices: new Uint32Array(I) };
}

function contourOf(slice) {
    const out = [];
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
        const c = i + NX * j, v = [slice[c], slice[c + 1], slice[c + NX + 1], slice[c + NX]], corner = [[0, 0], [1, 0], [1, 1], [0, 1]], pts = [];
        for (let e = 0; e < 4; e++) {
            const f = (e + 1) % 4; if ((v[e] > 0) === (v[f] > 0)) continue;
            const t = v[e] / (v[e] - v[f]); pts.push((i + corner[e][0] + (corner[f][0] - corner[e][0]) * t) * S, (j + corner[e][1] + (corner[f][1] - corner[e][1]) * t) * S);
        }
        for (let p = 0; p + 3 < pts.length; p += 4) out.push(pts[p], pts[p + 1], pts[p + 2], pts[p + 3]);
    }
    return new Float32Array(out);
}

function generate(seed) {
    const t0 = Date.now(), rand = rng(seed * 2654435761 + 12345), plan = planRoutes(rand), laid = layRoutes(plan, rand, seed), nodes = plan.nodes, pool = nodes[plan.start];
    const size = NXY * NZ, F = new Float32Array(size).fill(-260), X = new Float32Array(size), Y = new Float32Array(size), Z = new Float32Array(size), done = new Uint8Array(size);
    const G = new Float32Array(size).fill(-1e9), touched = new Int32Array(size);
    // 一、溶蚀洞腔。坐标先做低频扭曲，洞腔不是规整的管子。
    for (const group of laid.groups) {
        let n = 0;
        for (const s of group) {
            const R = Math.max(s.ra, s.rb) + 40, RZ = R / s.k, z0 = Math.max(0, Math.min(s.za, s.zb) - RZ), z1 = Math.min(ZMAX, Math.max(s.za, s.zb) + RZ), M = R + 26;
            const sx0 = Math.min(s.lx * z0, s.lx * z1), sx1 = Math.max(s.lx * z0, s.lx * z1), sy0 = Math.min(s.ly * z0, s.ly * z1), sy1 = Math.max(s.ly * z0, s.ly * z1);
            const i0 = Math.max(0, Math.floor((Math.min(s.ax, s.bx) + sx0 - M) / S)), i1 = Math.min(NX - 1, Math.ceil((Math.max(s.ax, s.bx) + sx1 + M) / S));
            const j0 = Math.max(0, Math.floor((Math.min(s.ay, s.by) + sy0 - M) / S)), j1 = Math.min(NY - 1, Math.ceil((Math.max(s.ay, s.by) + sy1 + M) / S));
            const k0 = Math.max(1, Math.floor((z0 - 26) / S) + 1), k1 = Math.min(NZ - 1, Math.ceil((z1 + 26) / S) + 1);
            const ex = s.bx - s.ax, ey = s.by - s.ay, ez = (s.zb - s.za) * s.k, l2 = ex * ex + ey * ey + ez * ez || 1;
            for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                const idx = i + NX * (j + NY * k);
                if (!done[idx]) {
                    const x = i * S, y = j * S, z = zOf(k), m = 7 * noise3(x, y, z, 85, seed + 4); done[idx] = 1;
                    X[idx] = x + 18 * noise3(x, y, z, 240, seed + 1) + m; Y[idx] = y + 16 * noise3(x, y, z, 240, seed + 2) - m; Z[idx] = z + 18 * noise3(x, y, z, 240, seed + 3);
                }
                const z = Z[idx], px = X[idx] - s.lx * z - s.ax, py = Y[idx] - s.ly * z - s.ay, pz = (z - s.za) * s.k;
                let t = (px * ex + py * ey + pz * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
                const dx = px - ex * t, dy = py - ey * t, dz = pz - ez * t, v = s.ra + (s.rb - s.ra) * t - Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (v < -40) continue;
                if (G[idx] < -1e8) touched[n++] = idx; if (v > G[idx]) G[idx] = v;
            }
        }
        for (let q = 0; q < n; q++) { const idx = touched[q]; F[idx] = smax(F[idx], G[idx], 24); G[idx] = -1e9; }
    }
    // 每个位置附近的洞有多开阔（R2）、离路线中线多远（D2）：后面用来决定形体能长多大、哪里要让路。
    const R2 = new Float32Array(NXY).fill(-1e3), D2 = new Float32Array(NXY).fill(1e3);
    const stamp = (p, route) => {
        const R = p.r * 1.6 + 80, i0 = Math.max(0, Math.floor((p.x - R) / S)), i1 = Math.min(NX - 1, Math.ceil((p.x + R) / S)), j0 = Math.max(0, Math.floor((p.y - R) / S)), j1 = Math.min(NY - 1, Math.ceil((p.y + R) / S));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = i + NX * j, d = Math.hypot(i * S - p.x, j * S - p.y), v = p.r - .25 * d; if (d < R && v > R2[c]) R2[c] = v; if (route && d < D2[c]) D2[c] = d; }
    };
    for (const p of laid.spine) stamp(p, true); for (const p of laid.extra) stamp(p, false);
    // 二、地面。水面以上的地面和水下洞腔是同一个场：一侧是走得下去的缓坡，另一侧是陡岸，水潭只在靠前的部分露天。
    const lobes = lobeField(seed + 71), ground = new Float32Array(NX * (NZ - 1)), side = pool.x - 520 > 40 ? -1 : 1;
    for (let k = 1; k < NZ; k++) for (let i = 0; i < NX; i++) {
        const x = i * S, z = zOf(k), u = side * (x - pool.x), drop = (SURFACE + 55 - GROUND) * (u >= 0 ? 1 - smooth(110, 470, u) : 1 - smooth(0, 130, -u)) * (1 - smooth(110, 250, z));
        ground[i + NX * (k - 1)] = GROUND + 6 * noise3(x, 0, z, 150, seed + 41) - .22 * z + drop;
    }
    for (let k = 1; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const idx = i + NX * (j + NY * k), y = j * S; let v = F[idx];
        if (done[idx] && v > -45) v += (11 * noise3(X[idx], Y[idx], Z[idx], 120, seed + 11) - (v < 60 ? lobes(X[idx], Y[idx], Z[idx]) : 0)) * clamp((R2[i + NX * j] - 18) / 50, .2, 1);
        v = Math.min(v, Math.min(i, NX - 1 - i, NY - 1 - j) * S - 40, ZMAX - zOf(k) - 14);
        if (y < SURFACE + 150) v = smax(v, ground[i + NX * (k - 1)] - y, 14);
        F[idx] = v;
    }
    // 三、钟乳石体系。每一处洞顶往下挂、每一处洞底往上长，长度由落点决定；开阔的地方长得大，路线正中间留出身位。
    const giant = dripField(150, seed + 61), mid = dripField(62, seed + 62), small = dripField(46, seed + 63), F0 = F.slice(), colS = new Float32Array(NY);
    for (let k = 1; k < NZ; k++) for (let i = 1; i < NX - 1; i++) {
        const x = i * S, z = zOf(k), g = giant(x, z, false), m = mid(x, z, false), sm = small(x, z, false);
        const LC = 215 * g + 90 * m + 20 * sm, LF = 120 * giant(x, z, true) + 50 * mid(x, z, true) + 10 * small(x, z, true), rib = 9 * m + 5 * sm;
        let edge = 0, has = false, broken = false, lastF = 0, prevRock = false;
        for (let j = 0; j < NY; j++) { // 从上往下：洞顶往下挂
            const c = i + NX * j, idx = c + NXY * k, f = F0[idx];
            if (f <= 0) { prevRock = true; lastF = f; has = true; broken = false; continue; }
            if (prevRock) { edge = (j - 1 + lastF / (lastF - f)) * S; prevRock = false; }
            const s = clamp((R2[c] - 20) / 60) * smooth(22, 62, Math.hypot(D2[c], z)) * (.45 + .75 * (.5 + .5 * noise3(x, j * S, z, 330, seed + 51)));
            colS[j] = s; if (!has) continue;
            let val = j * S - edge - LC * s;
            if (broken) val = Math.max(val, S * .5); else if (val >= 0) broken = true;
            if (val < F[idx]) F[idx] = val;
        }
        has = false; prevRock = false;
        for (let j = NY - 1; j >= 0; j--) { // 从下往上：洞底往上长，水面以上的地面保持平整好走
            const c = i + NX * j, idx = c + NXY * k, f = F0[idx];
            if (f <= 0) { prevRock = true; lastF = f; has = true; broken = false; continue; }
            if (prevRock) { edge = (j + 1 - lastF / (lastF - f)) * S; prevRock = false; }
            if (!has) continue;
            let val = edge - j * S - LF * colS[j] * smooth(SURFACE + 5, SURFACE + 80, j * S);
            if (broken) val = Math.max(val, S * .5); else if (val >= 0) broken = true;
            if (val < F[idx]) F[idx] = val;
        }
        for (let j = 0; j < NY; j++) { // 洞壁上的竖向棱：石幔和流石
            const c = i + NX * j, idx = c + NXY * k; if (F0[idx] < -30 || R2[c] < 22) continue;
            F[idx] -= rib * smooth(GROUND + 10, SURFACE + 40, j * S) * clamp((R2[c] - 22) / 40);
        }
    }
    // 保底：路线在游戏平面上至少留出身体净空。正常情况下前面已经让开，这里几乎不改形状。
    let patched = 0;
    for (const e of plan.edges) for (let p = 1; p < e.points.length; p++) {
        const a = e.points[p - 1], b = e.points[p], R = PROTECT + 30, ex = b.x - a.x, ey = b.y - a.y, l2 = ex * ex + ey * ey || 1;
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R) / S)), i1 = Math.min(NX - 1, Math.ceil((Math.max(a.x, b.x) + R) / S));
        const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - R) / S)), j1 = Math.min(NY - 1, Math.ceil((Math.max(a.y, b.y) + R) / S));
        for (let k = 1; k <= Math.min(NZ - 1, 1 + Math.ceil(R / S)); k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const idx = i + NX * (j + NY * k), x = i * S, y = j * S, z = zOf(k); let t = ((x - a.x) * ex + (y - a.y) * ey) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const v = PROTECT - Math.hypot(x - a.x - ex * t, y - a.y - ey * t, z);
            if (v > F[idx]) { if (k === 1 && F[idx] <= 0 && v > 0) patched++; F[idx] = v; }
        }
    }
    // 游戏平面前面的半个洞被剖掉：岩石在 z=0 处留下一块平的剖面。
    for (let c = 0; c < NXY; c++) { const v = F[NXY + c]; F[c] = v < 0 ? -v : Math.max(v, 1); }

    const slice = F.slice(NXY, NXY * 2), clear = distance(slice, true), rockDepth = distance(slice, false);
    const clearAt = (x, y) => {
        x = Math.max(0, Math.min(NX - 1.001, x / S)); y = Math.max(0, Math.min(NY - 1.001, y / S));
        const i = x | 0, j = y | 0, u = x - i, w = y - j, c = i + NX * j, a = clear[c] + (clear[c + 1] - clear[c]) * u, b = clear[c + NX] + (clear[c + NX + 1] - clear[c + NX]) * u;
        return a + (b - a) * w;
    };
    const cellOf = n => Math.round(n.x / S) + NX * Math.round(n.y / S), reach = new Uint8Array(NXY), queue = [cellOf(pool)]; reach[queue[0]] = 1;
    for (let h = 0; h < queue.length; h++) { const c = queue[h]; for (const o of [c - 1, c + 1, c - NX, c + NX]) if (!reach[o] && clear[o] >= BODY - 2) { reach[o] = 1; queue.push(o); } }
    let narrow = 1e9, wide = 0, hall = null, squeeze = null, water = 0, reached = 0, below = 0;
    for (let c = Math.ceil(SURFACE / S) * NX; c < NXY; c++) { below++; if (slice[c] > 0) water++; if (reach[c]) reached++; }
    for (const e of plan.edges) for (const p of e.points) { const w = clearAt(p.x, p.y) * 2; if (p.y > SURFACE + 240 && (!hall || w > hall.w)) hall = { x: p.x, y: p.y, w }; }
    for (let m = 1; m < plan.main.length; m++) {
        const e = plan.edges.find(e => (e.a === plan.main[m - 1] && e.b === plan.main[m]) || (e.b === plan.main[m - 1] && e.a === plan.main[m]));
        for (const p of e.points) { const w = clearAt(p.x, p.y) * 2; wide = Math.max(wide, w); if (w < narrow) { narrow = w; squeeze = { x: p.x, y: p.y, w }; } }
    }
    const mesh = buildMesh(F), inner = nodes.filter(n => !n.pool);
    return { seed, S, W, H, ZMAX, NX, NY, SURFACE, GROUND, pool: { x: pool.x, y: pool.y, side }, plan, slice, clear, rockDepth, clearAt, mesh, contour: contourOf(slice),
        sites: { hall, squeeze, pool: { x: pool.x, y: SURFACE + 40 } }, report: {
        seed, waypoints: nodes.length, reachable: nodes.filter(n => reach[cellOf(n)]).length, targetReachable: !!reach[cellOf(nodes[plan.target])],
        deadEnds: inner.filter(n => n.links.length === 1).length, forks: inner.filter(n => n.links.length > 2).length, loops: plan.edges.filter(e => e.loop).length, backBranches: laid.branches,
        narrowest: Math.round(narrow), widest: Math.round(wide), waterPercent: Math.round(water / below * 100), strayWaterPercent: Math.round(Math.max(0, water - reached) / below * 100),
        patchedCells: patched, vertices: mesh.positions.length / 3, triangles: mesh.indices.length / 3, ms: Date.now() - t0 } };
}

const api = { generate, S, W, H, ZMAX, BODY, NX, NY, SURFACE, GROUND };
root.CaveGen = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
