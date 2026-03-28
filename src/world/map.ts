import { CONFIG } from '../core/config';
import { state, target } from '../core/state';
import { CAVE_MAP_DATA } from './mapData';
import { createMazeSceneData } from './mazeScene';

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
// 算法：多层洞室节点 + 弯折通道网络 + 死路支洞 + 元胞自动机平滑
// 目标：保证可通，同时让正确路线隐藏在多重分叉和拐弯之后
// 返回迷宫专属数据，不写入全局 state.map（避免污染主线地图）
// =============================================
export function generateMazeMap(): {
    mazeMap: any[][];
    mazeWalls: any[];
    mazeExplored: boolean[][];
    mazeSceneThemeKeys: string[];
    mazeSceneThemeMap: number[][];
    mazeSceneBlendMap: {theme2: number, blend: number}[][];
    mazeSceneStructureMap: string[][];
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

    type Cell = {
        r: number;
        c: number;
    };

    type MazeNode = {
        id: number;
        r: number;
        c: number;
        roomRX: number;
        roomRY: number;
        tag: 'main' | 'branch' | 'deadEnd' | 'chamber';
    };

    type Candidate = {
        grid: number[][];
        nodes: MazeNode[];
        chamberNodes: MazeNode[];
        spawnNode: MazeNode;
        npcNode: MazeNode;
        exitCol: number;
    };

    type Metrics = {
        openCount: number;
        openRatio: number;
        reachableRatio: number;
        pathLen: number;
        deadEnds: number;
        junctions: number;
        pathDecisionCount: number;
        turnCount: number;
        maxRowRun: number;
        maxColRun: number;
        maxWindowOpen: number;
        accepted: boolean;
        score: number;
    };

    function clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }

    function rand(min: number, max: number) {
        return min + Math.random() * (max - min);
    }

    function randInt(min: number, max: number) {
        return Math.floor(rand(min, max + 1));
    }

    function isInside(r: number, c: number) {
        return r >= 0 && r < rows && c >= 0 && c < cols;
    }

    function isOpen(grid: number[][], r: number, c: number) {
        return isInside(r, c) && grid[r][c] === 0;
    }

    function digEllipse(grid: number[][], cr: number, cc: number, rx: number, ry: number) {
        const r0 = clamp(Math.floor(cr - ry - 1), 1, rows - 2);
        const r1 = clamp(Math.ceil(cr + ry + 1), 1, rows - 2);
        const c0 = clamp(Math.floor(cc - rx - 1), 1, cols - 2);
        const c1 = clamp(Math.ceil(cc + rx + 1), 1, cols - 2);
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const dx = (c - cc) / Math.max(0.01, rx);
                const dy = (r - cr) / Math.max(0.01, ry);
                if (dx * dx + dy * dy <= 1) {
                    grid[r][c] = 0;
                }
            }
        }
    }

    function digPocket(grid: number[][], node: MazeNode, scale: number) {
        if (node.tag === 'chamber') {
            // 随机决定洞室形状类型
            const shapeType = Math.random();
            if (shapeType < 0.3) {
                // 哑铃形 (两个大洞室中间一条小缝)
                const angle = Math.random() * Math.PI;
                const dist = node.roomRX * scale * 1.5;
                const cx1 = node.c + Math.cos(angle) * dist;
                const cy1 = node.r + Math.sin(angle) * dist;
                const cx2 = node.c - Math.cos(angle) * dist;
                const cy2 = node.r - Math.sin(angle) * dist;
                
                digEllipse(grid, cy1, cx1, node.roomRX * scale * 0.8, node.roomRY * scale * 0.8);
                digEllipse(grid, cy2, cx2, node.roomRX * scale * 0.8, node.roomRY * scale * 0.8);
                
                // 连接缝隙
                const points = [{r: cy1, c: cx1}, {r: cy2, c: cx2}];
                carvePolyline(grid, points, 1.5, 1.5);
            } else if (shapeType < 0.6) {
                // 漏斗形
                const dir = Math.random() < 0.5 ? 1 : -1; // 向上或向下漏斗
                const height = node.roomRY * scale * 2;
                const topWidth = node.roomRX * scale * 2;
                const bottomWidth = 2;
                
                for (let r = 0; r < height; r++) {
                    const currentWidth = topWidth - (topWidth - bottomWidth) * (r / height);
                    const actualR = node.r + (dir === 1 ? r : -r);
                    if (actualR > 0 && actualR < rows - 1) {
                        for (let c = -currentWidth/2; c <= currentWidth/2; c++) {
                            const actualC = Math.floor(node.c + c);
                            if (actualC > 0 && actualC < cols - 1) {
                                grid[actualR][actualC] = 0;
                            }
                        }
                    }
                }
            } else {
                // 不规则大洞室 (多个重叠椭圆)
                const lumps = randInt(4, 7);
                for (let i = 0; i < lumps; i++) {
                    const ox = rand(-node.roomRX * 0.8, node.roomRX * 0.8);
                    const oy = rand(-node.roomRY * 0.8, node.roomRY * 0.8);
                    digEllipse(
                        grid,
                        node.r + oy,
                        node.c + ox,
                        node.roomRX * scale * rand(0.6, 1.2),
                        node.roomRY * scale * rand(0.6, 1.2)
                    );
                }
            }
        } else {
            // 普通节点
            const lumps = node.tag === 'deadEnd' ? randInt(2, 3) : randInt(1, 2);
            const spreadX = 0.35;
            const spreadY = 0.35;
            for (let i = 0; i < lumps; i++) {
                const ox = rand(-node.roomRX * spreadX, node.roomRX * spreadX);
                const oy = rand(-node.roomRY * spreadY, node.roomRY * spreadY);
                digEllipse(
                    grid,
                    node.r + oy,
                    node.c + ox,
                    node.roomRX * scale * rand(0.86, 1.08),
                    node.roomRY * scale * rand(0.86, 1.12)
                );
            }
        }
    }

    function carvePolyline(grid: number[][], points: Cell[], startWidth: number, endWidth: number) {
        let total = 0;
        const lengths: number[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const seg = Math.max(1, Math.hypot(points[i + 1].c - points[i].c, points[i + 1].r - points[i].r));
            lengths.push(seg);
            total += seg;
        }

        let walked = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const seg = lengths[i];
            const steps = Math.max(12, Math.ceil(seg * 2.8));
            const nx = (b.r - a.r) / Math.max(1, seg);
            const ny = -(b.c - a.c) / Math.max(1, seg);
            const phase = Math.random() * Math.PI * 2;
            const wobbleAmp = rand(0.15, 0.55);

            for (let step = 0; step <= steps; step++) {
                const lt = step / steps;
                const gt = total > 0 ? (walked + seg * lt) / total : lt;
                let rr = a.r + (b.r - a.r) * lt;
                let cc = a.c + (b.c - a.c) * lt;
                const wobble = Math.sin(lt * Math.PI * 2 + phase) * wobbleAmp;
                rr += nx * wobble;
                cc += ny * wobble;
                const radius = clamp(
                    startWidth + (endWidth - startWidth) * gt + Math.sin(gt * Math.PI * 5 + phase) * 0.08,
                    0.8,
                    2.0
                );
                digEllipse(
                    grid,
                    rr,
                    cc,
                    radius * rand(0.92, 1.04),
                    radius * rand(0.88, 1.08)
                );
            }
            walked += seg;
        }
    }

    function carveConnection(grid: number[][], from: MazeNode, to: MazeNode, startWidth: number, endWidth: number, bendiness: number) {
        const dx = to.c - from.c;
        const dy = to.r - from.r;
        const len = Math.max(1, Math.hypot(dx, dy));
        const nx = dy / len;
        const ny = -dx / len;
        const bendCount = randInt(1, 3);
        const points: Cell[] = [{ r: from.r, c: from.c }];

        for (let i = 1; i <= bendCount; i++) {
            const t = i / (bendCount + 1);
            const side = Math.sin(t * Math.PI * rand(1.0, 1.8) + Math.random() * 2.2) * bendiness;
            points.push({
                r: from.r + dy * t + nx * side + rand(-0.45, 0.45),
                c: from.c + dx * t + ny * side + rand(-0.65, 0.65),
            });
        }
        points.push({ r: to.r, c: to.c });
        carvePolyline(grid, points, startWidth, endWidth);
    }

    function countOpen4(grid: number[][], r: number, c: number) {
        let count = 0;
        if (isOpen(grid, r - 1, c)) count++;
        if (isOpen(grid, r + 1, c)) count++;
        if (isOpen(grid, r, c - 1)) count++;
        if (isOpen(grid, r, c + 1)) count++;
        return count;
    }

    function roughen(grid: number[][]) {
        const next = grid.map(row => row.slice());
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                let count8 = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        if (grid[r + dr][c + dc] === 0) count8++;
                    }
                }
                if (grid[r][c] === 1) {
                    // 岩石变空地：周围空地多，或者有一定概率被侵蚀
                    if (count8 >= 5 || (count8 >= 4 && Math.random() < 0.2)) {
                        next[r][c] = 0;
                    }
                } else {
                    // 空地变岩石：周围岩石多，或者有一定概率沉积
                    if (count8 <= 2 || (count8 <= 3 && Math.random() < 0.1)) {
                        next[r][c] = 1;
                    }
                }
            }
        }
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                grid[r][c] = next[r][c];
            }
        }
    }

    function buildCandidate(): Candidate {
        const grid: number[][] = [];
        for (let r = 0; r < rows; r++) {
            grid[r] = new Array(cols).fill(1);
        }

        let nextNodeId = 0;
        const nodes: MazeNode[] = [];
        const chamberNodes: MazeNode[] = [];
        const edges = new Set<string>();
        const mainNodes: MazeNode[] = [];

        function createNode(r: number, c: number, tag: 'main' | 'branch' | 'deadEnd' | 'chamber', scale: number): MazeNode {
            const chamberScaleX = tag === 'chamber' ? rand(3.5, 5.0) : rand(1.2, 2.0);
            const chamberScaleY = tag === 'chamber' ? rand(3.5, 5.0) : rand(1.2, 2.0);
            const node: MazeNode = {
                id: nextNodeId++,
                r: clamp(Math.round(r), 3, rows - 4),
                c: clamp(Math.round(c), 3, cols - 4),
                roomRX: chamberScaleX * scale,
                roomRY: chamberScaleY * scale,
                tag,
            };
            nodes.push(node);
            if (tag === 'chamber') {
                chamberNodes.push(node);
            }
            return node;
        }

        function addEdge(a: MazeNode, b: MazeNode) {
            if (a.id === b.id) return;
            const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
            edges.add(key);
        }

        const exitCol = clamp(Math.floor(cols / 2) + randInt(-4, 4), 5, cols - 6);
        const laneCount = 6;
        const laneCols: number[] = [];
        for (let i = 0; i < laneCount; i++) {
            const t = i / (laneCount - 1);
            laneCols.push(Math.round(6 + t * (cols - 13)));
        }

        let laneIndex = clamp(Math.floor(laneCount / 2) + randInt(-1, 1), 0, laneCount - 1);
        let sideDir = Math.random() < 0.5 ? -1 : 1;
        const mainCount = 13;
        const spawnNode = createNode(4, exitCol + randInt(-1, 1), 'main', 1.02);
        mainNodes.push(spawnNode);

        for (let i = 1; i < mainCount - 1; i++) {
            if (laneIndex <= 1) sideDir = 1;
            else if (laneIndex >= laneCount - 2) sideDir = -1;
            else if (Math.random() < 0.72) sideDir *= -1;
            laneIndex = clamp(laneIndex + sideDir * randInt(1, 2), 0, laneCount - 1);
            const row = 4 + (i / (mainCount - 1)) * (rows - 11) + rand(-1.4, 1.4);
            const col = laneCols[laneIndex] + rand(-1.8, 1.8);
            mainNodes.push(createNode(row, col, 'main', rand(0.92, 1.08)));
        }

        const npcBaseCol = laneCols[clamp(laneIndex + sideDir * randInt(-1, 1), 0, laneCount - 1)] + rand(-2.2, 2.2);
        const npcNode = createNode(rows - 5, npcBaseCol, 'main', 1.08);
        mainNodes.push(npcNode);

        for (let i = 0; i < mainNodes.length - 1; i++) {
            addEdge(mainNodes[i], mainNodes[i + 1]);
        }

        const chamberAnchorIndexes: number[] = [];
        for (let i = 2; i < mainNodes.length - 2; i++) {
            if (Math.random() < 0.34) {
                chamberAnchorIndexes.push(i);
            }
        }
        if (chamberAnchorIndexes.length < 2) {
            chamberAnchorIndexes.push(3, Math.max(5, Math.floor(mainNodes.length * 0.6)));
        }

        const usedAnchors = new Set<number>();
        for (const rawIndex of chamberAnchorIndexes) {
            const index = clamp(rawIndex, 2, mainNodes.length - 3);
            if (usedAnchors.has(index)) continue;
            usedAnchors.add(index);
            const anchor = mainNodes[index];
            const chamber = createNode(
                anchor.r + rand(-2.5, 2.5),
                anchor.c + rand(-5.5, 5.5),
                'chamber',
                rand(0.96, 1.12)
            );
            addEdge(anchor, chamber);
            addEdge(chamber, mainNodes[index - 1]);
            addEdge(chamber, mainNodes[index + 1]);
            if (Math.random() < 0.65) {
                addEdge(chamber, mainNodes[clamp(index + randInt(2, 3), 0, mainNodes.length - 1)]);
            }
        }

        const branchRoots: MazeNode[] = [];
        for (let i = 1; i < mainNodes.length - 1; i++) {
            branchRoots.push(mainNodes[i]);
            if (Math.random() < 0.55) branchRoots.push(mainNodes[i]);
        }

        const loopableNodes: MazeNode[] = [];
        for (const node of mainNodes) {
            loopableNodes.push(node);
        }
        for (const node of chamberNodes) {
            loopableNodes.push(node);
        }

        const deepBranchCount = 12;
        for (let i = 0; i < deepBranchCount; i++) {
            const root = branchRoots[randInt(0, branchRoots.length - 1)];
            let prev = root;
            let lateralDir = Math.random() < 0.5 ? -1 : 1;
            const chainLength = randInt(1, 3);
            const branchNodes: MazeNode[] = [];
            for (let step = 0; step < chainLength; step++) {
                const isDeadEnd = step === chainLength - 1;
                const next = createNode(
                    prev.r + rand(3.4, 7.8) + (Math.random() < 0.18 ? rand(-4.2, -1.2) : 0),
                    prev.c + lateralDir * rand(5.2, 9.6) + rand(-1.6, 1.6),
                    isDeadEnd ? 'deadEnd' : 'branch',
                    isDeadEnd ? rand(0.94, 1.12) : rand(0.82, 0.96)
                );
                addEdge(prev, next);
                branchNodes.push(next);
                loopableNodes.push(next);
                if (Math.random() < 0.42) lateralDir *= -1;
                prev = next;
            }

            if (branchNodes.length >= 2 && Math.random() < 0.35) {
                const tail = branchNodes[branchNodes.length - 1];
                const candidates = loopableNodes.filter(node => {
                    if (node.id === tail.id || node.id === root.id) return false;
                    const rowDist = Math.abs(node.r - tail.r);
                    const colDist = Math.abs(node.c - tail.c);
                    return rowDist >= 4 && rowDist <= 14 && colDist >= 3 && colDist <= 15;
                });
                if (candidates.length > 0) {
                    const loopTo = candidates[randInt(0, candidates.length - 1)];
                    addEdge(tail, loopTo);
                    tail.tag = 'branch';
                }
            }
        }

        const extraDeadEnds = 5;
        for (let i = 0; i < extraDeadEnds; i++) {
            const root = loopableNodes[randInt(0, loopableNodes.length - 1)];
            const leaf = createNode(
                root.r + rand(-6.5, 6.5),
                root.c + (Math.random() < 0.5 ? -1 : 1) * rand(5.4, 11.5),
                'deadEnd',
                rand(0.92, 1.08)
            );
            addEdge(root, leaf);
            loopableNodes.push(leaf);
        }

        for (const node of nodes) {
            const scale = node.tag === 'main'
                ? rand(0.92, 1.06)
                : node.tag === 'deadEnd'
                    ? rand(0.95, 1.16)
                    : rand(0.82, 0.94);
            digPocket(grid, node, scale);
        }

        edges.forEach(key => {
            const [aId, bId] = key.split('-').map(Number);
            const a = nodes[aId];
            const b = nodes[bId];
            const dist = Math.hypot(a.c - b.c, a.r - b.r);
            // 加宽通道，减少小路
            const widthA = a.tag === 'main' && b.tag === 'main' ? rand(1.2, 1.8) : rand(0.9, 1.4);
            const widthB = a.tag === 'deadEnd' || b.tag === 'deadEnd' ? rand(0.8, 1.2) : rand(0.9, 1.4);
            const bend = clamp(dist * rand(0.08, 0.19), 0.8, 3.4);
            carveConnection(grid, a, b, widthA, widthB, bend);
        });

        roughen(grid);

        digPocket(grid, spawnNode, 0.96);
        digPocket(grid, npcNode, 1.02);
        for (const chamber of chamberNodes) {
            digPocket(grid, chamber, 1.05);
            for (let i = 0; i < 2; i++) {
                digEllipse(
                    grid,
                    chamber.r + rand(-1.2, 1.2),
                    chamber.c + rand(-1.2, 1.2),
                    chamber.roomRX * rand(0.32, 0.48),
                    chamber.roomRY * rand(0.32, 0.5)
                );
            }
        }
        for (const node of nodes) {
            if (node.tag !== 'deadEnd' && node.tag !== 'chamber' && Math.random() < 0.22) {
                digPocket(grid, node, 0.72);
            }
        }
        digEllipse(grid, 2.3, exitCol, 1.05, 1.1);
        digEllipse(grid, 1.1, exitCol, 0.85, 0.95);
        grid[0][exitCol] = 0;

        for (let r = 0; r < rows; r++) {
            grid[r][0] = 1;
            grid[r][cols - 1] = 1;
        }
        for (let c = 0; c < cols; c++) {
            grid[0][c] = 1;
            grid[rows - 1][c] = 1;
        }
        grid[0][exitCol] = 0;

        return {
            grid,
            nodes,
            chamberNodes,
            spawnNode,
            npcNode,
            exitCol,
        };
    }

    function analyzeCandidate(candidate: Candidate): Metrics {
        const grid = candidate.grid;
        const spawn = { r: clamp(Math.round(candidate.spawnNode.r), 1, rows - 2), c: clamp(Math.round(candidate.spawnNode.c), 1, cols - 2) };
        const npc = { r: clamp(Math.round(candidate.npcNode.r), 1, rows - 2), c: clamp(Math.round(candidate.npcNode.c), 1, cols - 2) };

        const degree: number[][] = [];
        let openCount = 0;
        let deadEnds = 0;
        let junctions = 0;
        let maxRowRun = 0;
        let maxColRun = 0;
        let maxWindowOpen = 0;

        for (let r = 0; r < rows; r++) {
            degree[r] = new Array(cols).fill(0);
            let run = 0;
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === 0) {
                    openCount++;
                    run++;
                    const deg = countOpen4(grid, r, c);
                    degree[r][c] = deg;
                    if (deg <= 1) deadEnds++;
                    if (deg >= 3) junctions++;
                } else {
                    maxRowRun = Math.max(maxRowRun, run);
                    run = 0;
                }
            }
            maxRowRun = Math.max(maxRowRun, run);
        }

        for (let c = 0; c < cols; c++) {
            let run = 0;
            for (let r = 0; r < rows; r++) {
                if (grid[r][c] === 0) {
                    run++;
                } else {
                    maxColRun = Math.max(maxColRun, run);
                    run = 0;
                }
            }
            maxColRun = Math.max(maxColRun, run);
        }

        const windowRadius = 3;
        for (let r = windowRadius; r < rows - windowRadius; r++) {
            for (let c = windowRadius; c < cols - windowRadius; c++) {
                let count = 0;
                for (let dr = -windowRadius; dr <= windowRadius; dr++) {
                    for (let dc = -windowRadius; dc <= windowRadius; dc++) {
                        if (grid[r + dr][c + dc] === 0) count++;
                    }
                }
                maxWindowOpen = Math.max(maxWindowOpen, count);
            }
        }

        const dist: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
        const parentR: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
        const parentC: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
        const qr: number[] = [];
        const qc: number[] = [];

        if (grid[spawn.r][spawn.c] !== 0) grid[spawn.r][spawn.c] = 0;
        if (grid[npc.r][npc.c] !== 0) grid[npc.r][npc.c] = 0;

        qr.push(spawn.r);
        qc.push(spawn.c);
        dist[spawn.r][spawn.c] = 0;

        let reachableCount = 0;
        for (let head = 0; head < qr.length; head++) {
            const r = qr[head];
            const c = qc[head];
            reachableCount++;
            const neighbors = [
                [r - 1, c],
                [r + 1, c],
                [r, c - 1],
                [r, c + 1],
            ];
            for (const [nr, nc] of neighbors) {
                if (!isOpen(grid, nr, nc)) continue;
                if (dist[nr][nc] !== -1) continue;
                dist[nr][nc] = dist[r][c] + 1;
                parentR[nr][nc] = r;
                parentC[nr][nc] = c;
                qr.push(nr);
                qc.push(nc);
            }
        }

        const pathLen = dist[npc.r][npc.c];
        let turnCount = 0;
        let pathDecisionCount = 0;
        if (pathLen >= 0) {
            let cr = npc.r;
            let cc = npc.c;
            let prevDr = 0;
            let prevDc = 0;
            while (!(cr === spawn.r && cc === spawn.c)) {
                const pr = parentR[cr][cc];
                const pc = parentC[cr][cc];
                if (pr < 0 || pc < 0) break;
                const dr = cr - pr;
                const dc = cc - pc;
                if ((prevDr !== 0 || prevDc !== 0) && (dr !== prevDr || dc !== prevDc)) {
                    turnCount++;
                }
                if (degree[cr][cc] >= 3) pathDecisionCount++;
                prevDr = dr;
                prevDc = dc;
                cr = pr;
                cc = pc;
            }
        }

        const openRatio = openCount / (rows * cols);
        const reachableRatio = openCount > 0 ? reachableCount / openCount : 0;
        const chamberFriendly = candidate.chamberNodes.length >= 2;
        const maxAllowedRowRun = 60;
        const maxAllowedColRun = 60;
        const maxAllowedWindowOpen = 200;
        const accepted = (
            openRatio >= 0.15 &&
            openRatio <= 0.7 &&
            reachableRatio >= 0.8 && // 保证连通性
            pathLen >= Math.floor(rows * 0.01) &&
            deadEnds >= 1 &&
            junctions >= 2 &&
            pathDecisionCount >= 1 &&
            turnCount >= 1 &&
            maxRowRun <= maxAllowedRowRun &&
            maxColRun <= maxAllowedColRun &&
            maxWindowOpen <= maxAllowedWindowOpen
        );
        let score = 0;        score += Math.max(0, 1 - Math.abs(openRatio - 0.3) / 0.13) * 220;
        score += Math.min(reachableRatio, 1) * 180;
        score += Math.max(0, Math.min(1, pathLen / (rows * 1.65))) * 190;
        score += Math.max(0, Math.min(1, deadEnds / 70)) * 120;
        score += Math.max(0, Math.min(1, junctions / 150)) * 110; // 放宽岔点得分上限
        score += Math.max(0, Math.min(1, pathDecisionCount / 26)) * 125;
        score += Math.max(0, Math.min(1, turnCount / 22)) * 110;
        score += Math.max(0, 1 - Math.max(0, maxRowRun - 10) / 8) * 110;
        score += Math.max(0, 1 - Math.max(0, maxColRun - 12) / 8) * 110;
        score += Math.max(0, 1 - Math.abs(maxWindowOpen - (chamberFriendly ? 40 : 26)) / (chamberFriendly ? 18 : 12)) * 150;
        if (!accepted) score -= 220;

        return {
            openCount,
            openRatio,
            reachableRatio,
            pathLen,
            deadEnds,
            junctions,
            pathDecisionCount,
            turnCount,
            maxRowRun,
            maxColRun,
            maxWindowOpen,
            accepted,
            score,
        };
    }

    let chosen: Candidate | null = null;
    let chosenMetrics: Metrics | null = null;
    const maxAttempts = 36;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = buildCandidate();
        const metrics = analyzeCandidate(candidate);
        if (!chosen || !chosenMetrics || metrics.score > chosenMetrics.score) {
            chosen = candidate;
            chosenMetrics = metrics;
        }
        if (metrics.accepted) {
            chosen = candidate;
            chosenMetrics = metrics;
            break;
        }
    }

    const finalCandidate = chosen!;
    const grid = finalCandidate.grid;
    const exitCol = finalCandidate.exitCol;
    const spawnNode = finalCandidate.spawnNode;
    const npcNode = finalCandidate.npcNode;

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

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (mazeMap[r][c] === 1) {
                let border = false;
                for (let dr = -1; dr <= 1 && !border; dr++) {
                    for (let dc = -1; dc <= 1 && !border; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                        if (mazeMap[nr][nc] === 0) border = true;
                    }
                }
                if (border) {
                    // 基础墙体，保证碰撞覆盖
                    const wall = {
                        x: c * ts + ts / 2 + (Math.random() - 0.5) * ts * 0.4,
                        y: r * ts + ts / 2 + (Math.random() - 0.5) * ts * 0.4,
                        r: ts * (0.5 + Math.random() * 0.2),
                        row: r,
                        col: c,
                        isBorder: true
                    };
                    mazeWalls.push(wall);
                    mazeMap[r][c] = wall;
                    
                    // 额外添加1-2个随机圆，打破网格感，表现结构无规则
                    const extraCount = Math.random() < 0.5 ? 1 : 2;
                    for (let i = 0; i < extraCount; i++) {
                        mazeWalls.push({
                            x: c * ts + ts / 2 + (Math.random() - 0.5) * ts * 0.8,
                            y: r * ts + ts / 2 + (Math.random() - 0.5) * ts * 0.8,
                            r: ts * (0.3 + Math.random() * 0.5),
                            row: r,
                            col: c,
                            isBorder: true
                        });
                    }
                } else {
                    mazeMap[r][c] = 2;
                }
            }
        }
    }

    // === 场景辨识度：区域主题分配（每局随机选4~5类 + 渐变过渡） ===
    const mazeScene = createMazeSceneData(finalCandidate.nodes, mazeMap, rows, cols);

    const exitX = exitCol * ts + ts / 2;
    const exitY = 0;
    const npcInitX = npcNode.c * ts + ts / 2;
    const npcInitY = npcNode.r * ts + ts / 2;
    const spawnX = spawnNode.c * ts + ts / 2;
    const spawnY = spawnNode.r * ts + ts / 2;

    return {
        mazeMap,
        mazeWalls,
        mazeExplored,
        mazeSceneThemeKeys: mazeScene.sceneThemeKeys,
        mazeSceneThemeMap: mazeScene.sceneThemeMap,
        mazeSceneBlendMap: mazeScene.sceneBlendMap,
        mazeSceneStructureMap: mazeScene.sceneStructureMap,
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
