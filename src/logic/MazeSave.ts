// 迷宫模式本地存档模块（v2 压缩版）
//
// 需求：迷宫模式当前关卡进度持久化，退出到主界面或退出小游戏后再回来能接上。
//
// v1 方案的问题：
// 直接 JSON.stringify(state.mazeRescue) 会把 mazeMap 里嵌套的 wall 对象全部展开，
// 再加上 diveHistory 里每条记录都带两份 100×100 boolean 快照，几次下潜后
// 单个 key 超过 Android 端 wx.setStorageSync 的 ~512KB 上限，报
// "entry size limit reached"，导致存档写入失败，标记和下潜记录丢失。
//
// v2 压缩方案（不改变运行时结构，只改存档格式）：
// - mazeMap 不存：运行时从 mazeWalls + mazeCols + mazeRows 重建
//     每个格子要么是 0（空）、2（内部实体墙无装饰圆）、wall 对象（边界墙）
//     wall 对象自带 row/col，读档时把同 (row,col) 的第一个作为基础墙，
//     后续同 (row,col) 的挂到 .extras 数组上；mazeMap[r][c] 指回基础墙
// - mazeWalls 的 extras 嵌套字段不存：避免同一个额外圆被序列化两次
// - boolean 二维数组（mazeExplored + 每条 diveHistory 的两份 snapshot）用位图+base64
// - sceneThemeMap（数字二维数组，范围 -1~7）用 RLE
// - sceneStructureMap（字符串 'none'|'stalactite'）用位图
// - sceneBlendMap（稀疏 {theme2,blend} 对象）只存非空格点
// - 玩家路径 playerPath 用 int16 量化
//
// 存档体积预估（100×100 迷宫 + 5 次下潜）：约 60~100KB，远小于 Android 上限
//
// 版本号：MAZE_SAVE_VERSION = 2；老 v1 存档自动丢弃

import { state, player } from '../core/state';
import { saveJSON, loadJSON, removeKey } from '../core/SaveStorage';

export const MAZE_SAVE_KEY = 'maze_save_v2';
export const MAZE_SAVE_VERSION = 2;

// ============================ 压缩工具函数 ============================

// base64 编码/解码（小游戏没有 Buffer，用 btoa/atoa 自己做）
function uint8ToBase64(bytes: Uint8Array): string {
    // 小游戏环境 btoa 有字符串长度限制和不接受非 latin1，所以手写
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

// 数字二维数组（-1~127 范围）RLE 压缩（-1 映射为 255）
// 输出形如 "v:count|v:count|..."，逗号分隔
function packThemeMap(map: number[][] | null | undefined, rows: number, cols: number): string {
    if (!map) return '';
    const bytes = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) {
        const row = map[r];
        for (let c = 0; c < cols; c++) {
            const v = row ? row[c] : -1;
            bytes[r * cols + c] = (v < 0 ? 255 : (v & 0xff));
        }
    }
    // RLE
    const runs: number[] = [];
    let curVal = bytes[0];
    let curCount = 1;
    for (let i = 1; i < bytes.length; i++) {
        if (bytes[i] === curVal && curCount < 65535) {
            curCount++;
        } else {
            runs.push(curVal, curCount);
            curVal = bytes[i];
            curCount = 1;
        }
    }
    runs.push(curVal, curCount);
    return runs.join(',');
}

function unpackThemeMap(str: string, rows: number, cols: number): number[][] {
    const map: number[][] = [];
    for (let r = 0; r < rows; r++) map.push(new Array(cols).fill(-1));
    if (!str) return map;
    const parts = str.split(',');
    let idx = 0;
    for (let i = 0; i + 1 < parts.length; i += 2) {
        const v = parseInt(parts[i], 10);
        const count = parseInt(parts[i + 1], 10);
        const real = (v === 255 ? -1 : v);
        for (let k = 0; k < count; k++) {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            if (r < rows) map[r][c] = real;
            idx++;
        }
    }
    return map;
}

// 字符串枚举二维数组（当前只有 'none'|'stalactite'）→ 位图
function packStructureMap(map: string[][] | null | undefined, rows: number, cols: number): string {
    const bitLen = rows * cols;
    const byteLen = (bitLen + 7) >> 3;
    const bytes = new Uint8Array(byteLen);
    if (!map) return uint8ToBase64(bytes);
    for (let r = 0; r < rows; r++) {
        const row = map[r];
        if (!row) continue;
        for (let c = 0; c < cols; c++) {
            if (row[c] === 'stalactite') {
                const idx = r * cols + c;
                bytes[idx >> 3] |= (1 << (idx & 7));
            }
        }
    }
    return uint8ToBase64(bytes);
}

function unpackStructureMap(b64: string, rows: number, cols: number): string[][] {
    const bytes = base64ToUint8(b64);
    const map: string[][] = [];
    for (let r = 0; r < rows; r++) {
        const row: string[] = [];
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const bit = (bytes[idx >> 3] >> (idx & 7)) & 1;
            row.push(bit === 1 ? 'stalactite' : 'none');
        }
        map.push(row);
    }
    return map;
}

// 稀疏 blend 对象 → 扁平数组 [r,c,theme2,blendInt] ...（blend 量化 0-255）
function packBlendMap(map: any[][] | null | undefined, rows: number, cols: number): number[] {
    const out: number[] = [];
    if (!map) return out;
    for (let r = 0; r < rows; r++) {
        const row = map[r];
        if (!row) continue;
        for (let c = 0; c < cols; c++) {
            const cell = row[c];
            if (cell && typeof cell === 'object') {
                const q = Math.max(0, Math.min(255, Math.round((cell.blend || 0) * 255)));
                out.push(r, c, cell.theme2 | 0, q);
            }
        }
    }
    return out;
}

function unpackBlendMap(flat: number[], rows: number, cols: number): any[][] {
    const map: any[][] = [];
    for (let r = 0; r < rows; r++) map.push(new Array(cols).fill(null));
    if (!flat) return map;
    for (let i = 0; i + 3 < flat.length; i += 4) {
        const r = flat[i];
        const c = flat[i + 1];
        const theme2 = flat[i + 2];
        const blend = flat[i + 3] / 255;
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
            map[r][c] = { theme2, blend };
        }
    }
    return map;
}

// 玩家路径 {x,y}[] → Int16Array 扁平（坐标范围 0~12000，int16 足够）
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

// mazeWalls 扁平化：去掉 extras 嵌套字段（避免重复序列化）
// 因为 extras 里的 wall 对象本身也在 mazeWalls 数组中，它们都有 row/col
function packWalls(walls: any[]): any[] {
    const out: any[] = [];
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (!w) continue;
        // 只保留基础字段，丢掉 extras 嵌套
        out.push({
            x: w.x,
            y: w.y,
            r: w.r,
            row: w.row,
            col: w.col,
            isBorder: !!w.isBorder,
        });
    }
    return out;
}

// 根据打平的 wall 列表 + rows/cols 重建 mazeMap（同时把 extras 挂回基础 wall）
// 规则：grid[r][c] 初始化为 0；存档另带 solidMask 标记哪些格是内部实体 2 或 border
// 但我们选择更简洁做法：重建时根据每个 wall 的 (row,col) 聚合
//   第一个出现在该 (row,col) 的 wall 是基础墙，后续同 (row,col) 挂到 extras
//   然后根据 rebuilt 的位置把 mazeMap[r][c] = baseWall
//   对于 mazeMap 值为 2（内部实体，无 wall 对象）的格子，靠单独的 solidMask 位图还原
function rebuildMazeMap(walls: any[], solidMask: boolean[][], rows: number, cols: number): any[][] {
    const map: any[][] = [];
    for (let r = 0; r < rows; r++) {
        map.push(new Array(cols).fill(0));
    }
    // 聚合墙
    const baseWallByCell: { [key: string]: any } = {};
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (!w) continue;
        const key = w.row + ',' + w.col;
        if (!baseWallByCell[key]) {
            w.extras = [];
            baseWallByCell[key] = w;
            if (w.row >= 0 && w.row < rows && w.col >= 0 && w.col < cols) {
                map[w.row][w.col] = w;
            }
        } else {
            baseWallByCell[key].extras.push(w);
        }
    }
    // solidMask 处理内部实体墙（值为 2 的格子）
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (solidMask[r] && solidMask[r][c]) {
                if (map[r][c] === 0) {
                    map[r][c] = 2;
                }
            }
        }
    }
    return map;
}

// 从运行时 mazeMap 里抽出内部实体墙位图（值 === 2 的格子）
function extractSolidMask(mazeMap: any[][], rows: number, cols: number): boolean[][] {
    const mask: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
        const row: boolean[] = [];
        const src = mazeMap[r];
        for (let c = 0; c < cols; c++) {
            row.push(src && src[c] === 2);
        }
        mask.push(row);
    }
    return mask;
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
    playerPath: number[];          // 扁平 [x,y,x,y,...] int
    exploredSnap: string;          // 位图 base64
    exploredBeforeSnap: string;    // 位图 base64
    ropesSnap: number[][];         // 每条绳索 [x,y,x,y,...]
    npcFoundAtEnd: boolean;
    finishAt: number;
}

interface PackedMaze {
    // 基础尺寸
    mazeCols: number;
    mazeRows: number;
    mazeTileSize: number;

    // 墙体（去掉 extras 嵌套）
    mazeWalls: any[];
    // 内部实体墙（值===2）位图
    solidMask: string;

    // 探索位图
    mazeExplored: string;

    // 场景
    sceneThemeKeys: string[];
    sceneThemeMap: string;         // RLE
    sceneBlendMap: number[];       // 稀疏扁平
    sceneStructureMap: string;     // 位图

    // 出口/NPC/出生点
    exitX: number; exitY: number;
    npcInitX: number; npcInitY: number;
    spawnX: number; spawnY: number;

    // 其它运行时字段（小，直接原样保留，这里用 any 放过）
    rest: any;
}

interface MazeSaveData {
    version: number;
    timestamp: number;
    packed: PackedMaze;
    ropes: number[][];             // 每条绳索路径扁平
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
    if (!maze.mazeMap || !maze.mazeWalls) return false;

    const rows: number = maze.mazeRows | 0;
    const cols: number = maze.mazeCols | 0;
    if (rows <= 0 || cols <= 0) return false;

    // 打包 diveHistory（每条记录压缩两份 snapshot + 路径 + 绳索）
    const packedHistory: PackedDive[] = [];
    const src = Array.isArray(maze.diveHistory) ? maze.diveHistory : [];
    for (let i = 0; i < src.length; i++) {
        const d = src[i];
        if (!d) continue;
        const ropesSnap: number[][] = [];
        if (Array.isArray(d.ropesSnapshot)) {
            for (let j = 0; j < d.ropesSnapshot.length; j++) {
                ropesSnap.push(packPath(d.ropesSnapshot[j] && d.ropesSnapshot[j].path));
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

    // mazeRescue 中除掉大字段后的其它运行时字段
    // （方法：浅拷贝整棵 mazeRescue，把已经单独处理的大字段删除）
    const rest: any = {};
    for (const k in maze) {
        if (!Object.prototype.hasOwnProperty.call(maze, k)) continue;
        // 这些字段已经单独压缩或单独处理，不再塞进 rest
        if (k === 'mazeMap' || k === 'mazeWalls' ||
            k === 'mazeExplored' || k === 'thisExploredBefore' ||
            k === 'sceneThemeKeys' || k === 'sceneThemeMap' ||
            k === 'sceneBlendMap' || k === 'sceneStructureMap' ||
            k === 'mazeCols' || k === 'mazeRows' || k === 'mazeTileSize' ||
            k === 'exitX' || k === 'exitY' ||
            k === 'npcInitX' || k === 'npcInitY' ||
            k === 'spawnX' || k === 'spawnY' ||
            k === 'diveHistory' ||
            k === 'playerPath' ||
            k === 'divingInBubbles') {
            continue;
        }
        rest[k] = maze[k];
    }
    rest.diveHistory = packedHistory; // 压缩后历史塞进 rest

    const solidMask = extractSolidMask(maze.mazeMap, rows, cols);

    // 绳索路径扁平化
    const ropes: number[][] = [];
    if (state.rope && Array.isArray(state.rope.ropes)) {
        for (let i = 0; i < state.rope.ropes.length; i++) {
            const rp = state.rope.ropes[i];
            ropes.push(packPath(rp && rp.path));
        }
    }

    const packed: PackedMaze = {
        mazeCols: cols,
        mazeRows: rows,
        mazeTileSize: maze.mazeTileSize,
        mazeWalls: packWalls(maze.mazeWalls),
        solidMask: packBoolMap(solidMask, rows, cols),
        mazeExplored: packBoolMap(maze.mazeExplored, rows, cols),
        sceneThemeKeys: Array.isArray(maze.sceneThemeKeys) ? maze.sceneThemeKeys.slice() : [],
        sceneThemeMap: packThemeMap(maze.sceneThemeMap, rows, cols),
        sceneBlendMap: packBlendMap(maze.sceneBlendMap, rows, cols),
        sceneStructureMap: packStructureMap(maze.sceneStructureMap, rows, cols),
        exitX: maze.exitX, exitY: maze.exitY,
        npcInitX: maze.npcInitX, npcInitY: maze.npcInitY,
        spawnX: maze.spawnX, spawnY: maze.spawnY,
        rest,
    };

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
            console.log('[MazeSave] 存档已保存，大小约 ' + kb + ' KB');
            // 800KB 安全线预警
            if (approxSize > 800 * 1024) {
                console.warn('[MazeSave] 存档接近单 key 上限（' + kb + 'KB），需要继续优化压缩');
            }
        } catch (e) { /* 忽略 */ }
    }
    return ok;
}

/**
 * 尝试从本地读取并恢复迷宫进度
 */
export function loadMazeProgress(): boolean {
    const data = loadJSON<MazeSaveData>(MAZE_SAVE_KEY);
    if (!data) return false;
    if (data.version !== MAZE_SAVE_VERSION) {
        console.warn('[MazeSave] 存档版本不兼容，丢弃。档中=' + data.version + ' 当前=' + MAZE_SAVE_VERSION);
        return false;
    }
    const packed = data.packed;
    if (!packed || !packed.mazeWalls || !packed.mazeCols || !packed.mazeRows) {
        console.warn('[MazeSave] 存档数据不完整，丢弃');
        return false;
    }

    const rows = packed.mazeRows | 0;
    const cols = packed.mazeCols | 0;

    // 重建 mazeWalls（普通数组，wall 对象没有 extras）
    const walls = packed.mazeWalls.map((w: any) => ({
        x: w.x, y: w.y, r: w.r,
        row: w.row, col: w.col,
        isBorder: !!w.isBorder,
    }));

    const solidMask = unpackBoolMap(packed.solidMask, rows, cols);
    const mazeMap = rebuildMazeMap(walls, solidMask, rows, cols);
    const mazeExplored = unpackBoolMap(packed.mazeExplored, rows, cols);
    const sceneThemeMap = unpackThemeMap(packed.sceneThemeMap, rows, cols);
    const sceneBlendMap = unpackBlendMap(packed.sceneBlendMap, rows, cols);
    const sceneStructureMap = unpackStructureMap(packed.sceneStructureMap, rows, cols);

    // 装配 mazeRescue
    const maze: any = {};
    if (packed.rest) {
        for (const k in packed.rest) {
            if (Object.prototype.hasOwnProperty.call(packed.rest, k)) {
                maze[k] = packed.rest[k];
            }
        }
    }
    maze.mazeCols = cols;
    maze.mazeRows = rows;
    maze.mazeTileSize = packed.mazeTileSize;
    maze.mazeWalls = walls;
    maze.mazeMap = mazeMap;
    maze.mazeExplored = mazeExplored;
    maze.sceneThemeKeys = packed.sceneThemeKeys || [];
    maze.sceneThemeMap = sceneThemeMap;
    maze.sceneBlendMap = sceneBlendMap;
    maze.sceneStructureMap = sceneStructureMap;
    maze.exitX = packed.exitX; maze.exitY = packed.exitY;
    maze.npcInitX = packed.npcInitX; maze.npcInitY = packed.npcInitY;
    maze.spawnX = packed.spawnX; maze.spawnY = packed.spawnY;
    maze.divingInBubbles = [];

    // 展开压缩后的 diveHistory
    const packedHistory: PackedDive[] = Array.isArray(maze.diveHistory) ? maze.diveHistory : [];
    const realHistory: any[] = [];
    for (let i = 0; i < packedHistory.length; i++) {
        const d = packedHistory[i];
        if (!d) continue;
        const ropesSnap: {path: {x: number, y: number}[]}[] = [];
        if (Array.isArray(d.ropesSnap)) {
            for (let j = 0; j < d.ropesSnap.length; j++) {
                ropesSnap.push({ path: unpackPath(d.ropesSnap[j]) });
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
    const restoredRopes: any[] = [];
    if (Array.isArray(data.ropes)) {
        for (let i = 0; i < data.ropes.length; i++) {
            restoredRopes.push({ path: unpackPath(data.ropes[i]) });
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

    console.log('[MazeSave] 存档恢复成功，已完成 ' + (maze.diveCount || 0) + ' 次下潜');
    return true;
}

/**
 * 清除迷宫存档
 */
export function clearMazeSave(): void {
    removeKey(MAZE_SAVE_KEY);
    // 顺便清除 v1 老档，避免占用空间
    removeKey('maze_save_v1');
    console.log('[MazeSave] 存档已清除');
}
