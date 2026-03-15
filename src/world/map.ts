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
