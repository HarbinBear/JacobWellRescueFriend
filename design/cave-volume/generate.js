// 三维洞腔生成小样 S02：洞腔是巨岩之间留出来的空隙，不是在实心里挖管子。
// 约束在先，碰撞轮廓是洞腔在游戏平面上的切面。场的约定：正值是水，负值是岩石。
// 坐标：x 向右，y 向下，z 朝屏幕里面；z=0 是潜水员所在的游戏平面。
(function (root) {
'use strict';
const S = 12, W = 1800, H = 1320, ZMAX = 372, BODY = 18, PROTECT = 26;
const NX = W / S + 1, NY = H / S + 1, NZ = ZMAX / S + 2, NXY = NX * NY; // k=0 是剖面盖层，k=1 是 z=0
const zOf = k => (k - 1) * S;
let QY = 0; // 最近一次岩块求值时的岩块本地 y，用来算岩层

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

// 约束一：路线图。只是一串必须走得通的路点，有岔路、回环、死胡同；它不规定哪里是洞室、哪里是通道。
function planRoutes(rand) {
    const COLS = 4, ROWS = 3, cw = (W - 500) / COLS, ch = (H - 440) / ROWS, nodes = [], edges = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
        nodes.push({ id: nodes.length, c, r, x: 250 + (c + .5) * cw + (rand() - .5) * cw * .6, y: 220 + (r + .5) * ch + (rand() - .5) * ch * .5, links: [] });
    const at = (c, r) => c < 0 || r < 0 || c >= COLS || r >= ROWS ? null : nodes[r * COLS + c];
    const link = (a, b, loop) => { edges.push({ a: a.id, b: b.id, loop, points: [] }); a.links.push(b.id); b.links.push(a.id); };
    const start = at(1, 0), seen = new Set([start.id]), open = [start];
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
    return { nodes, edges, start: start.id, target: target.id, main };
}

// 宽窄由一张空间上连续的“开阔度”决定：开阔的地方相邻路线会并成大厅，其余地方只留窄缝。
function widthAt(x, y, seed) {
    const n = .5 + .5 * noise3(x, y, 0, 300, seed + 31) + .2 * noise3(x, y, 0, 120, seed + 32);
    return 21 + 15 * (.5 + .5 * noise3(x, y, 0, 85, seed + 33)) + 105 * smooth(.60, .86, n);
}
function layRoutes(plan, rand, seed) {
    const { nodes, edges } = plan, s = nodes[plan.start], g = nodes[plan.target], spine = [];
    for (const e of edges) {
        const a = nodes[e.a], b = nodes[e.b], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), bend = (rand() - .5) * 170;
        const mx = (a.x + b.x) / 2 - dy / len * bend, my = (a.y + b.y) / 2 + dx / len * bend, lx = (rand() - .5) * .9, ly = (rand() - .5) * .9, deep = 1.1 + rand() * 1.3, N = 16;
        for (let i = 0; i <= N; i++) {
            const t = i / N, u = 1 - t, x = u * u * a.x + 2 * u * t * mx + t * t * b.x, y = u * u * a.y + 2 * u * t * my + t * t * b.y;
            const r = Math.max(widthAt(x, y, seed), 64 - Math.hypot(x - s.x, y - s.y) / 3, 54 - Math.hypot(x - g.x, y - g.y) / 3);
            e.points.push({ x, y, r, depth: 44 + r * deep, lx, ly });
        }
        for (let i = 1; i <= N; i++) {
            const p = e.points[i - 1], q = e.points[i], steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 22));
            for (let k = i === 1 ? 0 : 1; k <= steps; k++) { const t = k / steps; spine.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, r: p.r + (q.r - p.r) * t, depth: p.depth + (q.depth - p.depth) * t, lx, ly }); }
        }
    }
    return spine;
}

// 巨岩：大小不一、各自歪斜的圆角块，再被一两个斜面削掉棱角。
const SIZES = [[150, 110, 95, 65, 110, 90], [90, 60, 60, 40, 80, 70], [45, 45, 35, 25, 50, 50]]; // 巨、中、小：各轴半长的下限和浮动
function makeBlock(rand, id, cls, spine) {
    const z = SIZES[cls], hx = z[0] + rand() * z[1], hy = z[2] + rand() * z[3], hz = z[4] + rand() * z[5];
    const az = rand() < .2 ? (rand() - .5) * 2.4 : (rand() - .5) * .55, ax = (rand() - .5) * .6, ay = (rand() - .5) * .6;
    const cz = Math.cos(az), sz = Math.sin(az), cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    const m = [cz * cy, sz * cy, -sy, cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx, cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx], cuts = [];
    for (let i = 0; i < 2; i++) {
        let nx = rand() - .5, ny = (rand() - .5) * .8, nz = rand() - .5; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        cuts.push(nx, ny, nz, (.42 + rand() * .4) * (Math.abs(nx) * hx + Math.abs(ny) * hy + Math.abs(nz) * hz));
    }
    // 巨岩只往路线周围放：离路线远的地方本来就是完整基岩，不需要再放。
    const near = spine[Math.floor(rand() * spine.length)], turn = rand() * 6.2832, away = near.r * .6 + rand() * (1.3 * near.r + 170);
    return { id, cls, x: near.x + Math.cos(turn) * away, y: near.y + Math.sin(turn) * away, z: -150 + rand() * 580, m, hx, hy, hz, round: (cls === 2 ? 6 : 8) + rand() * 10, cuts, inset: 0, moved: 0, split: 0, period: 36 + rand() * 30 };
}
function sdBlock(b, x, y, z) {
    const dx = x - b.x, dy = y - b.y, dz = z - b.z, m = b.m, r = b.round, c = b.cuts;
    const qx = m[0] * dx + m[1] * dy + m[2] * dz, qy = m[3] * dx + m[4] * dy + m[5] * dz, qz = m[6] * dx + m[7] * dy + m[8] * dz;
    const ex = Math.abs(qx) - (b.hx - r - b.inset), ey = Math.abs(qy) - (b.hy - r - b.inset), ez = Math.abs(qz) - (b.hz - r - b.inset);
    const ox = ex > 0 ? ex : 0, oy = ey > 0 ? ey : 0, oz = ez > 0 ? ez : 0;
    let d = Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(ex, ey, ez), 0) - r;
    for (let i = 0; i < c.length; i += 4) d = smax(d, qx * c[i] + qy * c[i + 1] + qz * c[i + 2] - c[i + 3] + b.inset, 8);
    QY = qy; return d;
}
// 每块巨岩有自己的岩层方向：岩层在侧面上留下一道道台阶，倒下的岩块岩层也跟着歪。
function strata(b, qy, wobble, seed) {
    const yy = (qy + wobble) / b.period, n = Math.floor(yy), h0 = hash3(n, b.id, 3, seed) * 2 - 1, h1 = hash3(n + 1, b.id, 3, seed) * 2 - 1;
    let e = (yy - n - .7) / .3; e = e < 0 ? 0 : e * e * (3 - 2 * e); return 5.5 * (h0 + (h1 - h0) * e);
}
// 约束二：路线周围必须留出水。巨岩是一块一块往里放的：挡路就先整块挪开，再沿朝向路线的斜面劈掉一角，
// 还放不下就不要这一块。所以洞壁始终是巨岩的大面，没有被填上的地方就是多出来的空隙。
function fitBlock(b, cores) {
    const limit = Math.min(b.hx, b.hy) * .9, reach = Math.hypot(b.hx, b.hy, b.hz) + limit + 20, near = [], behind = b.z > 70;
    for (const c of cores) if (Math.abs(c.x - b.x) < reach + c.r && Math.abs(c.y - b.y) < reach + c.r && Math.abs(c.z - b.z) < reach + c.r) near.push(c);
    if (!near.length) return true;
    const worst = () => { let pen = 0, at = null; for (const c of near) { const p = c.r + 6 - sdBlock(b, c.x, c.y, c.z); if (p > pen) { pen = p; at = c; } } return { pen, at }; };
    const grad = p => [sdBlock(b, p.x + 2, p.y, p.z) - sdBlock(b, p.x - 2, p.y, p.z), sdBlock(b, p.x, p.y + 2, p.z) - sdBlock(b, p.x, p.y - 2, p.z), sdBlock(b, p.x, p.y, p.z + 2) - sdBlock(b, p.x, p.y, p.z - 2)];
    for (let it = 0; it < 6; it++) {
        const w = worst(); if (!w.at) return true;
        if (b.moved + w.pen + 1 > limit) break;
        // 穿过游戏平面的巨岩只在画面内挪动；只有本来就在后面的巨岩才允许再往里退。
        const g = grad(w.at), full = Math.hypot(g[0], g[1], g[2]) || 1; if (!(behind && g[2] < 0)) g[2] = 0;
        const l = Math.hypot(g[0], g[1], g[2]); if (l < .1 * full) break;
        const step = (w.pen + 1) * Math.min(1.7, full / l); b.x -= g[0] / l * step; b.y -= g[1] / l * step; b.z -= g[2] / l * step; b.moved += step;
    }
    for (let it = 0; it < 5; it++) {
        const w = worst(); if (!w.at) break;
        const p = w.at, m = b.m, g = grad(p), l = Math.hypot(g[0], g[1]) || 1, cx = p.x - b.x, cy = p.y - b.y, cl = Math.hypot(cx, cy) || 1;
        let gx = .45 * g[0] / l + .55 * cx / cl + .16 * (hash3(b.id, it, 1, 97) * 2 - 1), gy = .45 * g[1] / l + .55 * cy / cl + .16 * (hash3(b.id, it, 2, 97) * 2 - 1);
        let gz = behind && p.z < b.z ? -.5 - .7 * hash3(b.id, it, 3, 97) : .34 * (hash3(b.id, it, 3, 97) * 2 - 1);
        const n = Math.hypot(gx, gy, gz) || 1; gx /= n; gy /= n; gz /= n;
        // 一个劈面要同时让开这一侧的整段路线，而不是只让开一个点，否则巨岩会被零碎地削没。
        let off = 1e9;
        for (const c of near) { const dx = c.x - b.x, dy = c.y - b.y, dz = c.z - b.z, along = gx * dx + gy * dy + gz * dz; if (c === p || along > .4 * Math.hypot(dx, dy, dz)) off = Math.min(off, along - c.r - 7); }
        b.cuts.push(m[0] * gx + m[1] * gy + m[2] * gz, m[3] * gx + m[4] * gy + m[5] * gz, m[6] * gx + m[7] * gy + m[8] * gz, off); b.split++;
    }
    const w = worst(); if (w.at) b.inset += w.pen + 1;
    let bulk = 0; // 只剩碎片的不要，不留薄片
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let e = -1; e <= 1; e++) {
        const qx = a * b.hx * .55, qy = c * b.hy * .55, qz = e * b.hz * .55, m = b.m;
        if (sdBlock(b, b.x + m[0] * qx + m[3] * qy + m[6] * qz, b.y + m[1] * qx + m[4] * qy + m[7] * qz, b.z + m[2] * qx + m[5] * qy + m[8] * qz) < -10) bulk++;
    }
    return bulk >= (b.cls === 0 ? 8 : 5);
}

function distance(slice, water) {
    const d = new Float32Array(NXY), A = S, B = S * 1.4142;
    for (let i = 0; i < NXY; i++) d[i] = (slice[i] > 0) === water ? 1e6 : 0;
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
    const t0 = Date.now(), rand = rng(seed * 2654435761 + 12345), plan = planRoutes(rand), spine = layRoutes(plan, rand, seed), blocks = [];
    // 低频扭曲：让巨岩的面略微弯曲，不是机械的平面。岩块和净空都在扭曲后的坐标里算。
    const wX = (x, y, z) => x + 26 * noise3(x, y, z, 260, seed + 1), wY = (x, y, z) => y + 22 * noise3(x, y, z, 260, seed + 2), wZ = (x, y, z) => z + 26 * noise3(x, y, z, 260, seed + 3);
    const cores = [];
    for (const p of spine) for (let j = 0; j < 4; j++) {
        const f = j / 3, x = p.x + p.lx * p.r * f, y = p.y + p.ly * p.r * f, z = p.depth * f * .92;
        cores.push({ x: wX(x, y, z), y: wY(x, y, z), z: wZ(x, y, z), r: p.r * Math.sqrt(1 - .85 * f * f) });
    }
    const size = NXY * NZ, F = new Float32Array(size), X = new Float32Array(size), Y = new Float32Array(size), Z = new Float32Array(size);
    // 离所有路线都很远的地方是完整基岩，洞腔只可能出现在路线附近。
    const zone = new Float32Array(NXY).fill(-400), back = new Float32Array(NXY);
    for (const p of spine) {
        const R = 1.7 * p.r + 105, i0 = Math.max(0, Math.floor((p.x - R) / S)), i1 = Math.min(NX - 1, Math.ceil((p.x + R) / S)), j0 = Math.max(0, Math.floor((p.y - R) / S)), j1 = Math.min(NY - 1, Math.ceil((p.y + R) / S));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = i + NX * j, v = R - Math.hypot(i * S - p.x, j * S - p.y); if (v > zone[c]) { zone[c] = v; back[c] = p.depth * 1.2 + 80; } }
    }
    for (let k = 1; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const c = i + NX * j, idx = c + NXY * k, x = i * S, y = j * S, z = zOf(k);
        X[idx] = wX(x, y, z); Y[idx] = wY(x, y, z); Z[idx] = wZ(x, y, z); F[idx] = Math.min(zone[c], back[c] - z);
    }
    const tried = [240, 560, 520], kept = [0, 0, 0]; let moved = 0, split = 0;
    for (let cls = 0; cls < 3; cls++) for (let n = 0; n < tried[cls]; n++) {
        const b = makeBlock(rand, blocks.length, cls, spine), c = Math.max(0, Math.min(NX - 1, Math.round(b.x / S))) + NX * Math.max(0, Math.min(NY - 1, Math.round(b.y / S)));
        if (zone[c] < -Math.hypot(b.hx, b.hy) || !fitBlock(b, cores)) continue;
        blocks.push(b); kept[cls]++; if (b.moved) moved++; if (b.split) split++;
    }
    for (const b of blocks) {
        const m = b.m, ex = Math.abs(m[0]) * b.hx + Math.abs(m[3]) * b.hy + Math.abs(m[6]) * b.hz + 36, ey = Math.abs(m[1]) * b.hx + Math.abs(m[4]) * b.hy + Math.abs(m[7]) * b.hz + 36, ez = Math.abs(m[2]) * b.hx + Math.abs(m[5]) * b.hy + Math.abs(m[8]) * b.hz + 36;
        const i0 = Math.max(0, Math.floor((b.x - ex) / S)), i1 = Math.min(NX - 1, Math.ceil((b.x + ex) / S)), j0 = Math.max(0, Math.floor((b.y - ey) / S)), j1 = Math.min(NY - 1, Math.ceil((b.y + ey) / S));
        const k0 = Math.max(1, Math.floor((b.z - ez) / S) + 1), k1 = Math.min(NZ - 1, Math.ceil((b.z + ez) / S) + 1), layerSeed = b.id * 7 + seed; b.ex = ex; b.ey = ey;
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const idx = i + NX * (j + NY * k), cur = F[idx]; if (cur < -60) continue;
            let d = sdBlock(b, X[idx], Y[idx], Z[idx]); if (d >= cur + 8) continue;
            if (d > -34) d += strata(b, QY, 10 * noise3(X[idx], Y[idx], Z[idx], 80, layerSeed), seed);
            if (d < cur) F[idx] = d;
        }
    }
    for (let k = 1; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const idx = i + NX * (j + NY * k); let v = F[idx];
        if (v > -50 && v < 50) v += 7 * noise3(X[idx], Y[idx], Z[idx], 130, seed + 11) + 3 * noise3(X[idx], Y[idx], Z[idx], 44, seed + 12);
        F[idx] = Math.min(v, Math.min(i, NX - 1 - i, j, NY - 1 - j) * S - 40, ZMAX - zOf(k) - 14);
    }
    // 保底：路线在游戏平面上至少留出身体净空。正常情况下巨岩已经让开，这里几乎不改形状。
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

    const slice = F.slice(NXY, NXY * 2), clear = distance(slice, true), rockDepth = distance(slice, false), nodes = plan.nodes;
    for (let c = 0; c < NXY; c++) rockDepth[c] = slice[c] > 0 ? 0 : Math.max(-slice[c], rockDepth[c] - 8);
    const clearAt = (x, y) => {
        x = Math.max(0, Math.min(NX - 1.001, x / S)); y = Math.max(0, Math.min(NY - 1.001, y / S));
        const i = x | 0, j = y | 0, u = x - i, w = y - j, c = i + NX * j, a = clear[c] + (clear[c + 1] - clear[c]) * u, b = clear[c + NX] + (clear[c + NX + 1] - clear[c + NX]) * u;
        return a + (b - a) * w;
    };
    const cellOf = n => Math.round(n.x / S) + NX * Math.round(n.y / S), reach = new Uint8Array(NXY), queue = [cellOf(nodes[plan.start])]; reach[queue[0]] = 1;
    for (let h = 0; h < queue.length; h++) { const c = queue[h]; for (const o of [c - 1, c + 1, c - NX, c + NX]) if (!reach[o] && clear[o] >= BODY - 2) { reach[o] = 1; queue.push(o); } }
    let narrow = 1e9, wide = 0, hall = null, squeeze = null, water = 0, reached = 0;
    for (let c = 0; c < NXY; c++) { if (slice[c] > 0) water++; if (reach[c]) reached++; }
    for (const e of plan.edges) for (const p of e.points) { const w = clearAt(p.x, p.y) * 2; if (!hall || w > hall.w) hall = { x: p.x, y: p.y, w }; }
    for (let m = 1; m < plan.main.length; m++) {
        const e = plan.edges.find(e => (e.a === plan.main[m - 1] && e.b === plan.main[m]) || (e.b === plan.main[m - 1] && e.a === plan.main[m]));
        for (const p of e.points) { const w = clearAt(p.x, p.y) * 2; wide = Math.max(wide, w); if (w < narrow) { narrow = w; squeeze = { x: p.x, y: p.y, w }; } }
    }
    const mesh = buildMesh(F);
    // 网格是按 12 单位的格子取出来的，棱角会被磨圆。法线改用巨岩本身的形状来算，面是平的、棱是硬的、岩层台阶看得见。
    const CELL = 120, cols = Math.ceil(W / CELL) + 1, rows = Math.ceil(H / CELL) + 1, buckets = []; for (let i = 0; i < cols * rows; i++) buckets.push([]);
    for (const b of blocks) for (let j = Math.max(0, Math.floor((b.y - b.ey) / CELL)); j <= Math.min(rows - 1, Math.floor((b.y + b.ey) / CELL)); j++)
        for (let i = Math.max(0, Math.floor((b.x - b.ex) / CELL)); i <= Math.min(cols - 1, Math.floor((b.x + b.ex) / CELL)); i++) buckets[i + cols * j].push(b);
    const P = mesh.positions, N = mesh.normals; let sharp = 0;
    for (let v = 0; v < P.length; v += 3) {
        if (P[v + 2] < 1) continue;
        const x = wX(P[v], P[v + 1], P[v + 2]), y = wY(P[v], P[v + 1], P[v + 2]), z = wZ(P[v], P[v + 1], P[v + 2]);
        const list = buckets[Math.max(0, Math.min(cols - 1, Math.floor(P[v] / CELL))) + cols * Math.max(0, Math.min(rows - 1, Math.floor(P[v + 1] / CELL)))];
        let a = null, da = 1e9, wa = 0, c = null, dc = 1e9, wc = 0;
        for (const b of list) {
            const base = sdBlock(b, x, y, z); if (base > 30 || base < -34) continue;
            const wobble = 10 * noise3(x, y, z, 80, b.id * 7 + seed), d = base + strata(b, QY, wobble, seed);
            if (d < da) { c = a; dc = da; wc = wa; a = b; da = d; wa = wobble; } else if (d < dc) { c = b; dc = d; wc = wobble; }
        }
        if (!a || Math.abs(da) > 12) continue; // 这里的表面不是巨岩的面，保留网格法线
        const f = (px, py, pz) => { let d = sdBlock(a, px, py, pz); d += strata(a, QY, wa, seed); if (c) { let e = sdBlock(c, px, py, pz); e += strata(c, QY, wc, seed); if (e < d) d = e; } return d; };
        const gx = f(x + 1.5, y, z) - f(x - 1.5, y, z), gy = f(x, y + 1.5, z) - f(x, y - 1.5, z), gz = f(x, y, z + 1.5) - f(x, y, z - 1.5), l = Math.hypot(gx, gy, gz); if (l < 1e-4) continue;
        const nx = N[v] * .22 + gx / l * .78, ny = N[v + 1] * .22 + gy / l * .78, nz = N[v + 2] * .22 + gz / l * .78, n = Math.hypot(nx, ny, nz) || 1;
        N[v] = nx / n; N[v + 1] = ny / n; N[v + 2] = nz / n; sharp++;
    }
    return { seed, S, W, H, ZMAX, NX, NY, plan, slice, clear, rockDepth, clearAt, mesh, contour: contourOf(slice), sites: { hall, squeeze }, report: {
        seed, waypoints: nodes.length, reachable: nodes.filter(n => reach[cellOf(n)]).length, targetReachable: !!reach[cellOf(nodes[plan.target])],
        deadEnds: nodes.filter(n => n.links.length === 1).length, forks: nodes.filter(n => n.links.length > 2).length, loops: plan.edges.filter(e => e.loop).length,
        narrowest: Math.round(narrow), widest: Math.round(wide), waterPercent: Math.round(water / NXY * 100), strayWaterPercent: Math.round((water - reached) / NXY * 100),
        blocks: blocks.length, giantBlocks: kept[0], mediumBlocks: kept[1], smallBlocks: kept[2], blocksMoved: moved, blocksSplit: split, patchedCells: patched,
        sharpNormalPercent: Math.round(sharp / (mesh.positions.length / 3) * 100), vertices: mesh.positions.length / 3, triangles: mesh.indices.length / 3, ms: Date.now() - t0 } };
}

const api = { generate, S, W, H, ZMAX, BODY, NX, NY };
root.CaveGen = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
