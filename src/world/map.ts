import { CONFIG } from '../core/config';
import { state, target } from '../core/state';

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

// 线性剧情地图生成
export function generateMap() {
    state.map = [];
    state.zones = [];
    const { rows, cols, tileSize } = CONFIG;
    const centerX = Math.floor(cols / 2);

    // 1. 初始化：全墙壁 (1=实体, 0=空)
    for (let r = 0; r < rows; r++) {
        state.map[r] = [];
        for (let c = 0; c < cols; c++) {
            state.map[r][c] = 1;
        }
    }

    // 2. 获取洞穴段配置
    const segments = ((CONFIG as any).caveSegments && (CONFIG as any).caveSegments.length > 0)
        ? (CONFIG as any).caveSegments
        : getDefaultCaveSegments(cols);

    // 收集所有路径点用于挖掘
    let pathPoints: [number, number, number][] = []; // [row, col, radius]

    // 辅助函数：添加路径点并进行边界检查
    function addPoint(r: number, c: number, w: number): number {
        if (c < 3) c = 3;
        if (c > cols - 4) c = cols - 4;
        pathPoints.push([r, c, w]);
        return c;
    }

    // 记录上一段结束时的位置，用于段间连接
    let currentR = 0;
    let currentC = centerX;
    let junctionR = 0;
    let junctionC = centerX;

    for (let seg of segments) {
        // 死路分支（向上挖掘）特殊处理
        if (seg.upward) {
            let deadR = seg.startRow;
            let deadC = seg.centerCol || centerX;
            for (let i = 0; i < (seg.length || 35); i++) {
                deadR -= 1.0;
                deadC += (Math.random() - 0.5) * (seg.drift || 0.3) * 2;
                if (seg.pullStrength) {
                    deadC += ((seg.centerCol || centerX) - deadC) * seg.pullStrength;
                }
                let w = seg.width + Math.random() * (seg.widthVariance || 0);
                if (deadC < 3) deadC = 3;
                if (deadC > cols - 4) deadC = cols - 4;
                pathPoints.push([deadR, deadC, w]);
            }
            // 记录死路地标
            state.landmarks.deadEndDeep = {
                x: deadC * tileSize,
                y: deadR * tileSize
            };
            // 记录死路区域
            if (seg.zone) {
                state.zones.push({
                    name: seg.zone,
                    yMin: deadR * tileSize,
                    yMax: seg.startRow * tileSize,
                    xMin: ((seg.centerCol || centerX) - 5) * tileSize,
                    xMax: ((seg.centerCol || centerX) + 5) * tileSize
                });
            }
            continue;
        }

        // 三岔路口标记
        if (seg.isJunction) {
            junctionR = seg.endRow;
            junctionC = seg.targetCol || centerX;
            // 桥接段：从当前位置平滑过渡到目标位置
            let bridgeSteps = Math.ceil((seg.endRow - seg.startRow) * 2);
            for (let i = 0; i < bridgeSteps; i++) {
                let t = (i + 1) / bridgeSteps;
                let r = seg.startRow + (seg.endRow - seg.startRow) * t;
                let c = currentC * (1 - t) + junctionC * t;
                addPoint(r, c, seg.width);
            }
            currentR = seg.endRow;
            currentC = junctionC;
            state.landmarks.junction = {
                x: junctionC * tileSize,
                y: junctionR * tileSize
            };
            if (seg.zone) {
                state.zones.push({
                    name: seg.zone,
                    yMin: (junctionR - 5) * tileSize,
                    yMax: (junctionR + 5) * tileSize
                });
            }
            continue;
        }

        // 通用段处理
        let segStartR = seg.startRow;
        let segEndR = seg.endRow;
        let rowStep = seg.rowStep || 1.0;

        // 如果段有固定起始列，用它；否则沿用上一段结束位置
        if (seg.startRow <= currentR + 1) {
            // 连续段
        } else {
            currentR = seg.startRow;
        }
        if (segStartR === 0) {
            currentR = 0;
            currentC = seg.centerCol || centerX;
        }

        // 固定宽度段（入口等）
        if (seg.name === 'entrance') {
            for (let r = segStartR; r < segEndR; r++) {
                addPoint(r, seg.centerCol || centerX, seg.width);
            }
            currentR = segEndR;
            currentC = seg.centerCol || centerX;
        } else {
            // 动态挖掘
            while (currentR < segEndR) {
                currentR += rowStep;
                currentC += (Math.random() - 0.5) * (seg.drift || 0) * 2;

                // 目标吸引
                if (seg.targetCol !== undefined && seg.pullStrength) {
                    currentC += (seg.targetCol - currentC) * seg.pullStrength;
                } else if (seg.centerCol !== undefined && seg.pullStrength) {
                    currentC += (seg.centerCol - currentC) * seg.pullStrength;
                }

                let w = seg.width + Math.random() * (seg.widthVariance || 0);

                // 顶部窄化
                if (seg.topNarrowRows && currentR < segStartR + seg.topNarrowRows) {
                    w = seg.topNarrowWidth || w;
                }

                // 底部收窄
                if (seg.narrowStart && currentR > seg.narrowStart) {
                    let narrowProgress = (currentR - seg.narrowStart) / (segEndR - seg.narrowStart);
                    w = w - (w - (seg.narrowEndWidth || 2)) * narrowProgress;
                    if (w < (seg.narrowEndWidth || 2)) w = seg.narrowEndWidth || 2;
                    if (seg.narrowDrift) {
                        currentC += seg.narrowDrift;
                    }
                }

                currentC = addPoint(currentR, currentC, w);
            }
        }

        // 记录地标
        if (seg.landmark === 'suit') {
            state.landmarks.suit = {
                x: currentC * tileSize,
                y: (seg.startRow + (seg.landmarkOffset || 5)) * tileSize
            };
        } else if (seg.landmark === 'tunnelEntry') {
            state.landmarks.tunnelEntry = {
                x: currentC * tileSize,
                y: seg.startRow * tileSize
            };
            // 隧道路径点
            state.landmarks.tunnelPath = [];
            // 遍历该段path点记录路径
        }

        // 记录区域
        if (seg.zone && !seg.isJunction) {
            state.zones.push({
                name: seg.zone,
                yMin: segStartR * tileSize,
                yMax: segEndR * tileSize
            });
        }
    }

    // 隧道路径点和终点（从pathPoints中提取story_tunnel段的数据）
    state.landmarks.tunnelPath = [];
    let tunnelSeg = segments.find((s: any) => s.name === 'story_tunnel');
    if (tunnelSeg) {
        for (let p of pathPoints) {
            if (p[0] >= tunnelSeg.startRow && p[0] <= tunnelSeg.endRow) {
                if (Math.floor(p[0]) % 5 === 0) {
                    state.landmarks.tunnelPath.push({ x: p[1] * tileSize, y: p[0] * tileSize });
                }
            }
        }
        // 隧道终点
        let lastTunnelPoint: [number, number, number] | null = null;
        for (let p of pathPoints) {
            if (p[0] >= tunnelSeg.startRow && p[0] <= tunnelSeg.endRow) {
                lastTunnelPoint = p;
            }
        }
        if (lastTunnelPoint) {
            state.landmarks.tunnelEnd = {
                x: lastTunnelPoint[1] * tileSize,
                y: lastTunnelPoint[0] * tileSize
            };
            state.landmarks.tunnelPath.push(state.landmarks.tunnelEnd);
        }

        // 空气墙（第一次下潜阻挡）
        state.invisibleWalls.push({
            x: state.landmarks.tunnelEntry.x,
            y: (tunnelSeg.startRow + 10) * tileSize,
            r: tileSize * 1.2
        });
    }

    // 3. 挖掘通道（优化：只处理路径点半径内的格子而非全图）
    for (let p of pathPoints) {
        let [pr, pc, radius] = p;
        let rMin = Math.max(0, Math.floor(pr - radius) - 1);
        let rMax = Math.min(rows - 1, Math.ceil(pr + radius) + 1);
        let cMin = Math.max(0, Math.floor(pc - radius) - 1);
        let cMax = Math.min(cols - 1, Math.ceil(pc + radius) + 1);
        for (let r = rMin; r <= rMax; r++) {
            for (let c = cMin; c <= cMax; c++) {
                let dist = Math.hypot(r - pr, c - pc);
                if (dist < radius) {
                    state.map[r][c] = 0;
                }
            }
        }
    }

    // 顶部水面清理
    for (let r = 0; r < 6; r++) {
        for (let c = 1; c < cols - 1; c++) {
            state.map[r][c] = 0;
        }
    }

    // 4. 生成墙壁渲染数据 —— 仅边缘岩石生成 wall 对象
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
