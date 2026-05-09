// 经济模块：价格计算 / 卖货 / 收益结算
//
// 阶段 1 简化版：
// - 品相 roll 在拾取瞬间完成（详见 ItemPickup.ts）
// - 卖价 = baseValue × conditionMultiplier
// - 死亡撤离全损；半成功 50% 丢失（暂未实现）；完整撤离全保留
//
// 详见 design/extraction/03-economy-and-progression.md

import {
    getItemDef,
    CONDITION_MULTIPLIERS,
    CONDITION_NAMES,
    CONDITION_POOLS,
    ConditionPoolId,
} from '../core/ExtractionRegistry';
import {
    getExtractionState,
    ensureExtractionState,
    nextExtractionItemId,
    WarehouseItem,
    BagItem,
} from '../core/ExtractionState';

// =============================================
// 品相 roll
// =============================================

/** 按品相池随机抽一个档位 */
export function rollCondition(poolId: ConditionPoolId | undefined): string {
    const pool = CONDITION_POOLS[poolId || 'defaultPool'] || CONDITION_POOLS.defaultPool;
    // pool: [broken, worn, normal, fine, pristine] 五档独立概率
    const r = Math.random();
    let acc = 0;
    const labels = ['broken', 'worn', 'normal', 'fine', 'pristine'];
    for (let i = 0; i < pool.length; i++) {
        acc += pool[i];
        if (r < acc) return labels[i];
    }
    return 'normal';
}

// =============================================
// 价格计算
// =============================================

/** 计算单件物品的售价（baseValue × condition 倍率） */
export function computeItemPrice(itemId: string, condition: string): number {
    const def = getItemDef(itemId);
    if (!def) return 0;
    const mul = CONDITION_MULTIPLIERS[condition] != null ? CONDITION_MULTIPLIERS[condition] : 1.0;
    return Math.round(def.baseValue * mul);
}

/** 计算单件物品的展示名（含品相前缀） */
export function getItemDisplayName(itemId: string, condition: string): string {
    const def = getItemDef(itemId);
    if (!def) return '未知物品';
    const prefix = CONDITION_NAMES[condition] || '';
    return prefix + def.name;
}

/** 估算仓库里全部物品的总价值 */
export function computeWarehouseTotalValue(): number {
    const ex = getExtractionState();
    if (!ex) return 0;
    let total = 0;
    for (const it of ex.warehouse) {
        total += computeItemPrice(it.itemId, it.condition);
    }
    return total;
}

/** 估算背包里全部物品的总价值 */
export function computeBagTotalValue(): number {
    const ex = getExtractionState();
    if (!ex) return 0;
    let total = 0;
    for (const it of ex.bag.items) {
        total += computeItemPrice(it.itemId, it.condition);
    }
    return total;
}

// =============================================
// 金币操作
// =============================================

/** 增加金币（同步累计 stats.totalCoinsEarned） */
export function addCoins(amount: number): void {
    const ex = ensureExtractionState();
    if (amount > 0) {
        ex.coins += amount;
        ex.stats.totalCoinsEarned += amount;
    } else {
        ex.coins = Math.max(0, ex.coins + amount);
    }
}

/** 扣金币（不够时返回 false） */
export function spendCoins(amount: number): boolean {
    const ex = ensureExtractionState();
    if (amount < 0) amount = 0;
    if (ex.coins < amount) return false;
    ex.coins -= amount;
    return true;
}

/** 当前金币余额 */
export function getCoins(): number {
    const ex = getExtractionState();
    return ex ? ex.coins : 0;
}

// =============================================
// 卖货
// =============================================

/**
 * 卖出仓库里的某件物品（按 id），返回获得的金币
 */
export function sellWarehouseItem(itemUniqueId: number): number {
    const ex = getExtractionState();
    if (!ex) return 0;
    for (let i = 0; i < ex.warehouse.length; i++) {
        const it = ex.warehouse[i];
        if (it.id === itemUniqueId) {
            const price = computeItemPrice(it.itemId, it.condition);
            ex.warehouse.splice(i, 1);
            addCoins(price);
            return price;
        }
    }
    return 0;
}

/**
 * 一键卖出仓库里所有物品，返回总收益
 */
export function sellAllWarehouseItems(): number {
    const ex = getExtractionState();
    if (!ex) return 0;
    let total = 0;
    for (const it of ex.warehouse) {
        total += computeItemPrice(it.itemId, it.condition);
    }
    ex.warehouse = [];
    addCoins(total);
    return total;
}

// =============================================
// 仓库操作
// =============================================

/** 把一件物品（id + 品相）追加到仓库 */
export function addToWarehouse(itemId: string, condition: string): WarehouseItem {
    const ex = ensureExtractionState();
    const item: WarehouseItem = {
        id: nextExtractionItemId(),
        itemId,
        condition,
    };
    ex.warehouse.push(item);
    return item;
}

/** 把背包整个倒进仓库（成功撤离时调用） */
export function transferBagToWarehouse(): WarehouseItem[] {
    const ex = ensureExtractionState();
    const moved: WarehouseItem[] = [];
    for (const bagIt of ex.bag.items) {
        const it: WarehouseItem = {
            id: bagIt.id,           // 沿用 bag 里的 id（不重新申请）
            itemId: bagIt.itemId,
            condition: bagIt.condition,
        };
        ex.warehouse.push(it);
        moved.push(it);
    }
    ex.bag.items = [];
    return moved;
}

// =============================================
// 撤离结算（核心入口，由 ExtractionDive.onDiveEnd 调用）
// =============================================

export type ExtractReason = 'retreat' | 'o2' | 'fishkill' | 'beacon' | 'rescued';

export interface DiveSettlement {
    /** 撤离原因 */
    reason: ExtractReason;
    /** 入账的物品列表（成功撤离 = 全部背包；半成功 = 保住的；失败 = 空） */
    keptItems: BagItem[];
    /** 丢失的物品列表（半成功 = 50% 丢失；失败 = 全部背包） */
    lostItems: BagItem[];
    /** 入仓库后估算总价值（金币） */
    keptValue: number;
    /** 丢失的物品估值 */
    lostValue: number;
}

/**
 * 撤离结算：根据 reason 决定保留/丢失，把保留的物品入仓库。
 * 调用方拿到 DiveSettlement 后用于结算页展示。
 */
export function settleDiveExtraction(reason: ExtractReason): DiveSettlement {
    const ex = ensureExtractionState();
    const all = ex.bag.items.slice();
    const kept: BagItem[] = [];
    const lost: BagItem[] = [];

    if (reason === 'fishkill') {
        // 死亡撤离：全损
        for (const it of all) lost.push(it);
    } else if (reason === 'o2') {
        // 半成功撤离：每件 50% 概率丢失
        for (const it of all) {
            if (Math.random() < 0.5) lost.push(it);
            else kept.push(it);
        }
    } else {
        // retreat / beacon / rescued 都是完整撤离
        for (const it of all) kept.push(it);
    }

    // 把保留的物品搬进仓库（id 沿用）
    let keptValue = 0;
    for (const it of kept) {
        ex.warehouse.push({ id: it.id, itemId: it.itemId, condition: it.condition });
        keptValue += computeItemPrice(it.itemId, it.condition);
    }
    let lostValue = 0;
    for (const it of lost) {
        lostValue += computeItemPrice(it.itemId, it.condition);
    }

    // 清空背包
    ex.bag.items = [];

    // 累计统计
    ex.stats.totalDives++;

    return {
        reason,
        keptItems: kept,
        lostItems: lost,
        keptValue,
        lostValue,
    };
}
