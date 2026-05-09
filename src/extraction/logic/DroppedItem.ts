// 水底丢弃物：玩家在下潜中从背包丢出的物品
//
// 与原 Relic 系统的区别：
// - Relic 是"地图固有的图鉴对象"，按 seed 刷新；玩家拾取后入背包不再出现
// - DroppedItem 是"玩家临时丢弃在水底的对象"；可以重新拾起
// - 当次下潜结束（撤离 / 死亡）后整体清空；不入存档
//
// 接入：
// - 玩家在背包详情卡点"丢弃" → 调 dropItemAtPlayer(item)
// - 拾取系统在 findNearbyPickupRelic 之外，再做一遍 findNearbyDroppedItem
// - 渲染层独立画 DroppedItem（小光点 + 旋转），不走 Relic 渲染
// - dive 钩子 onDiveStart / onDiveEnd 调 resetDroppedItems()

import { state, player } from '../../core/state';
import { CONFIG } from '../../core/config';
import { getItemDef } from '../core/ExtractionRegistry';
import { addToBag, canFitInBag } from './Inventory';

// =============================================
// 类型 + 容器
// =============================================

export interface DroppedItem {
    id: number;
    /** 物品 id（共享 ItemRegistry 的 itemId） */
    itemId: string;
    /** 品相档位（保留丢弃前的品相，重捡仍是这个品相） */
    condition: string;
    /** 占用格子数（缓存，重捡时校验背包） */
    slots: number;
    /** 世界坐标 */
    x: number;
    y: number;
    /** 落地后的小幅漂浮（让丢弃物有"水底沉浮"动效） */
    bobPhase: number;
    /** 创建时间（ms，仅用于动效） */
    createdAt: number;
}

let _items: DroppedItem[] = [];
let _nextId = 1;

// =============================================
// 公共 API
// =============================================

/** 取所有丢弃物（供渲染层使用） */
export function getDroppedItems(): DroppedItem[] {
    return _items;
}

/** 重置（每次下潜开始/结束清空） */
export function resetDroppedItems(): void {
    _items = [];
    _nextId = 1;
}

/** 在玩家身边放下一件物品（玩家身后偏下方一格距离） */
export function dropItemAtPlayer(itemId: string, condition: string, slots: number): DroppedItem | null {
    const def = getItemDef(itemId);
    if (!def) return null;

    // 落点：玩家正下方偏一点（避免和玩家碰撞），随机偏移避免堆叠
    const offsetR = 24 + Math.random() * 18;
    const offsetA = Math.random() * Math.PI * 2;
    const dx = Math.cos(offsetA) * offsetR;
    const dy = Math.sin(offsetA) * offsetR;

    const it: DroppedItem = {
        id: _nextId++,
        itemId,
        condition,
        slots,
        x: player.x + dx,
        y: player.y + dy,
        bobPhase: Math.random() * Math.PI * 2,
        createdAt: Date.now(),
    };
    _items.push(it);
    return it;
}

/** 找玩家附近最近的可拾取丢弃物（返回 null 表示无） */
export function findNearbyDroppedItem(): DroppedItem | null {
    if (_items.length === 0) return null;
    const range = pickupRange();
    let best: DroppedItem | null = null;
    let bestD = range;
    for (const it of _items) {
        const d = Math.hypot(player.x - it.x, player.y - it.y);
        if (d < bestD) {
            bestD = d;
            best = it;
        }
    }
    return best;
}

/** 按 id 查找 */
export function findDroppedItemById(id: number): DroppedItem | null {
    for (const it of _items) {
        if (it.id === id) return it;
    }
    return null;
}

/** 拾起一个丢弃物（成功则从场景移除并入背包） */
export interface PickupDroppedResult {
    ok: boolean;
    reason?: string;     // 'bagFull' / 'notFound'
}
export function pickupDroppedItem(id: number): PickupDroppedResult {
    const it = findDroppedItemById(id);
    if (!it) return { ok: false, reason: 'notFound' };
    if (!canFitInBag(it.slots)) return { ok: false, reason: 'bagFull' };

    const bagItem = addToBag(it.itemId, it.condition);
    if (!bagItem) return { ok: false, reason: 'bagFull' };

    // 从场景移除
    for (let i = 0; i < _items.length; i++) {
        if (_items[i].id === id) {
            _items.splice(i, 1);
            break;
        }
    }
    return { ok: true };
}

// =============================================
// 内部
// =============================================

function pickupRange(): number {
    const cfg: any = (CONFIG as any).extraction;
    return (cfg && cfg.pickupRange) || 180;
}
