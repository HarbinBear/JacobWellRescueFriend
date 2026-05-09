// 商店刷新与购买逻辑（黄金矿工式）
//
// 货架结构：
//   消耗品架：3 槽（氧气瓶/电池/绳索 池）
//   应急架：2 槽（救生信标/防鲨喷雾 池；阶段 2 暂只放占位）
//   装备架：2 槽（背包/脚蹼 永久装备池）
//   特价架：1~2 槽（随机一件 6~8 折特价；阶段 2 暂无）
//
// 刷新规则：
// - 进入岸上时若 shop.slots 不存在则首次刷新
// - "换一批"按钮触发：第 1 次免费、第 2 次 20、第 3 次 50、之后 100
// - 装备架已拥有的物品仍可显示（标"已拥有"），但不阻塞其他装备出现
//
// 详见 design/extraction/02-shop-randomization.md

import { ensureExtractionState, ShopSlot } from '../core/ExtractionState';
import { getItemDef, listItemsByCategory } from '../core/ExtractionRegistry';
import { spendCoins } from './Economy';
import { setBagMaxSlots } from './Inventory';

// =============================================
// 池配置（阶段 2 简化版；阶段 3 可改为 JSON）
// =============================================

const CONSUMABLE_POOL = ['airTankS', 'airTankM', 'airTankL', 'batteryWeak', 'batteryStd', 'batteryHigh', 'ropePack5', 'ropePack15'];
const EMERGENCY_POOL: string[] = []; // 阶段 3 添加 'beacon', 'sharkRepellent'
const EQUIPMENT_POOL = ['bag8', 'bag12', 'bag16', 'finsRacing', 'finsEndurance'];
// 特价池：从消耗品里抽，但价格 0.7×
const SPECIAL_POOL = CONSUMABLE_POOL;

const SHELF_SLOTS = {
    consumable: 3,
    emergency: 2,
    equipment: 2,
    special: 1,
};

const REROLL_COST_TABLE = [0, 20, 50, 100, 100, 100];

// =============================================
// 工具
// =============================================

function pickN(pool: string[], n: number, exclude: Set<string>): string[] {
    const cand = pool.filter(id => !exclude.has(id));
    const out: string[] = [];
    while (out.length < n && cand.length > 0) {
        const idx = Math.floor(Math.random() * cand.length);
        out.push(cand[idx]);
        cand.splice(idx, 1);
    }
    return out;
}

function nextSlotId(): number {
    if (!(globalThis as any).__shopSlotIdCounter) (globalThis as any).__shopSlotIdCounter = 1;
    const c = (globalThis as any).__shopSlotIdCounter as number;
    (globalThis as any).__shopSlotIdCounter = c + 1;
    return c;
}

// =============================================
// 价格策略
// =============================================

/** 商店售价（baseValue × 老板系数；阶段 2 简化为 1.0×；特价 0.7×） */
export function shopPriceFor(itemId: string, isSpecial: boolean): number {
    const def = getItemDef(itemId);
    if (!def) return 9999;
    const base = def.baseValue;
    if (isSpecial) return Math.max(1, Math.round(base * 0.7));
    return base;
}

// =============================================
// 刷新
// =============================================

/** 重新生成所有槽位（黄金矿工式：每个货架抽不同的 N 件） */
export function refreshShopSlots(): void {
    const ex = ensureExtractionState();
    const slots: ShopSlot[] = [];

    // 消耗品架：3 槽，从池里抽不重复
    {
        const picks = pickN(CONSUMABLE_POOL, SHELF_SLOTS.consumable, new Set());
        for (const id of picks) {
            slots.push({
                slotId: nextSlotId(),
                shelf: 'consumable',
                itemId: id,
                price: shopPriceFor(id, false),
                sold: false,
            });
        }
    }

    // 装备架：2 槽，从装备池里抽（已拥有的物品仍可出，UI 标"已拥有"）
    {
        const picks = pickN(EQUIPMENT_POOL, SHELF_SLOTS.equipment, new Set());
        for (const id of picks) {
            slots.push({
                slotId: nextSlotId(),
                shelf: 'equipment',
                itemId: id,
                price: shopPriceFor(id, false),
                sold: false,
            });
        }
    }

    // 特价架：1 槽，从消耗品池抽 1 件，价格 0.7×
    {
        const picks = pickN(SPECIAL_POOL, SHELF_SLOTS.special, new Set());
        for (const id of picks) {
            slots.push({
                slotId: nextSlotId(),
                shelf: 'special',
                itemId: id,
                price: shopPriceFor(id, true),
                sold: false,
            });
        }
    }

    // 应急架：阶段 2 暂无品，留空（阶段 3 启用）
    if (EMERGENCY_POOL.length > 0) {
        const picks = pickN(EMERGENCY_POOL, SHELF_SLOTS.emergency, new Set());
        for (const id of picks) {
            slots.push({
                slotId: nextSlotId(),
                shelf: 'emergency',
                itemId: id,
                price: shopPriceFor(id, false),
                sold: false,
            });
        }
    }

    if (!ex.shop) {
        ex.shop = { slots, rerollCount: 0, lastRefreshAt: Date.now() };
    } else {
        ex.shop.slots = slots;
        ex.shop.lastRefreshAt = Date.now();
    }
}

/** 确保 shop 已经初始化；首次进入商店时调用 */
export function ensureShopInitialized(): void {
    const ex = ensureExtractionState();
    if (!ex.shop || !ex.shop.slots || ex.shop.slots.length === 0) {
        refreshShopSlots();
        if (ex.shop) ex.shop.rerollCount = 0;
    }
}

/** 取下一次 reroll 的费用 */
export function getRerollCost(): number {
    const ex = ensureExtractionState();
    const idx = ex.shop ? ex.shop.rerollCount : 0;
    return REROLL_COST_TABLE[Math.min(idx, REROLL_COST_TABLE.length - 1)];
}

/** 玩家点"换一批" */
export function performShopReroll(): { ok: boolean; cost: number; reason?: string } {
    const ex = ensureExtractionState();
    if (!ex.shop) {
        ensureShopInitialized();
    }
    const cost = getRerollCost();
    if (cost > 0) {
        if (!spendCoins(cost)) return { ok: false, cost, reason: 'noCoin' };
    }
    refreshShopSlots();
    if (ex.shop) ex.shop.rerollCount++;
    return { ok: true, cost };
}

// =============================================
// 购买
// =============================================

/** 是否已拥有某件永久装备 */
export function isEquipmentOwned(itemId: string): boolean {
    const ex = ensureExtractionState();
    if (ex.ownedEquipment && ex.ownedEquipment.indexOf(itemId) >= 0) return true;
    // 兼容：背包基于 maxSlots 判定
    const def = getItemDef(itemId);
    if (def && (def as any).effects?.inventorySlots != null) {
        return ex.bag.maxSlots >= (def as any).effects.inventorySlots;
    }
    return false;
}

/** 取消耗品当前库存数量 */
export function getConsumableCount(itemId: string): number {
    const ex = ensureExtractionState();
    return (ex.consumables && ex.consumables[itemId]) || 0;
}

/** 加消耗品库存 */
export function addConsumable(itemId: string, n: number = 1): void {
    const ex = ensureExtractionState();
    if (!ex.consumables) ex.consumables = {};
    ex.consumables[itemId] = (ex.consumables[itemId] || 0) + n;
}

/** 消费一个消耗品（下潜开始时；不够返回 false） */
export function consumeConsumable(itemId: string, n: number = 1): boolean {
    const ex = ensureExtractionState();
    if (!ex.consumables) ex.consumables = {};
    const cur = ex.consumables[itemId] || 0;
    if (cur < n) return false;
    ex.consumables[itemId] = cur - n;
    if (ex.consumables[itemId] === 0) delete ex.consumables[itemId];
    return true;
}

/** 在某个 shop slot 购买 */
export function performShopBuySlot(slotId: number): { ok: boolean; reason?: string } {
    const ex = ensureExtractionState();
    if (!ex.shop) return { ok: false, reason: 'noShop' };

    const slot = ex.shop.slots.find(s => s.slotId === slotId);
    if (!slot) return { ok: false, reason: 'noSlot' };
    if (slot.sold) return { ok: false, reason: 'sold' };

    const def = getItemDef(slot.itemId);
    if (!def) return { ok: false, reason: 'unknownItem' };

    // 永久装备 + 已拥有 → 不允许重复购买
    if (def.category === 'equipment' && isEquipmentOwned(slot.itemId)) {
        return { ok: false, reason: 'owned' };
    }

    // 扣金
    if (!spendCoins(slot.price)) return { ok: false, reason: 'noCoin' };

    // 永久装备 → 加入 ownedEquipment + 应用效果（背包升级走 setBagMaxSlots）
    if (def.category === 'equipment') {
        if (ex.ownedEquipment.indexOf(slot.itemId) < 0) ex.ownedEquipment.push(slot.itemId);
        const eff = (def as any).effects;
        if (eff?.inventorySlots != null) {
            // 立刻应用（下次下潜生效；当前数据层马上变）
            setBagMaxSlots(eff.inventorySlots);
        }
        // 标售（装备槽位单件）
        slot.sold = true;
    } else if (def.category === 'consumable' || def.category === 'emergency') {
        // 消耗品 → 加库存（同一槽位可多次买）
        addConsumable(slot.itemId, 1);
        // 不置 sold（玩家可继续买同一件）
    }

    return { ok: true };
}
