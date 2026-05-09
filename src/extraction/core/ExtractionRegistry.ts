// 物品注册表（运行时只读）
//
// 设计目标：
// - 所有"物品的属性"（价值/重量/体积/稀有度/spawn 权重/品相池）来自这一个表
// - 阶段 1：表内联在代码里，方便快速迭代；
//   阶段 2：切换到从 JSON 配置加载（详见 design/extraction/01-item-attributes-and-config.md §5）
// - 古物的 itemId 与现有 Relic.RelicKind 一一对应（保持单一数据源）
//
// 解耦原则：价值/重量/体积/稀有度/spawnWeight 全部独立，不互相推导。
// 反例：weight=10 的硬币只值 8 金（小+常见+便宜）；
//      weight=2 的相机外壳值 900 金（小+稀有+贵）；
//      weight=5 的铁锚只值 60 金（大+常见+便宜）。

import type { RelicKind } from '../../logic/Relic';

// =============================================
// 类型定义
// =============================================

export type ItemCategory =
    | 'treasure'      // 古物 / 战利品
    | 'consumable'    // 消耗品（氧气瓶、电池、绳索）
    | 'equipment'     // 永久装备（背包、脚蹼）
    | 'emergency'     // 应急品（救生信标）
    | 'material';     // 杂项材料（合成预留）

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** 品相池 id（决定该物品的品相分布） */
export type ConditionPoolId = 'defaultPool' | 'metalPool' | 'gemPool' | 'boneSkullPool';

export interface ItemDef {
    /** 唯一 id（古物使用 RelicKind 字符串，消耗品/装备另起 id） */
    id: string;
    /** 中文名 */
    name: string;
    /** 简短描述 */
    desc: string;
    /** 大类 */
    category: ItemCategory;
    /** 基础售价（金币） */
    baseValue: number;
    /** 重量（虚拟单位） */
    weight: number;
    /** 占用背包格子数（阶段 1 1~4） */
    slots: number;
    /** 稀有度（仅 UI 标签，不直接影响价值） */
    rarity: ItemRarity;
    /** 场景刷新概率权重（与价值/稀有度独立） */
    spawnWeight: number;
    /** 品相池 id */
    conditionPool: ConditionPoolId;
    /** 检索标签（未来事件触发用，阶段 1 暂未使用） */
    tags?: string[];
}

/** 装备运行时效果（覆盖到 player / CONFIG.maze.* 的临时副本） */
export interface EquipmentEffects {
    /** 起始氧气数值（中氧 100 / 大氧 150） */
    startO2?: number;
    /** 手电照射距离倍率 */
    flashlightRangeMul?: number;
    /** 移动速度倍率 */
    moveSpeedMul?: number;
    /** 氧气消耗倍率（>1 更费氧，<1 更省氧） */
    o2DrainMul?: number;
    /** 背包容量（格子数）—— 永久装备：背包 */
    inventorySlots?: number;
    /** 起始绳索段数 */
    startRopeCount?: number;
}

export interface EquipmentDef extends ItemDef {
    effects: EquipmentEffects;
}

// =============================================
// 品相池配置（来自 01-item-attributes-and-config.md §3）
// =============================================

/** 品相档位与价值倍率 */
export const CONDITION_MULTIPLIERS: { [k: string]: number } = {
    broken: 0.4,
    worn: 0.8,
    normal: 1.0,
    fine: 1.5,
    pristine: 3.0,
};

/** 品相档位中文名 */
export const CONDITION_NAMES: { [k: string]: string } = {
    broken: '残缺的',
    worn: '磨损的',
    normal: '',
    fine: '完好的',
    pristine: '完美的',
};

/** 品相分布池（每池 5 个档位的累计概率，按 broken/worn/normal/fine/pristine 顺序） */
export const CONDITION_POOLS: { [k in ConditionPoolId]: number[] } = {
    // [broken, worn, normal, fine, pristine]
    defaultPool:   [0.25, 0.35, 0.25, 0.12, 0.03],
    metalPool:     [0.30, 0.40, 0.22, 0.07, 0.01],
    gemPool:       [0.10, 0.20, 0.30, 0.25, 0.15],
    boneSkullPool: [0.50, 0.20, 0.15, 0.10, 0.05],
};

// =============================================
// 古物物品表（32 种 Relic 的属性）
// 数值来自 design/extraction/01-item-attributes-and-config.md §4.1
// =============================================

const TREASURE_ITEMS: ItemDef[] = [
    { id: 'skeleton',      name: '古老骸骨',     desc: '一具早年遇难者的遗骸，无法辨识身份。',           category: 'treasure', baseValue: 350,  weight: 800,  slots: 4, rarity: 'rare',     spawnWeight: 3,  conditionPool: 'boneSkullPool' },
    { id: 'coin',          name: '锈蚀硬币',     desc: '一枚年代久远的硬币，图案已几乎磨平。',           category: 'treasure', baseValue: 8,    weight: 5,    slots: 1, rarity: 'common',   spawnWeight: 10, conditionPool: 'metalPool' },
    { id: 'potshard',      name: '陶罐碎片',     desc: '古代陶器的断片，边缘光滑被水冲刷多年。',         category: 'treasure', baseValue: 12,   weight: 80,   slots: 1, rarity: 'common',   spawnWeight: 8,  conditionPool: 'defaultPool' },
    { id: 'anchor',        name: '小铁锚',       desc: '一具小船的铁锚，锈迹斑斑。',                     category: 'treasure', baseValue: 60,   weight: 1500, slots: 3, rarity: 'uncommon', spawnWeight: 5,  conditionPool: 'metalPool' },
    { id: 'ring',          name: '银色指环',     desc: '一枚素面指环，内侧似有字母但已模糊。',           category: 'treasure', baseValue: 80,   weight: 8,    slots: 1, rarity: 'uncommon', spawnWeight: 4,  conditionPool: 'metalPool' },
    { id: 'stoneTablet',   name: '刻字石板',     desc: '刻有不明图腾的石板，来历成谜。',                 category: 'treasure', baseValue: 220,  weight: 600,  slots: 3, rarity: 'rare',     spawnWeight: 3,  conditionPool: 'defaultPool' },
    { id: 'fishhook',      name: '锈蚀鱼钩',     desc: '断线的渔具，想必曾有人在此垂钓。',               category: 'treasure', baseValue: 6,    weight: 15,   slots: 1, rarity: 'common',   spawnWeight: 7,  conditionPool: 'metalPool' },
    { id: 'bell',          name: '小铜铃',       desc: '一只仪式用的小铜铃，摇铃已哑。',                 category: 'treasure', baseValue: 45,   weight: 60,   slots: 1, rarity: 'uncommon', spawnWeight: 5,  conditionPool: 'metalPool' },
    { id: 'rustyKey',      name: '锈蚀钥匙',     desc: '一把开不了任何锁的旧钥匙。',                     category: 'treasure', baseValue: 15,   weight: 25,   slots: 1, rarity: 'common',   spawnWeight: 6,  conditionPool: 'metalPool' },
    { id: 'shell',         name: '螺旋海螺',     desc: '一只螺旋壳贝类，洞内本不该有的物种。',           category: 'treasure', baseValue: 18,   weight: 35,   slots: 1, rarity: 'common',   spawnWeight: 9,  conditionPool: 'defaultPool' },
    { id: 'silverCoin',    name: '银币',         desc: '成色上好的旧式银币，边缘打有齿纹。',             category: 'treasure', baseValue: 120,  weight: 8,    slots: 1, rarity: 'rare',     spawnWeight: 4,  conditionPool: 'metalPool' },
    { id: 'humanSkull',    name: '人类头骨',     desc: '一颗失去身躯的头骨，静静望向洞顶。',             category: 'treasure', baseValue: 600,  weight: 1200, slots: 3, rarity: 'epic',     spawnWeight: 2,  conditionPool: 'boneSkullPool' },
    { id: 'pocketWatch',   name: '破碎怀表',     desc: '表盖裂开，指针停在某个无人记得的时刻。',         category: 'treasure', baseValue: 280,  weight: 60,   slots: 1, rarity: 'rare',     spawnWeight: 3,  conditionPool: 'metalPool' },
    { id: 'oilLamp',       name: '旧油灯',       desc: '曾照亮这条水道，如今只剩金属骨架。',             category: 'treasure', baseValue: 70,   weight: 350,  slots: 2, rarity: 'uncommon', spawnWeight: 4,  conditionPool: 'metalPool' },
    { id: 'smallKnife',    name: '小刀',         desc: '木柄几乎腐朽，刀刃长满锈斑。',                   category: 'treasure', baseValue: 35,   weight: 90,   slots: 1, rarity: 'uncommon', spawnWeight: 5,  conditionPool: 'metalPool' },
    { id: 'maskShard',     name: '潜水镜碎片',   desc: '碎掉的玻璃镜片，有前人潜水者到过这里。',         category: 'treasure', baseValue: 25,   weight: 30,   slots: 1, rarity: 'common',   spawnWeight: 4,  conditionPool: 'defaultPool' },
    { id: 'waterFlask',    name: '铝制水壶',     desc: '凹陷的水壶，主人早已没机会再喝上一口。',         category: 'treasure', baseValue: 30,   weight: 200,  slots: 2, rarity: 'uncommon', spawnWeight: 5,  conditionPool: 'metalPool' },
    { id: 'ironNail',      name: '锈铁钉',       desc: '一根粗大的船钉，说明这里曾有木船解体。',         category: 'treasure', baseValue: 4,    weight: 50,   slots: 1, rarity: 'common',   spawnWeight: 8,  conditionPool: 'metalPool' },
    { id: 'brassCompass',  name: '黄铜指南针',   desc: '罗盘玻璃碎裂，磁针仍固执指向某个方向。',         category: 'treasure', baseValue: 240,  weight: 80,   slots: 1, rarity: 'rare',     spawnWeight: 3,  conditionPool: 'metalPool' },
    { id: 'leatherBoot',   name: '半只皮靴',     desc: '皮面皱缩，鞋底却异常完整。',                     category: 'treasure', baseValue: 18,   weight: 250,  slots: 2, rarity: 'common',   spawnWeight: 4,  conditionPool: 'defaultPool' },
    { id: 'cross',         name: '小十字架',     desc: '金属十字架，有人来此寻求最后的庇护。',           category: 'treasure', baseValue: 180,  weight: 40,   slots: 1, rarity: 'rare',     spawnWeight: 3,  conditionPool: 'metalPool' },
    { id: 'amulet',        name: '古老护身符',   desc: '绳结已腐，骨片上的咒文仍清晰可辨。',             category: 'treasure', baseValue: 320,  weight: 30,   slots: 1, rarity: 'rare',     spawnWeight: 3,  conditionPool: 'defaultPool' },
    { id: 'idolFigure',    name: '无名小神像',   desc: '粗糙雕刻的神像，面容被水流磨平。',               category: 'treasure', baseValue: 750,  weight: 400,  slots: 2, rarity: 'epic',     spawnWeight: 2,  conditionPool: 'defaultPool' },
    { id: 'crystal',       name: '水晶簇',       desc: '天然形成的水晶，在手电下发出冷白光。',           category: 'treasure', baseValue: 420,  weight: 50,   slots: 1, rarity: 'rare',     spawnWeight: 4,  conditionPool: 'gemPool' },
    { id: 'ceramicBowl',   name: '陶碗',         desc: '一只几乎完整的陶碗，底部沉着淤泥。',             category: 'treasure', baseValue: 40,   weight: 280,  slots: 2, rarity: 'uncommon', spawnWeight: 6,  conditionPool: 'defaultPool' },
    { id: 'glassBottle',   name: '旧玻璃瓶',     desc: '带着厚厚水垢的玻璃瓶，里面似乎什么都没有。',     category: 'treasure', baseValue: 14,   weight: 180,  slots: 2, rarity: 'common',   spawnWeight: 7,  conditionPool: 'defaultPool' },
    { id: 'coralChunk',    name: '珊瑚块',       desc: '这里本不该有珊瑚，海水也不该流到这么深。',       category: 'treasure', baseValue: 90,   weight: 120,  slots: 1, rarity: 'rare',     spawnWeight: 3,  conditionPool: 'defaultPool' },
    { id: 'sharkTooth',    name: '鲨鱼牙',       desc: '锋利如昨，你更不愿细想它的来历。',               category: 'treasure', baseValue: 380,  weight: 8,    slots: 1, rarity: 'epic',     spawnWeight: 2,  conditionPool: 'defaultPool' },
    { id: 'fishSkeleton',  name: '鱼骨架',       desc: '大型鱼类的骨架，脊柱依然完整。',                 category: 'treasure', baseValue: 28,   weight: 200,  slots: 2, rarity: 'uncommon', spawnWeight: 6,  conditionPool: 'boneSkullPool' },
    { id: 'fossil',        name: '螺旋化石',     desc: '岩片上留有古生物的螺旋印痕。',                   category: 'treasure', baseValue: 260,  weight: 350,  slots: 2, rarity: 'rare',     spawnWeight: 4,  conditionPool: 'defaultPool' },
    { id: 'obsidian',      name: '黑曜石块',     desc: '漆黑晶亮的火山岩，边缘被水磨圆。',               category: 'treasure', baseValue: 55,   weight: 180,  slots: 1, rarity: 'uncommon', spawnWeight: 5,  conditionPool: 'defaultPool' },
    { id: 'cameraHousing', name: '相机外壳',     desc: '进水报废的小相机，卷片器裂出缝隙。',             category: 'treasure', baseValue: 900,  weight: 320,  slots: 2, rarity: 'epic',     spawnWeight: 2,  conditionPool: 'metalPool' },
];

// =============================================
// 消耗品表
// =============================================

const CONSUMABLE_ITEMS: EquipmentDef[] = [
    { id: 'airTankS',    name: '小氧气瓶',  desc: '免费兜底装备，起始氧气 60。',          category: 'consumable', baseValue: 0,   weight: 600,  slots: 1, rarity: 'common',   spawnWeight: 0, conditionPool: 'defaultPool', effects: { startO2: 60 } },
    { id: 'airTankM',    name: '中氧气瓶',  desc: '常规装备，起始氧气 100。',             category: 'consumable', baseValue: 40,  weight: 800,  slots: 2, rarity: 'common',   spawnWeight: 0, conditionPool: 'defaultPool', effects: { startO2: 100 } },
    { id: 'airTankL',    name: '大氧气瓶',  desc: '深水玩家必备，起始氧气 150。',         category: 'consumable', baseValue: 120, weight: 1200, slots: 3, rarity: 'uncommon', spawnWeight: 0, conditionPool: 'defaultPool', effects: { startO2: 150 } },
    { id: 'batteryWeak', name: '弱电池',    desc: '免费兜底装备，手电照射距离 ×0.7。',    category: 'consumable', baseValue: 0,   weight: 100,  slots: 1, rarity: 'common',   spawnWeight: 0, conditionPool: 'defaultPool', effects: { flashlightRangeMul: 0.7 } },
    { id: 'batteryStd',  name: '标准电池',  desc: '常规手电电池。',                       category: 'consumable', baseValue: 30,  weight: 100,  slots: 1, rarity: 'common',   spawnWeight: 0, conditionPool: 'defaultPool', effects: { flashlightRangeMul: 1.0 } },
    { id: 'batteryHigh', name: '高功率电池', desc: '手电照射距离 ×1.3。',                  category: 'consumable', baseValue: 80,  weight: 150,  slots: 1, rarity: 'uncommon', spawnWeight: 0, conditionPool: 'defaultPool', effects: { flashlightRangeMul: 1.3 } },
    { id: 'ropePack5',   name: '绳索 5 段',  desc: '5 段绳索，铺路用。',                  category: 'consumable', baseValue: 20,  weight: 200,  slots: 1, rarity: 'common',   spawnWeight: 0, conditionPool: 'defaultPool', effects: { startRopeCount: 5 } },
    { id: 'ropePack15',  name: '绳索 15 段', desc: '15 段绳索装，性价比包。',             category: 'consumable', baseValue: 50,  weight: 500,  slots: 2, rarity: 'common',   spawnWeight: 0, conditionPool: 'defaultPool', effects: { startRopeCount: 15 } },
];

// =============================================
// 永久装备表
// =============================================

const EQUIPMENT_ITEMS: EquipmentDef[] = [
    { id: 'bag4',          name: '4 格背包',   desc: '基础背包，4 个格子。',                category: 'equipment', baseValue: 0,    weight: 0, slots: 0, rarity: 'common',   spawnWeight: 0, conditionPool: 'defaultPool', effects: { inventorySlots: 4 } },
    { id: 'bag8',          name: '8 格背包',   desc: '加大版背包，8 个格子。',              category: 'equipment', baseValue: 300,  weight: 0, slots: 0, rarity: 'uncommon', spawnWeight: 0, conditionPool: 'defaultPool', effects: { inventorySlots: 8 } },
    { id: 'bag12',         name: '12 格背包',  desc: '专业级背包，12 个格子。',             category: 'equipment', baseValue: 800,  weight: 0, slots: 0, rarity: 'rare',     spawnWeight: 0, conditionPool: 'defaultPool', effects: { inventorySlots: 12 } },
    { id: 'bag16',         name: '16 格背包',  desc: '深水玩家专属，16 个格子。',           category: 'equipment', baseValue: 1800, weight: 0, slots: 0, rarity: 'epic',     spawnWeight: 0, conditionPool: 'defaultPool', effects: { inventorySlots: 16 } },
    { id: 'finsBasic',     name: '普通脚蹼',   desc: '基础脚蹼。',                          category: 'equipment', baseValue: 0,    weight: 0, slots: 0, rarity: 'common',   spawnWeight: 0, conditionPool: 'defaultPool', effects: { moveSpeedMul: 1.0 } },
    { id: 'finsRacing',    name: '竞速脚蹼',   desc: '速度提升 1.2×，节省下潜时间。',       category: 'equipment', baseValue: 400,  weight: 0, slots: 0, rarity: 'rare',     spawnWeight: 0, conditionPool: 'defaultPool', effects: { moveSpeedMul: 1.2 } },
    { id: 'finsEndurance', name: '长续航脚蹼', desc: '速度 0.95×，氧耗 0.85×，深水玩家爱。', category: 'equipment', baseValue: 350,  weight: 0, slots: 0, rarity: 'rare',     spawnWeight: 0, conditionPool: 'defaultPool', effects: { moveSpeedMul: 0.95, o2DrainMul: 0.85 } },
];

// =============================================
// 注册中心：合并所有物品到 id->def map
// =============================================

const _itemsById: { [id: string]: ItemDef } = {};

(function register() {
    for (const it of TREASURE_ITEMS) _itemsById[it.id] = it;
    for (const it of CONSUMABLE_ITEMS) _itemsById[it.id] = it;
    for (const it of EQUIPMENT_ITEMS) _itemsById[it.id] = it;
})();

// =============================================
// 对外 API
// =============================================

/** 按 id 查物品定义（含古物 / 消耗品 / 装备） */
export function getItemDef(id: string): ItemDef | null {
    return _itemsById[id] || null;
}

/** 按 RelicKind 查古物定义 */
export function getTreasureByRelicKind(kind: RelicKind): ItemDef | null {
    return _itemsById[kind as string] || null;
}

/** 是否是装备/消耗品（带 effects 字段） */
export function isEquipment(id: string): boolean {
    const def = _itemsById[id];
    if (!def) return false;
    return def.category === 'consumable' || def.category === 'equipment' || def.category === 'emergency';
}

/** 取装备的运行时效果（仅对 equipment / consumable / emergency 有效） */
export function getEquipmentEffects(id: string): EquipmentEffects | null {
    const def = _itemsById[id] as EquipmentDef;
    if (!def) return null;
    return def.effects || null;
}

/** 列出某一类全部物品 */
export function listItemsByCategory(cat: ItemCategory): ItemDef[] {
    const out: ItemDef[] = [];
    for (const id in _itemsById) {
        if (Object.prototype.hasOwnProperty.call(_itemsById, id)) {
            const def = _itemsById[id];
            if (def.category === cat) out.push(def);
        }
    }
    return out;
}
