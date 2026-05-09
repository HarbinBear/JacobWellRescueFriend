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
import { getTreasureByRelicKind } from '../core/ExtractionRegistry';
import { rollCondition, getItemDisplayName, computeItemPrice } from './Economy';
import { addToBag, canFitInBag } from './Inventory';
import { getExtractionState, ensureExtractionState } from '../core/ExtractionState';
import type { Relic } from '../../logic/Relic';

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

/** 每次下潜开始：清空本次拾取记录 + 清空飘字 */
export function resetPickupForDive(): void {
    const ex = ensureExtractionState();
    ex.diveSession.pickedRelicIds = [];
    _pickupHints = [];
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

