import { CONFIG } from '../core/config';
import { state } from '../core/state';

function getActivePathGrid() {
    if (state.screen === 'mazeRescue' && state.mazeRescue) {
        return {
            map: state.mazeRescue.mazeMap,
            rows: state.mazeRescue.mazeRows,
            cols: state.mazeRescue.mazeCols,
            tileSize: state.mazeRescue.mazeTileSize,
        };
    }
    return {
        map: state.map,
        rows: CONFIG.rows,
        cols: CONFIG.cols,
        tileSize: CONFIG.tileSize,
    };
}

// --- 网格级线段碰撞检测 ---
// 如果线段穿过实心格则返回 true
function lineHitsSolid(x1: number, y1: number, x2: number, y2: number): boolean {
    const active = getActivePathGrid();
    const tileSize = active.tileSize;
    let dx = x2 - x1;
    let dy = y2 - y1;
    let dist = Math.hypot(dx, dy);
    if(dist < 1) return false;
    let steps = Math.ceil(dist / (tileSize * 0.4));
    for(let i = 0; i <= steps; i++) {
        let t = i / steps;
        let px = x1 + dx * t;
        let py = y1 + dy * t;
        let r = Math.floor(py / tileSize);
        let c = Math.floor(px / tileSize);
        if(active.map[r] && active.map[r][c]) {
            let cell = active.map[r][c];
            if(cell === 2) return true;
            if(typeof cell === 'object') {
                if(Math.hypot(px - cell.x, py - cell.y) < cell.r) return true;
            }
        }
    }
    return false;
}

// --- 基于网格的 A* 寻路（绕过绳索障碍物）---
function gridAStar(startX: number, startY: number, endX: number, endY: number, padding: number): any[] {
    const active = getActivePathGrid();
    const tileSize = active.tileSize;
    const rows = active.rows;
    const cols = active.cols;
    let sr = Math.floor(startY / tileSize);
    let sc = Math.floor(startX / tileSize);
    let er = Math.floor(endY / tileSize);
    let ec = Math.floor(endX / tileSize);

    sr = Math.max(0, Math.min(rows - 1, sr));
    sc = Math.max(0, Math.min(cols - 1, sc));
    er = Math.max(0, Math.min(rows - 1, er));
    ec = Math.max(0, Math.min(cols - 1, ec));

    function isPassable(r: number, c: number): boolean {
        if(r < 0 || r >= rows || c < 0 || c >= cols) return false;
        return active.map[r] && active.map[r][c] === 0;
    }

    function isPassableRelaxed(r: number, c: number): boolean {
        if(r < 0 || r >= rows || c < 0 || c >= cols) return false;
        let cell = active.map[r] ? active.map[r][c] : 1;
        return cell === 0;
    }

    let openSet: any[] = [];
    let gScore: any = {};
    let fScore: any = {};
    let cameFrom: any = {};
    let closedSet = new Set();

    let key = (r: number, c: number) => r * cols + c;
    let heuristic = (r: number, c: number) => Math.abs(r - er) + Math.abs(c - ec);

    let startKey = key(sr, sc);
    gScore[startKey] = 0;
    fScore[startKey] = heuristic(sr, sc);
    openSet.push({ r: sr, c: sc, f: fScore[startKey] });

    let dirs = [
        [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
        [-1, -1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [1, 1, 1.414]
    ];

    let maxIters = CONFIG.ropeAStarMaxIters || 3000;
    let found = false;

    for(let iter = 0; iter < maxIters; iter++) {
        if(openSet.length === 0) break;

        let bestIdx = 0;
        for(let i = 1; i < openSet.length; i++) {
            if(openSet[i].f < openSet[bestIdx].f) bestIdx = i;
        }
        let current = openSet[bestIdx];
        openSet.splice(bestIdx, 1);

        let ck = key(current.r, current.c);
        if(closedSet.has(ck)) continue;
        closedSet.add(ck);

        if(current.r === er && current.c === ec) {
            found = true;
            break;
        }

        for(let [dr, dc, cost] of dirs) {
            let nr = current.r + dr;
            let nc = current.c + dc;
            if(nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

            let nk = key(nr, nc);
            if(closedSet.has(nk)) continue;

            let pass = (nr === sr && nc === sc) || (nr === er && nc === ec)
                ? isPassableRelaxed(nr, nc)
                : isPassable(nr, nc);
            if(!pass) continue;

            let ng = gScore[ck] + cost;
            if(gScore[nk] === undefined || ng < gScore[nk]) {
                gScore[nk] = ng;
                fScore[nk] = ng + heuristic(nr, nc);
                cameFrom[nk] = ck;
                openSet.push({ r: nr, c: nc, f: fScore[nk] });
            }
        }
    }

    if(!found) {
        return [{ x: startX, y: startY }, { x: endX, y: endY }];
    }

    let path: any[] = [];
    let ck: any = key(er, ec);
    while(ck !== undefined) {
        let r = Math.floor(ck / cols);
        let c = ck % cols;
        path.unshift({
            x: c * tileSize + tileSize / 2,
            y: r * tileSize + tileSize / 2
        });
        ck = cameFrom[ck];
    }

    if(path.length > 0) {
        path[0] = { x: startX, y: startY };
        path[path.length - 1] = { x: endX, y: endY };
    }

    path = simplifyPath(path);
    return path;
}

// 路径简化：贪心拉直
function simplifyPath(path: any[]): any[] {
    if(path.length <= 2) return path;
    let result = [path[0]];
    let i = 0;
    while(i < path.length - 1) {
        let farthest = i + 1;
        for(let j = i + 2; j < path.length; j++) {
            if(!lineHitsSolid(path[i].x, path[i].y, path[j].x, path[j].y)) {
                farthest = j;
            } else {
                break;
            }
        }
        result.push(path[farthest]);
        i = farthest;
    }
    return result;
}

// 使用网格 A* 构建绕障路径
export function buildAvoidedPath(start: any, end: any, padding: number): any[] {
    if(!lineHitsSolid(start.x, start.y, end.x, end.y)) {
        return [{ x: start.x, y: start.y }, { x: end.x, y: end.y }];
    }
    return gridAStar(start.x, start.y, end.x, end.y, padding);
}

// 计算折线总长度
export function pathLength(pts: any[]): number {
    let len = 0;
    for(let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    }
    return len;
}

// 在折线上按距离 t 采样一个点（0 到总长度）
export function samplePolyline(pts: any[], t: number): any {
    let acc = 0;
    for(let i = 1; i < pts.length; i++) {
        let segLen = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        if(acc + segLen >= t) {
            let frac = segLen > 0 ? (t - acc) / segLen : 0;
            return {
                x: pts[i-1].x + (pts[i].x - pts[i-1].x) * frac,
                y: pts[i-1].y + (pts[i].y - pts[i-1].y) * frac
            };
        }
        acc += segLen;
    }
    return { x: pts[pts.length-1].x, y: pts[pts.length-1].y };
}

// 获取折线在距离 t 处的法线方向
export function polylineNormal(pts: any[], t: number): any {
    let acc = 0;
    for(let i = 1; i < pts.length; i++) {
        let segLen = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        if(acc + segLen >= t || i === pts.length - 1) {
            let dx = pts[i].x - pts[i-1].x;
            let dy = pts[i].y - pts[i-1].y;
            let len = Math.hypot(dx, dy) || 1;
            return { x: -dy / len, y: dx / len };
        }
        acc += segLen;
    }
    return { x: 0, y: -1 };
}
