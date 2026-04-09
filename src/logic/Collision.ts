import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

// --- 碰撞检测 ---

/**
 * 主线/竞技场碰撞检测
 * 检查指定坐标是否与墙体碰撞
 */
export function checkCollision(x: number, y: number, isPlayer?: boolean): boolean {
    if(isPlayer === undefined) isPlayer = false;
    const { tileSize, playerRadius } = CONFIG;
    let r = Math.floor(y/tileSize);
    let c = Math.floor(x/tileSize);
    
    for(let ry = r-1; ry <= r+1; ry++) {
        for(let rc = c-1; rc <= c+1; rc++) {
            if(!state.map[ry]) continue;
            let cell = state.map[ry][rc];
            if(!cell) continue;
            if(typeof cell === 'object') {
                let dist = Math.hypot(x - cell.x, y - cell.y);
                if(dist < cell.r + playerRadius) return true;
            } else if(cell === 2) {
                let cellCx = rc * tileSize + tileSize / 2;
                let cellCy = ry * tileSize + tileSize / 2;
                if(Math.abs(x - cellCx) < tileSize / 2 + playerRadius && Math.abs(y - cellCy) < tileSize / 2 + playerRadius) return true;
            }
        }
    }
    
    if(isPlayer && state.invisibleWalls) {
        for(let wall of state.invisibleWalls) {
            let dist = Math.hypot(x - wall.x, y - wall.y);
            if(dist < wall.r + playerRadius) return true;
        }
    }
    
    return false;
}

/**
 * 获取指定坐标到最近墙体的距离
 */
export function getNearestWallDist(x: number, y: number): number {
    const { tileSize } = CONFIG;
    let r = Math.floor(y/tileSize);
    let c = Math.floor(x/tileSize);
    let minDist = 999;
    for(let ry = r-2; ry <= r+2; ry++) {
        for(let rc = c-2; rc <= c+2; rc++) {
            if(!state.map[ry]) continue;
            let cell = state.map[ry][rc];
            if(!cell) continue;
            if(typeof cell === 'object') {
                let dist = Math.hypot(x - cell.x, y - cell.y) - cell.r;
                if(dist < minDist) minDist = dist;
            } else if(cell === 2) {
                let cellCx = rc * tileSize + tileSize / 2;
                let cellCy = ry * tileSize + tileSize / 2;
                let dist = Math.hypot(x - cellCx, y - cellCy) - tileSize / 2;
                if(dist < minDist) minDist = dist;
            }
        }
    }
    return minDist;
}

/**
 * 迷宫模式碰撞检测（使用迷宫专属地图数据）
 */
export function checkMazeCollision(x: number, y: number, maze: any): boolean {
    const ts = maze.mazeTileSize;
    const playerRadius = CONFIG.maze.playerRadius;
    const r = Math.floor(y / ts);
    const c = Math.floor(x / ts);
    // 搜索范围 5x5：wall 有随机偏移+大半径，碰撞边缘可能超出 3x3 范围
    for(let ry = r-2; ry <= r+2; ry++) {
        for(let rc = c-2; rc <= c+2; rc++) {            if (!maze.mazeMap[ry]) continue;
            const cell = maze.mazeMap[ry][rc];
            if (!cell) continue;
            if (typeof cell === 'object') {
                const dist = Math.hypot(x - cell.x, y - cell.y);
                if (dist < cell.r + playerRadius) return true;
                // 检查同格子的额外装饰圆（挂在基础 wall 的 extras 上）
                if (cell.extras) {
                    for (const extra of cell.extras) {
                        if (Math.hypot(x - extra.x, y - extra.y) < extra.r + playerRadius) return true;
                    }
                }
            } else if (cell === 2) {
                const cellCx = rc * ts + ts / 2;
                const cellCy = ry * ts + ts / 2;
                if (Math.abs(x - cellCx) < ts / 2 + playerRadius && Math.abs(y - cellCy) < ts / 2 + playerRadius) return true;
            }
        }
    }
    return false;
}
