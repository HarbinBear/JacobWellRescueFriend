// 三维洞腔生成小样：约束在先，碰撞轮廓是三维洞腔在游戏平面上的切面，不再是输入。
// 坐标：x 向右，y 向下，z 朝屏幕里面；z=0 是潜水员所在的游戏平面。
(function (root) {
'use strict';
const S = 12, W = 1800, H = 1320, ZMAX = 372, BODY = 18, PROTECT = 30;
const NX = W / S + 1, NY = H / S + 1, NZ = ZMAX / S + 2, NXY = NX * NY; // k=0 是剖面盖层，k=1 是 z=0
const zOf = k => (k - 1) * S;

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

// 约束一：路线图。必须有通到被救者的路，有岔路、有回环、有死胡同。
function planRoutes(rand) {
    const COLS = 5, ROWS = 4, cw = (W - 300) / COLS, ch = (H - 260) / ROWS, nodes = [], edges = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const u = rand();
        nodes.push({ id: nodes.length, c, r, x: 150 + (c + .5) * cw + (rand() - .5) * cw * .5, y: 130 + (r + .5) * ch + (rand() - .5) * ch * .44,
            radius: 36 + u * u * u * 100, zc: 0, kz: 1, links: [] });
    }
    const at = (c, r) => c < 0 || r < 0 || c >= COLS || r >= ROWS ? null : nodes[r * COLS + c];
    const link = (a, b, loop) => { edges.push({ a: a.id, b: b.id, loop, points: [] }); a.links.push(b.id); b.links.push(a.id); };
    const start = at(2, 0), seen = new Set([start.id]), open = [start];
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
    const far = new Map([[start.id, 0]]), from = new Map(), queue = [start.id];
    while (queue.length) {
        const id = queue.shift();
        for (const e of edges) {
            if (e.loop) continue;
            const o = e.a === id ? e.b : e.b === id ? e.a : -1;
            if (o < 0 || far.has(o)) continue;
            far.set(o, far.get(id) + Math.hypot(nodes[o].x - nodes[id].x, nodes[o].y - nodes[id].y)); from.set(o, id); queue.push(o);
        }
    }
    let target = start; for (const n of nodes) if (far.get(n.id) > far.get(target.id)) target = n;
    const main = []; for (let id = target.id; id !== undefined; id = from.get(id)) main.unshift(id);
    start.radius = 74; target.radius = Math.max(target.radius, 64);
    return { nodes, edges, start: start.id, target: target.id, main };
}

// 把路线图变成三维洞腔的基本形体：洞室是几个压扁的椭球，通道是粗细不均、在深度方向上起伏的管。
function shapes(plan, rand) {
    const groups = [], columns = [], { nodes, edges } = plan;
    for (const n of nodes) {
        n.zc = (rand() - .3) * n.radius * .7; n.kz = 1 / (1.2 + rand() * .9);
        for (let l = 0, lobes = n.radius > 60 ? 3 : 2; l < lobes; l++) {
            const a = rand() * 6.283, d = l ? n.radius * (.4 + rand() * .4) : 0, r = n.radius * (l ? .5 + rand() * .3 : 1);
            const x = n.x + Math.cos(a) * d, y = n.y + Math.sin(a) * d * .55, z = n.zc + (l ? (rand() - .4) * n.radius * .6 : 0);
            groups.push({ fy: 1.25, segs: [{ ax: x, ay: y, bx: x, by: y, ra: r, rb: r, za: z, zb: z, k: n.kz }] });
        }
    }
    for (const e of edges) {
        const a = nodes[e.a], b = nodes[e.b], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), bend = (rand() - .5) * 150;
        const mx = (a.x + b.x) / 2 - dy / len * bend, my = (a.y + b.y) / 2 + dx / len * bend;
        const base = 22 + rand() * 24, phase = rand() * 50, lift = (rand() - .4) * 60, k = 1 / (1.1 + Math.abs(dx) / len * .9), N = 12, segs = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N, s = 1 - t, x = s * s * a.x + 2 * s * t * mx + t * t * b.x, y = s * s * a.y + 2 * s * t * my + t * t * b.y;
            const r = Math.max(21, base * (.85 + .6 * noise3(t * 3 + phase, e.a, e.b, 1, 77)));
            const z = (a.zc * s + b.zc * t) * .6 + Math.sin(Math.PI * t) * lift, prev = e.points[e.points.length - 1];
            if (prev) segs.push({ ax: prev.x, ay: prev.y, bx: x, by: y, ra: prev.r, rb: r, za: prev.z, zb: z, k });
            e.points.push({ x, y, r, z });
        }
        groups.push({ fy: 1, segs });
    }
    // 只长在游戏平面后面的石柱和钟乳：不挡路，只提供纵深。
    for (const n of nodes) if (n.radius > 78) for (let i = 0, count = 2 + Math.floor(rand() * 2); i < count; i++) {
        const reach = n.radius / 1.25, hang = rand() < .5, top = n.y - reach * 1.15;
        columns.push({ x: n.x + (rand() - .5) * n.radius * 1.3, z: Math.max(48, n.zc + n.radius / n.kz * (.2 + rand() * .45)), top,
            bottom: hang ? n.y - reach * (.05 + rand() * .5) : n.y + reach * 1.15, r: 8 + rand() * 9, hang });
    }
    return { groups, columns };
}

function carve(F, X, Y, Z, group) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const s of group.segs) {
        const R = Math.max(s.ra, s.rb) + 72, RZ = R / s.k;
        x0 = Math.min(x0, s.ax - R, s.bx - R); x1 = Math.max(x1, s.ax + R, s.bx + R); y0 = Math.min(y0, s.ay - R, s.by - R); y1 = Math.max(y1, s.ay + R, s.by + R);
        z0 = Math.min(z0, s.za - RZ, s.zb - RZ); z1 = Math.max(z1, s.za + RZ, s.zb + RZ);
    }
    const i0 = Math.max(0, Math.floor(x0 / S)), i1 = Math.min(NX - 1, Math.ceil(x1 / S)), j0 = Math.max(0, Math.floor(y0 / S)), j1 = Math.min(NY - 1, Math.ceil(y1 / S));
    const k0 = Math.max(1, Math.floor(z0 / S) + 1), k1 = Math.min(NZ - 1, Math.ceil(z1 / S) + 1), fy = group.fy;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const idx = i + NX * (j + NY * k), x = X[idx], y = Y[idx], z = Z[idx]; let best = -1e9;
        for (const s of group.segs) {
            const ex = s.bx - s.ax, ey = s.by - s.ay, l2 = ex * ex + ey * ey;
            let t = l2 ? ((x - s.ax) * ex + (y - s.ay) * ey) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = x - (s.ax + ex * t), dy = (y - (s.ay + ey * t)) * fy, dz = (z - (s.za + (s.zb - s.za) * t)) * s.k;
            const v = s.ra + (s.rb - s.ra) * t - Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (v > best) best = v;
        }
        F[idx] = smax(F[idx], best, 22);
    }
}

function clearance(slice) {
    const d = new Float32Array(NXY), A = S, B = S * 1.4142;
    for (let i = 0; i < NXY; i++) d[i] = slice[i] > 0 ? 1e6 : 0;
    for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) { const c = i + NX * j; d[c] = Math.min(d[c], d[c - 1] + A, d[c - NX] + A, d[c - NX - 1] + B, d[c - NX + 1] + B); }
    for (let j = NY - 2; j > 0; j--) for (let i = NX - 2; i > 0; i--) { const c = i + NX * j; d[c] = Math.min(d[c], d[c + 1] + A, d[c + NX] + A, d[c + NX + 1] + B, d[c + NX - 1] + B); }
    for (let i = 0; i < NXY; i++) d[i] = Math.max(0, d[i] - S / 2);
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
    const positions = new Float32Array(P), normals = new Float32Array(P.length), h = .7;
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
    const t0 = Date.now(), rand = rng(seed * 2654435761 + 12345), plan = planRoutes(rand), shape = shapes(plan, rand), dipX = (rand() - .5) * .3;
    const size = NXY * NZ, F = new Float32Array(size).fill(-260), X = new Float32Array(size), Y = new Float32Array(size), Z = new Float32Array(size);
    // 低频扭曲：让管和椭球不再是规整的几何体。
    for (let k = 1; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const idx = i + NX * (j + NY * k), x = i * S, y = j * S, z = zOf(k);
        X[idx] = x + 26 * noise3(x, y, z, 260, seed + 1); Y[idx] = y + 22 * noise3(x, y, z, 260, seed + 2); Z[idx] = z + 26 * noise3(x, y, z, 260, seed + 3);
    }
    for (const g of shape.groups) carve(F, X, Y, Z, g);
    // 溶蚀起伏加岩层：岩层有软有硬，硬层留下沿深度方向延伸的岩檐。
    for (let idx = NXY; idx < size; idx++) {
        let v = F[idx]; if (v <= -90) continue;
        const x = X[idx], y = Y[idx], z = Z[idx];
        const yy = (y + x * dipX + z * .2 + 30 * noise3(x, y, z, 340, seed + 21)) / 44, n = Math.floor(yy);
        const h0 = hash3(n, 7, 3, seed) * 2 - 1, h1 = hash3(n + 1, 7, 3, seed) * 2 - 1; let e = (yy - n - .7) / .3; e = e < 0 ? 0 : e * e * (3 - 2 * e);
        F[idx] = v + 17 * noise3(x, y, z, 140, seed + 11) + 7.5 * noise3(x, y, z, 47, seed + 12) + 12 * (h0 + (h1 - h0) * e);
    }
    for (const c of shape.columns) {
        const i0 = Math.max(0, Math.floor((c.x - 70) / S)), i1 = Math.min(NX - 1, Math.ceil((c.x + 70) / S)), j0 = Math.max(0, Math.floor((c.top - 40) / S)), j1 = Math.min(NY - 1, Math.ceil((c.bottom + 40) / S));
        const k0 = Math.max(1, Math.floor((c.z - 70) / S) + 1), k1 = Math.min(NZ - 1, Math.ceil((c.z + 70) / S) + 1);
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const idx = i + NX * (j + NY * k), y = Y[idx]; let t = (y - c.top) / (c.bottom - c.top); const over = t > 1 ? (t - 1) * (c.bottom - c.top) : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const r = c.hang ? c.r * Math.pow(1 - t, .7) + 2 : c.r * (.55 + .45 * (2 * t - 1) * (2 * t - 1));
            const rock = r - Math.hypot(X[idx] - c.x, Z[idx] - c.z, over);
            F[idx] = -smax(-F[idx], rock, 10);
        }
    }
    for (let k = 1; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const idx = i + NX * (j + NY * k); F[idx] = Math.min(F[idx], Math.min(i, NX - 1 - i, j, NY - 1 - j) * S - 40, ZMAX - zOf(k) - 14);
    }
    // 约束二：每条路线在游戏平面上保底留出身体净空，其余形状都可以自由变化。
    for (const e of plan.edges) for (let p = 1; p < e.points.length; p++) {
        const a = e.points[p - 1], b = e.points[p], R = PROTECT + 30, ex = b.x - a.x, ey = b.y - a.y, l2 = ex * ex + ey * ey || 1;
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R) / S)), i1 = Math.min(NX - 1, Math.ceil((Math.max(a.x, b.x) + R) / S));
        const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - R) / S)), j1 = Math.min(NY - 1, Math.ceil((Math.max(a.y, b.y) + R) / S));
        for (let k = 1; k <= Math.min(NZ - 1, 1 + Math.ceil(R / S)); k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const idx = i + NX * (j + NY * k), x = i * S, y = j * S, z = zOf(k); let t = ((x - a.x) * ex + (y - a.y) * ey) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            F[idx] = Math.max(F[idx], PROTECT - Math.hypot(x - a.x - ex * t, y - a.y - ey * t, z));
        }
    }
    // 游戏平面前面的半个洞被剖掉：岩石在 z=0 处留下一块平的剖面。
    for (let c = 0; c < NXY; c++) { const v = F[NXY + c]; F[c] = v < 0 ? -v : Math.max(v, 1); }

    const slice = F.slice(NXY, NXY * 2), clear = clearance(slice), nodes = plan.nodes;
    const clearAt = (x, y) => {
        x = Math.max(0, Math.min(NX - 1.001, x / S)); y = Math.max(0, Math.min(NY - 1.001, y / S));
        const i = x | 0, j = y | 0, u = x - i, w = y - j, c = i + NX * j, a = clear[c] + (clear[c + 1] - clear[c]) * u, b = clear[c + NX] + (clear[c + NX + 1] - clear[c + NX]) * u;
        return a + (b - a) * w;
    };
    const cellOf = n => Math.round(n.x / S) + NX * Math.round(n.y / S), reach = new Uint8Array(NXY), queue = [cellOf(nodes[plan.start])]; reach[queue[0]] = 1;
    for (let h = 0; h < queue.length; h++) { const c = queue[h]; for (const o of [c - 1, c + 1, c - NX, c + NX]) if (!reach[o] && clear[o] >= BODY - 2) { reach[o] = 1; queue.push(o); } }
    let narrow = 1e9, wide = 0;
    for (let m = 1; m < plan.main.length; m++) {
        const e = plan.edges.find(e => (e.a === plan.main[m - 1] && e.b === plan.main[m]) || (e.b === plan.main[m - 1] && e.a === plan.main[m]));
        for (const p of e.points) { const w = clearAt(p.x, p.y) * 2; narrow = Math.min(narrow, w); wide = Math.max(wide, w); }
    }
    const mesh = buildMesh(F);
    return { seed, S, W, H, ZMAX, plan, slice, clear, clearAt, mesh, contour: contourOf(slice), columns: shape.columns, report: {
        seed, rooms: nodes.length, reachable: nodes.filter(n => reach[cellOf(n)]).length, targetReachable: !!reach[cellOf(nodes[plan.target])],
        deadEnds: nodes.filter(n => n.links.length === 1).length, forks: nodes.filter(n => n.links.length > 2).length, loops: plan.edges.filter(e => e.loop).length,
        mainRouteRooms: plan.main.length, narrowest: Math.round(narrow), widest: Math.round(wide), columns: shape.columns.length,
        vertices: mesh.positions.length / 3, triangles: mesh.indices.length / 3, ms: Date.now() - t0 } };
}

const api = { generate, S, W, H, ZMAX, BODY };
root.CaveGen = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
