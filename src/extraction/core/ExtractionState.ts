// 撤离玩法状态根（state.extraction）
//
// 设计原则：
// - 所有撤离玩法数据集中在 state.extraction 子树，不污染 state.mazeRescue
// - 本模块仅负责 state.extraction 的初始化与默认值兜底，不做任何业务逻辑
// - 业务逻辑（拾取、商店、经济）都通过 import 这里的类型与访问器实现
// - 阶段 1 只支持最小必要字段；后续阶段按子卷文档增量扩展
//
// 详见 design/extraction/04-loadout-and-inventory.md 与 07-engineering-isolation.md

import { state } from '../../core/state';

// =============================================
// 类型定义
// =============================================

/** 仓库里的一件战利品（已上岸，等待卖出 / 留作收藏） */
export interface WarehouseItem {
    /** 唯一 id（递增计数） */
    id: number;
    /** 物品 id（对应 ExtractionRegistry 里的 itemId） */
    itemId: string;
    /** 品相档位（'broken'/'worn'/'normal'/'fine'/'pristine'）；阶段 1 暂时全部为 normal */
    condition: string;
}

/** 下潜中的临时背包格子里的物品 */
export interface BagItem {
    /** 唯一 id（递增计数，与 warehouse 共享一套计数避免冲突） */
    id: number;
    /** 物品 id */
    itemId: string;
    /** 品相档位 */
    condition: string;
    /** 占用格子数（从 ItemRegistry 读取并落到运行时，避免 UI 反复查表） */
    slots: number;
}

/** 撤离玩法状态根 */
export interface ExtractionState {
    /** 数据版本号（升级老存档兜底用） */
    version: number;

    /** 金币余额 */
    coins: number;

    /** 名声（阶段 1 仅占位，阶段 3 启用） */
    reputation: number;

    /** 仓库（已撤离回岸的物品） */
    warehouse: WarehouseItem[];

    /** 仓库 / 背包共享的下一个唯一 id（避免 id 冲突） */
    nextItemId: number;

    /** 下潜中的临时背包（运行时数据，每次下潜开始清空） */
    bag: {
        /** 容量（格子数）—— 阶段 1 固定 4 */
        maxSlots: number;
        /** 稀疏槽位数组：长度 = maxSlots，每个位置要么是 BagItem 要么是 null（空槽） */
        items: (BagItem | null)[];
    };

    /** 当次下潜的运行时数据，结束清空 */
    diveSession: {
        /** 已被本次下潜拾取的 relic id 列表（当次内不再次出现，下次下潜重刷） */
        pickedRelicIds: number[];
    };

    /** 已购消耗品库存（itemId -> 数量；阶段 2 启用） */
    consumables: { [itemId: string]: number };

    /**
     * 装备库存（不含保底装备 bag4 / finsBasic）。
     *
     * 设计：装备是"消耗式"的。
     * - 玩家在商店买装备 → stock[id]++（同款可叠加，作为备用件）
     * - 撤离失败（o2 / fishkill）→ 当前装备的那件销毁：stock[equipped.bag]--
     * - 库存归零时自动回退到次优（按等级降序），最差回退到保底 bag4 / finsBasic
     *
     * 注意：bag4 / finsBasic 是"穿在身上的"保底装备，永远存在，不入此 stock
     * （所以即使 stock 全空，玩家仍能下水，不会破产）。
     */
    equipmentStock: { [itemId: string]: number };

    /**
     * 当前装备的三件主装备（背包 + 脚蹼 + 潜水衣）。
     *
     * 下潜开始时由 Loadout.applyLoadoutForDive 读取并应用效果。
     * 撤离失败时由 Economy.loseEquippedOnFailure 把对应装备从 stock 扣 1，
     * 若 stock 归零则自动 fallback 到次优 / 保底。
     */
    equipped: {
        bag: string;     // 默认 'bag4'（保底）
        fins: string;    // 默认 'finsBasic'（保底）
        suit: string;    // 默认 'suitBasic'（保底，决定本次最大可下潜深度）
    };

    /**
     * @deprecated 旧字段，已被 equipmentStock + equipped 替代。
     * 保留仅用于老存档迁移（patchExtractionState 会读它然后清空）。
     */
    ownedEquipment: string[];

    /** 商店运行时态（每次进入岸上重置；不入存档） */
    shop?: {
        /** 当前货架物品 id 列表（4 个货架的扁平合集） */
        slots: ShopSlot[];
        /** 已使用换一批次数（影响下次费用） */
        rerollCount: number;
        /** 上次刷新的世界时间戳（隔时间自动刷新） */
        lastRefreshAt: number;
    };

    /** 一次性事件标志位（阶段 1 暂未使用） */
    flags: {
        /** 是否首次进入撤离系统（用于教程） */
        tutorialShown: boolean;
    };

    /** 累计统计（成就/调试用） */
    stats: {
        /** 累计获得金币 */
        totalCoinsEarned: number;
        /** 累计撤离次数 */
        totalDives: number;
        /** 累计拾取物品数 */
        totalPickups: number;
    };
}

/** 商店一个货位（不分类版：所有商品平铺在一个池子里） */
export interface ShopSlot {
    /** 唯一 id（点击 hit-test / 同一商品多次出现时区分） */
    slotId: number;
    /**
     * 货架类型（已弃用：所有商品平铺）。
     * 新刷新逻辑统一赋值为 'shelf'；保留字段是为了不破坏老存档（运行时 shop 不存档但避免兼容问题）。
     * @deprecated 使用 isSpecial 区分特价
     */
    shelf: 'consumable' | 'emergency' | 'equipment' | 'special' | 'shelf';
    /** 物品 id */
    itemId: string;
    /** 售价（baseValue × 老板系数；可与 itemDef.baseValue 不同） */
    price: number;
    /** 是否已售（消耗品永远不消耗 slot；装备买完变 sold） */
    sold: boolean;
    /** 是否走特价（0.7× 价；UI 用金色描边/百分比角标突出） */
    isSpecial?: boolean;
}

// =============================================
// 默认值
// =============================================

/** 阶段 1 起步配置：100 金 + 4 格背包（全空） + 保底装备 */
export function getInitialExtractionState(): ExtractionState {
    return {
        version: 1,
        coins: 100,
        reputation: 0,
        warehouse: [],
        nextItemId: 1,
        bag: {
            maxSlots: 4,
            items: [null, null, null, null] as any,
        },
        diveSession: {
            pickedRelicIds: [],
        },
        consumables: {},
        equipmentStock: {},                             // 装备库存（保底装备不入此表）
        equipped: { bag: 'bag4', fins: 'finsBasic', suit: 'suitBasic' },   // 起步只穿保底
        ownedEquipment: [],                              // 已废弃，保留空数组兼容
        flags: {
            tutorialShown: false,
        },
        stats: {
            totalCoinsEarned: 0,
            totalDives: 0,
            totalPickups: 0,
        },
    };
}

// =============================================
// 访问器
// =============================================

/** 获取 state.extraction，不存在时返回 null（不自动初始化，避免与 load 流程冲突） */
export function getExtractionState(): ExtractionState | null {
    const ex = (state as any).extraction;
    return ex && typeof ex === 'object' ? (ex as ExtractionState) : null;
}

/** 强制确保 state.extraction 存在（如果不存在则初始化为默认值） */
export function ensureExtractionState(): ExtractionState {
    let ex = (state as any).extraction;
    if (!ex || typeof ex !== 'object') {
        ex = getInitialExtractionState();
        (state as any).extraction = ex;
    }
    return ex as ExtractionState;
}

/** 老存档兜底：把缺失的字段填上默认值（用于 load 之后） */
export function patchExtractionState(ex: any): ExtractionState {
    const def = getInitialExtractionState();
    if (!ex || typeof ex !== 'object') return def;
    if (typeof ex.version !== 'number') ex.version = def.version;
    if (typeof ex.coins !== 'number') ex.coins = def.coins;
    if (typeof ex.reputation !== 'number') ex.reputation = def.reputation;
    if (!Array.isArray(ex.warehouse)) ex.warehouse = [];
    if (typeof ex.nextItemId !== 'number') ex.nextItemId = 1;
    if (!ex.bag || typeof ex.bag !== 'object') ex.bag = def.bag;
    if (typeof ex.bag.maxSlots !== 'number') ex.bag.maxSlots = def.bag.maxSlots;
    if (!Array.isArray(ex.bag.items)) ex.bag.items = [];
    if (!ex.diveSession || typeof ex.diveSession !== 'object') ex.diveSession = def.diveSession;
    if (!Array.isArray(ex.diveSession.pickedRelicIds)) ex.diveSession.pickedRelicIds = [];
    if (!ex.consumables || typeof ex.consumables !== 'object') ex.consumables = {};

    // === 装备体系迁移：从老的 ownedEquipment 转到新的 equipmentStock + equipped ===
    if (!ex.equipmentStock || typeof ex.equipmentStock !== 'object') ex.equipmentStock = {};
    if (!ex.equipped || typeof ex.equipped !== 'object') {
        ex.equipped = { bag: 'bag4', fins: 'finsBasic', suit: 'suitBasic' };
    }
    if (typeof ex.equipped.bag !== 'string') ex.equipped.bag = 'bag4';
    if (typeof ex.equipped.fins !== 'string') ex.equipped.fins = 'finsBasic';
    if (typeof ex.equipped.suit !== 'string') ex.equipped.suit = 'suitBasic';   // 老存档兜底：保底潜水衣

    // 老存档迁移：ownedEquipment 数组 → 折算为 stock + equipped
    if (Array.isArray(ex.ownedEquipment) && ex.ownedEquipment.length > 0) {
        const owned: string[] = ex.ownedEquipment.slice();
        // 把非保底的装备按 1 件入 stock（如果还没入过）
        for (const id of owned) {
            if (id === 'bag4' || id === 'finsBasic' || id === 'suitBasic') continue;
            if (!ex.equipmentStock[id]) ex.equipmentStock[id] = 1;
        }
        // 推断 equipped.bag：根据 maxSlots（最稳的"已生效"指标）
        const ms = ex.bag.maxSlots | 0;
        if (ms >= 16 && (ex.equipmentStock['bag16'] || owned.indexOf('bag16') >= 0)) ex.equipped.bag = 'bag16';
        else if (ms >= 12 && (ex.equipmentStock['bag12'] || owned.indexOf('bag12') >= 0)) ex.equipped.bag = 'bag12';
        else if (ms >= 8 && (ex.equipmentStock['bag8'] || owned.indexOf('bag8') >= 0)) ex.equipped.bag = 'bag8';
        else ex.equipped.bag = 'bag4';
        // 推断 equipped.fins：按老 owned 顺序选最优（finsRacing > finsEndurance > finsBasic）
        if (owned.indexOf('finsRacing') >= 0) ex.equipped.fins = 'finsRacing';
        else if (owned.indexOf('finsEndurance') >= 0) ex.equipped.fins = 'finsEndurance';
        else ex.equipped.fins = 'finsBasic';
        // 潜水衣：按 owned 顺序选最优（suitCCR > suitDeep > suitBasic）；老存档没有，默认保底
        if (owned.indexOf('suitCCR') >= 0) ex.equipped.suit = 'suitCCR';
        else if (owned.indexOf('suitDeep') >= 0) ex.equipped.suit = 'suitDeep';
        // 否则保持 'suitBasic'
        // 迁移完毕，清空老字段（避免下次 load 重复迁移）
        ex.ownedEquipment = [];
    } else {
        ex.ownedEquipment = [];
    }

    // shop 字段是运行时态，不入存档（这里清空）
    if (ex.shop) ex.shop = undefined;
    if (!ex.flags || typeof ex.flags !== 'object') ex.flags = def.flags;
    if (typeof ex.flags.tutorialShown !== 'boolean') ex.flags.tutorialShown = false;
    if (!ex.stats || typeof ex.stats !== 'object') ex.stats = def.stats;
    if (typeof ex.stats.totalCoinsEarned !== 'number') ex.stats.totalCoinsEarned = 0;
    if (typeof ex.stats.totalDives !== 'number') ex.stats.totalDives = 0;
    if (typeof ex.stats.totalPickups !== 'number') ex.stats.totalPickups = 0;
    return ex as ExtractionState;
}

/** 重置为新手起步状态（GM 调试用） */
export function resetExtractionState(): void {
    (state as any).extraction = getInitialExtractionState();
}

/** 申请下一个唯一 item id（warehouse + bag 共用） */
export function nextExtractionItemId(): number {
    const ex = ensureExtractionState();
    const id = ex.nextItemId;
    ex.nextItemId = id + 1;
    return id;
}
