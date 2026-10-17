import { CONFIG } from '../core/config';
import { state } from '../core/state';

export function getActiveMapContext() {
    if (state.screen === 'mazeRescue' && state.mazeRescue) {
        return {
            map: state.mazeRescue.mazeMap,
            walls: state.mazeRescue.mazeWalls,
            rows: state.mazeRescue.mazeRows,
            cols: state.mazeRescue.mazeCols,
            tileSize: state.mazeRescue.mazeTileSize,
        };
    }
    return {
        map: state.map,
        walls: state.walls,
        rows: CONFIG.rows,
        cols: CONFIG.cols,
        tileSize: CONFIG.tileSize,
    };
}

export function isLineOfSight(x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {
    let dist = Math.hypot(x2-x1, y2-y1);
    if(dist > maxDist) return false;
    const active = getActiveMapContext();
    const tileSize = active.tileSize;
    let dx=x2-x1, dy=y2-y1;
    let steps = Math.max(1, Math.ceil(dist / (tileSize*0.35)));
    for(let i=0; i<=steps; i++) {
        let t=i/steps, cx=x1+dx*t, cy=y1+dy*t;
        let r=Math.floor(cy/tileSize), c=Math.floor(cx/tileSize);
        if(active.map[r] && active.map[r][c]) {
            let cell = active.map[r][c];
            if(cell===2) return false;
            if(typeof cell==='object' && Math.hypot(cx-cell.x,cy-cell.y)<cell.r) return false;
        }
    }
    // 检测 walls 数组中的额外圆（迷宫模式下每个格子可能有多个装饰圆）
    if (active.walls) {
        for (let w of active.walls) {
            // 快速排除：wall 离线段太远则跳过
            let midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
            let halfLen = dist / 2 + w.r;
            if (Math.abs(w.x - midX) > halfLen || Math.abs(w.y - midY) > halfLen) continue;
            // 如果 wall 已经在 map 格子中（typeof cell === 'object'），上面已经检测过了
            let wr = w.row, wc = w.col;
            if (active.map[wr] && active.map[wr][wc] === w) continue;
            // 逐步检测线段是否穿过这个额外圆
            for (let i = 0; i <= steps; i++) {
                let t = i / steps;
                let cx = x1 + dx * t, cy = y1 + dy * t;
                if (Math.hypot(cx - w.x, cy - w.y) < w.r) return false;
            }
        }
    }
    return true;
}

