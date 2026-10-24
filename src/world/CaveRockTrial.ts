import { CAVE_ROCK_ROOM } from './CaveRockData';
import { RockPoint, RockWall, pointInRock, rockTrialCollision, rockSegmentClear } from './RockGeometry';

export function createCaveRockTrialMap() {
    const tileSize = 120, cols = 10, rows = 59, x = 240, y = 5760;
    const room = { ...CAVE_ROCK_ROOM, x, y };
    const polygons: RockPoint[][] = CAVE_ROCK_ROOM.shapes.map(p => p.map(v => ({ x: x + v[0], y: y + v[1] })));
    const exitX = x + CAVE_ROCK_ROOM.player[0];
    // An actual connected surface shaft, with no hidden circular collision proxies.
    polygons.push([{ x: 0, y: 0 }, { x: exitX - 65, y: 0 }, { x: exitX - 65, y }, { x: x + 331, y }, { x, y: y + room.height }, { x: 0, y: rows * tileSize }]);
    polygons.push([{ x: exitX + 65, y: 0 }, { x: cols * tileSize, y: 0 }, { x: cols * tileSize, y: rows * tileSize }, { x: x + room.width, y: y + room.height }, { x: x + 518, y }, { x: exitX + 65, y }]);
    polygons.push([{ x: 0, y: y + room.height }, { x: cols * tileSize, y: y + room.height }, { x: cols * tileSize, y: rows * tileSize }, { x: 0, y: rows * tileSize }]);
    const walls: RockWall[] = polygons.map(p => {
        const minX = Math.min(...p.map(v => v.x)), maxX = Math.max(...p.map(v => v.x));
        const minY = Math.min(...p.map(v => v.y)), maxY = Math.max(...p.map(v => v.y));
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        return { x: cx, y: cy, r: Math.hypot(maxX - minX, maxY - minY) / 2, row: Math.floor(cy / tileSize), col: Math.floor(cx / tileSize), rockPolygon: p };
    });
    const map: any[][] = [], explored: boolean[][] = [], themes: number[][] = [], blends: any[][] = [], structures: string[][] = [];
    for (let r = 0; r < rows; r++) {
        map[r] = []; explored[r] = []; themes[r] = []; blends[r] = []; structures[r] = [];
        for (let c = 0; c < cols; c++) {
            const cx = (c + .5) * tileSize, cy = (r + .5) * tileSize;
            map[r][c] = walls.find(w => pointInRock(w.rockPolygon!, cx, cy)) || 0;
            explored[r][c] = false; themes[r][c] = 0; blends[r][c] = { theme2: -1, blend: 0 }; structures[r][c] = '';
        }
    }
    return {
        seed: 0x43525631, mazeMap: map, mazeWalls: walls, mazeExplored: explored,
        mazeCols: cols, mazeRows: rows, mazeTileSize: tileSize,
        mazeSceneThemeKeys: ['hardRock'], mazeSceneThemeMap: themes, mazeSceneBlendMap: blends, mazeSceneStructureMap: structures,
        exitX, exitY: 0, spawnX: exitX, spawnY: y + CAVE_ROCK_ROOM.player[1],
        npcInitX: x + 359, npcInitY: y + 1030, caveRockRoom: room,
    };
}

/** Geometry-aware A*: the actual rope cannot use cell occupancy or circular proxies. */
function computeCaveRockPath(maze: any, start: RockPoint, end: RockPoint, padding: number): RockPoint[] {
    const walls: RockWall[] = maze.mazeWalls;
    if (rockSegmentClear(walls, start, end, padding)) return [{ ...start }, { ...end }];
    const ts = 20, rows = Math.ceil(maze.mazeRows * maze.mazeTileSize / ts), cols = Math.ceil(maze.mazeCols * maze.mazeTileSize / ts);
    const point = (key: number) => ({ x: (key % cols + .5) * ts, y: (Math.floor(key / cols) + .5) * ts });
    const passable = new Map<number, boolean>();
    function allowed(key: number) {
        if (passable.has(key)) return passable.get(key)!;
        const p = point(key), value = !rockTrialCollision(maze, p.x, p.y, padding);
        passable.set(key, value); return value;
    }
    function connectors(p: RockPoint) {
        const out: number[] = [], r = Math.floor(p.y / ts), c = Math.floor(p.x / ts);
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
            if (r + dr < 0 || r + dr >= rows || c + dc < 0 || c + dc >= cols) continue;
            const key = (r + dr) * cols + c + dc;
            if (allowed(key) && rockSegmentClear(walls, p, point(key), padding)) out.push(key);
        }
        return out;
    }
    const starts = connectors(start), ends = new Set(connectors(end));
    const cost = new Map<number, number>(), parent = new Map<number, number>(), closed = new Set<number>();
    const open: { key: number; f: number }[] = [];
    const heuristic = (key: number) => { const p = point(key); return Math.hypot(p.x - end.x, p.y - end.y); };
    for (const key of starts) {
        const p = point(key), g = Math.hypot(p.x - start.x, p.y - start.y);
        cost.set(key, g); open.push({ key, f: g + heuristic(key) });
    }
    let found = -1;
    for (let n = 0; n < 5000 && open.length; n++) {
        let best = 0;
        for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
        const key = open.splice(best, 1)[0].key;
        if (closed.has(key)) continue;
        if (ends.has(key)) { found = key; break; }
        closed.add(key);
        const r = Math.floor(key / cols), c = key % cols, from = point(key);
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if ((!dr && !dc) || r + dr < 0 || r + dr >= rows || c + dc < 0 || c + dc >= cols) continue;
            const next = (r + dr) * cols + c + dc;
            if (closed.has(next) || !allowed(next)) continue;
            const to = point(next);
            if (!rockSegmentClear(walls, from, to, padding)) continue;
            const g = cost.get(key)! + Math.hypot(to.x - from.x, to.y - from.y);
            if (cost.has(next) && cost.get(next)! <= g) continue;
            cost.set(next, g); parent.set(next, key); open.push({ key: next, f: g + heuristic(next) });
        }
    }
    // Never fall back to a known-through-wall chord when no safe route exists.
    if (found < 0) return [{ ...start }];
    const route: RockPoint[] = [{ ...end }];
    for (let key: number | undefined = found; key !== undefined; key = parent.get(key)) route.unshift(point(key));
    route.unshift({ ...start });
    const result = [route[0]];
    for (let i = 0; i < route.length - 1;) {
        let next = i + 1;
        for (let j = i + 2; j < route.length; j++) if (rockSegmentClear(walls, route[i], route[j], padding)) next = j;
        result.push(route[next]); i = next;
    }
    return result;
}

const ropePaths = new WeakMap<object,{start:RockPoint;end:RockPoint;padding:number;path:RockPoint[]}>();
export function buildCaveRockPath(maze:any,start:RockPoint,end:RockPoint,padding:number):RockPoint[]{
 const old=ropePaths.get(maze);
 if(old&&old.padding===padding&&Math.hypot(start.x-old.start.x,start.y-old.start.y)<.001&&Math.hypot(end.x-old.end.x,end.y-old.end.y)<20&&old.path.length>1&&rockSegmentClear(maze.mazeWalls,old.path[old.path.length-2],end,padding)){
  const result=old.path.slice(0,-1).map(p=>({...p}));result.push({...end});return result;
 }
 const result=computeCaveRockPath(maze,start,end,padding);ropePaths.set(maze,{start:{...start},end:{...end},padding,path:result});return result;
}
