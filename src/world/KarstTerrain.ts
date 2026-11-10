import { CONFIG } from '../core/config';
import { planKarstChambers, chamberErosion, sculptKarstChambers, continuousKarstProtection, type KarstChambers } from './KarstChambers';
import { RockPoint, RockWall, registerRockSurface, unregisterRockSurface } from './RockGeometry';
import { buildVolumeField, type KarstVolumeData } from './KarstVolume';
import { karstClamp as clamp, karstMix as mix, karstSmooth as smooth, karstNoise as noise, karstHash as hash } from './KarstNoise';

export const KARST_VERSION = 1;
const STEP = 12, BUCKET = 128, FIELD_RANGE = 192, HEIGHT_RANGE = 144;
export interface KarstEdge { a: RockPoint; b: RockPoint; wall: RockWall; nx: number; ny: number }
export interface KarstFormation {
    x: number; y: number; length: number; width: number; bend: number; direction: number; seed: number;
}
export interface KarstTerrain {
    seed: number; version: number; generation: 'legacy'|'chambers'|'volume'; chambers?: KarstChambers; volume?: KarstVolumeData; x: number; y: number; step: number; cols: number; rows: number;
    field: Float32Array; texture: Uint8Array; edges: KarstEdge[]; buckets: Map<string, KarstEdge[]>;
    owned: Map<RockWall, KarstEdge[]>; handles: RockWall[]; formations: KarstFormation[]; generationMs: number;
}
const terrains = new WeakMap<object, KarstTerrain>();
export function getKarstTerrain(maze: any): KarstTerrain | null { return maze ? terrains.get(maze) || null : null; }
export function releaseKarstTerrain(maze: any) {
    const t=getKarstTerrain(maze);if(t)for(const wall of t.handles)unregisterRockSurface(wall);
    if(maze)terrains.delete(maze);
}

export function sampleKarst(t: KarstTerrain, x: number, y: number, field = t.field) {
    const u = (x - t.x) / t.step, v = (y - t.y) / t.step, c = Math.floor(u), r = Math.floor(v);
    if (c < 0 || r < 0 || c >= t.cols - 1 || r >= t.rows - 1) return y < t.y ? 192 : -192;
    const i = r * t.cols + c;
    return mix(mix(field[i], field[i + 1], u - c), mix(field[i + t.cols], field[i + t.cols + 1], u - c), v - r);
}
function edgesIn(t: KarstTerrain, l: number, top: number, r: number, b: number) {
    const result = new Set<KarstEdge>();
    for (let y = Math.floor(top / BUCKET); y <= Math.floor(b / BUCKET); y++)
        for (let x = Math.floor(l / BUCKET); x <= Math.floor(r / BUCKET); x++)
            for (const edge of t.buckets.get(x + ',' + y) || []) result.add(edge);
    return result;
}
function onEdge(e: KarstEdge, x: number, y: number) {
    const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
    const u = clamp(((x - e.a.x) * dx + (y - e.a.y) * dy) / (dx * dx + dy * dy || 1));
    const px = e.a.x + dx * u, py = e.a.y + dy * u;
    return { x: px, y: py, dist: Math.hypot(px - x, py - y), nx: e.nx, ny: e.ny, wall: e.wall };
}
export function karstNearest(t: KarstTerrain, x: number, y: number, maxDistance = Infinity, wall?: RockWall) {
    let best: ReturnType<typeof onEdge> | null = null;
    if (wall) {
        for (const e of t.owned.get(wall) || []) {
            const p = onEdge(e, x, y);
            if (p.dist <= maxDistance && (!best || p.dist < best.dist)) best = p;
        }
    } else {
        let radius = Math.min(64, maxDistance);
        for (let pass = 0; pass < 10; pass++) {
            for (const e of edgesIn(t, x - radius, y - radius, x + radius, y + radius)) {
                const p = onEdge(e, x, y);
                if (p.dist <= maxDistance && (!best || p.dist < best.dist)) best = p;
            }
            if (best && best.dist <= radius || radius >= maxDistance) break;
            radius = Math.min(maxDistance, radius * 2);
        }
    }
    if (!best) return { x, y, dist: Infinity, nx: 0, ny: -1, wall: null as RockWall | null };
    if (sampleKarst(t, x, y) < 0) best.dist = -best.dist;
    return best;
}
export function karstCircle(t: KarstTerrain, x: number, y: number, radius: number) {
    const value = sampleKarst(t, x, y);
    if (value < -.001) return true;
    if (radius <= 0) return false;
    return karstNearest(t, x, y, radius).dist < radius;
}
export function karstRay(t: KarstTerrain, x: number, y: number, dx: number, dy: number, range: number, owner?: RockWall) {
    let distance = range, edge: KarstEdge | null = null;
    const candidates = owner ? t.owned.get(owner) || [] : edgesIn(t, Math.min(x, x + dx * range) - 1,
        Math.min(y, y + dy * range) - 1, Math.max(x, x + dx * range) + 1, Math.max(y, y + dy * range) + 1);
    for (const e of candidates) {
        const ex = e.b.x - e.a.x, ey = e.b.y - e.a.y, det = dx * ey - dy * ex;
        if (Math.abs(det) < 1e-9) continue;
        const ax = e.a.x - x, ay = e.a.y - y;
        const d = (ax * ey - ay * ex) / det, u = (ax * dy - ay * dx) / det;
        if (d > .015 && d < distance && u >= -1e-8 && u <= 1 + 1e-8) { distance = d; edge = e; }
    }
    return { x: x + dx * distance, y: y + dy * distance, distance, wall: edge?.wall || null, nx: edge?.nx || 0, ny: edge?.ny || 0 };
}
export function karstSegmentClear(t: KarstTerrain, a: RockPoint, b: RockPoint, padding = 0) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < .01) return !karstCircle(t, a.x, a.y, padding);
    if (karstRay(t, a.x, a.y, (b.x - a.x) / length, (b.y - a.y) / length, length).distance < length - .1) return false;
    const count = Math.max(1, Math.ceil(length / 10));
    for (let i = 1; i < count; i++) {
        const u = i / count, r = Math.min(padding, length * u * .45, length * (1 - u) * .45);
        if (karstCircle(t, mix(a.x, b.x, u), mix(a.y, b.y, u), r)) return false;
    }
    return true;
}
function blur(a: Float32Array, cols: number, rows: number) {
    const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c; tmp[i] = (a[r * cols + Math.max(0, c - 1)] + 2 * a[i] + a[r * cols + Math.min(cols - 1, c + 1)]) * .25;
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c; out[i] = (tmp[Math.max(0, r - 1) * cols + c] + 2 * tmp[i] + tmp[Math.min(rows - 1, r + 1) * cols + c]) * .25;
    }
    return out;
}
export function karstDistances(t: KarstTerrain) {
    const a = t.field, d = new Float32Array(a.length), cols = t.cols, rows = t.rows, step = t.step, diag = step * Math.SQRT2;
    d.fill(FIELD_RANGE);
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c;
        for (const n of [i - 1, i + 1, i - cols, i + cols]) if ((a[i] < 0) !== (a[n] < 0))
            d[i] = Math.min(d[i], step * Math.abs(a[i]) / (Math.abs(a[i]) + Math.abs(a[n])));
    }
    for (let r = 1; r < rows; r++) for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c; d[i] = Math.min(d[i], d[i - 1] + step, d[i - cols] + step, d[i - cols - 1] + diag, d[i - cols + 1] + diag);
    }
    for (let r = rows - 2; r >= 0; r--) for (let c = cols - 2; c > 0; c--) {
        const i = r * cols + c; d[i] = Math.min(d[i], d[i + 1] + step, d[i + cols] + step, d[i + cols + 1] + diag, d[i + cols - 1] + diag);
    }
    return d;
}
function openCell(maze: any, r: number, c: number) { return r >= 0 && c >= 0 && r < maze.mazeRows && c < maze.mazeCols && maze.mazeMap[r]?.[c] === 0; }
function routeClearance(maze: any, x: number, y: number) {
    const ts = maze.mazeTileSize, r = Math.floor(y / ts), c = Math.floor(x / ts);
    if (!openCell(maze, r, c)) return -192;
    const degree=Number(openCell(maze,r-1,c))+Number(openCell(maze,r+1,c))+Number(openCell(maze,r,c-1))+Number(openCell(maze,r,c+1));
    const important=Math.max(44-Math.hypot(x-maze.npcInitX,y-maze.npcInitY),44-Math.hypot(x-maze.exitX,y-(maze.continuous?.seamY||1080)-ts*.5));
    // Protect actual constrictions and junctions. A 4-neighbour chamber interior
    // is not an invisible grid of passages: it must admit long speleothems.
    if(degree===4)return important;
    const cx = (c + .5) * ts, cy = (r + .5) * ts, dx = x - cx, dy = y - cy;
    let distance = Math.hypot(dx, dy);
    if (dx < 0 && openCell(maze, r, c - 1) || dx >= 0 && openCell(maze, r, c + 1)) distance = Math.min(distance, Math.abs(dy));
    if (dy < 0 && openCell(maze, r - 1, c) || dy >= 0 && openCell(maze, r + 1, c)) distance = Math.min(distance, Math.abs(dx));
    return Math.max(34-distance,important);
}
function growFormations(t: KarstTerrain, maze: any, calcite: Float32Array, relief: Float32Array) {
    const base = new Float32Array(t.field), seed = t.seed, added = new Set<number>();
    for (let r = 2; r < t.rows - 2; r++) for (let c = 2; c < t.cols - 2; c += 2) {
        const i = r * t.cols + c, a = base[i], b = base[i + t.cols];
        if ((a < 0) === (b < 0)) continue;
        const direction = a < 0 ? 1 : -1, y = t.y + (r + clamp(a / (a - b))) * t.step;
        if (y < (maze.continuous?.seamY || 1080) + 140) continue;
        const x = t.x + c * t.step, patch = noise(x, y, 390, seed + 241), chance = hash(c, r, seed + 913);
        if (patch < -.07 || chance > (direction > 0 ? .34 : .15)) continue;
        let clearance = 0;
        for (let d = 24; d <= 420; d += 16) { if (sampleKarst(t, x, y + d * direction, base) < 0) break; clearance = d; }
        if (clearance < 110) continue;
        const v = hash(c + 59, r - 21, seed), length = Math.min(clearance * (direction>0?.48:.22), 38 + v * v * 280);
        const formation: KarstFormation = { x, y: y - direction * 22, length: length + 22, width: 15 + hash(c, r, seed + 19) * 26,
            bend: (hash(c, r, seed + 51) - .5) * 21, direction, seed: (seed ^ Math.imul(c + 1, 257) ^ Math.imul(r + 1, 7919)) >>> 0 };
        for(let d=24;d<formation.length;d+=6){
            const px=formation.x+formation.bend*smooth(0,1,d/formation.length),py=formation.y+d*direction;
            if(routeClearance(maze,px,py)>2){formation.length=Math.max(28,d-12);break;}
        }
        if(formation.length>=38)t.formations.push(formation);
    }
    for (const f of t.formations) {
        const l = Math.max(1, Math.floor((f.x - f.width * 1.8 - t.x) / t.step)), r = Math.min(t.cols - 2, Math.ceil((f.x + f.width * 1.8 - t.x) / t.step));
        const top = Math.max(1, Math.floor((Math.min(f.y, f.y + f.direction * f.length) - 24 - t.y) / t.step));
        const bottom = Math.min(t.rows - 2, Math.ceil((Math.max(f.y, f.y + f.direction * f.length) + 24 - t.y) / t.step));
        for (let row = top; row <= bottom; row++) for (let col = l; col <= r; col++) {
            const x = t.x + col * t.step, y = t.y + row * t.step, depth = (y - f.y) * f.direction, u = depth / f.length;
            if (u < -.16 || u > 1.12) continue;
            const center = f.x + f.bend * smooth(0, 1, u) + noise(y, f.x, 44, f.seed) * 2.4;
            const width = f.width * Math.pow(Math.max(0, 1 - clamp(u)), .69) * (1 + .12 * Math.sin(u * 21 + noise(x, y, 31, f.seed) * 2));
            const signed = Math.max(Math.abs(x - center) - width, depth - f.length, -depth - 18);
            const i = row * t.cols + col, old = t.field[i];
            // Smooth union fuses the root into the ceiling; tips keep their narrow taper.
            const blend = clamp(.5 + .5 * (old - signed) / 18);
            t.field[i] = Math.max(mix(old, signed, blend) - 18 * blend * (1 - blend), routeClearance(maze, x, y));
            if(base[i]>=0&&t.field[i]<0)added.add(i);
            if (signed < 18 && t.field[i] < 18) {
                const weight = (1 - smooth(-10, 18, signed)) * smooth(-.16, .12, u);
                calcite[i] = Math.max(calcite[i], weight);
                relief[i] = Math.max(relief[i], (26 + 32 * Math.sqrt(Math.max(0, 1 - Math.pow((x - center) / Math.max(1, width), 2)))) * weight);
            }
        }
    }
    // Passage clearance can cut a long drip. Keep only new deposition connected
    // to its original rock root; detached green needles are not cave geology.
    const connected=new Set<number>(),queue:number[]=[];
    for(const i of added){
        if(t.field[i]>=0)continue;
        for(const n of [i-1,i+1,i-t.cols,i+t.cols])if(n>=0&&n<base.length&&base[n]<0&&t.field[n]<0){connected.add(i);queue.push(i);break;}
    }
    for(let head=0;head<queue.length;head++)for(const n of [queue[head]-1,queue[head]+1,queue[head]-t.cols,queue[head]+t.cols]){
        if(added.has(n)&&t.field[n]<0&&!connected.has(n)){connected.add(n);queue.push(n);}
    }
    for(const i of added)if(!connected.has(i)){t.field[i]=base[i];calcite[i]=0;relief[i]=0;}
}
function createEdges(t: KarstTerrain, maze: any) {
    const wallBuckets = new Map<string, RockWall[]>(), ts = maze.mazeTileSize;
    for (const wall of t.handles) {
        const key = Math.floor(wall.x / ts) + ',' + Math.floor(wall.y / ts);
        if (!wallBuckets.has(key)) wallBuckets.set(key, []); wallBuckets.get(key)!.push(wall);
    }
    function owner(x: number, y: number) {
        let best = t.handles[0], distance = Infinity, c = Math.floor(x / ts), r = Math.floor(y / ts);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const wall of wallBuckets.get(c + dx + ',' + (r + dy)) || []) {
            const d = Math.abs(Math.hypot(x - wall.x, y - wall.y) - wall.r);
            if (d < distance) { distance = d; best = wall; }
        }
        return best;
    }
    const cases: Record<number, number[][]> = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]],
        8: [[2, 3]], 9: [[2, 0]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] };
    for (let r = 0; r < t.rows - 1; r++) for (let c = 0; c < t.cols - 1; c++) {
        const i = r * t.cols + c, v = [t.field[i], t.field[i + 1], t.field[i + t.cols + 1], t.field[i + t.cols]];
        let code = 0; for (let j = 0; j < 4; j++) if (v[j] < 0) code |= 1 << j;
        if (code === 0 || code === 15) continue;
        const inside = v.reduce((a, b) => a + b, 0) < 0;
        const pairs = code === 5 ? (inside ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]]) : code === 10 ? (inside ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]]) : cases[code];
        const point = (edge: number) => {
            const ends = [[0, 1], [1, 2], [3, 2], [0, 3]][edge], coords = [[0, 0], [1, 0], [1, 1], [0, 1]];
            const a = ends[0], b = ends[1], u = clamp(v[a] / (v[a] - v[b]));
            return { x: t.x + (c + mix(coords[a][0], coords[b][0], u)) * t.step, y: t.y + (r + mix(coords[a][1], coords[b][1], u)) * t.step };
        };
        for (const pair of pairs) {
            const a = point(pair[0]), b = point(pair[1]), mx = (a.x + b.x) * .5, my = (a.y + b.y) * .5;
            let nx = -(b.y - a.y), ny = b.x - a.x; const length = Math.hypot(nx, ny) || 1; nx /= length; ny /= length;
            if (sampleKarst(t, mx + nx * 2, my + ny * 2) < 0) { nx = -nx; ny = -ny; }
            const wall = owner(mx, my); if (!wall) continue;
            const edge: KarstEdge = { a, b, wall, nx, ny }; t.edges.push(edge);
            if (!t.owned.has(wall)) t.owned.set(wall, []); t.owned.get(wall)!.push(edge);
            for (let row = Math.floor(Math.min(a.y, b.y) / BUCKET); row <= Math.floor(Math.max(a.y, b.y) / BUCKET); row++)
                for (let col = Math.floor(Math.min(a.x, b.x) / BUCKET); col <= Math.floor(Math.max(a.x, b.x) / BUCKET); col++) {
                    const key = col + ',' + row; if (!t.buckets.has(key)) t.buckets.set(key, []); t.buckets.get(key)!.push(edge);
                }
        }
    }
    for (const wall of t.handles) registerRockSurface(wall, {
        closest: (x, y) => karstNearest(t, x, y, Infinity, wall),
        circle: (x, y, radius) => { const p = karstNearest(t, x, y, radius + ts * 2, wall); return Number.isFinite(p.dist) && p.dist < radius; },
        ray: (x, y, dx, dy, range) => karstRay(t, x, y, dx, dy, range, wall).distance,
    });
}
export function buildKarstTerrain(maze: any, requested?: string): KarstTerrain {
    const previous = getKarstTerrain(maze); if (previous) return previous;
    const start = Date.now(), seam = maze.continuous?.seamY || 1080, ts = maze.mazeTileSize;
    const wanted=requested||maze.karstGeneration||CONFIG.karst.geometryMode;
    const generation: 'legacy'|'chambers'|'volume'=wanted==='volume'?'volume':wanted==='chambers'?'chambers':'legacy';
    maze.karstGeneration=generation;
    const x0 = -STEP * 2, y0 = Math.floor((seam - 144) / STEP) * STEP;
    const t: KarstTerrain = { seed: maze.seed >>> 0, version: generation==='legacy'?KARST_VERSION:generation==='volume'?3:2, generation, x: x0, y: y0, step: STEP,
        cols: Math.ceil((maze.mazeCols * ts - x0 + STEP * 2) / STEP) + 1, rows: Math.ceil((maze.mazeRows * ts - y0 + STEP * 2) / STEP) + 1,
        field: null!, texture: null!, edges: [], buckets: new Map(), owned: new Map(),
        handles: maze.mazeWalls.filter((w: any) => !w.shoreBank && !w.shoreObstacle), formations: [], generationMs: 0 };
    if(generation==='volume'){
        // 三维洞腔：碰撞用的密度场是洞腔在游戏平面上的切面，墙面句柄、射线和锚点查询沿用同一套轮廓代码。
        buildVolumeField(t,maze); t.texture=new Uint8Array(t.field.length*4);
        for(let i=0;i<t.field.length;i++){
            const encoded=Math.round(clamp((t.field[i]+FIELD_RANGE)/(FIELD_RANGE*2))*65535);
            t.texture[i*4]=encoded>>>8;t.texture[i*4+1]=encoded&255;
        }
        createEdges(t,maze);t.generationMs=Date.now()-start;terrains.set(maze,t);return t;
    }
    if(generation==='chambers')t.chambers=planKarstChambers(maze);
    const protect=t.chambers?continuousKarstProtection(maze):(x:number,y:number)=>routeClearance(maze,x,y);
    const raw = new Float32Array(t.cols * t.rows), bankWalls = maze.continuous?.banks || [];
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
        const x = t.x + c * STEP, y = t.y + r * STEP, u = x / ts - .5, v = y / ts - .5, cc = Math.floor(u), rr = Math.floor(v);
        const at = (row: number, col: number) => openCell(maze, row, col) ? 80 : -80;
        let field = mix(mix(at(rr, cc), at(rr, cc + 1), u - cc), mix(at(rr + 1, cc), at(rr + 1, cc + 1), u - cc), v - rr);
        if (y < seam && bankWalls.length) {
            let bank = 128;
            for (const wall of bankWalls) {
                const poly = wall.rockPolygon!; let inside = false, d = 192;
                for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
                    const p = poly[a], q = poly[b];
                    if ((p.y > y) !== (q.y > y) && x < (q.x - p.x) * (y - p.y) / (q.y - p.y) + p.x) inside = !inside;
                    const dx = q.x - p.x, dy = q.y - p.y, f = clamp(((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1));
                    d = Math.min(d, Math.hypot(x - p.x - dx * f, y - p.y - dy * f));
                }
                bank = Math.min(bank, d * (inside ? -1 : 1));
            }
            field = mix(bank, field, smooth(seam - 48, seam + 96, y));
        }
        raw[r * t.cols + c] = field;
    }
    t.field = blur(raw, t.cols, t.rows);
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
        const x = t.x + c * STEP, y = t.y + r * STEP, i = r * t.cols + c, gate = smooth(seam - 16, seam + 160, y);
        const erosion = t.chambers?chamberErosion(t.chambers.at(x,y),x,y):noise(x, y, 207, t.seed) * 21 + noise(x + noise(x,y,139,t.seed+83)*22, y, 67, t.seed + 31) * 10 + noise(x, y, 29, t.seed + 77) * 3.5;
        t.field[i] = Math.max(t.field[i] + erosion * gate, protect(x, y));
        if (c === 0 || c === t.cols - 1 || r === t.rows - 1) t.field[i] = -192;
        if (Math.abs(t.field[i]) < .0001) t.field[i] = .0001;
    }
    const calcite = new Float32Array(raw.length), relief = new Float32Array(raw.length);
    if(t.chambers)sculptKarstChambers(t,maze,protect,t.chambers);
    else growFormations(t, maze, calcite, relief);
    const distance = karstDistances(t); t.texture = new Uint8Array(raw.length * 4);
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
        const i = r * t.cols + c, x = t.x + c * STEP, y = t.y + r * STEP, inside = t.field[i] < 0;
        const broad = noise(x, y, 173, t.seed + 359), flowing = noise(x, y, 370, t.seed + 241);
        const wax = Math.max(calcite[i], smooth(.1, .59, flowing) * .71);
        const depth = inside ? distance[i] : 0, width = 43 + 18 * noise(x, y, 270, t.seed + 411);
        // A continuous thickness field, not a radial bevel on individual stones.
        const mass = 10 + 57 * (1 - Math.exp(-depth / (width * .78)));
        const shelves = Math.sin(y * .029 + broad * 2.6 + x * .0033) * (1 - wax) * 5.5;
        const middle = noise(x + broad * 25, y, 61, t.seed + 619);
        const joint = (1 - smooth(.025, .17, Math.abs(middle + broad * .27))) * 10;
        const bumps = broad * 23 + middle * 11 + noise(x+middle*18,y+broad*21,29,t.seed+631)*6 - joint;
        const h = Math.max(0, mass + (bumps + shelves) * smooth(0, 32, depth));
        const height = mix(h, Math.max(h * .63, relief[i]), calcite[i] * .88);
        const encoded = Math.round(clamp((t.field[i] + FIELD_RANGE) / (FIELD_RANGE * 2)) * 65535);
        t.texture[i * 4] = encoded >>> 8; t.texture[i * 4 + 1] = encoded & 255;
        t.texture[i * 4 + 2] = Math.round(clamp(height / HEIGHT_RANGE) * 255); t.texture[i * 4 + 3] = Math.round(wax * 255);
    }
    createEdges(t, maze); t.generationMs = Date.now() - start; terrains.set(maze, t); return t;
}
export function karstStats(maze: any) {
    const t = getKarstTerrain(maze);
    return t ? { version: t.version, generation:t.generation, chambers:t.chambers?.rooms.map(r=>({id:r.id,grammar:r.grammar,x:r.x,y:r.y,radius:r.radius})), seed: t.seed, step: t.step, grid: [t.cols, t.rows], edges: t.edges.length,
        formations: t.formations.length, volume: t.volume?.stats, cpuFieldBytes: t.field.byteLength + t.texture.byteLength,
        gpuFieldBytes: t.texture.byteLength, generationMs: t.generationMs, deterministic: true } : null;
}
