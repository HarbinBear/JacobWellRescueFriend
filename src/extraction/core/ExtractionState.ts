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

    /** 已购永久装备 id 列表（重复购买视为已拥有） */
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

/** 商店一个货位（占商店 UI 的一个槽位） */
export interface ShopSlot {
    /** 唯一 id（点击 hit-test / 同一商品多次出现时区分） */
    slotId: number;
    /** 货架类型（影响展示分组） */
    shelf: 'consumable' | 'emergency' | 'equipment' | 'special';
    /** 物品 id */
    itemId: string;
    /** 售价（baseValue × 老板系数；可与 itemDef.baseValue 不同） */
    price: number;
    /** 是否已售（消耗品永远不消耗 slot；装备买完变 sold） */
    sold: boolean;
}

// =============================================
// 默认值
// =============================================

/** 阶段 1 起步配置：100 金 + 4 格背包（全空） */
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
        ownedEquipment: ['bag4', 'finsBasic'],
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
    if (!Array.isArray(ex.ownedEquipment)) ex.ownedEquipment = def.ownedEquipment.slice();
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
