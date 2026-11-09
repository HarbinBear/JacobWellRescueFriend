import { layout as layoutData } from './Layout';

import { state } from '../../core/state';
import { circleHitsRock, pointInRock, RockPoint, RockWall } from '../../world/RockGeometry';

export const layout = layoutData;
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export type WorldStation = typeof layout.stations[number];
export interface ShoreWorld {
    layoutVersion: number; originX: number; surfaceY: number; seamY: number;
    left: RockPoint[]; right: RockPoint[]; banks: RockWall[];
    wet: number; headWet: boolean; grounded: boolean; landBlend: number; walkPhase: number; facing: number;
    elapsed: number; chapterStatus: 'searching' | 'rescued'; stationId: string | null;
    panel: string | null; notice: string; noticeUntil: number; saveOK: boolean; savedAt: number;
    events: { x: number; y: number; age: number; strength: number; kind: string }[];
    nextFishId: number; airTanks: string[]; journal: { time: number; text: string }[];
    pendingAction: string | null; actionTime: number; hidden: boolean; hiddenAt?: number;
}
export function world(): ShoreWorld | null { return (state.mazeRescue as any)?.continuous || null; }
export function activeWorld() { return state.screen === 'mazeRescue' && !!world(); }

// Shape-preserving Hermite samples are shared with the texture baker. The visible
// ledge, the feet, rays and rope anchors all use these exact samples.
export function sampleBank(nodes: number[][], spacing = 8): RockPoint[] {
    const result: RockPoint[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i], b = nodes[i + 1], p = nodes[Math.max(0, i - 1)], q = nodes[Math.min(nodes.length - 1, i + 2)];
        const dx = b[0] - a[0], m0 = (b[1] - p[1]) / (b[0] - p[0] || 1), m1 = (q[1] - a[1]) / (q[0] - a[0] || 1);
        const steps = Math.max(1, Math.ceil(Math.abs(dx) / spacing));
        for (let j = 0; j < steps; j++) {
            const t = j / steps, t2 = t * t, t3 = t2 * t;
            const raw = (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * dx * m0 + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * dx * m1;
            result.push({ x: a[0] + dx * t, y: clamp(raw, Math.min(a[1], b[1]), Math.max(a[1], b[1])) });
        }
    }
    const last = nodes[nodes.length - 1]; result.push({ x: last[0], y: last[1] }); return result;
}
function makeWall(id: string, surface: RockPoint[], x: number, edgeX: number, seam: number): RockWall {
    const polygon = surface.map(p => ({ x: p.x + x, y: p.y }));
    polygon.push({ x: edgeX + x, y: seam });
    const minX = Math.min(...polygon.map(p => p.x)), maxX = Math.max(...polygon.map(p => p.x));
    const minY = Math.min(...polygon.map(p => p.y)), maxY = Math.max(...polygon.map(p => p.y));
    const wall: any = { id, x: (minX + maxX) / 2, y: (minY + maxY) / 2, r: Math.hypot(maxX - minX, maxY - minY) / 2,
        row: -1, col: -1, isBorder: true, shoreBank: true, rockPolygon: polygon };
    return wall;
}
function profileIndex(bank: RockPoint[], x: number) {
    let lo=1,hi=bank.length-1;const ascending=bank[hi].x>bank[0].x;
    while(lo<hi){const mid=(lo+hi)>>1;if(ascending?bank[mid].x<x:bank[mid].x>x)lo=mid+1;else hi=mid;}
    return lo;
}
function profileHeight(bank: RockPoint[], x: number) {
    if(x<Math.min(bank[0].x,bank[bank.length-1].x)||x>Math.max(bank[0].x,bank[bank.length-1].x))return Infinity;
    const i=profileIndex(bank,x),a=bank[i-1],b=bank[i];return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x||1);
}
export function groundAt(x: number): number {
    const w=world();if(!w)return Infinity;
    const local=x-w.originX,a=profileHeight(w.left,local);return Number.isFinite(a)?a:profileHeight(w.right,local);
}
const bankProfiles=new WeakMap<object,RockPoint[]>();
export function bankCircleCollision(wall:RockWall,x:number,y:number,radius:number) {
    if(radius<=0)return pointInRock(wall.rockPolygon!,x,y);
    let bank=bankProfiles.get(wall);if(!bank){bank=wall.rockPolygon!.slice(0,-1);bankProfiles.set(wall,bank);}
    const height=profileHeight(bank,x),seam=layout.seamY;
    if(Number.isFinite(height)&&y>=height&&y<=seam)return true;
    const close=(a:RockPoint,b:RockPoint)=>{const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1));return Math.hypot(x-a.x-dx*t,y-a.y-dy*t)<radius;};
    const a=profileIndex(bank,x-radius),b=profileIndex(bank,x+radius),lo=Math.max(1,Math.min(a,b)-1),hi=Math.min(bank.length-1,Math.max(a,b)+1);
    for(let i=lo;i<=hi;i++)if(close(bank[i-1],bank[i]))return true;
    const edge=wall.rockPolygon![wall.rockPolygon!.length-1];return close(bank[bank.length-1],edge)||close(edge,bank[0]);
}
export function slopeAt(x: number) { const a = groundAt(x - 3), b = groundAt(x + 3); return Number.isFinite(a + b) ? (b - a) / 6 : 0; }
export function depthMeters(y: number) { return Math.max(0, (y - (world()?.surfaceY || 0)) / (state.mazeRescue?.mazeTileSize || 120)); }
export function bodyWet(y: number, radius = 20) { const w = world(); return w ? smooth(w.surfaceY - radius, w.surfaceY + radius, y) : 1; }
export function landAmount(x: number) { const w = world(); return w ? 1 - smooth(46, 134, groundAt(x) - w.surfaceY) : 0; }
export function stationPosition(s: WorldStation) { const x = (world()?.originX || 0) + s.x; return { x, y: groundAt(x) }; }

export function attachWorldTerrain(maze: any): ShoreWorld {
    const left = sampleBank(layout.leftBank), right = sampleBank(layout.rightBank), x = maze.exitX;
    const banks = [makeWall('shore-left', left, x, layout.minX, layout.seamY), makeWall('shore-right', right, x, layout.maxX, layout.seamY)];
    const w: ShoreWorld = { layoutVersion: layout.version, originX: x, surfaceY: layout.surfaceY, seamY: layout.seamY, left, right, banks,
        wet: 0, headWet: false, grounded: true, landBlend: 1, walkPhase: 0, facing: 1, elapsed: 0, chapterStatus: 'searching', stationId: null,
        panel: null, notice: '沿浅滩走进泉水；不需要按下潜按钮', noticeUntil: 9, saveOK: false, savedAt: 0, events: [], nextFishId: 1,
        airTanks: [], journal: [], pendingAction: null, actionTime: 0, hidden: false };
    maze.continuous = w;
    const ts = maze.mazeTileSize, rowEnd = Math.floor(w.seamY / ts);
    // Only replace the entry apron. The remainder of the seeded cave is intact.
    for (let r = 0; r < rowEnd; r++) for (let c = 0; c < maze.mazeCols; c++) {
        const corners = [[c*ts+.1,r*ts+.1],[(c+1)*ts-.1,r*ts+.1],[c*ts+.1,(r+1)*ts-.1],[(c+1)*ts-.1,(r+1)*ts-.1]];
        maze.mazeMap[r][c] = banks.some(b => corners.every(([px,py]) => pointInRock(b.rockPolygon!,px,py))) ? 2 : 0;
    }
    const nr=Math.floor(maze.npcInitY/ts),nc=Math.floor(maze.npcInitX/ts),queue:number[][]=[[nr,nc]],component=new Set([nr+','+nc]);
    for(let i=0;i<queue.length;i++){const [r,c]=queue[i];for(const [dr,dc]of [[1,0],[-1,0],[0,1],[0,-1]]){const rr=r+dr,cc=c+dc,id=rr+','+cc;if(rr>=rowEnd&&maze.mazeMap[rr]?.[cc]===0&&!component.has(id)){component.add(id);queue.push([rr,cc]);}}}
    let join = { x, y: w.seamY + ts * .5 }, distance = Infinity;
    for (const [r,c] of queue) {
        const px = (c + .5) * ts, py = (r + .5) * ts, d = Math.hypot(px - x, py - w.seamY);
        if (d < distance) { distance = d; join = { x: px, y: py }; }
    }
    const tunnel: RockPoint[] = [];
    for (let t = 0; t <= 1.001; t += .025) tunnel.push({ x: x + (join.x - x) * t, y: w.seamY + (join.y - w.seamY) * t });
    maze.mazeWalls = maze.mazeWalls.filter((wall: any) => wall.y - wall.r >= w.seamY - ts * .15 && !tunnel.some(p => Math.hypot(wall.x - p.x, wall.y - p.y) < wall.r + ts * .82));
    for (const p of tunnel) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = Math.floor(p.y / ts) + dr, c = Math.floor(p.x / ts) + dc;
        if (r >= rowEnd && maze.mazeMap[r] && c >= 0 && c < maze.mazeCols) maze.mazeMap[r][c] = 0;
    }
    // Removed circular walls must not remain as hidden map references.
    const retained = new Set(maze.mazeWalls);
    for (let r = rowEnd; r < maze.mazeRows; r++) for (let c = 0; c < maze.mazeCols; c++) {
        const cell = maze.mazeMap[r][c];
        if (typeof cell === 'object') {
            if (!retained.has(cell)) maze.mazeMap[r][c] = 0;
            else if (cell.extras) cell.extras = cell.extras.filter((v: any) => retained.has(v));
        }
    }
    maze.mazeWalls.push(...banks);
    maze.exitY = w.surfaceY;
    maze.playerPath = [];
    return w;
}
export function circleCollision(x: number, y: number, radius = 20): boolean {
    const m: any = state.mazeRescue, w = world(); if (!m || !w) return false;
    const upper=y<w.seamY-radius,minX=upper?w.originX+layout.minX:0,maxX=upper?w.originX+layout.maxX:m.mazeCols*m.mazeTileSize;
    if (x < minX + radius || x > maxX - radius || y < radius || y > m.mazeRows * m.mazeTileSize - radius) return true;
    if (w.banks.some(b => bankCircleCollision(b, x, y, radius))) return true;
    if (upper) return false;
    const ts = m.mazeTileSize, r = Math.floor(y / ts), c = Math.floor(x / ts);
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const row = r + dr, col = c + dc, cell = m.mazeMap[row]?.[col];
        if (typeof cell === 'object' && cell) {
            if (circleHitsRock(cell,x,y,radius)) return true;
            if (cell.extras?.some((e:any)=>circleHitsRock(e,x,y,radius))) return true;
        }
        if (cell === 2 && Math.abs(x - (col + .5) * ts) < ts / 2 + radius && Math.abs(y - (row + .5) * ts) < ts / 2 + radius) return true;
    }
    return false;
}
export function sweptMove(body: { x: number; y: number; vx: number; vy: number }, radius = 20) {
    const steps = Math.max(1, Math.ceil(Math.hypot(body.vx, body.vy) / 4)), dx = body.vx / steps, dy = body.vy / steps;
    for (let i = 0; i < steps; i++) {
        if (!circleCollision(body.x + dx, body.y, radius)) body.x += dx; else body.vx *= .24;
        if (!circleCollision(body.x, body.y + dy, radius)) body.y += dy; else body.vy *= .12;
    }
}
export function bankSupport(body: { x: number; y: number; vx: number; vy: number }, reach: number, wasGrounded = false): boolean {
    const ground = groundAt(body.x), gap = ground - body.y - reach;
    if (!Number.isFinite(ground) || ground > layout.surfaceY + 160) return false;
    if (gap <= 6 && gap >= -12 || wasGrounded && Math.abs(gap) < Math.abs(body.vx) * 1.5 + 5) {
        body.y = ground - reach; if (body.vy > 0) body.vy = 0; return true;
    }
    return false;
}
