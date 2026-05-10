// 水下战利品（Relic）拾取交互
//
// 阶段 1 设计：
// - 玩家走近 Relic（< pickupRange） → 走轮盘按钮（与氧气瓶轮盘范式一致）
// - 轮盘扇区显示 "拾取 XX"
// - 选中后立刻：(a) roll 品相 (b) 入背包 (c) 把 relic 加入 diveSession.pickedRelicIds
// - 当次下潜内不再出现该 relic；下次下潜按 seed 重刷
//
// 与 Marker.ts 的接入：
// - Marker.ts 的 detectWheelContext() 会被扩展一个 'pickupRelic' 上下文
// - executeWheelAction() 会被扩展一个 'pickupRelic' 动作分支
// - 这两处是阶段 1 仅有的"对现有代码的扩展"

import { state, player } from '../../core/state';
import { CONFIG } from '../../core/config';
import { getTreasureByRelicKind, getItemDef } from '../core/ExtractionRegistry';
import { rollCondition, getItemDisplayName, computeItemPrice } from './Economy';
import { addToBag, canFitInBag } from './Inventory';
import { getExtractionState, ensureExtractionState } from '../core/ExtractionState';
import type { Relic } from '../../logic/Relic';
import {
    findNearbyDroppedItem,
    pickupDroppedItem,
    findDroppedItemById,
    dropItemAtPlayer,
    DroppedItem,
    resetDroppedItems,
} from './DroppedItem';

// =============================================
// 拾取目标统一抽象（Relic + DroppedItem）
// =============================================

export type PickupTargetKind = 'relic' | 'dropped';

export interface PickupTarget {
    kind: PickupTargetKind;
    /** Relic id 或 DroppedItem id */
    id: number;
    /** 显示名（轮盘 label 用） */
    label: string;
    /** 世界坐标（飘字用） */
    x: number;
    y: number;
}

/**
 * 找玩家附近最近的可拾取目标（先 Relic 后 DroppedItem，距离最近优先）
 */
export function findNearbyPickupTarget(): PickupTarget | null {
    const relic = findNearbyPickupRelic();
    const dropped = findNearbyDroppedItem();

    // 都没有
    if (!relic && !dropped) return null;

    // 只有一个
    if (relic && !dropped) {
        const def = getTreasureByRelicKind(relic.kind);
        return {
            kind: 'relic',
            id: relic.id,
            label: def ? '拾取 · ' + def.name : '拾取',
            x: relic.x,
            y: relic.y,
        };
    }
    if (!relic && dropped) {
        const def = getItemDef(dropped.itemId);
        return {
            kind: 'dropped',
            id: dropped.id,
            label: def ? '拾起 · ' + def.name : '拾起',
            x: dropped.x,
            y: dropped.y,
        };
    }

    // 两个都有：选距离更近的
    const r = relic!;
    const d = dropped!;
    const dr = Math.hypot(player.x - r.x, player.y - r.y);
    const dd = Math.hypot(player.x - d.x, player.y - d.y);
    if (dd <= dr) {
        const def = getItemDef(d.itemId);
        return {
            kind: 'dropped',
            id: d.id,
            label: def ? '拾起 · ' + def.name : '拾起',
            x: d.x,
            y: d.y,
        };
    } else {
        const def = getTreasureByRelicKind(r.kind);
        return {
            kind: 'relic',
            id: r.id,
            label: def ? '拾取 · ' + def.name : '拾取',
            x: r.x,
            y: r.y,
        };
    }
}

/** 统一的拾取入口（Relic 走 performPickup；DroppedItem 走 performPickupDropped） */
export function performPickupTarget(target: PickupTarget): PickupResult {
    if (target.kind === 'relic') {
        return performPickup(target.id);
    } else {
        return performPickupDropped(target.id);
    }
}

/** 拾起一个丢弃物 */
export function performPickupDropped(droppedId: number): PickupResult {
    const it = findDroppedItemById(droppedId);
    if (!it) return { ok: false, reason: 'noRelic' };

    const def = getItemDef(it.itemId);
    if (!def) return { ok: false, reason: 'unknownItem' };

    if (!canFitInBag(it.slots)) {
        pushPickupHint('背包已满 (' + it.slots + ' 格)', it.x, it.y);
        return { ok: false, reason: 'bagFull' };
    }

    const r = pickupDroppedItem(droppedId);
    if (!r.ok) {
        if (r.reason === 'bagFull') pushPickupHint('背包已满', it.x, it.y);
        return { ok: false, reason: r.reason };
    }

    // 飘字反馈："拾起 完美的怀表"（不显示金额，因为已经在仓库估算过了）
    const display = getItemDisplayName(def.id, it.condition);
    pushPickupHint('✓ ' + display, it.x, it.y);

    return {
        ok: true,
        displayName: display,
        fromX: it.x,
        fromY: it.y,
    };
}

// =============================================
// 配置（默认值，未来可走 CONFIG.extraction.*）
// =============================================

function pickupRange(): number {
    const cfg: any = (CONFIG as any).extraction;
    return (cfg && cfg.pickupRange) || 180;
}

/** 取拾取范围（导出供 UI 渲染调试圆圈） */
export function getPickupRange(): number {
    return pickupRange();
}

// =============================================
// 找玩家附近最近的可拾取 relic
// =============================================

/**
 * 返回玩家附近最近的可拾取 relic（未在本次下潜被拾取的）；
 * 如果没找到返回 null。
 */
export function findNearbyPickupRelic(): Relic | null {
    const maze = state.mazeRescue;
    if (!maze) return null;
    const relics: Relic[] = (maze as any).relics || [];
    if (relics.length === 0) return null;

    const ex = getExtractionState();
    const picked = ex ? ex.diveSession.pickedRelicIds : [];
    const pickedSet = new Set(picked);

    const range = pickupRange();
    let best: Relic | null = null;
    let bestD = range;
    for (const r of relics) {
        if (pickedSet.has(r.id)) continue;
        const d = Math.hypot(player.x - r.x, player.y - r.y);
        if (d < bestD) { bestD = d; best = r; }
    }
    return best;
}

/**
 * 给定 relic id 查找具体 relic 对象（轮盘上下文执行时用）
 */
function findRelicByIdInMaze(id: number): Relic | null {
    const maze = state.mazeRescue;
    if (!maze) return null;
    const relics: Relic[] = (maze as any).relics || [];
    for (const r of relics) {
        if (r.id === id) return r;
    }
    return null;
}

// =============================================
// 执行拾取动作（轮盘选中"拾取"扇区时调用）
// =============================================

export interface PickupResult {
    /** 是否成功拾取 */
    ok: boolean;
    /** 失败原因（'bagFull' / 'unknownItem' / 'noRelic'） */
    reason?: string;
    /** 成功时的物品展示名（含品相前缀）；UI 用 */
    displayName?: string;
    /** 成功时的世界坐标（飞入背包动画用） */
    fromX?: number;
    fromY?: number;
}

export function performPickup(relicId: number): PickupResult {
    const relic = findRelicByIdInMaze(relicId);
    if (!relic) return { ok: false, reason: 'noRelic' };

    // 用 relic.kind 查物品定义（kind 与 itemId 同名）
    const def = getTreasureByRelicKind(relic.kind);
    if (!def) return { ok: false, reason: 'unknownItem' };

    // 容量检查
    if (!canFitInBag(def.slots)) {
        // 飘字提示"背包已满"
        pushPickupHint('背包已满 (' + def.slots + ' 格)', relic.x, relic.y);
        return { ok: false, reason: 'bagFull' };
    }

    // 品相 roll（拾取瞬间确定）
    const condition = rollCondition(def.conditionPool);

    // 入背包
    const item = addToBag(def.id, condition);
    if (!item) {
        pushPickupHint('背包已满', relic.x, relic.y);
        return { ok: false, reason: 'bagFull' };
    }

    // 标记本次下潜已拾取
    const ex = ensureExtractionState();
    if (ex.diveSession.pickedRelicIds.indexOf(relic.id) < 0) {
        ex.diveSession.pickedRelicIds.push(relic.id);
    }

    // 拾取成功飘字："✓ 完美的怀表 +600 金"
    const display = getItemDisplayName(def.id, condition);
    const price = computeItemPrice(def.id, condition);
    pushPickupHint('✓ ' + display + '  +' + price + ' 金', relic.x, relic.y);

    return {
        ok: true,
        displayName: display,
        fromX: relic.x,
        fromY: relic.y,
    };
}

// =============================================
// 提示文字工具
// =============================================

/** 轮盘扇区显示的标签："拾取 · 物品名" */
export function getRelicPickupLabel(relicId: number): string {
    const relic = findRelicByIdInMaze(relicId);
    if (!relic) return '拾取';
    const def = getTreasureByRelicKind(relic.kind);
    if (!def) return '拾取';
    return '拾取 · ' + def.name;
}

// =============================================
// 下潜钩子
// =============================================

/** 每次下潜开始/结束：清空本次拾取记录 + 清空飘字 + 清空丢弃物 */
export function resetPickupForDive(): void {
    const ex = ensureExtractionState();
    ex.diveSession.pickedRelicIds = [];
    _pickupHints = [];
    resetDroppedItems();
}

// =============================================
// 丢弃物品（背包 → 水底丢弃物）
// =============================================

/** 把背包某件物品丢到水底（玩家身边落下，可重新拾起） */
export function discardBagItemAtPlayer(itemUniqueId: number): {
    ok: boolean;
    reason?: string;
} {
    const ex = ensureExtractionState();
    // 稀疏槽位数组：通过 id 找到槽位索引（注意 null 跳过）
    let idx = -1;
    for (let i = 0; i < ex.bag.items.length; i++) {
        const b = ex.bag.items[i];
        if (b && b.id === itemUniqueId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, reason: 'notFound' };

    const it = ex.bag.items[idx]!;
    const def = getItemDef(it.itemId);
    if (!def) return { ok: false, reason: 'unknownItem' };

    // 落到玩家身边
    const dropped = dropItemAtPlayer(it.itemId, it.condition, it.slots);
    if (!dropped) return { ok: false, reason: 'dropFailed' };

    // 从背包移除（保留槽位结构：置 null 而非 splice）
    ex.bag.items[idx] = null;

    // 飘字提示
    pushPickupHint('丢弃 ' + getItemDisplayName(it.itemId, it.condition), dropped.x, dropped.y);

    return { ok: true };
}

// =============================================
// 拾取飘字（世界层米色小字 + 上浮淡出，类似 Relic 的发现 hint）
// =============================================

export interface PickupHint {
    text: string;
    x: number;
    y: number;
    life: number;        // 已存活帧数
    maxLife: number;     // 总帧数
}

let _pickupHints: PickupHint[] = [];

/** 推一条飘字（世界坐标） */
function pushPickupHint(text: string, x: number, y: number): void {
    _pickupHints.push({
        text,
        x,
        y: y - 36,
        life: 0,
        maxLife: 90,
    });
    // 限制最多 6 条
    if (_pickupHints.length > 6) _pickupHints.shift();
}

/** 每帧推进飘字（由 ExtractionDive 钩子或 RenderRelic 调用） */
export function updatePickupHints(): void {
    if (_pickupHints.length === 0) return;
    const kept: PickupHint[] = [];
    for (const h of _pickupHints) {
        h.life += 1;
        h.y -= 0.6;
        if (h.life < h.maxLife) kept.push(h);
    }
    _pickupHints = kept;
}

/** 取所有飘字（渲染层用） */
export function getPickupHints(): PickupHint[] {
    return _pickupHints;
}

