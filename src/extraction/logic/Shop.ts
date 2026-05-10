// 商店刷新与购买逻辑（黄金矿工式）
//
// 设计：所有商品平等，不做"消耗品/装备/特价"分类
//   - 一次刷出 SHOP_TOTAL_SLOTS 个槽位（默认 8）
//   - 商品池来源：消耗品池 + 装备池 + （阶段 3）应急品池
//   - 每次刷新随机指定 1~2 件作为"今日特价"（0.7× 价），用 slot.isSpecial 标记
//
// 刷新规则：
// - 进入岸上时若 shop.slots 不存在则首次刷新
// - "换一批"按钮触发：第 1 次免费、第 2 次 20、第 3 次 50、之后 100
// - 装备可重复购买（升级是消耗式装备）
//
// 详见 design/extraction/02-shop-randomization.md（旧分类设计已弃用）

import { ensureExtractionState, ShopSlot } from '../core/ExtractionState';
import { getItemDef, listItemsByCategory } from '../core/ExtractionRegistry';
import { spendCoins } from './Economy';
import { setBagMaxSlots } from './Inventory';

// =============================================
// 池配置
// =============================================

const CONSUMABLE_POOL = ['airTankS', 'airTankM', 'airTankL', 'batteryWeak', 'batteryStd', 'batteryHigh', 'ropePack5', 'ropePack15'];
const EMERGENCY_POOL: string[] = []; // 阶段 3 添加 'beacon', 'sharkRepellent'
const EQUIPMENT_POOL = ['bag8', 'bag12', 'bag16', 'finsRacing', 'finsEndurance'];

/** 商店一次刷出的槽位总数 */
const SHOP_TOTAL_SLOTS = 8;
/** 每次刷新随机抽多少个槽走特价 */
const SPECIAL_SLOT_COUNT = 1;

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

/** 商店售价（baseValue × 老板系数；普通 1.0×，特价 0.7×；价格不少于 1） */
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

/**
 * 重新生成所有槽位（不分类版本）：
 * - 把消耗品 + 装备 + 应急三个池合并，按总数 SHOP_TOTAL_SLOTS 抽
 * - 同 itemId 不重复（一次刷新里）
 * - 随机挑 SPECIAL_SLOT_COUNT 个槽走特价（标 isSpecial=true，价格 0.7×）
 *
 * 备注：装备类槽位 sold=true 表示这次已被买走（同次内不再买，下次刷新才会再出）
 *       消耗品类槽位 sold 永远 false（可重复购买）
 */
export function refreshShopSlots(): void {
    const ex = ensureExtractionState();

    // 合并所有池
    const fullPool: string[] = [];
    for (const id of CONSUMABLE_POOL) fullPool.push(id);
    for (const id of EQUIPMENT_POOL) fullPool.push(id);
    for (const id of EMERGENCY_POOL) fullPool.push(id);

    // 抽 SHOP_TOTAL_SLOTS 个不重复的 itemId
    const picks = pickN(fullPool, SHOP_TOTAL_SLOTS, new Set());

    // 随机选若干个走特价
    const specialIdxSet = new Set<number>();
    {
        const indices = picks.map((_, i) => i);
        for (let n = 0; n < SPECIAL_SLOT_COUNT && indices.length > 0; n++) {
            const i = Math.floor(Math.random() * indices.length);
            specialIdxSet.add(indices[i]);
            indices.splice(i, 1);
        }
    }

    const slots: ShopSlot[] = [];
    for (let i = 0; i < picks.length; i++) {
        const id = picks[i];
        const isSpecial = specialIdxSet.has(i);
        slots.push({
            slotId: nextSlotId(),
            shelf: 'shelf',         // 已不分类；保留字段兼容旧结构
            itemId: id,
            price: shopPriceFor(id, isSpecial),
            sold: false,
            isSpecial,
        });
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

// =============================================
// 装备库存查询（取代旧的 isEquipmentOwned 概念）
// =============================================

/**
 * 当前持有某件装备的数量（含正穿在身上的那件）。
 *
 * 保底装备（bag4 / finsBasic）始终视作 1（穿在身上，永远在）。
 * 其他装备从 equipmentStock 读取。
 */
export function getEquipmentStock(itemId: string): number {
    if (itemId === 'bag4' || itemId === 'finsBasic') return 1;
    const ex = ensureExtractionState();
    const n = (ex.equipmentStock && ex.equipmentStock[itemId]) || 0;
    // 当前装备的那件如果不在 stock 里（例如老存档迁移路径），仍然显示 1
    if (n === 0 && (ex.equipped?.bag === itemId || ex.equipped?.fins === itemId)) return 1;
    return n;
}

/**
 * 旧 API：是否"已拥有"。
 * 在新模型下，只用来判断保底装备是否买重复（没意义，永远拥有）。
 * 升级装备一律返回 false（允许重复买作为备用件）。
 *
 * @deprecated 新代码请用 getEquipmentStock(); UI 应展示"持有 N"
 */
export function isEquipmentOwned(itemId: string): boolean {
    return itemId === 'bag4' || itemId === 'finsBasic';
}

// =============================================
// 装备槽位 / 自动装上更优件
// =============================================

/** 装备等级（数字越大越好，仅用于自动装上"刚买的更好的那件"） */
function equipmentTier(itemId: string): number {
    switch (itemId) {
        case 'bag4':          return 1;
        case 'bag8':          return 2;
        case 'bag12':         return 3;
        case 'bag16':         return 4;
        case 'finsBasic':     return 1;
        case 'finsEndurance': return 2;
        case 'finsRacing':    return 3;
        default:              return 0;
    }
}

/** 装备类别：'bag' 或 'fins'，其它返回 null */
function equipmentSlotKind(itemId: string): 'bag' | 'fins' | null {
    if (itemId === 'bag4' || itemId === 'bag8' || itemId === 'bag12' || itemId === 'bag16') return 'bag';
    if (itemId === 'finsBasic' || itemId === 'finsRacing' || itemId === 'finsEndurance') return 'fins';
    return null;
}

/**
 * 当某件升级装备库存归零（被失败撤离销毁），自动回退到次优。
 * 选择规则：从同槽位的所有装备里挑库存 > 0 的、tier 最高的；都没有就回到保底。
 */
export function fallbackEquippedSlot(slot: 'bag' | 'fins'): string {
    const ex = ensureExtractionState();
    const candidates = slot === 'bag'
        ? ['bag16', 'bag12', 'bag8']
        : ['finsRacing', 'finsEndurance'];
    for (const id of candidates) {
        if ((ex.equipmentStock?.[id] || 0) > 0) {
            return id;
        }
    }
    return slot === 'bag' ? 'bag4' : 'finsBasic';
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

    // 扣金
    if (!spendCoins(slot.price)) return { ok: false, reason: 'noCoin' };

    // 永久装备 → 入装备库存（stock++）；如果比当前装备更好，自动装上
    if (def.category === 'equipment') {
        if (!ex.equipmentStock) ex.equipmentStock = {};
        ex.equipmentStock[slot.itemId] = (ex.equipmentStock[slot.itemId] || 0) + 1;

        const slotKind = equipmentSlotKind(slot.itemId);
        if (slotKind) {
            if (!ex.equipped) ex.equipped = { bag: 'bag4', fins: 'finsBasic' };
            const curEquipped = slotKind === 'bag' ? ex.equipped.bag : ex.equipped.fins;
            // 如果新买的等级 ≥ 当前装备的等级，自动换上（== 时也换，因为可能从 stock 取首件）
            if (equipmentTier(slot.itemId) >= equipmentTier(curEquipped)) {
                if (slotKind === 'bag') {
                    ex.equipped.bag = slot.itemId;
                    const eff = (def as any).effects;
                    if (eff?.inventorySlots != null) {
                        setBagMaxSlots(eff.inventorySlots);
                    }
                } else {
                    ex.equipped.fins = slot.itemId;
                    // fins 的 moveSpeedMul / o2DrainMul 在下次下潜 applyLoadoutForDive 时生效
                }
            }
        }
        // 标售（装备槽位单件，下次刷新才会再出）
        slot.sold = true;
    } else if (def.category === 'consumable' || def.category === 'emergency') {
        // 消耗品 → 加库存（同一槽位可多次买）
        addConsumable(slot.itemId, 1);
        // 不置 sold（玩家可继续买同一件）
    }

    return { ok: true };
}
