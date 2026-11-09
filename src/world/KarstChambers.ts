import type { KarstTerrain, KarstFormation } from './KarstTerrain';
import { karstClamp as clamp, karstMix as mix, karstSmooth as smooth, karstNoise as noise, karstHash as hash } from './KarstNoise';

export type KarstGrammar = 'flow' | 'fracture' | 'tufa' | 'vault';
export interface KarstChamber {
    id: number; x: number; y: number; radius: number; grammar: KarstGrammar; seed: number;
    inclination: number; material: number; mineral: number; relief: number; bevel: number; roughness: number;
}
export interface KarstChambers {
    rooms: KarstChamber[]; cells: Int16Array; cols: number; rows: number; tileSize: number;
    at(x: number, y: number): KarstChamber;
}
export interface SculptedFormation extends KarstFormation {
    kind: 'drip' | 'curtain' | 'blade' | 'bulb' | 'overhang'; axisX: number; axisY: number;
    relief: number; faceOffset: number; material: number; taper: number; roomId: number; landmark: boolean;
}
function open(maze: any, r: number, c: number) { return maze.mazeMap[r]?.[c] === 0; }
export function planKarstChambers(maze: any): KarstChambers {
    const cols = maze.mazeCols, rows = maze.mazeRows, ts = maze.mazeTileSize, distances = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) distances[r * cols + c] = open(maze, r, c) ? 10000 : 0;
    for (let r = 1; r < rows; r++) for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c; distances[i] = Math.min(distances[i], distances[i - 1] + 1, distances[i - cols] + 1,
            distances[i - cols - 1] + Math.SQRT2, distances[i - cols + 1] + Math.SQRT2);
    }
    for (let r = rows - 2; r >= 0; r--) for (let c = cols - 2; c > 0; c--) {
        const i = r * cols + c; distances[i] = Math.min(distances[i], distances[i + 1] + 1, distances[i + cols] + 1,
            distances[i + cols + 1] + Math.SQRT2, distances[i + cols - 1] + Math.SQRT2);
    }
    const candidates: { x: number; y: number; d: number; cell: number }[] = [], seam = maze.continuous?.seamY || 1080;
    for (let r = Math.ceil((seam + 170) / ts); r < rows - 2; r++) for (let c = 2; c < cols - 2; c++) {
        const i = r * cols + c, d = distances[i]; if (d < 2.30) continue;
        if (d < distances[i - 1] || d < distances[i + 1] || d < distances[i - cols] || d < distances[i + cols]) continue;
        candidates.push({ x: (c + .5) * ts, y: (r + .5) * ts, d, cell: i });
    }
    candidates.sort((a, b) => (b.d + hash(b.cell, 0, maze.seed) * .23) - (a.d + hash(a.cell, 0, maze.seed) * .23));
    const chosen: typeof candidates = [];
    for (const c of candidates) {
        if (chosen.some(a => Math.hypot(a.x - c.x, a.y - c.y) < ts * Math.max(3.2, Math.min(a.d, c.d) * 1.1))) continue;
        chosen.push(c); if (chosen.length === 64) break;
    }
    if (chosen.length < 4) for (let r = Math.ceil((seam + 190) / ts); r < rows - 2; r += 3) for (let c = 2; c < cols - 2; c += 3) {
        if (distances[r * cols + c] < 1.8) continue;
        const x = (c + .5) * ts, y = (r + .5) * ts;
        if (!chosen.some(a => Math.hypot(a.x - x, a.y - y) < ts * 5)) chosen.push({ x, y, d: distances[r * cols + c], cell: r * cols + c });
    }
    chosen.sort((a, b) => a.y - b.y || a.x - b.x);
    const grammars: KarstGrammar[] = ['flow', 'fracture', 'tufa', 'vault'], offset = Math.floor(hash(0, 0, maze.seed + 71) * 4);
    const rooms = chosen.map((c, id): KarstChamber => {
        const index = (id + offset) % 4, seed = (maze.seed ^ Math.imul(c.cell + 1, 7919)) >>> 0;
        const signed = hash(c.cell, 7, seed) * 2 - 1;
        return { id, x: c.x, y: c.y, radius: Math.min(650, (c.d - .40) * ts), grammar: grammars[index], seed,
            inclination: index === 1 ? signed * .65 + .24 : index === 3 ? signed * .43 : signed * .08,
            material: [0, 2, 3, 0][index], mineral: [.39, .20, .72, .62][index] + signed * .12,
            relief: [137, 181, 109, 208][index] + signed * 20, bevel: [34, 20, 49, 29][index], roughness: [20, 12, 34, 23][index] };
    });
    if (!rooms.length) rooms.push({ id: 0, x: maze.exitX, y: seam + ts * 3, radius: ts * 2, grammar: 'flow', seed: maze.seed,
        inclination: 0, material: 0, mineral: .35, relief: 137, bevel: 34, roughness: 20 });
    const cells = new Int16Array(cols * rows), costs = new Float32Array(cells.length); cells.fill(-1); costs.fill(Infinity);
    const heap: { cell: number; room: number; cost: number }[] = [];
    function push(value: typeof heap[number]) { heap.push(value); let i = heap.length - 1; while (i > 0) {
        const p = (i - 1) >> 1; if (heap[p].cost <= value.cost) break; heap[i] = heap[p]; i = p; } heap[i] = value; }
    function pop() { const root = heap[0], tail = heap.pop()!; if (heap.length) {
        let i = 0; while (i * 2 + 1 < heap.length) { let c = i * 2 + 1; if (c + 1 < heap.length && heap[c + 1].cost < heap[c].cost) c++;
            if (heap[c].cost >= tail.cost) break; heap[i] = heap[c]; i = c; } heap[i] = tail; } return root; }
    for (const room of rooms) { const cell = Math.floor(room.y / ts) * cols + Math.floor(room.x / ts); costs[cell] = 0; cells[cell] = room.id; push({ cell, room: room.id, cost: 0 }); }
    while (heap.length) {
        const q = pop(); if (q.cost > costs[q.cell]) continue; const r = Math.floor(q.cell / cols), c = q.cell % cols;
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const rr = r + dy, cc = c + dx; if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
            const cell = rr * cols + cc, cost = q.cost + (open(maze, rr, cc) ? 1 : 5);
            if (cost >= costs[cell]) continue; costs[cell] = cost; cells[cell] = q.room; push({ cell, room: q.room, cost });
        }
    }
    return { rooms, cells, cols, rows, tileSize: ts, at(x, y) {
        const c = Math.max(0, Math.min(cols - 1, Math.floor(x / ts))), r = Math.max(0, Math.min(rows - 1, Math.floor(y / ts)));
        return rooms[Math.max(0, cells[r * cols + c])];
    } };
}
export function continuousKarstProtection(maze: any) {
    const ts=maze.mazeTileSize,cols=maze.mazeCols,rows=maze.mazeRows,seam=maze.continuous?.seamY||1080;
    const degree=new Uint8Array(cols*rows),buckets=new Map<string,number[][]>(),radius=34,step=128;
    for(let r=Math.floor(seam/ts);r<rows;r++)for(let c=0;c<cols;c++)if(open(maze,r,c))degree[r*cols+c]=
        Number(open(maze,r-1,c))+Number(open(maze,r+1,c))+Number(open(maze,r,c-1))+Number(open(maze,r,c+1));
    function add(ax:number,ay:number,bx:number,by:number){const line=[ax,ay,bx,by];
        for(let r=Math.floor((Math.min(ay,by)-radius)/step);r<=Math.floor((Math.max(ay,by)+radius)/step);r++)
            for(let c=Math.floor((Math.min(ax,bx)-radius)/step);c<=Math.floor((Math.max(ax,bx)+radius)/step);c++){
                const key=c+','+r;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key)!.push(line);}}
    for(let r=Math.floor(seam/ts);r<rows;r++)for(let c=0;c<cols;c++)if(open(maze,r,c)&&degree[r*cols+c]<4){
        const x=(c+.5)*ts,y=(r+.5)*ts;add(x,y,x,y);
        for(const [dy,dx]of [[1,0],[0,1]])if(open(maze,r+dy,c+dx)&&degree[(r+dy)*cols+c+dx]<4)add(x,y,x+dx*ts,y+dy*ts);
    }
    return (x:number,y:number)=>{
        let value=Math.max(44-Math.hypot(x-maze.npcInitX,y-maze.npcInitY),44-Math.hypot(x-maze.exitX,y-seam-ts*.5));
        for(const line of buckets.get(Math.floor(x/step)+','+Math.floor(y/step))||[]){
            const dx=line[2]-line[0],dy=line[3]-line[1],u=clamp(((x-line[0])*dx+(y-line[1])*dy)/(dx*dx+dy*dy||1));
            value=Math.max(value,radius-Math.hypot(x-line[0]-dx*u,y-line[1]-dy*u));
        }return value;
    };
}
function sample(t: KarstTerrain, field: Float32Array, x: number, y: number) {
    const u = (x - t.x) / t.step, v = (y - t.y) / t.step, c = Math.floor(u), r = Math.floor(v);
    if (c < 0 || r < 0 || c >= t.cols - 1 || r >= t.rows - 1) return -192;
    const i = r * t.cols + c; return mix(mix(field[i], field[i + 1], u - c), mix(field[i + t.cols], field[i + t.cols + 1], u - c), v - r);
}
function rectangle(t: KarstTerrain, x: number, y: number, ex: number, ey: number, padding: number, visit: (i: number, x: number, y: number) => void) {
    const c0 = Math.max(1, Math.floor((Math.min(x, ex) - padding - t.x) / t.step)), c1 = Math.min(t.cols - 2, Math.ceil((Math.max(x, ex) + padding - t.x) / t.step));
    const r0 = Math.max(1, Math.floor((Math.min(y, ey) - padding - t.y) / t.step)), r1 = Math.min(t.rows - 2, Math.ceil((Math.max(y, ey) + padding - t.y) / t.step));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * t.cols + c, t.x + c * t.step, t.y + r * t.step);
}
export function chamberErosion(chamber: KarstChamber, x: number, y: number) {
    const angle = chamber.inclination, u = x * Math.cos(angle) + y * Math.sin(angle), v = -x * Math.sin(angle) + y * Math.cos(angle);
    switch (chamber.grammar) {
        case 'flow': return noise(u, v * .32, 93, chamber.seed) * 17 + noise(u, v, 29, chamber.seed + 1) * 3;
        case 'fracture': {
            const beds = Math.floor((v + noise(u, v, 167, chamber.seed) * 14) / 47);
            return noise(u, beds * 59, 63, chamber.seed + 3) * 23 + noise(u, v, 31, chamber.seed + 4) * 2;
        }
        case 'tufa': return (Math.abs(noise(u, v, 84, chamber.seed)) - .30) * 46 + noise(u, v, 33, chamber.seed + 5) * 8;
        case 'vault': return noise(u, v, 199, chamber.seed) * 35 + noise(u, v, 53, chamber.seed + 7) * 5;
    }
}
export function sculptKarstChambers(t: KarstTerrain, maze: any, protection: (x: number, y: number) => number, chambers = planKarstChambers(maze)) { (t as any).chambers = chambers;
    // Distinct void grammars: a hanging gallery, a tilted fault, scalloped
    // mineral basins, and a low undercut vault. Existing access paths stay open.
    for (const room of chambers.rooms) {
        const rad = room.radius, rx = rad * (room.grammar === 'fracture' ? 1.14 : 1.30), ry = rad * (room.grammar === 'vault' ? .87 : 1.14);
        rectangle(t, room.x, room.y, room.x, room.y, Math.max(rx, ry) + 60, (i, x, y) => {
            const seam=maze.continuous?.seamY||1080;if(y<seam+80)return;
            const dx = x - room.x, dy = y - room.y, a = room.inclination, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
            const theta = Math.atan2(v / ry, u / rx), warped = noise(x, y, 144, room.seed) * 18;
            let voidField = (1 - Math.hypot(u / rx, v / ry)) * Math.min(rx, ry) + warped;
            if (room.grammar === 'fracture') {
                const off=u+v*.18;
                voidField=(1.0-Math.pow(Math.pow(Math.abs(off/rx),3.4)+Math.pow(Math.abs(v/ry),3.4),1.0/3.4))*Math.min(rx,ry)+warped;
            }
            if (room.grammar === 'tufa') voidField += Math.sin(theta * 5 + noise(x, y, 221, room.seed) * 1.1) * 31;
            if (room.grammar === 'vault') voidField += (u < 0 ? 34 : -20) * smooth(-ry * .3, ry * .1, v);
            t.field[i] = Math.max(t.field[i], mix(t.field[i],voidField,smooth(seam+80,seam+310,y)), protection(x, y));
        });
    }
    const base = new Float32Array(t.field), additions = new Set<number>();
    function rootAt(room: KarstChamber, angle: number) {
        const dx = Math.cos(angle), dy = Math.sin(angle); let previous = 0;
        for (let d = 18; d < room.radius * 2 + 180; d += 12) {
            if (sample(t, base, room.x + dx * d, room.y + dy * d) >= 0) { previous = d; continue; }
            let lo = previous, hi = d; for (let j = 0; j < 8; j++) { const mid = (lo + hi) * .5;
                if (sample(t, base, room.x + dx * mid, room.y + dy * mid) >= 0) lo = mid; else hi = mid; }
            return { x: room.x + dx * (hi + 18), y: room.y + dy * (hi + 18), axisX: -dx, axisY: -dy };
        }
        return null;
    }
    for (const room of chambers.rooms) {
        const phase = hash(room.id, 19, room.seed) - .5;
        const angles = room.grammar === 'flow' ? [-Math.PI * .5 + phase * .35, -Math.PI * .5 - .48, Math.PI * .5 + .36] :
            room.grammar === 'fracture' ? [Math.PI + room.inclination - .35, -Math.PI * .5 + room.inclination] :
            room.grammar === 'tufa' ? [Math.PI * .5 + phase * .3, Math.PI + .35, -.3] : [-Math.PI * .5 - .52, Math.PI + .2];
        for (let k = 0; k < angles.length; k++) {
            const root = rootAt(room, angles[k]); if (!root) continue;
            let clearance = 0;
            for (let d = 24; d < room.radius * 2.3 + 170; d += 12) { if (sample(t, base, root.x + root.axisX * d, root.y + root.axisY * d) < 0) break; clearance = d; }
            if (clearance < 140) continue;
            const hero = k === 0, grammar = room.grammar, seed = (room.seed ^ Math.imul(k + 1, 997)) >>> 0;
            const length = Math.min(clearance * (grammar === 'tufa' ? .28 : .46), room.radius * (hero ? 1.12 : .62));
            const width = Math.min(clearance * .22, room.radius * (grammar === 'flow' ? .21 : grammar === 'fracture' ? .30 : grammar === 'tufa' ? .43 : .39)) * (hero ? 1 : .70);
            const f: SculptedFormation = { ...root, x: root.x, y: root.y, length, width: Math.max(24, width),
                direction: root.axisY >= 0 ? 1 : -1, bend: (hash(k, 3, seed) - .5) * Math.min(48, width * .5), seed,
                kind: grammar === 'flow' ? 'curtain' : grammar === 'fracture' ? 'blade' : grammar === 'tufa' ? 'bulb' : 'overhang',
                relief: grammar === 'fracture' ? 246 : grammar === 'vault' ? 252 : grammar === 'tufa' ? 126 : 178,
                faceOffset: phase * .7, material: grammar === 'flow' ? 1 : room.material,
                taper: grammar === 'vault' ? .38 : grammar === 'flow' ? .83 : .65, roomId: room.id, landmark: hero };
            t.formations.push(f);
            if (grammar === 'flow' && hero) for (let j = 0; j < 3; j++) {
                const offset = (j - .9) * width * .70;
                t.formations.push({ ...f, x: f.x + f.axisY * offset - f.axisX * 12, y: f.y - f.axisX * offset - f.axisY * 12,
                    width: f.width * (.29 + hash(j, 7, seed) * .15), length: f.length * (.43 + hash(j, 9, seed) * .37),
                    bend: f.bend * .6, seed: seed + j * 151, kind: 'drip', relief: f.relief * .7, landmark: false } as SculptedFormation);
            }
        }
    }
    for (const f0 of t.formations) {
        const f = f0 as SculptedFormation, ex = f.x + f.axisX * f.length, ey = f.y + f.axisY * f.length;
        rectangle(t, f.x, f.y, ex, ey, f.width * 1.65 + 34, (i, x, y) => {
            const dx = x - f.x, dy = y - f.y, depth = dx * f.axisX + dy * f.axisY, u = depth / f.length;
            if (u < -.19 || u > 1.10) return;
            const bend = f.bend * smooth(0, 1, u) + noise(depth, f.x, 44, f.seed) * (f.kind === 'blade' ? .65 : 2.4);
            const across = dx * f.axisY - dy * f.axisX - bend;
            const taper = f.kind === 'bulb' ? Math.sqrt(Math.max(0, 1 - Math.pow(clamp(u) * 1.04, 2))) :
                f.kind === 'blade' ? Math.max(0, 1 - clamp(u) * .88) : Math.pow(Math.max(0, 1 - clamp(u)), f.taper);
            const width = f.width * taper * (1 + .12 * Math.sin(u * 21 + noise(x, y, 31, f.seed) * 2));
            const density = Math.max(Math.abs(across) - width, depth - f.length, -depth - 22), old = t.field[i];
            const blend = clamp(.5 + .5 * (old - density) / 20);
            t.field[i] = Math.max(mix(old, density, blend) - 20 * blend * (1 - blend), protection(x, y));
            if (base[i] >= 0 && t.field[i] < 0) additions.add(i);
        });
    }
    const connected = new Set<number>(), queue: number[] = [];
    for (const i of additions) for (const n of [i - 1, i + 1, i - t.cols, i + t.cols]) {
        if (base[n] < 0 && t.field[n] < 0) { connected.add(i); queue.push(i); break; }
    }
    for (let head = 0; head < queue.length; head++) for (const n of [queue[head] - 1, queue[head] + 1, queue[head] - t.cols, queue[head] + t.cols]) {
        if (additions.has(n) && t.field[n] < 0 && !connected.has(n)) { connected.add(n); queue.push(n); }
    }
    for (const i of additions) if (!connected.has(i)) t.field[i] = base[i];
    // Encoding stays within the shared 16-bit range even for a grand chamber.
    for (let i = 0; i < t.field.length; i++) t.field[i] = Math.max(-192, Math.min(192, t.field[i]));
    return chambers;
}
