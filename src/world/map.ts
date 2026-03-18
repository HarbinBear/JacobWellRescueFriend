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
// 算法：多层洞室节点 + 弯折通道网络 + 死路支洞 + 元胞自动机平滑
// 目标：保证可通，同时让正确路线隐藏在多重分叉和拐弯之后
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

    type MazeNode = {
        r: number;
        c: number;
        roomRX: number;
        roomRY: number;
        level: number;
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

    function digEllipse(grid: number[][], cr: number, cc: number, rx: number, ry: number) {
        const r0 = clamp(Math.floor(cr - ry - 1), 1, rows - 2);
        const r1 = clamp(Math.ceil(cr + ry + 1), 1, rows - 2);
        const c0 = clamp(Math.floor(cc - rx - 1), 1, cols - 2);
        const c1 = clamp(Math.ceil(cc + rx + 1), 1, cols - 2);
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const nr = (c - cc) / Math.max(0.01, rx);
                const nc = (r - cr) / Math.max(0.01, ry);
                if (nr * nr + nc * nc <= 1) {
                    grid[r][c] = 0;
                }
            }
        }
    }

    function carveNodeRoom(grid: number[][], node: MazeNode, scale: number = 1) {
        digEllipse(grid, node.r, node.c, node.roomRX * scale, node.roomRY * scale);
    }

    function carveTunnel(grid: number[][], from: MazeNode, to: MazeNode, startWidth: number, endWidth: number, bend: number) {
        const dx = to.c - from.c;
        const dy = to.r - from.r;
        const length = Math.max(12, Math.hypot(dx, dy));
        const steps = Math.max(18, Math.ceil(length * 1.2));
        const midT = 0.5 + (Math.random() - 0.5) * 0.18;
        const midX = from.c + dx * midT;
        const midY = from.r + dy * midT;
        const nx = dy / Math.max(1, length);
        const ny = -dx / Math.max(1, length);
        const ctrlX = midX + nx * bend;
        const ctrlY = midY + ny * bend;
        const wigglePhase = Math.random() * Math.PI * 2;
        const wiggleAmp = Math.min(2.8, Math.abs(bend) * 0.18 + rand(0.4, 1.4));

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const omt = 1 - t;
            let c = omt * omt * from.c + 2 * omt * t * ctrlX + t * t * to.c;
            let r = omt * omt * from.r + 2 * omt * t * ctrlY + t * t * to.r;
            const curveWave = Math.sin(t * Math.PI * rand(1.2, 2.0) + wigglePhase) * wiggleAmp;
            c += nx * curveWave;
            r += ny * curveWave;

            const baseWidth = startWidth + (endWidth - startWidth) * t;
            const widthWave = Math.sin(t * Math.PI * 2 + wigglePhase) * 0.5 + Math.sin(t * Math.PI * 5 + wigglePhase * 0.7) * 0.25;
            const radius = clamp(baseWidth + widthWave, 1.15, 3.9);
            digEllipse(grid, r, c, radius * rand(0.95, 1.15), radius * rand(0.85, 1.2));
        }
    }

    function randomOpenCell(grid: number[][]) {
        for (let tries = 0; tries < 120; tries++) {
            const r = randInt(3, rows - 4);
            const c = randInt(3, cols - 4);
            if (grid[r][c] === 0) {
                return { r, c };
            }
        }
        return { r: Math.floor(rows / 2), c: Math.floor(cols / 2) };
    }

    function countOpenNeighbors(grid: number[][], r: number, c: number) {
        let openCount = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                if (grid[r + dr] && grid[r + dr][c + dc] === 0) openCount++;
            }
        }
        return openCount;
    }

    const grid: number[][] = [];
    for (let r = 0; r < rows; r++) {
        grid[r] = new Array(cols).fill(1);
    }

    const exitCol = clamp(Math.floor(cols / 2) + randInt(-5, 5), 6, cols - 7);
    const exitRow = 0;
    const levelCount = 8;
    const levels: MazeNode[][] = [];

    const topNode: MazeNode = {
        r: 4,
        c: exitCol + randInt(-2, 2),
        roomRX: rand(2.8, 4.8),
        roomRY: rand(2.0, 3.4),
        level: 0,
    };
    levels.push([topNode]);

    for (let level = 1; level < levelCount - 1; level++) {
        const t = level / (levelCount - 1);
        const centerRow = Math.floor(6 + t * (rows - 14) + rand(-3, 3));
        const count = randInt(2, 4);
        const nodes: MazeNode[] = [];
        const colsUsed: number[] = [];
        for (let i = 0; i < count; i++) {
            let col = Math.floor(rand(6, cols - 7));
            let guard = 0;
            while (colsUsed.some(v => Math.abs(v - col) < 8) && guard < 24) {
                col = Math.floor(rand(6, cols - 7));
                guard++;
            }
            colsUsed.push(col);
            nodes.push({
                r: clamp(centerRow + randInt(-4, 4), 4, rows - 5),
                c: col,
                roomRX: rand(2.0, 5.4),
                roomRY: rand(1.8, 4.6),
                level,
            });
        }
        nodes.sort((a, b) => a.c - b.c);
        levels.push(nodes);
    }

    const npcNode: MazeNode = {
        r: rows - 5,
        c: clamp(Math.floor(cols / 2) + randInt(-8, 8), 6, cols - 7),
        roomRX: rand(3.2, 5.8),
        roomRY: rand(2.8, 4.8),
        level: levelCount - 1,
    };
    levels.push([npcNode]);

    const allNodes: MazeNode[] = [];
    for (const levelNodes of levels) {
        for (const node of levelNodes) {
            allNodes.push(node);
        }
    }
    const edges = new Set<string>();

    function addEdge(a: MazeNode, b: MazeNode) {
        const ia = allNodes.indexOf(a);
        const ib = allNodes.indexOf(b);
        const key = ia < ib ? `${ia}-${ib}` : `${ib}-${ia}`;
        edges.add(key);
    }

    let chainNode = topNode;
    for (let level = 1; level < levels.length; level++) {
        const nextNodes = levels[level];
        let best = nextNodes[0];
        let bestScore = Infinity;
        for (const node of nextNodes) {
            const score = Math.abs(node.c - chainNode.c) + Math.abs(node.r - chainNode.r) * 0.2;
            if (score < bestScore) {
                bestScore = score;
                best = node;
            }
        }
        addEdge(chainNode, best);
        chainNode = best;
    }

    for (let level = 0; level < levels.length - 1; level++) {
        const current = levels[level];
        const next = levels[level + 1];
        for (const node of current) {
            const desired = randInt(1, Math.min(3, next.length));
            const ranked = [...next].sort((a, b) => {
                const da = Math.abs(a.c - node.c) + Math.abs(a.r - node.r) * 0.15 + Math.random() * 5;
                const db = Math.abs(b.c - node.c) + Math.abs(b.r - node.r) * 0.15 + Math.random() * 5;
                return da - db;
            });
            for (let i = 0; i < desired; i++) {
                addEdge(node, ranked[i]);
            }
        }

        if (current.length > 1) {
            for (let i = 0; i < current.length - 1; i++) {
                if (Math.random() < 0.45) addEdge(current[i], current[i + 1]);
            }
        }
    }

    for (const node of allNodes) {
        carveNodeRoom(grid, node);
    }

    for (const key of edges) {
        const [aIndex, bIndex] = key.split('-').map(Number);
        const a = allNodes[aIndex];
        const b = allNodes[bIndex];
        const bend = rand(-10, 10);
        carveTunnel(
            grid,
            a,
            b,
            rand(1.3, Math.max(1.5, Math.min(a.roomRX, a.roomRY) * 0.65)),
            rand(1.3, Math.max(1.5, Math.min(b.roomRX, b.roomRY) * 0.65)),
            bend
        );
    }

    const deadEndCount = randInt(10, 16);
    for (let i = 0; i < deadEndCount; i++) {
        const start = allNodes[randInt(0, allNodes.length - 1)];
        const branchAngle = rand(-Math.PI * 0.95, Math.PI * 0.95);
        const branchLen = rand(7, 18);
        const endNode: MazeNode = {
            r: clamp(start.r + Math.sin(branchAngle) * branchLen + rand(-3, 3), 3, rows - 4),
            c: clamp(start.c + Math.cos(branchAngle) * branchLen + rand(-4, 4), 3, cols - 4),
            roomRX: rand(1.4, 3.2),
            roomRY: rand(1.2, 2.8),
            level: start.level,
        };
        carveTunnel(grid, start, endNode, rand(1.0, 1.8), rand(0.9, 1.7), rand(-7, 7));
        carveNodeRoom(grid, endNode, rand(0.85, 1.15));
    }

    for (let pass = 0; pass < 2; pass++) {
        const next = grid.map(row => [...row]);
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                const openCount = countOpenNeighbors(grid, r, c);
                if (grid[r][c] === 1 && openCount >= 5) {
                    next[r][c] = 0;
                } else if (grid[r][c] === 0 && openCount <= 1) {
                    next[r][c] = 1;
                }
            }
        }
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                grid[r][c] = next[r][c];
            }
        }
    }

    for (const node of allNodes) {
        carveNodeRoom(grid, node, 0.92);
    }
    for (const key of edges) {
        const [aIndex, bIndex] = key.split('-').map(Number);
        const a = allNodes[aIndex];
        const b = allNodes[bIndex];
        carveTunnel(grid, a, b, rand(1.25, 2.1), rand(1.25, 2.1), rand(-8, 8));
    }

    digEllipse(grid, 2.5, exitCol, 2.4, 2.0);
    for (let r = 0; r <= 3; r++) {
        digEllipse(grid, r, exitCol, 1.4, 1.2);
    }
    carveNodeRoom(grid, npcNode, 1.1);

    for (let r = 0; r < rows; r++) {
        grid[r][0] = 1;
        grid[r][cols - 1] = 1;
    }
    for (let c = 0; c < cols; c++) {
        grid[0][c] = 1;
        grid[rows - 1][c] = 1;
    }
    grid[0][exitCol] = 0;

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
                    const offsetX = (Math.random() - 0.5) * ts * 0.2;
                    const offsetY = (Math.random() - 0.5) * ts * 0.2;
                    const radius = ts * (0.48 + Math.random() * 0.22);
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
                    mazeMap[r][c] = 2;
                }
            }
        }
    }

    const exitX = exitCol * ts + ts / 2;
    const exitY = 0;
    const npcInitX = npcNode.c * ts + ts / 2;
    const npcInitY = npcNode.r * ts + ts / 2;
    const spawnX = topNode.c * ts + ts / 2;
    const spawnY = topNode.r * ts + ts / 2;

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
