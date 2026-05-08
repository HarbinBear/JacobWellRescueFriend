// 迷宫模式：场景图鉴物件（Relic）
//
// 设计目标（一句话）：往场景里撒一些静态、不可交互、纯视觉的"遗落物"（骸骨/硬币/陶片/
// 铁锚/指环/石板/鱼钩/铜铃/钥匙/海螺）；玩家靠近并被手电光锥照到就算"发现"，
// 下潜结算显示本次新发现，岸上累计图鉴进度；同一张地图内位置、种类、姿态完全稳定。
//
// 关键约束：
// - 位置 / 类型 / 姿态 全部由"主 seed 派生子 seed"确定性生成，跨设备跨读档一致
// - 运行时 relics[] 不进存档，靠 seed + consumedRelicIds（这里叫 discovered）重建
// - 发现判定：靠近半径 + 在手电光锥内（角度 + 距离都满足）才记入图鉴
// - 视觉绝对静态：不发光、不呼吸、不脉冲、不闪烁；已发现和未发现外观完全一致
// - 物件不参与任何碰撞、不出现轮盘按钮、不与氧气瓶/NPC/标记共用视觉语言
//
// 2026-05 本轮调整：
// - 取消 50% 散落逻辑：所有物件一律贴岩石外缘（重力感，D2 方案 - 贴任意外缘）
// - 尺寸整体放大：size 从 0.9~1.1 调到 1.5~1.9（配合 RenderRelic 的渲染尺度放大）
// - 新增"发现瞬间提示"：发现时往 _hintList 推一条，3s 内在物件上方冒米色小字，
//   渲染层单独绘制；提示数据不进存档（靠运行态维护）

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { srand, setActiveSeededRandom, clearActiveSeededRandom } from '../core/SeededRandom';
import { checkMazeCollision } from './Collision';

// =============================================
// 图鉴类型表
// =============================================

export type RelicKind =
    | 'skeleton'        // 骸骨
    | 'coin'            // 锈蚀硬币
    | 'potshard'        // 陶罐碎片
    | 'anchor'          // 小铁锚
    | 'ring'            // 指环
    | 'stoneTablet'     // 刻字石板
    | 'fishhook'        // 锈蚀鱼钩
    | 'bell'            // 铜铃
    | 'rustyKey'        // 锈蚀钥匙
    | 'shell';          // 螺旋海螺

// 类型配置：中文名、简短叙事描述、权重（出现概率）
export interface RelicTypeDef {
    name: string;
    desc: string;
    weight: number;     // 相对权重，越大越常见
}

export const RELIC_TYPES: Record<RelicKind, RelicTypeDef> = {
    skeleton:    { name: '古老骸骨',     desc: '一具早年遇难者的遗骸，无法辨识身份。', weight: 2 },
    coin:        { name: '锈蚀硬币',     desc: '一枚年代久远的硬币，图案已几乎磨平。', weight: 10 },
    potshard:    { name: '陶罐碎片',     desc: '古代陶器的断片，边缘光滑被水冲刷多年。', weight: 8 },
    anchor:      { name: '小铁锚',       desc: '一具小船的铁锚，锈迹斑斑。',             weight: 5 },
    ring:        { name: '银色指环',     desc: '一枚素面指环，内侧似有字母但已模糊。', weight: 4 },
    stoneTablet: { name: '刻字石板',     desc: '刻有不明图腾的石板，来历成谜。',         weight: 3 },
    fishhook:    { name: '锈蚀鱼钩',     desc: '断线的渔具，想必曾有人在此垂钓。',       weight: 7 },
    bell:        { name: '小铜铃',       desc: '一只仪式用的小铜铃，摇铃已哑。',         weight: 5 },
    rustyKey:    { name: '锈蚀钥匙',     desc: '一把开不了任何锁的旧钥匙。',             weight: 6 },
    shell:       { name: '螺旋海螺',     desc: '一只螺旋壳贝类，洞内本不该有的物种。', weight: 9 },
};

export const ALL_RELIC_KINDS: RelicKind[] = [
    'skeleton','coin','potshard','anchor','ring',
    'stoneTablet','fishhook','bell','rustyKey','shell',
];

// =============================================
// 单个物件的运行时数据
// =============================================

export interface Relic {
    id: number;             // 稳定 ID（从 seed 派生出来，跨设备一致）
    kind: RelicKind;        // 类型
    x: number;              // 世界坐标
    y: number;
    angle: number;          // 绘制方向（贴岩石时朝向"外"；散落时随机）
    size: number;           // 尺寸缩放（0.9~1.1）
    onWall: boolean;        // 是否贴在岩石外缘
    wallX: number;          // 依附的岩石中心（仅 onWall=true 时有意义）
    wallY: number;
    seed: number;           // 细节随机种子（给渲染层用：抖动、纹理分布等）
}

// =============================================
// 配置快捷读取（容错：config 中如果还没加这段就用默认值兜底）
// =============================================

function cfg() {
    return ((CONFIG as any).relic) || {};
}

// =============================================
// 按权重随机选一种类型
// =============================================

function pickKindByWeight(): RelicKind {
    const total = ALL_RELIC_KINDS.reduce((s, k) => s + RELIC_TYPES[k].weight, 0);
    let r = srand() * total;
    for (const k of ALL_RELIC_KINDS) {
        r -= RELIC_TYPES[k].weight;
        if (r <= 0) return k;
    }
    return 'coin';
}

// =============================================
// 根据主 seed 为当前迷宫派生生成 relic 列表
//
// 策略：
//   - 按 config.totalCount 尝试生成 N 个
//   - 每个 relic 随机选一个墙体做候选：
//     * 50% 概率贴在岩石外缘（法线方向向外推 w.r + margin）
//     * 50% 概率散落在岩石附近的通路上（法线方向再向外多推一些，并 jitter）
//   - 位置必须不撞墙（checkMazeCollision 兜底），离玩家出生点大于 minDistToSpawn
//   - 两两之间 minDistBetween，避免扎堆
// =============================================

export function generateRelics(): Relic[] {
    const maze = state.mazeRescue;
    if (!maze) return [];
    const c = cfg();

    const totalCount: number = c.totalCount ?? 15;
    const minDistBetween: number = c.minDistBetween ?? 220;
    const minDistToSpawn: number = c.minDistToSpawn ?? 400;
    // 注意：本轮起物件一律贴岩石外缘，onWallRatio 配置项保留兼容但不再影响逻辑

    const relics: Relic[] = [];
    let nextId = 1;

    // 出生点
    const mazeCfg: any = CONFIG.maze;
    const wallThick = mazeCfg.wallThickness || 5;
    const spawnX = maze.exitX;
    const spawnY = (wallThick + 1) * maze.mazeTileSize + maze.mazeTileSize / 2;

    const walls: any[] = maze.mazeWalls || [];
    if (walls.length === 0) return [];

    // 关键：贴墙距离必须大于 playerRadius，否则 checkMazeCollision 会把所有位置都判为"嵌墙"
    // （它的规则是 dist < cell.r + playerRadius 就视为碰撞）。
    // 这是之前版本生成空列表的根因——extraPush 从 4~7 起步直接全被拒。
    const playerRadius: number = (CONFIG.maze as any).playerRadius || 12;

    // 多角度扫描：一次挑一颗墙后，试 8 个等间隔法线方向 + 随机初相位，
    // 任何一个方向能满足"不嵌墙 + 不靠出生点 + 不与已有物件太近"即算成功。
    // 这样避免一次失败就浪费一个 attempt。
    const angleOffsets = [0, Math.PI/4, -Math.PI/4, Math.PI/2, -Math.PI/2, Math.PI*3/4, -Math.PI*3/4, Math.PI];

    // 最多尝试 totalCount * 30 次（足够宽松，给多角度扫描留出空间）
    const maxAttempts = totalCount * 30;
    let attempts = 0;
    while (relics.length < totalCount && attempts < maxAttempts) {
        attempts++;

        // 随机挑一颗墙
        const w = walls[Math.floor(srand() * walls.length)];
        if (!w) continue;
        const wallR = w.r || 30;

        // 所有物件一律贴岩石外缘（D2：任意角度外缘都可以，表现"水下遗物靠在岩石上"）
        // 主法线角度随机起始，然后在 angleOffsets 里依次尝试
        const baseAngle = srand() * Math.PI * 2;
        // 贴墙距离：playerRadius + 4~10px 缓冲，保证玩家能游到拾取范围、并能通过碰撞判定
        const extraPush = playerRadius + 4 + srand() * 6;
        const offsetR = wallR + extraPush;

        let placed = false;
        for (const off of angleOffsets) {
            const angle = baseAngle + off;
            const tx = w.x + Math.cos(angle) * offsetR;
            const ty = w.y + Math.sin(angle) * offsetR;

            // 出生点距离
            if (Math.hypot(tx - spawnX, ty - spawnY) < minDistToSpawn) continue;
            // 彼此距离
            let tooClose = false;
            for (const r of relics) {
                if (Math.hypot(tx - r.x, ty - r.y) < minDistBetween) { tooClose = true; break; }
            }
            if (tooClose) continue;
            // 必须在通路里（不能在岩石内部 / 不能嵌墙 / 不嵌额外装饰圆）
            if (checkMazeCollision(tx, ty, maze)) continue;

            const kind = pickKindByWeight();
            // 尺寸整体放大：配合渲染层感知尺度，最终像素尺寸约 28~38px（远小于氧气瓶）
            const size = 1.5 + srand() * 0.4;
            // 贴墙物件朝向沿法线指向外（让物件"背靠岩石"）
            const drawAngle = angle;
            const seedDetail = Math.floor(srand() * 0x7fffffff);

            relics.push({
                id: nextId++,
                kind,
                x: tx, y: ty,
                angle: drawAngle,
                size,
                onWall: true,
                wallX: w.x, wallY: w.y,
                seed: seedDetail,
            });
            placed = true;
            break;
        }
        // placed=false 的 attempt 自然计入，继续换下一颗墙
    }

    return relics;
}

// =============================================
// 对外：为迷宫生成完整 relic 数据（带派生 seed 包装）
// 由 MazeLogic 在新建地图 / 读档两个分支都调用
//
// 派生 seed 选 mainSeed ^ 0x5EED1CE0，和 fishDens (^0xDEADBEEF)、
// oxygenTanks (^0xCAFEBABE) 区分开，保证序列独立
// =============================================
export function buildRelicsForMaze(mainSeed: number): Relic[] {
    const subSeed = ((mainSeed >>> 0) ^ 0x5EED1CE0) >>> 0;
    setActiveSeededRandom(subSeed);
    let list: Relic[] = [];
    try {
        list = generateRelics();
    } finally {
        clearActiveSeededRandom();
    }
    const wanted = ((CONFIG as any).relic && (CONFIG as any).relic.totalCount) || 15;
    console.log('[Relic] 生成 ' + list.length + ' / 期望 ' + wanted + ' 个物件（subSeed=' + subSeed + '）');
    return list;
}

// =============================================
// 每帧更新：发现判定
//
// 条件：
//   1. relic 未被发现
//   2. 玩家手电处于开启状态（没手电就发现不了）
//   3. relic 距玩家 < discoverRadius
//   4. relic 在玩家手电光锥内（角度差 < fov/2）
//
// 发现时：加入 discoveredRelicIds（全局图鉴），加入 thisDiveNewRelicIds（本次下潜）
// =============================================

let _thisDiveNewRelicIds: number[] = [];

// 发现提示：世界空间的一次性飘字
// 渲染层读 getRelicHints() 遍历绘制；寿命走完从列表移除
// 全部走模块级运行态，不进存档（跨 session 不需要续）
export interface RelicHint {
    relicId: number;
    text: string;           // 形如 '发现 · 古老骸骨'
    x: number;              // 世界坐标（取物件位置，再上方浮动一点）
    y: number;
    life: number;           // 已经活了多少帧
    maxLife: number;        // 总寿命（帧）
}
let _hintList: RelicHint[] = [];

export function resetRelicDiscoveryForDive() {
    _thisDiveNewRelicIds = [];
    _hintList = [];
}

export function getThisDiveNewRelicIds(): number[] {
    return _thisDiveNewRelicIds.slice();
}

/** 渲染层读取当前所有发现提示 */
export function getRelicHints(): RelicHint[] {
    return _hintList;
}

export function updateRelicDiscovery() {
    const maze = state.mazeRescue;
    if (!maze) return;
    const relics: Relic[] = (maze as any).relics || [];
    if (relics.length === 0) return;
    // 手电关了就发现不了
    if (!state.flashlightOn) return;

    const c = cfg();
    const radius: number = c.discoverRadius ?? 110;
    const fovDeg: number = c.discoverFovDeg ?? 60;
    const fovHalf = (fovDeg * Math.PI / 180) / 2;

    const discovered: number[] = (maze as any).discoveredRelicIds || [];
    const discoveredSet = new Set<number>(discovered);

    for (const relic of relics) {
        if (discoveredSet.has(relic.id)) continue;
        const dx = relic.x - player.x;
        const dy = relic.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        // 角度差：玩家朝向 vs 目标方向
        const targetAngle = Math.atan2(dy, dx);
        let diff = targetAngle - player.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) > fovHalf) continue;

        // 通过所有检查，记录为"已发现"
        discovered.push(relic.id);
        discoveredSet.add(relic.id);
        if (_thisDiveNewRelicIds.indexOf(relic.id) < 0) {
            _thisDiveNewRelicIds.push(relic.id);
        }
        // 推入一条世界飘字："发现 · <物件名>"，在物件上方 30px 位置冒出
        const def = RELIC_TYPES[relic.kind];
        if (def) {
            _hintList.push({
                relicId: relic.id,
                text: '发现 · ' + def.name,
                x: relic.x,
                y: relic.y - 30,
                life: 0,
                maxLife: 90,      // 1.5s @ 60fps
            });
        }
    }

    (maze as any).discoveredRelicIds = discovered;

    // 推进已有 hint 的寿命，过期的丢掉
    if (_hintList.length > 0) {
        const kept: RelicHint[] = [];
        for (const h of _hintList) {
            h.life += 1;
            // 同时让 hint 上飘一点（每帧向上 0.35px）
            h.y -= 0.35;
            if (h.life < h.maxLife) kept.push(h);
        }
        _hintList = kept;
    }
}

// =============================================
// 对外查询
// =============================================

export function getDiscoveredCount(): number {
    const maze = state.mazeRescue;
    if (!maze) return 0;
    const d = (maze as any).discoveredRelicIds;
    return Array.isArray(d) ? d.length : 0;
}

export function getTotalRelicCount(): number {
    const maze = state.mazeRescue;
    if (!maze) return 0;
    const r = (maze as any).relics;
    return Array.isArray(r) ? r.length : 0;
}

/** 按 id 查找 relic（用于结算页展示本次发现的具体物件） */
export function findRelicById(id: number): Relic | null {
    const maze = state.mazeRescue;
    if (!maze) return null;
    const relics: Relic[] = (maze as any).relics || [];
    for (const r of relics) {
        if (r.id === id) return r;
    }
    return null;
}
