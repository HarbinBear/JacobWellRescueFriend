// 背包数据操作（不含 UI）
//
// 阶段 1 简化版：固定 4 格背包；下潜中拾取 → 入背包；撤离时 transferBagToWarehouse
// 详见 design/extraction/04-loadout-and-inventory.md §四

import { getItemDef } from '../core/ExtractionRegistry';
import {
    getExtractionState,
    ensureExtractionState,
    nextExtractionItemId,
    BagItem,
} from '../core/ExtractionState';

// =============================================
// 容量计算
// =============================================

/** 计算背包当前已占用的格子数 */
export function getBagOccupiedSlots(): number {
    const ex = getExtractionState();
    if (!ex) return 0;
    let used = 0;
    for (const it of ex.bag.items) used += it.slots;
    return used;
}

/** 计算背包剩余格子数 */
export function getBagFreeSlots(): number {
    const ex = getExtractionState();
    if (!ex) return 0;
    return ex.bag.maxSlots - getBagOccupiedSlots();
}

/** 是否能放下 N 个格子的物品 */
export function canFitInBag(slots: number): boolean {
    return getBagFreeSlots() >= slots;
}

// =============================================
// 放入 / 取出
// =============================================

/**
 * 把物品放进背包；返回新建的 BagItem（背包满则返回 null）
 */
export function addToBag(itemId: string, condition: string): BagItem | null {
    const ex = ensureExtractionState();
    const def = getItemDef(itemId);
    if (!def) {
        console.warn('[Inventory] 未知物品 id=' + itemId);
        return null;
    }
    if (!canFitInBag(def.slots)) {
        return null;
    }
    const item: BagItem = {
        id: nextExtractionItemId(),
        itemId,
        condition,
        slots: def.slots,
    };
    ex.bag.items.push(item);
    ex.stats.totalPickups++;
    return item;
}

/** 从背包丢弃指定 id 的物品 */
export function dropFromBag(itemUniqueId: number): boolean {
    const ex = getExtractionState();
    if (!ex) return false;
    for (let i = 0; i < ex.bag.items.length; i++) {
        if (ex.bag.items[i].id === itemUniqueId) {
            ex.bag.items.splice(i, 1);
            return true;
        }
    }
    return false;
}

/** 清空背包（出发准备页 / GM 调试用） */
export function clearBag(): void {
    const ex = getExtractionState();
    if (!ex) return;
    ex.bag.items = [];
}

/** 设置背包容量（永久装备应用 / GM 调试用） */
export function setBagMaxSlots(slots: number): void {
    const ex = ensureExtractionState();
    ex.bag.maxSlots = Math.max(1, slots | 0);
}

/** 取背包内所有物品的浅拷贝（UI 渲染用） */
export function getBagItems(): BagItem[] {
    const ex = getExtractionState();
    if (!ex) return [];
    return ex.bag.items.slice();
}
