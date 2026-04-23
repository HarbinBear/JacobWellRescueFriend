// 迷宫模式本地存档模块（v3 种子版）
//
// 需求：迷宫模式当前关卡进度持久化，退出到主界面或退出小游戏后再回来能接上。
//
// v1 / v2 的问题：
// - v1 直接 JSON.stringify，一次下潜就 500KB+，Android 单 key 超限丢数据
// - v2 压缩了位图与场景图，降到 ~374KB/次下潜，但随着下潜次数堆积仍会逼近上限
//
// v3 方案（种子 + 增量快照）：
// 地图结构（mazeMap / mazeWalls / 场景主题各图 / exit/spawn/npc 坐标 / 食人鱼聚集点 / 骷髅）
// 通过确定性 PRNG 从 seed 完全重建，因此存档里不再保存这些大字段，只需：
//   - seed：uint32，恢复时用 generateMazeMap(seed) 重建完整地图
//   - mazeExplored：100×100 位图 base64
//   - diveHistory：每条压缩（exploredSnapshot + exploredBeforeSnapshot + playerPath + 绳索含端点）
//   - rest：diveCount / npcFound / maxDepthReached / totalRopePlaced 等小字段
//   - ropes / markers / player：绳索（完整端点 + wall 坐标最近匹配回挂）、标记、玩家状态
//
// 预期单次下潜体积：~10~30KB；5 次下潜 ~50~150KB，远低于单 key 上限。
//
// 版本号：MAZE_SAVE_VERSION = 3；老 v1 / v2 存档自动丢弃（用户已确认不保留老档）

import { state, player } from '../core/state';
import { saveJSON, loadJSON, removeKey } from '../core/SaveStorage';
import { generateMazeMap } from '../world/map';

export const MAZE_SAVE_KEY = 'maze_save_v3';
export const MAZE_SAVE_VERSION = 3;

// ============================ 压缩工具函数 ============================

// base64 编码/解码（小游戏没有 Buffer，自己做）
function uint8ToBase64(bytes: Uint8Array): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    let i = 0;
    const len = bytes.length;
    while (i < len) {
        const b1 = bytes[i++];
        const b2 = i < len ? bytes[i++] : 0;
        const b3 = i < len ? bytes[i++] : 0;
        const pad2 = i - 1 > len - 1;
        const pad1 = i > len - 1;
        out += chars[b1 >> 2];
        out += chars[((b1 & 0x03) << 4) | (b2 >> 4)];
        out += pad1 ? '=' : chars[((b2 & 0x0f) << 2) | (b3 >> 6)];
        out += pad2 ? '=' : chars[b3 & 0x3f];
    }
    return out;
}

function base64ToUint8(str: string): Uint8Array {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Int8Array(128);
    for (let i = 0; i < 128; i++) lookup[i] = -1;
    for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

    let end = str.length;
    while (end > 0 && str[end - 1] === '=') end--;
    const outLen = Math.floor((end * 3) / 4);
    const out = new Uint8Array(outLen);

    let op = 0;
    let i = 0;
    while (i < end) {
        const c1 = lookup[str.charCodeAt(i++)] || 0;
        const c2 = i < end ? (lookup[str.charCodeAt(i++)] || 0) : 0;
        const c3 = i < end ? (lookup[str.charCodeAt(i++)] || 0) : 0;
        const c4 = i < end ? (lookup[str.charCodeAt(i++)] || 0) : 0;
        if (op < outLen) out[op++] = (c1 << 2) | (c2 >> 4);
        if (op < outLen) out[op++] = ((c2 & 0x0f) << 4) | (c3 >> 2);
        if (op < outLen) out[op++] = ((c3 & 0x03) << 6) | c4;
    }
    return out;
}

// boolean 二维数组 → 位图 base64
function packBoolMap(map: boolean[][] | null | undefined, rows: number, cols: number): string {
    const bitLen = rows * cols;
    const byteLen = (bitLen + 7) >> 3;
    const bytes = new Uint8Array(byteLen);
    if (!map) return uint8ToBase64(bytes);
    for (let r = 0; r < rows; r++) {
        const row = map[r];
        if (!row) continue;
        for (let c = 0; c < cols; c++) {
            if (row[c]) {
                const idx = r * cols + c;
                bytes[idx >> 3] |= (1 << (idx & 7));
            }
        }
    }
    return uint8ToBase64(bytes);
}

// 位图 base64 → boolean 二维数组
function unpackBoolMap(b64: string, rows: number, cols: number): boolean[][] {
    const bytes = base64ToUint8(b64);
    const map: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const bit = (bytes[idx >> 3] >> (idx & 7)) & 1;
            row.push(bit === 1);
        }
        map.push(row);
    }
    return map;
}

// 玩家路径 {x,y}[] → 扁平 int（坐标范围 0~12000，int32 足够）
function packPath(path: {x: number, y: number}[] | null | undefined): number[] {
    if (!path || path.length === 0) return [];
    const out: number[] = [];
    for (let i = 0; i < path.length; i++) {
        out.push(Math.round(path[i].x), Math.round(path[i].y));
    }
    return out;
}

function unpackPath(flat: number[] | null | undefined): {x: number, y: number}[] {
    const out: {x: number, y: number}[] = [];
    if (!flat) return out;
    for (let i = 0; i + 1 < flat.length; i += 2) {
        out.push({ x: flat[i], y: flat[i + 1] });
    }
    return out;
}

// ============================ 绳索端点与 wall 引用重挂 ============================
//
// 活绳子 state.rope.ropes[*] 结构（参考 Rope.ts endRope 真实写入）：
//   { start: {x,y}, startWall: wall, end: {x,y}, endWall: wall, path, slackFactor, mode }
// 其中 wall 是 mazeWalls 里的对象引用。因为存档里 mazeWalls 靠 seed 重建，地址必然变化，
// 所以我们只存 wall 的坐标特征（x/y/r），读档时用"近距离匹配"在新 mazeWalls 里找回真实对象。
//
// 匹配规则：先取坐标差平方最小的墙；如果距离超过容差（默认 2px），退回 null。
// 这样即便 seed 算法未来微调，绳子钉子位置小幅漂移也不会挂错墙。

interface PackedWallRef {
    x: number;
    y: number;
    r: number;
}

interface PackedLiveRope {
    start: {x: number, y: number} | null;
    end: {x: number, y: number} | null;
    startWall: PackedWallRef | null;
    endWall: PackedWallRef | null;
    path: number[];          // 扁平 [x,y,...]
    slackFactor: number;
    mode: string;
}

interface PackedHistoryRope {
    // 历史快照只用来画轨迹和端点，不需要 wall 对象引用
    start: {x: number, y: number} | null;
    end: {x: number, y: number} | null;
    path: number[];
}

// 把一个 wall 对象压成 {x,y,r}；null 安全
function packWallRef(wall: any): PackedWallRef | null {
    if (!wall) return null;
    return {
        x: Math.round(wall.x * 100) / 100,
        y: Math.round(wall.y * 100) / 100,
        r: Math.round((wall.r || 0) * 100) / 100,
    };
}

// 端点坐标压缩（保留两位小数；绳子端点落在岩石外缘，精度需要高一点）
function packPoint(p: any): {x: number, y: number} | null {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return {
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
    };
}

// 根据坐标特征在 mazeWalls 中查找最近的 wall 对象
// tolerancePx：距离超过这个阈值就认为匹配失败（防止错挂）
function findWallByRef(walls: any[], ref: PackedWallRef | null, tolerancePx: number = 2): any {
    if (!ref || !Array.isArray(walls) || walls.length === 0) return null;
    let best: any = null;
    let bestD2 = Infinity;
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (!w) continue;
        const dx = w.x - ref.x;
        const dy = w.y - ref.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
            bestD2 = d2;
            best = w;
        }
    }
    if (!best) return null;
    // 距离超过容差，算匹配失败（宁可挂 null 也不要挂错）
    if (Math.sqrt(bestD2) > tolerancePx) {
        console.warn('[MazeSave] wall 最近匹配距离=' + Math.sqrt(bestD2).toFixed(2) +
                     'px 超过容差=' + tolerancePx + 'px，端点可能未正确回挂');
        return null;
    }
    return best;
}

// 打包单条活绳子
function packLiveRope(rope: any): PackedLiveRope {
    return {
        start: packPoint(rope && rope.start),
        end: packPoint(rope && rope.end),
        startWall: packWallRef(rope && rope.startWall),
        endWall: packWallRef(rope && rope.endWall),
        path: packPath(rope && rope.path),
        slackFactor: (rope && typeof rope.slackFactor === 'number') ? rope.slackFactor : 0,
        mode: (rope && typeof rope.mode === 'string') ? rope.mode : 'tight',
    };
}

// 解包单条活绳子，并用新 mazeWalls 回挂 startWall / endWall
function unpackLiveRope(p: PackedLiveRope, newMazeWalls: any[]): any {
    return {
        start: p.start ? { x: p.start.x, y: p.start.y } : null,
        end: p.end ? { x: p.end.x, y: p.end.y } : null,
        startWall: findWallByRef(newMazeWalls, p.startWall),
        endWall: findWallByRef(newMazeWalls, p.endWall),
        path: unpackPath(p.path),
        slackFactor: p.slackFactor,
        mode: p.mode,
    };
}

// 打包单条历史快照绳子（diveHistory[*].ropesSnapshot[*]）
function packHistoryRope(rope: any): PackedHistoryRope {
    return {
        start: packPoint(rope && rope.start),
        end: packPoint(rope && rope.end),
        path: packPath(rope && rope.path),
    };
}

function unpackHistoryRope(p: PackedHistoryRope): any {
    return {
        start: p.start ? { x: p.start.x, y: p.start.y } : null,
        end: p.end ? { x: p.end.x, y: p.end.y } : null,
        path: unpackPath(p.path),
    };
}

// ============================ 存档主结构 ============================

interface PackedDive {
    diveType: string;
    duration: number;
    maxDepth: number;
    newExploredCount: number;
    ropePlaced: number;
    returnReason: string;
    newThemes: string[];
    playerPath: number[];              // 扁平 [x,y,x,y,...] int
    exploredSnap: string;              // 位图 base64
    exploredBeforeSnap: string;        // 位图 base64
    ropesSnap: PackedHistoryRope[];    // 每条历史绳索（含端点）
    npcFoundAtEnd: boolean;
    finishAt: number;
}

interface PackedMaze {
    // 种子：恢复时用 generateMazeMap(seed) 重建完整地图结构
    seed: number;

    // 地图尺寸（用于位图解压时的 rows/cols；重建出来应该和存档一致，这里留一份方便严格校验）
    mazeCols: number;
    mazeRows: number;

    // 累计探索位图（跨下潜保留）
    mazeExplored: string;

    // 其它运行时字段（diveCount / npcFound / maxDepthReached / totalRopePlaced / discoveredThemes
    //               / diveHistory 压缩版 / 其它小字段）
    rest: any;
}

interface MazeSaveData {
    version: number;
    timestamp: number;
    packed: PackedMaze;
    ropes: PackedLiveRope[];           // 活绳子数组（完整端点 + wall 坐标）
    markers: any[];
    playerPos: { x: number; y: number; angle: number; o2: number };
}

// ============================ 对外接口 ============================

/**
 * 是否存在迷宫存档
 */
export function hasMazeSave(): boolean {
    const data = loadJSON<MazeSaveData>(MAZE_SAVE_KEY);
    if (!data) return false;
    if (data.version !== MAZE_SAVE_VERSION) return false;
    if (!data.packed) return false;
    return true;
}

/**
 * 保存当前迷宫进度到本地
 */
export function saveMazeProgress(): boolean {
    const maze: any = state.mazeRescue;
    if (!maze) return false;
    if (maze.seed == null) {
        console.warn('[MazeSave] 存档未保存：mazeRescue.seed 缺失');
        return false;
    }

    const rows: number = maze.mazeRows | 0;
    const cols: number = maze.mazeCols | 0;
    if (rows <= 0 || cols <= 0) return false;

    // 打包 diveHistory（每条记录压缩两份 snapshot + 路径 + 绳索含端点）
    const packedHistory: PackedDive[] = [];
    const src = Array.isArray(maze.diveHistory) ? maze.diveHistory : [];
    for (let i = 0; i < src.length; i++) {
        const d = src[i];
        if (!d) continue;
        const ropesSnap: PackedHistoryRope[] = [];
        if (Array.isArray(d.ropesSnapshot)) {
            for (let j = 0; j < d.ropesSnapshot.length; j++) {
                ropesSnap.push(packHistoryRope(d.ropesSnapshot[j]));
            }
        }
        packedHistory.push({
            diveType: d.diveType,
            duration: d.duration,
            maxDepth: d.maxDepth,
            newExploredCount: d.newExploredCount,
            ropePlaced: d.ropePlaced,
            returnReason: d.returnReason,
            newThemes: Array.isArray(d.newThemes) ? d.newThemes.slice() : [],
            playerPath: packPath(d.playerPath),
            exploredSnap: packBoolMap(d.exploredSnapshot, rows, cols),
            exploredBeforeSnap: packBoolMap(d.exploredBeforeSnapshot, rows, cols),
            ropesSnap,
            npcFoundAtEnd: !!d.npcFoundAtEnd,
            finishAt: d.finishAt || 0,
        });
    }

    // 收集其它小字段（剔除所有能从种子重建或已经单独压缩的大字段）
    const rest: any = {};
    for (const k in maze) {
        if (!Object.prototype.hasOwnProperty.call(maze, k)) continue;
        if (k === 'seed' ||
            // 能从 seed 重建的，全部不存
            k === 'mazeMap' || k === 'mazeWalls' ||
            k === 'sceneThemeKeys' || k === 'sceneThemeMap' ||
            k === 'sceneBlendMap' || k === 'sceneStructureMap' ||
            k === 'mazeCols' || k === 'mazeRows' || k === 'mazeTileSize' ||
            k === 'exitX' || k === 'exitY' ||
            k === 'npcInitX' || k === 'npcInitY' ||
            k === 'spawnX' || k === 'spawnY' ||
            // 骷髅 / 聚集点也能从 seed 重建（MazeLogic 里用派生 seed 包住 generateFishDens）
            k === 'fishDens' ||
            // 单独压缩的大字段
            k === 'mazeExplored' || k === 'thisExploredBefore' ||
            k === 'diveHistory' ||
            // 不该跨 session 存的运行时杂项
            k === 'playerPath' ||
            k === 'divingInBubbles') {
            continue;
        }
        rest[k] = maze[k];
    }
    rest.diveHistory = packedHistory;

    const packed: PackedMaze = {
        seed: (maze.seed >>> 0),
        mazeCols: cols,
        mazeRows: rows,
        mazeExplored: packBoolMap(maze.mazeExplored, rows, cols),
        rest,
    };

    // 活绳子（完整打包：端点 + wall 坐标 + slack + mode）
    const ropes: PackedLiveRope[] = [];
    if (state.rope && Array.isArray(state.rope.ropes)) {
        for (let i = 0; i < state.rope.ropes.length; i++) {
            ropes.push(packLiveRope(state.rope.ropes[i]));
        }
    }

    const data: MazeSaveData = {
        version: MAZE_SAVE_VERSION,
        timestamp: Date.now(),
        packed,
        ropes,
        markers: state.markers || [],
        playerPos: {
            x: player.x,
            y: player.y,
            angle: player.angle,
            o2: player.o2,
        },
    };

    const ok = saveJSON(MAZE_SAVE_KEY, data);
    if (ok) {
        try {
            const approxSize = JSON.stringify(data).length;
            const kb = Math.round(approxSize / 1024);
            console.log('[MazeSave] 存档已保存（v3 种子），大小约 ' + kb + ' KB（seed=' + (maze.seed >>> 0) + '）');
            if (approxSize > 400 * 1024) {
                console.warn('[MazeSave] 存档仍偏大（' + kb + 'KB），可考虑裁剪 diveHistory 条数');
            }
        } catch (e) { /* 忽略 */ }
    }
    return ok;
}

/**
 * 尝试从本地读取并恢复迷宫进度
 *
 * 恢复流程：
 *   1. 读取种子 → generateMazeMap(seed) 重建完整地图结构
 *   2. fishDens 留空；由 MazeLogic.resetMazeLogic 的读档分支用派生 seed 重建一次
 *   3. 把存档里的 mazeExplored / diveHistory / rest / ropes / markers / player 覆盖上去
 *   4. 绳索 wall 端点用"最近匹配"在新 mazeWalls 里找回对象引用
 */
export function loadMazeProgress(): boolean {
    const data = loadJSON<MazeSaveData>(MAZE_SAVE_KEY);
    if (!data) return false;
    if (data.version !== MAZE_SAVE_VERSION) {
        console.warn('[MazeSave] 存档版本不兼容，丢弃。档中=' + data.version + ' 当前=' + MAZE_SAVE_VERSION);
        return false;
    }
    const packed = data.packed;
    if (!packed || packed.seed == null) {
        console.warn('[MazeSave] 存档数据不完整（缺 seed），丢弃');
        return false;
    }

    // === 用种子重建完整地图 ===
    const mazeData = generateMazeMap(packed.seed >>> 0);
    const rows = mazeData.mazeRows;
    const cols = mazeData.mazeCols;

    // 严格校验：存档里的 rows/cols 必须和当前算法产出一致
    // （避免 CONFIG.maze.cols/rows 改过导致老档和新算法不匹配）
    if (packed.mazeRows !== rows || packed.mazeCols !== cols) {
        console.warn('[MazeSave] 存档尺寸不匹配（' + packed.mazeRows + 'x' + packed.mazeCols +
                     ' vs 当前 ' + rows + 'x' + cols + '），丢弃');
        return false;
    }

    // 用存档里的已探索位图覆盖（种子重建出来的是全 false，这里要换成累积探索）
    const mazeExplored = unpackBoolMap(packed.mazeExplored, rows, cols);

    // 装配 mazeRescue
    const maze: any = {};
    if (packed.rest) {
        for (const k in packed.rest) {
            if (Object.prototype.hasOwnProperty.call(packed.rest, k)) {
                maze[k] = packed.rest[k];
            }
        }
    }
    // 种子与重建出来的地图结构字段全部直接来自 mazeData
    maze.seed = mazeData.seed;
    maze.mazeCols = cols;
    maze.mazeRows = rows;
    maze.mazeTileSize = mazeData.mazeTileSize;
    maze.mazeWalls = mazeData.mazeWalls;
    maze.mazeMap = mazeData.mazeMap;
    maze.mazeExplored = mazeExplored;
    maze.sceneThemeKeys = mazeData.mazeSceneThemeKeys;
    maze.sceneThemeMap = mazeData.mazeSceneThemeMap;
    maze.sceneBlendMap = mazeData.mazeSceneBlendMap;
    maze.sceneStructureMap = mazeData.mazeSceneStructureMap;
    maze.exitX = mazeData.exitX; maze.exitY = mazeData.exitY;
    maze.npcInitX = mazeData.npcInitX; maze.npcInitY = mazeData.npcInitY;
    maze.spawnX = mazeData.spawnX; maze.spawnY = mazeData.spawnY;
    maze.divingInBubbles = [];
    // fishDens 留空占位；MazeLogic.resetMazeLogic 的读档分支会用派生 seed 重建一次
    maze.fishDens = [];

    // 展开压缩后的 diveHistory
    const packedHistory: PackedDive[] = Array.isArray(maze.diveHistory) ? maze.diveHistory : [];
    const realHistory: any[] = [];
    for (let i = 0; i < packedHistory.length; i++) {
        const d = packedHistory[i];
        if (!d) continue;
        const ropesSnap: any[] = [];
        if (Array.isArray(d.ropesSnap)) {
            for (let j = 0; j < d.ropesSnap.length; j++) {
                ropesSnap.push(unpackHistoryRope(d.ropesSnap[j]));
            }
        }
        realHistory.push({
            diveType: d.diveType,
            duration: d.duration,
            maxDepth: d.maxDepth,
            newExploredCount: d.newExploredCount,
            ropePlaced: d.ropePlaced,
            returnReason: d.returnReason,
            newThemes: d.newThemes || [],
            playerPath: unpackPath(d.playerPath),
            exploredSnapshot: unpackBoolMap(d.exploredSnap, rows, cols),
            exploredBeforeSnapshot: unpackBoolMap(d.exploredBeforeSnap, rows, cols),
            ropesSnapshot: ropesSnap,
            npcFoundAtEnd: !!d.npcFoundAtEnd,
            finishAt: d.finishAt || 0,
        });
    }
    maze.diveHistory = realHistory;

    // 强制回到岸上
    maze.phase = 'shore';
    maze.resultTimer = 0;
    maze.divingInTimer = 0;
    maze._hudEntryTimer = 0;
    maze.shoreMapOpen = false;
    maze.shoreMapDiveIndex = -1;
    maze.shoreMapAnimTimer = 0;
    maze.minimapExpanded = false;
    maze.retreatHolding = false;
    maze.retreatHoldStart = 0;
    maze.retreatTouchId = null;
    maze.npcRescueHolding = false;
    maze.npcRescueHoldStart = 0;
    maze.npcRescueTouchId = null;
    maze._hudDetailOpen = 0;
    maze._hudDetailHolding = false;
    maze._retreatDetailOpen = 0;
    maze._retreatDetailHolding = false;
    maze._shoreRecordOpen = false;
    maze._shoreRecordAnim = 0;
    maze._driveToggleOpen = 0;
    maze._driveToggleHolding = false;
    maze._driveSwitchTip = 0;

    state.mazeRescue = maze;

    // 恢复绳索
    if (!state.rope) {
        state.rope = {
            ropes: [],
            active: false,
            current: {
                start: null, startWall: null, end: null, path: [],
                basePoints: [], slackFactor: 1, mode: 'loose', time: 0,
            },
            ui: { visible: false, type: null, progress: 0, anchor: null },
            hold: { active: false, type: null, timer: 0, touchId: null, anchor: null },
            stillTimer: 0,
        } as any;
    }
    // 活绳子解包 + wall 最近匹配回挂
    const restoredRopes: any[] = [];
    if (Array.isArray(data.ropes)) {
        for (let i = 0; i < data.ropes.length; i++) {
            restoredRopes.push(unpackLiveRope(data.ropes[i], maze.mazeWalls));
        }
    }
    state.rope.ropes = restoredRopes;

    // 恢复标记
    state.markers = Array.isArray(data.markers) ? data.markers : [];

    // 恢复玩家关键状态
    if (data.playerPos) {
        player.x = data.playerPos.x;
        player.y = data.playerPos.y;
        player.angle = data.playerPos.angle;
        player.o2 = data.playerPos.o2;
    }

    console.log('[MazeSave] 存档恢复成功（v3 种子），seed=' + (mazeData.seed >>> 0) +
                '，已完成 ' + (maze.diveCount || 0) + ' 次下潜，活绳子 ' + restoredRopes.length + ' 条');
    return true;
}

/**
 * 清除迷宫存档
 */
export function clearMazeSave(): void {
    removeKey(MAZE_SAVE_KEY);
    // 顺便清除老 v1 / v2 存档，避免占用空间
    removeKey('maze_save_v1');
    removeKey('maze_save_v2');
    console.log('[MazeSave] 存档已清除');
}
