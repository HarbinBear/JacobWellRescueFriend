import { CONFIG } from '../core/config';
import { state, target } from '../core/state';
import { CAVE_MAP_DATA } from './mapData';

// 默认洞穴段配置（可通过 CONFIG.caveSegments 覆盖）
// 每段: { name, startRow, endRow, centerCol(可选), width, widthVariance, drift, narrowStart(可选), narrowEndWidth(可选), targetCol(可选), pullStrength(可选) }
function getDefaultCaveSegments(cols: number) {
    const cx = Math.floor(cols / 2);
    const rx = cx + 20;
    return [
        // Phase 0: 入口水面
        { name: 'entrance', startRow: 0, endRow: 8, centerCol: cx, width: 6, widthVariance: 0, drift: 0, zone: 'entrance' },
        // Phase 1: 第一洞室 - 较宽，底部收窄
        { name: 'chamber1', startRow: 8, endRow: 35, centerCol: cx, width: 6, widthVariance: 4, drift: 1,
          narrowStart: 30, narrowEndWidth: 2.5, narrowDrift: 0.5, zone: 'chamber1' },
        // Phase 2: 潜水服通道 - 狭小，向右偏移连接第二洞室
        { name: 'suit_tunnel', startRow: 35, endRow: 50, targetCol: rx, pullStrength: 0.2, width: 2.0, widthVariance: 0, drift: 0,
          zone: 'suit_tunnel', landmark: 'suit', landmarkOffset: 5 },
        // Phase 3: 第二洞室通道 - 偏右，狭长
        { name: 'chamber2', startRow: 50, endRow: 75, centerCol: rx, width: 2.0, widthVariance: 1.2, drift: 0.4, pullStrength: 0.15,
          narrowStart: 70, narrowEndWidth: 2.0, narrowDrift: -0.5, zone: 'chamber2' },
        // Phase 4: 三岔路口桥接 - 连接到中心
        { name: 'junction_bridge', startRow: 75, endRow: 81, targetCol: cx, pullStrength: 0.3, width: 2.5, widthVariance: 0, drift: 0,
          zone: 'junction', isJunction: true },
        // 分支 A: 死路（向上）
        { name: 'dead_end', startRow: 81, endRow: 81, upward: true, length: 35, centerCol: cx, width: 2.2, widthVariance: 1.0, drift: 0.3,
          pullStrength: 0.1, zone: 'dead_end' },
        // Phase 5: 第三洞室
        { name: 'chamber3', startRow: 81, endRow: 105, centerCol: cx, width: 5, widthVariance: 3, drift: 0.75, pullStrength: 0.05,
          topNarrowRows: 5, topNarrowWidth: 3.5, narrowStart: 95, narrowEndWidth: 2.0, zone: 'chamber3' },
        // Phase 6: 剧情隧道 - 极窄
        { name: 'story_tunnel', startRow: 105, endRow: 135, width: 0.8, widthVariance: 0, drift: 0.1, rowStep: 0.8,
          zone: 'story_tunnel', landmark: 'tunnelEntry' },
        // Phase 7: 第四洞室
        { name: 'chamber4', startRow: 135, endRow: 150, width: 8, widthVariance: 4, drift: 1, zone: 'chamber4' }
    ];
}

// 判断一个格子是否是边缘（至少有一个相邻格子是空的）
function isBorderTile(map: any[][], r: number, c: number, rows: number, cols: number): boolean {
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            let nr = r + dr;
            let nc = c + dc;
            // 地图边界外不算空
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (map[nr][nc] === 0) return true;
        }
    }
    return false;
}

// 从图片数据加载地图（由 scripts/processMap.py 生成）
export function generateMap() {
    state.map = [];
    state.zones = [];
    const { rows, cols, tileSize } = CONFIG;

    // 1. 从图片预处理数据直接加载地图矩阵
    for (let r = 0; r < rows; r++) {
        state.map[r] = [];
        const srcRow = CAVE_MAP_DATA[r];
        for (let c = 0; c < cols; c++) {
            // srcRow 可能比 cols 短（图片数据不足时补墙）
            state.map[r][c] = (srcRow && srcRow[c] !== undefined) ? srcRow[c] : 1;
        }
    }

    // 2. 扫描顶部找到入口水道列，存入 landmarks.entrance
    let entranceCol = -1;
    outer: for (let r = 0; r < Math.min(10, rows); r++) {
        for (let c = 0; c < cols; c++) {
            if (state.map[r][c] === 0) {
                entranceCol = c;
                state.landmarks.entrance = {
                    x: c * tileSize + tileSize / 2 + tileSize * 4,
                    y: r * tileSize + tileSize / 2
                };
                break outer;
            }
        }
    }

    // 根据新地图手动设置剧情关键地标
    // tunnelEntry (a): 缝隙入口，第一关NPC独自下潜触发点，第二关玩家进入触发濒死剧情
    state.landmarks.tunnelEntry = { x: 1800, y: 5300 };
    // tunnelEnd (b): 缝隙中间，第二关玩家被卡住/濒死的位置
    state.landmarks.tunnelEnd = { x: 2000, y: 5600 };
    // deadEndDeep: 假烟囱（394,2700），第二关NPC救人后独自游向此处
    state.landmarks.deadEndDeep = { x: 394, y: 2700 };

    // 3. 生成墙壁渲染数据 —— 仅边缘岩石生成 wall 对象
    state.walls = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (state.map[r][c] === 1) {
                let border = isBorderTile(state.map, r, c, rows, cols);
                if (border) {
                    // 边缘岩石：生成渲染用圆形对象
                    let offsetX = (Math.random() - 0.5) * tileSize * 0.6;
                    let offsetY = (Math.random() - 0.5) * tileSize * 0.6;
                    let radius = tileSize * (0.6 + Math.random() * 0.4);

                    let wall = {
                        x: c * tileSize + tileSize / 2 + offsetX,
                        y: r * tileSize + tileSize / 2 + offsetY,
                        r: radius,
                        row: r,
                        col: c,
                        isBorder: true
                    };

                    state.walls.push(wall);
                    state.map[r][c] = wall;
                } else {
                    // 内部实体：标记为填充但不生成 wall 对象
                    // 用数字 2 表示内部实体（碰撞检测需要但不渲染圆形）
                    state.map[r][c] = 2;
                }
            }
        }
    }

    // 5. 生成浅水区生态
    state.plants = [];
    state.fishes = [];

    // 水草（只在浅水区和第一洞室的边缘岩石上）
    for (let w of state.walls) {
        if (w.y < 30 * tileSize) {
            if (Math.random() < 0.3) {
                let angle = Math.random() * Math.PI * 2;
                let dist = w.r * 0.8;
                state.plants.push({
                    x: w.x + Math.cos(angle) * dist,
                    y: w.y + Math.sin(angle) * dist,
                    len: 10 + Math.random() * 15,
                    color: Math.random() > 0.5 ? '#2e8b57' : '#3cb371',
                    offset: Math.random() * Math.PI * 2
                });
            }
        }
    }

    // 鱼群（只在浅水区）
    let schools = 5;
    for (let s = 0; s < schools; s++) {
        let centerR = Math.floor(Math.random() * 20 + 2);
        let centerC = Math.floor(cols / 2 + (Math.random() - 0.5) * 10);

        if (state.map[centerR] && state.map[centerR][centerC] === 0) {
            let count = Math.floor(Math.random() * 5) + 3;
            let colors = ['#ff7f50', '#ffd700', '#00bfff'];
            let schoolColor = colors[Math.floor(Math.random() * colors.length)];

            for (let i = 0; i < count; i++) {
                state.fishes.push({
                    x: centerC * tileSize + tileSize / 2 + (Math.random() - 0.5) * tileSize * 2,
                    y: centerR * tileSize + tileSize / 2 + (Math.random() - 0.5) * tileSize * 2,
                    vx: (Math.random() - 0.5) * 1.0,
                    vy: (Math.random() - 0.5) * 0.3,
                    size: 4 + Math.random() * 3,
                    color: schoolColor,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
    }
}

function getNeighborCount(r: number, c: number): number {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            let nr = r + i;
            let nc = c + j;
            if (nr < 0 || nr >= state.map.length || nc < 0 || nc >= state.map[0].length) {
                count++;
            } else if (state.map[nr][nc] !== 0) {
                count++;
            }
        }
    }
    return count;
}

// =============================================
// 食人鱼纯享版：生成正方形竞技场地图
// =============================================
export function generateArenaMap() {
    const arenaCfg = CONFIG.fishArena;
    const ts = arenaCfg.tileSize;
    const totalSize = arenaCfg.mapSize;
    const wallThick = arenaCfg.wallThickness;

    // 竞技场格子数
    const cols = Math.ceil(totalSize / ts);
    const rows = Math.ceil(totalSize / ts);
    const wallCols = Math.ceil(wallThick / ts);

    // 重置地图数组
    state.map = [];
    state.walls = [];
    state.plants = [];
    state.fishes = [];
    state.explored = [];

    // 初始化：全部填充为岩石（1）
    for (let r = 0; r < rows; r++) {
        state.map[r] = [];
        state.explored[r] = [];
        for (let c = 0; c < cols; c++) {
            // 顶部开放（水面），其余三面保留岩石墙
            const inWall = r >= rows - wallCols ||
                           c < wallCols || c >= cols - wallCols;
            state.map[r][c] = inWall ? 1 : 0;
            state.explored[r][c] = true; // 竞技场全图可见
        }
    }

    // 随机生成大块障碍物（矩形岩石块）
    const obstCount = arenaCfg.obstacleCount;
    const innerLeft = wallCols * ts;
    const innerRight = (cols - wallCols) * ts;
    const innerTop = wallCols * ts;
    const innerBottom = (rows - wallCols) * ts;
    const innerW = innerRight - innerLeft;
    const innerH = innerBottom - innerTop;

    // 玩家出生点（内部中心）
    const spawnX = totalSize / 2;
    const spawnY = totalSize / 2;

    for (let i = 0; i < obstCount; i++) {
        // 随机尝试放置，避免太靠近出生点
        for (let attempt = 0; attempt < 20; attempt++) {
            const ow = arenaCfg.obstacleMinSize + Math.random() * (arenaCfg.obstacleMaxSize - arenaCfg.obstacleMinSize);
            const oh = arenaCfg.obstacleMinSize + Math.random() * (arenaCfg.obstacleMaxSize - arenaCfg.obstacleMinSize);
            const ox = innerLeft + Math.random() * (innerW - ow);
            const oy = innerTop + Math.random() * (innerH - oh);

            // 检查与出生点的距离
            const cx = ox + ow / 2;
            const cy = oy + oh / 2;
            if (Math.hypot(cx - spawnX, cy - spawnY) < arenaCfg.obstacleMinDist) continue;

            // 将矩形区域填充为岩石
            const r0 = Math.floor(oy / ts);
            const r1 = Math.ceil((oy + oh) / ts);
            const c0 = Math.floor(ox / ts);
            const c1 = Math.ceil((ox + ow) / ts);
            for (let r = r0; r < r1 && r < rows; r++) {
                for (let c = c0; c < c1 && c < cols; c++) {
                    state.map[r][c] = 1;
                }
            }
            break;
        }
    }

    // 生成墙壁渲染数据（边缘岩石）
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (state.map[r][c] === 1) {
                let border = isBorderTile(state.map, r, c, rows, cols);
                if (border) {
                    const offsetX = (Math.random() - 0.5) * ts * 0.5;
                    const offsetY = (Math.random() - 0.5) * ts * 0.5;
                    const radius = ts * (0.55 + Math.random() * 0.35);
                    const wall = {
                        x: c * ts + ts / 2 + offsetX,
                        y: r * ts + ts / 2 + offsetY,
                        r: radius,
                        row: r,
                        col: c,
                        isBorder: true
                    };
                    state.walls.push(wall);
                    state.map[r][c] = wall;
                } else {
                    state.map[r][c] = 2;
                }
            }
        }
    }

    // 设置竞技场地标（出生点）
    state.landmarks.entrance = { x: spawnX, y: spawnY };

    // 竞技场专用 CONFIG 覆盖（临时修改 cols/rows 供碰撞检测使用）
    (CONFIG as any)._arenaRows = rows;
    (CONFIG as any)._arenaCols = cols;
    (CONFIG as any)._arenaTileSize = ts;
}

// =============================================
// 迷宫引导绳模式：生成随机洞穴地图
// 算法：随机游走挖通道 + 元胞自动机平滑 + 多条支路死路
// 通道宽度 3~5 格，形成真正的洞穴感而非网格迷宫
// 返回迷宫专属数据，不写入全局 state.map（避免污染主线地图）
// =============================================
export function generateMazeMap(): {
    mazeMap: any[][];
    mazeWalls: any[];
    mazeExplored: boolean[][];
    mazeCols: number;
    mazeRows: number;
    mazeTileSize: number;
    exitX: number;
    exitY: number;
    npcInitX: number;
    npcInitY: number;
    spawnX: number;
    spawnY: number;
} {
    const mazeCfg = CONFIG.maze;
    const cols = mazeCfg.cols;
    const rows = mazeCfg.rows;
    const ts = mazeCfg.tileSize;

    // ---- 辅助函数 ----

    // 在 grid 上以 (cr, cc) 为中心挖出半径 rad 的圆形通道
    function digCircle(grid: number[][], cr: number, cc: number, rad: number) {
        const r0 = Math.max(1, Math.floor(cr - rad));
        const r1 = Math.min(rows - 2, Math.ceil(cr + rad));
        const c0 = Math.max(1, Math.floor(cc - rad));
        const c1 = Math.min(cols - 2, Math.ceil(cc + rad));
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                if (Math.hypot(r - cr, c - cc) <= rad) {
                    grid[r][c] = 0;
                }
            }
        }
    }

    // 随机游走挖一条通道，从 (sr, sc) 出发，走 steps 步
    // brushMin/brushMax 控制每步挖掘的圆形半径范围
    function drunkardWalk(
        grid: number[][], sr: number, sc: number,
        steps: number, brushMin: number, brushMax: number,
        bias: number = 0 // 正值偏向向下，负值偏向向上
    ) {
        let r = sr, c = sc;
        // 方向权重：上下左右，bias 影响上下权重
        for (let i = 0; i < steps; i++) {
            const rad = brushMin + Math.random() * (brushMax - brushMin);
            digCircle(grid, r, c, rad);
            // 随机选方向，带偏向
            const dirs = [
                { dr: -1, dc: 0, w: Math.max(0.1, 1 - bias) }, // 上
                { dr: 1,  dc: 0, w: Math.max(0.1, 1 + bias) }, // 下
                { dr: 0,  dc: -1, w: 1 },                       // 左
                { dr: 0,  dc: 1,  w: 1 },                       // 右
            ];
            // 加权随机选方向
            const totalW = dirs.reduce((s, d) => s + d.w, 0);
            let rnd = Math.random() * totalW;
            let chosen = dirs[0];
            for (const d of dirs) {
                rnd -= d.w;
                if (rnd <= 0) { chosen = d; break; }
            }
            // 移动，保持在边界内（留1格边框）
            r = Math.max(2, Math.min(rows - 3, r + chosen.dr));
            c = Math.max(2, Math.min(cols - 3, c + chosen.dc));
        }
        return { r, c }; // 返回终点
    }

    // ---- 1. 初始化全部为墙 ----
    const grid: number[][] = [];
    for (let r = 0; r < rows; r++) {
        grid[r] = new Array(cols).fill(1);
    }

    // ---- 2. 挖主通道：从顶部出口向下蜿蜒到底部 NPC 位置 ----
    // 出口固定在顶部中央偏左右随机一点
    const exitCol = Math.floor(cols / 2) + Math.floor((Math.random() - 0.5) * cols * 0.2);
    const exitRow = 1;

    // 主通道：从出口向下游走到底部，偏向向下
    const mainEnd = drunkardWalk(grid, exitRow, exitCol, rows * 3, 1.8, 2.8, 0.6);

    // 确保出口打通到顶部边界
    digCircle(grid, 0, exitCol, 1.5);
    digCircle(grid, 1, exitCol, 2.0);

    // NPC 位置：底部区域，从主通道终点附近再走一段确保到达底部
    let npcRow = rows - 3;
    let npcCol = mainEnd.c;
    // 从主通道终点补充挖到底部
    drunkardWalk(grid, mainEnd.r, mainEnd.c, rows, 1.5, 2.5, 0.8);
    // 确保 NPC 所在格是通道
    digCircle(grid, npcRow, npcCol, 2.5);

    // ---- 3. 挖多条支路（死路），增加迷宫复杂度 ----
    // 从主通道上随机选取起点，向各方向挖支路
    const branchCount = 6 + Math.floor(Math.random() * 5); // 6~10条支路
    for (let i = 0; i < branchCount; i++) {
        // 随机选一个已挖通的格子作为支路起点
        let attempts = 0;
        let br = 0, bc = 0;
        do {
            br = 2 + Math.floor(Math.random() * (rows - 4));
            bc = 2 + Math.floor(Math.random() * (cols - 4));
            attempts++;
        } while (grid[br][bc] !== 0 && attempts < 50);

        if (grid[br][bc] === 0) {
            // 支路长度：短支路（死路）或中等支路
            const branchLen = 15 + Math.floor(Math.random() * 40);
            const branchBias = (Math.random() - 0.5) * 1.2; // 随机方向偏向
            drunkardWalk(grid, br, bc, branchLen, 1.2, 2.2, branchBias);
        }
    }

    // ---- 4. 元胞自动机平滑（2轮），让洞穴边缘更有机 ----
    // 规则：如果一个墙格周围8邻居中通道格 >= 5，则变为通道
    //       如果一个通道格周围8邻居中墙格 >= 6，则变为墙（填充孤立小通道）
    for (let pass = 0; pass < 2; pass++) {
        const next: number[][] = grid.map(row => [...row]);
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                let openCount = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        if (grid[r + dr][c + dc] === 0) openCount++;
                    }
                }
                if (grid[r][c] === 1 && openCount >= 5) {
                    next[r][c] = 0; // 墙变通道（扩展洞穴）
                } else if (grid[r][c] === 0 && openCount <= 1) {
                    next[r][c] = 1; // 孤立通道格填回墙
                }
            }
        }
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                grid[r][c] = next[r][c];
            }
        }
    }

    // ---- 5. 确保出口和 NPC 位置周围一定是通道 ----
    digCircle(grid, exitRow, exitCol, 2.5);
    digCircle(grid, 0, exitCol, 1.5);
    digCircle(grid, npcRow, npcCol, 3.0);

    // 确保出口到玩家出生点（出口下方3格）之间连通
    for (let r = 0; r <= exitRow + 3; r++) {
        digCircle(grid, r, exitCol, 2.0);
    }

    // ---- 6. 保持外围边框为墙 ----
    for (let r = 0; r < rows; r++) {
        grid[r][0] = 1;
        grid[r][cols - 1] = 1;
    }
    for (let c = 0; c < cols; c++) {
        grid[0][c] = 1;
        grid[rows - 1][c] = 1;
    }
    // 出口处打开顶部边框
    grid[0][exitCol] = 0;

    // ---- 7. 生成 mazeMap 和 mazeWalls ----
    const mazeMap: any[][] = [];
    const mazeWalls: any[] = [];
    const mazeExplored: boolean[][] = [];

    for (let r = 0; r < rows; r++) {
        mazeMap[r] = [];
        mazeExplored[r] = [];
        for (let c = 0; c < cols; c++) {
            mazeMap[r][c] = grid[r][c] === 1 ? 1 : 0;
            mazeExplored[r][c] = false;
        }
    }

    // 生成墙壁渲染数据：边缘岩石用大圆形，有随机偏移，形成自然岩石感
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (mazeMap[r][c] === 1) {
                // 判断是否是边缘格（至少有一个相邻格是通道）
                let border = false;
                for (let dr = -1; dr <= 1 && !border; dr++) {
                    for (let dc = -1; dc <= 1 && !border; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                        if (mazeMap[nr][nc] === 0) border = true;
                    }
                }
                if (border) {
                    // 边缘岩石：大圆形 + 随机偏移，形成有机洞穴壁
                    const offsetX = (Math.random() - 0.5) * ts * 0.5;
                    const offsetY = (Math.random() - 0.5) * ts * 0.5;
                    const radius = ts * (0.55 + Math.random() * 0.35); // 0.55~0.9倍格子
                    const wall = {
                        x: c * ts + ts / 2 + offsetX,
                        y: r * ts + ts / 2 + offsetY,
                        r: radius,
                        row: r,
                        col: c,
                        isBorder: true
                    };
                    mazeWalls.push(wall);
                    mazeMap[r][c] = wall;
                } else {
                    // 内部实体岩石
                    mazeMap[r][c] = 2;
                }
            }
        }
    }

    // ---- 8. 计算关键坐标 ----
    const exitX = exitCol * ts + ts / 2;
    const exitY = 0; // 顶部边界
    const npcInitX = npcCol * ts + ts / 2;
    const npcInitY = npcRow * ts + ts / 2;
    // 玩家出生点：出口正下方，确保在已挖通的通道内
    const spawnX = exitX;
    const spawnY = (exitRow + 3) * ts + ts / 2;

    return {
        mazeMap,
        mazeWalls,
        mazeExplored,
        mazeCols: cols,
        mazeRows: rows,
        mazeTileSize: ts,
        exitX,
        exitY,
        npcInitX,
        npcInitY,
        spawnX,
        spawnY,
    };
}
