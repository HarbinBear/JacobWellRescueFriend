// 背包数据操作（不含 UI）
//
// 数据模型：稀疏槽位数组
// - bag.items 长度始终 = bag.maxSlots
// - 每个位置要么是 BagItem，要么是 null（空槽位）
// - 放入/丢弃保留槽位位置（玩家拖拽后的排列会被记住）
//
// 对外 API 兼容旧调用方：
// - getBagItems() 仍返回"只含非空物品"的数组（常用于结算 / 卖出 / 显示件数）
// - 拖拽与 UI 渲染请用 getBagSlots()（稀疏槽位）
//
// 详见 design/extraction/04-loadout-and-inventory.md §四

import { getItemDef } from '../core/ExtractionRegistry';
import {
    getExtractionState,
    ensureExtractionState,
    nextExtractionItemId,
    BagItem,
} from '../core/ExtractionState';

// =============================================
// 内部：把 bag.items 规范成长度 = maxSlots 的稀疏数组
// 兼容老存档（原来是密集数组），首次访问时补齐
// =============================================
function normalizeSlots(ex: { bag: { maxSlots: number; items: (BagItem | null)[] } }): void {
    const target = Math.max(1, ex.bag.maxSlots | 0);
    const cur = ex.bag.items;
    if (!Array.isArray(cur)) {
        ex.bag.items = new Array(target).fill(null);
        return;
    }
    // 长度不够：补 null
    while (cur.length < target) cur.push(null);
    // 超长：若尾部全是 null 直接裁掉；否则把尾部非 null 物品挤到前面可用空位
    if (cur.length > target) {
        const overflow: BagItem[] = [];
        for (let i = target; i < cur.length; i++) {
            const it = cur[i];
            if (it) overflow.push(it);
        }
        cur.length = target;
        // 尝试安置超出的物品到可用空位
        for (const ov of overflow) {
            let placed = false;
            for (let i = 0; i < target; i++) {
                if (cur[i] == null) { cur[i] = ov; placed = true; break; }
            }
            if (!placed) {
                // 真放不下（降容时的情况）—— 丢弃到虚空
                console.warn('[Inventory] 降低背包容量时丢失一件物品：' + ov.itemId);
            }
        }
    }
}

// =============================================
// 容量计算
// =============================================

export function getBagOccupiedSlots(): number {
    const ex = getExtractionState();
    if (!ex) return 0;
    normalizeSlots(ex as any);
    let used = 0;
    for (const it of ex.bag.items as (BagItem | null)[]) {
        if (it) used += it.slots;
    }
    return used;
}

export function getBagFreeSlots(): number {
    const ex = getExtractionState();
    if (!ex) return 0;
    return ex.bag.maxSlots - getBagOccupiedSlots();
}

export function canFitInBag(slots: number): boolean {
    return getBagFreeSlots() >= slots;
}

// =============================================
// 放入 / 取出
// =============================================

/**
 * 把物品放进背包第一个空槽位
 */
export function addToBag(itemId: string, condition: string): BagItem | null {
    const ex = ensureExtractionState();
    const def = getItemDef(itemId);
    if (!def) {
        console.warn('[Inventory] 未知物品 id=' + itemId);
        return null;
    }
    normalizeSlots(ex as any);
    if (!canFitInBag(def.slots)) return null;

    const item: BagItem = {
        id: nextExtractionItemId(),
        itemId,
        condition,
        slots: def.slots,
    };
    const slots = ex.bag.items as (BagItem | null)[];
    for (let i = 0; i < slots.length; i++) {
        if (slots[i] == null) {
            slots[i] = item;
            ex.stats.totalPickups++;
            return item;
        }
    }
    return null;
}

/** 从背包丢弃指定 id 的物品（置 null 槽位） */
export function dropFromBag(itemUniqueId: number): boolean {
    const ex = getExtractionState();
    if (!ex) return false;
    normalizeSlots(ex as any);
    const slots = ex.bag.items as (BagItem | null)[];
    for (let i = 0; i < slots.length; i++) {
        const it = slots[i];
        if (it && it.id === itemUniqueId) {
            slots[i] = null;
            return true;
        }
    }
    return false;
}

/** 清空背包（所有槽位置 null） */
export function clearBag(): void {
    const ex = getExtractionState();
    if (!ex) return;
    const target = Math.max(1, ex.bag.maxSlots | 0);
    ex.bag.items = new Array(target).fill(null) as any;
}

/** 设置背包容量：扩容时补 null，缩容时保留已有物品 */
export function setBagMaxSlots(slots: number): void {
    const ex = ensureExtractionState();
    ex.bag.maxSlots = Math.max(1, slots | 0);
    normalizeSlots(ex as any);
}

/** 取背包内所有非空物品（结算 / 卖出 / 计件等用） */
export function getBagItems(): BagItem[] {
    const ex = getExtractionState();
    if (!ex) return [];
    normalizeSlots(ex as any);
    const out: BagItem[] = [];
    for (const it of ex.bag.items as (BagItem | null)[]) {
        if (it) out.push(it);
    }
    return out;
}

/** 取背包原始槽位数组（稀疏，含 null）—— UI 渲染与拖拽用 */
export function getBagSlots(): (BagItem | null)[] {
    const ex = getExtractionState();
    if (!ex) return [];
    normalizeSlots(ex as any);
    return (ex.bag.items as (BagItem | null)[]).slice();
}

/** 按槽位 index 交换两格内容（用于拖拽到另一物品上） */
export function swapBagSlots(indexA: number, indexB: number): boolean {
    const ex = getExtractionState();
    if (!ex) return false;
    normalizeSlots(ex as any);
    const slots = ex.bag.items as (BagItem | null)[];
    if (indexA < 0 || indexA >= slots.length) return false;
    if (indexB < 0 || indexB >= slots.length) return false;
    if (indexA === indexB) return false;
    const tmp = slots[indexA];
    slots[indexA] = slots[indexB];
    slots[indexB] = tmp;
    return true;
}

/** 把某件物品移动到指定槽位（目标是空槽时直接占据；目标是物品时交换） */
export function moveBagItemToSlot(itemUniqueId: number, targetIndex: number): boolean {
    const ex = getExtractionState();
    if (!ex) return false;
    normalizeSlots(ex as any);
    const slots = ex.bag.items as (BagItem | null)[];
    if (targetIndex < 0 || targetIndex >= slots.length) return false;

    let from = -1;
    for (let i = 0; i < slots.length; i++) {
        const it = slots[i];
        if (it && it.id === itemUniqueId) { from = i; break; }
    }
    if (from < 0) return false;
    if (from === targetIndex) return false;

    // 交换或移动（如果 target 是 null，就是"搬家"；如果 target 有物品，就是交换）
    const tmp = slots[from];
    slots[from] = slots[targetIndex];
    slots[targetIndex] = tmp;
    return true;
}

// =============================================
// 向后兼容别名（旧代码还可能调用 swapBagItems / moveBagItemToIndex）
// =============================================

/** @deprecated 使用 swapBagSlots；但保留按物品 id 的变体兼容旧调用 */
export function swapBagItems(idA: number, idB: number): boolean {
    const ex = getExtractionState();
    if (!ex) return false;
    normalizeSlots(ex as any);
    const slots = ex.bag.items as (BagItem | null)[];
    let ia = -1, ib = -1;
    for (let i = 0; i < slots.length; i++) {
        const it = slots[i];
        if (!it) continue;
        if (it.id === idA) ia = i;
        if (it.id === idB) ib = i;
    }
    if (ia < 0 || ib < 0 || ia === ib) return false;
    return swapBagSlots(ia, ib);
}

/** @deprecated 使用 moveBagItemToSlot */
export function moveBagItemToIndex(itemUniqueId: number, targetIndex: number): boolean {
    return moveBagItemToSlot(itemUniqueId, targetIndex);
}
