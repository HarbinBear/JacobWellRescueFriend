// 迷宫模式：场景图鉴物件（Relic）
//
// 设计目标（一句话）：往场景里撒一些静态、不可交互、纯视觉的"遗落物"；玩家靠近并被手电光锥照到就算"发现"，
// 下潜结算显示本次新发现，岸上累计图鉴进度（总图鉴 32 种，跨关累计）；同一张地图内位置、种类、姿态完全稳定。
//
// 关键约束：
// - 图鉴总共 32 种；每关完全随机抽 15 种不重复（每种在单关只会出现一个）
// - 位置 / 类型 / 姿态 全部由"主 seed 派生子 seed"确定性生成，跨设备跨读档一致
// - 运行时 relics[] 不进存档，靠 seed + discoveredRelicIds（总图鉴）重建
// - 发现判定：靠近半径 + 在手电光锥内（角度 + 距离都满足）才记入图鉴
// - 视觉绝对静态：不发现和未发现外观完全一致
// - 物件不参与任何碰撞、不出现轮盘按钮
//
// 2026-05 扩到 32 种 + 每关不重复：
// - RELIC_TYPES 扩到 32 种
// - ALL_RELIC_KINDS 同步
// - 每关按权重抽 15 种不重复 kind，每种只生成一个
// - 发现时推两条 hint：(a) 普通"发现 · 名字" (b) 若是总图鉴首次发现则额外推一条"新图鉴 +1"金色小字

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { srand, setActiveSeededRandom, clearActiveSeededRandom } from '../core/SeededRandom';
import { checkMazeCollision } from './Collision';

// =============================================
// 图鉴类型表（32 种）
// =============================================

export type RelicKind =
    // 老 10 种
    | 'skeleton'        // 古老骸骨
    | 'coin'            // 锈蚀硬币
    | 'potshard'        // 陶罐碎片
    | 'anchor'          // 小铁锚
    | 'ring'            // 银色指环
    | 'stoneTablet'     // 刻字石板
    | 'fishhook'        // 锈蚀鱼钩
    | 'bell'            // 小铜铃
    | 'rustyKey'        // 锈蚀钥匙
    | 'shell'           // 螺旋海螺
    // 人类遗物扩展
    | 'silverCoin'      // 银币
    | 'humanSkull'      // 人类头骨（独立于骸骨，只画头骨）
    | 'pocketWatch'     // 怀表
    | 'oilLamp'         // 油灯
    | 'smallKnife'      // 小刀
    | 'maskShard'       // 潜水镜碎片
    | 'waterFlask'      // 水壶
    | 'ironNail'        // 锈铁钉
    | 'brassCompass'    // 黄铜指南针
    | 'leatherBoot'     // 半只皮靴
    // 宗教 / 符号
    | 'cross'           // 十字架
    | 'amulet'          // 护身符
    | 'idolFigure'      // 小神像
    | 'crystal'         // 水晶
    // 陶瓷 / 日用
    | 'ceramicBowl'     // 陶碗
    | 'glassBottle'     // 玻璃瓶
    // 海洋生物遗骸
    | 'coralChunk'      // 珊瑚块
    | 'sharkTooth'      // 鲨鱼牙
    | 'fishSkeleton'    // 鱼骨架
    // 地质样本
    | 'fossil'          // 化石（带螺旋化石印痕）
    | 'obsidian'        // 黑曜石
    // 现代遗落物
    | 'cameraHousing';  // 相机外壳（坏的，卷片器露出）

// 类型配置：中文名、简短叙事描述、权重（出现概率）
export interface RelicTypeDef {
    name: string;
    desc: string;
    weight: number;     // 相对权重
}

export const RELIC_TYPES: Record<RelicKind, RelicTypeDef> = {
    // 老 10 种
    skeleton:     { name: '古老骸骨',       desc: '一具早年遇难者的遗骸，无法辨识身份。',         weight: 3 },
    coin:         { name: '锈蚀硬币',       desc: '一枚年代久远的硬币，图案已几乎磨平。',         weight: 10 },
    potshard:     { name: '陶罐碎片',       desc: '古代陶器的断片，边缘光滑被水冲刷多年。',       weight: 8 },
    anchor:       { name: '小铁锚',         desc: '一具小船的铁锚，锈迹斑斑。',                   weight: 5 },
    ring:         { name: '银色指环',       desc: '一枚素面指环，内侧似有字母但已模糊。',         weight: 4 },
    stoneTablet:  { name: '刻字石板',       desc: '刻有不明图腾的石板，来历成谜。',               weight: 3 },
    fishhook:     { name: '锈蚀鱼钩',       desc: '断线的渔具，想必曾有人在此垂钓。',             weight: 7 },
    bell:         { name: '小铜铃',         desc: '一只仪式用的小铜铃，摇铃已哑。',               weight: 5 },
    rustyKey:     { name: '锈蚀钥匙',       desc: '一把开不了任何锁的旧钥匙。',                   weight: 6 },
    shell:        { name: '螺旋海螺',       desc: '一只螺旋壳贝类，洞内本不该有的物种。',         weight: 9 },
    // 人类遗物扩展
    silverCoin:   { name: '银币',           desc: '成色上好的旧式银币，边缘打有齿纹。',           weight: 4 },
    humanSkull:   { name: '人类头骨',       desc: '一颗失去身躯的头骨，静静望向洞顶。',           weight: 2 },
    pocketWatch:  { name: '破碎怀表',       desc: '表盖裂开，指针停在某个无人记得的时刻。',       weight: 3 },
    oilLamp:      { name: '旧油灯',         desc: '曾照亮这条水道，如今只剩金属骨架。',           weight: 4 },
    smallKnife:   { name: '小刀',           desc: '木柄几乎腐朽，刀刃长满锈斑。',                 weight: 5 },
    maskShard:    { name: '潜水镜碎片',     desc: '碎掉的玻璃镜片，有前人潜水者到过这里。',       weight: 4 },
    waterFlask:   { name: '铝制水壶',       desc: '凹陷的水壶，主人早已没机会再喝上一口。',       weight: 5 },
    ironNail:     { name: '锈铁钉',         desc: '一根粗大的船钉，说明这里曾有木船解体。',       weight: 8 },
    brassCompass: { name: '黄铜指南针',     desc: '罗盘玻璃碎裂，磁针仍固执指向某个方向。',       weight: 3 },
    leatherBoot:  { name: '半只皮靴',       desc: '皮面皱缩，鞋底却异常完整。',                   weight: 4 },
    // 宗教 / 符号
    cross:        { name: '小十字架',       desc: '金属十字架，有人来此寻求最后的庇护。',         weight: 3 },
    amulet:       { name: '古老护身符',     desc: '绳结已腐，骨片上的咒文仍清晰可辨。',           weight: 3 },
    idolFigure:   { name: '无名小神像',     desc: '粗糙雕刻的神像，面容被水流磨平。',             weight: 2 },
    crystal:      { name: '水晶簇',         desc: '天然形成的水晶，在手电下发出冷白光。',         weight: 4 },
    // 陶瓷 / 日用
    ceramicBowl:  { name: '陶碗',           desc: '一只几乎完整的陶碗，底部沉着淤泥。',           weight: 6 },
    glassBottle:  { name: '旧玻璃瓶',       desc: '带着厚厚水垢的玻璃瓶，里面似乎什么都没有。',   weight: 7 },
    // 海洋生物遗骸
    coralChunk:   { name: '珊瑚块',         desc: '这里本不该有珊瑚，海水也不该流到这么深。',     weight: 3 },
    sharkTooth:   { name: '鲨鱼牙',         desc: '锋利如昨，你更不愿细想它的来历。',             weight: 2 },
    fishSkeleton: { name: '鱼骨架',         desc: '大型鱼类的骨架，脊柱依然完整。',               weight: 6 },
    // 地质样本
    fossil:       { name: '螺旋化石',       desc: '岩片上留有古生物的螺旋印痕。',                 weight: 4 },
    obsidian:     { name: '黑曜石块',       desc: '漆黑晶亮的火山岩，边缘被水磨圆。',             weight: 5 },
    // 现代遗落物
    cameraHousing:{ name: '相机外壳',       desc: '进水报废的小相机，卷片器裂出缝隙。',           weight: 2 },
};

export const ALL_RELIC_KINDS: RelicKind[] = [
    'skeleton','coin','potshard','anchor','ring',
    'stoneTablet','fishhook','bell','rustyKey','shell',
    'silverCoin','humanSkull','pocketWatch','oilLamp','smallKnife',
    'maskShard','waterFlask','ironNail','brassCompass','leatherBoot',
    'cross','amulet','idolFigure','crystal',
    'ceramicBowl','glassBottle',
    'coralChunk','sharkTooth','fishSkeleton',
    'fossil','obsidian',
    'cameraHousing',
];

// =============================================
// 单个物件的运行时数据
// =============================================

export interface Relic {
    id: number;
    kind: RelicKind;
    x: number;
    y: number;
    angle: number;
    size: number;
    onWall: boolean;
    wallX: number;
    wallY: number;
    seed: number;
}

// =============================================
// 配置快捷读取
// =============================================

function cfg() {
    return ((CONFIG as any).relic) || {};
}

// =============================================
// 按权重抽 N 种不重复 kind
// =============================================

function pickUniqueKinds(n: number): RelicKind[] {
    const pool = ALL_RELIC_KINDS.slice();
    const weights: number[] = pool.map(k => RELIC_TYPES[k].weight);
    const picked: RelicKind[] = [];
    const take = Math.min(n, pool.length);
    for (let i = 0; i < take; i++) {
        let total = 0;
        for (const w of weights) total += w;
        if (total <= 0) break;
        let r = srand() * total;
        let chosen = 0;
        for (let j = 0; j < pool.length; j++) {
            if (weights[j] <= 0) continue;
            r -= weights[j];
            if (r <= 0) { chosen = j; break; }
        }
        picked.push(pool[chosen]);
        weights[chosen] = 0; // 置零避免重复
    }
    return picked;
}

// =============================================
// 根据主 seed 为当前迷宫派生生成 relic 列表
//
// 策略：
//   - 从 32 种里按权重抽 totalCount（默认 15）种不重复 kind
//   - 每种 kind 生成一个物件，贴在岩石外缘
//   - 位置必须不撞墙，离玩家出生点 > minDistToSpawn，两两 ≥ minDistBetween
// =============================================

export function generateRelics(): Relic[] {
    const maze = state.mazeRescue;
    if (!maze) return [];
    const c = cfg();

    const totalCount: number = c.totalCount ?? 15;
    const minDistBetween: number = c.minDistBetween ?? 220;
    const minDistToSpawn: number = c.minDistToSpawn ?? 400;

    // 本关要出现的 kind 列表（不重复）
    const targetKinds = pickUniqueKinds(totalCount);

    const relics: Relic[] = [];
    let nextId = 1;

    // 出生点
    const mazeCfg: any = CONFIG.maze;
    const wallThick = mazeCfg.wallThickness || 5;
    const spawnX = maze.exitX;
    const spawnY = (wallThick + 1) * maze.mazeTileSize + maze.mazeTileSize / 2;

    const walls: any[] = maze.mazeWalls || [];
    if (walls.length === 0) return [];

    const playerRadius: number = (CONFIG.maze as any).playerRadius || 12;

    const angleOffsets = [0, Math.PI/4, -Math.PI/4, Math.PI/2, -Math.PI/2, Math.PI*3/4, -Math.PI*3/4, Math.PI];

    // 对每个要出现的 kind 独立找一个位置
    for (const kind of targetKinds) {
        // 最多尝试 80 次给这个 kind 找位置
        const maxAttempts = 80;
        let placed = false;
        for (let attempt = 0; attempt < maxAttempts && !placed; attempt++) {
            const w = walls[Math.floor(srand() * walls.length)];
            if (!w) continue;
            const wallR = w.r || 30;
            const baseAngle = srand() * Math.PI * 2;
            const extraPush = playerRadius + 4 + srand() * 6;
            const offsetR = wallR + extraPush;

            for (const off of angleOffsets) {
                const angle = baseAngle + off;
                const tx = w.x + Math.cos(angle) * offsetR;
                const ty = w.y + Math.sin(angle) * offsetR;

                if (Math.hypot(tx - spawnX, ty - spawnY) < minDistToSpawn) continue;
                let tooClose = false;
                for (const r of relics) {
                    if (Math.hypot(tx - r.x, ty - r.y) < minDistBetween) { tooClose = true; break; }
                }
                if (tooClose) continue;
                if (checkMazeCollision(tx, ty, maze)) continue;

                const size = 1.5 + srand() * 0.4;
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
        }
        // 如果某个 kind 80 次都没找到位置（极端情况），就放弃这一个，继续下一个 kind
    }

    return relics;
}

// =============================================
// 对外：为迷宫生成完整 relic 数据（带派生 seed 包装）
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
// =============================================

let _thisDiveNewRelicIds: number[] = [];
// 本次下潜新增到"总图鉴"的 kind 列表（首次发现此种类）。用于结算页"本次新增图鉴 X 种"金色高亮。
let _thisDiveNewKinds: RelicKind[] = [];

export interface RelicHint {
    relicId: number;
    text: string;
    x: number;
    y: number;
    life: number;
    maxLife: number;
    /** 提示类型：'normal' 普通发现 / 'newCodex' 全新图鉴金色高亮 */
    kind: 'normal' | 'newCodex';
}
let _hintList: RelicHint[] = [];

export function resetRelicDiscoveryForDive() {
    _thisDiveNewRelicIds = [];
    _thisDiveNewKinds = [];
    _hintList = [];
}

export function getThisDiveNewRelicIds(): number[] {
    return _thisDiveNewRelicIds.slice();
}

/** 本次下潜新增到总图鉴的 kind 数（首次发现的种类数） */
export function getThisDiveNewCodexCount(): number {
    return _thisDiveNewKinds.length;
}

export function getRelicHints(): RelicHint[] {
    return _hintList;
}

export function updateRelicDiscovery() {
    const maze = state.mazeRescue;
    if (!maze) return;
    const relics: Relic[] = (maze as any).relics || [];
    if (relics.length === 0) return;
    if (!state.flashlightOn) return;

    const c = cfg();
    const radius: number = c.discoverRadius ?? 110;
    const fovDeg: number = c.discoverFovDeg ?? 60;
    const fovHalf = (fovDeg * Math.PI / 180) / 2;

    const discovered: number[] = (maze as any).discoveredRelicIds || [];
    const discoveredSet = new Set<number>(discovered);

    // 计算"总图鉴已发现种类集合"：用于判断这次发现的 kind 是不是"全新图鉴"
    const discoveredKindSet: Set<RelicKind> = new Set();
    for (const r of relics) {
        if (discoveredSet.has(r.id)) discoveredKindSet.add(r.kind);
    }
    // 注意：discoveredSet 是"本关的"，"总图鉴"的 kind 应跨关累计；
    // 但当前 discoveredRelicIds 里存的都是"本关 relics 的 id"，跨关不通用。
    // 总图鉴的 kind 集合 = 历史上所有被加进 discoveredRelicIds 的 relic 对应 kind。
    // 这里我们采用折中：用 maze.codexKinds（一个 kind 字符串数组）单独维护"总图鉴 kind 集合"，跨关累计。
    if (!Array.isArray((maze as any).codexKinds)) (maze as any).codexKinds = [];
    const codexKinds: RelicKind[] = (maze as any).codexKinds;
    const codexKindSet: Set<RelicKind> = new Set(codexKinds);

    for (const relic of relics) {
        if (discoveredSet.has(relic.id)) continue;
        const dx = relic.x - player.x;
        const dy = relic.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
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

        const def = RELIC_TYPES[relic.kind];
        if (def) {
            // 普通发现提示
            _hintList.push({
                relicId: relic.id,
                text: '发现 · ' + def.name,
                x: relic.x,
                y: relic.y - 30,
                life: 0,
                maxLife: 90,
                kind: 'normal',
            });

            // 如果此 kind 是"总图鉴"首次发现，额外推一条金色"新图鉴 +1"
            if (!codexKindSet.has(relic.kind)) {
                codexKindSet.add(relic.kind);
                codexKinds.push(relic.kind);
                if (_thisDiveNewKinds.indexOf(relic.kind) < 0) {
                    _thisDiveNewKinds.push(relic.kind);
                }
                _hintList.push({
                    relicId: relic.id,
                    text: '★ 新图鉴 +1',
                    x: relic.x,
                    y: relic.y - 48,
                    life: 0,
                    maxLife: 120,
                    kind: 'newCodex',
                });
            }
        }
    }

    (maze as any).discoveredRelicIds = discovered;
    (maze as any).codexKinds = codexKinds;

    if (_hintList.length > 0) {
        const kept: RelicHint[] = [];
        for (const h of _hintList) {
            h.life += 1;
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

/** 总图鉴已发现种类数（跨关累计），对应 codexKinds 数组长度 */
export function getCodexFoundKindCount(): number {
    const maze = state.mazeRescue;
    if (!maze) return 0;
    const k = (maze as any).codexKinds;
    return Array.isArray(k) ? k.length : 0;
}

/** 总图鉴总种类数 = ALL_RELIC_KINDS.length */
export function getCodexTotalKindCount(): number {
    return ALL_RELIC_KINDS.length;
}

/** 总图鉴已发现 kind 集合（只读），供 UI 判断每一格是否已发现 */
export function getCodexFoundKindSet(): Set<RelicKind> {
    const maze = state.mazeRescue;
    if (!maze) return new Set();
    const k = (maze as any).codexKinds;
    return new Set<RelicKind>(Array.isArray(k) ? k : []);
}

/** 按 id 查找 relic */
export function findRelicById(id: number): Relic | null {
    const maze = state.mazeRescue;
    if (!maze) return null;
    const relics: Relic[] = (maze as any).relics || [];
    for (const r of relics) {
        if (r.id === id) return r;
    }
    return null;
}
