// 出发准备 + 装备运行时效果应用
//
// 阶段 1 简化版：
// - 没有"出发准备页"，下潜开始瞬间默认应用：4 格背包 + 普通脚蹼 + 简易潜水衣 + 默认电池/氧气瓶
// - 阶段 2 加入完整的出发准备 UI 后，这里会读 state.extraction.loadout 来决定装备
//
// 详见 design/extraction/04-loadout-and-inventory.md §五、§七

import { CONFIG } from '../../core/config';
import { player, state } from '../../core/state';
import { getEquipmentEffects, getItemDef, EquipmentEffects } from '../core/ExtractionRegistry';
import { ensureExtractionState } from '../core/ExtractionState';
import { setBagMaxSlots } from './Inventory';

// =============================================
// 运行时覆盖快照（卸载时还原）
// =============================================

interface ConfigSnapshot {
    lightRange: number;
    mazeMoveSpeed: number;
    breathO2Peak: number;
}

let _appliedSnapshot: ConfigSnapshot | null = null;

// 本次下潜实际带的氧气瓶（最多两瓶，按等级降序；带的 itemId 列表）。
// 用于 HUD 双圈氧气环、潜水员双气瓶视觉、撤离结算等读取。
let _activeAirTanks: string[] = [];

/** 按氧气瓶 id 推断单瓶起始氧气（从 ItemRegistry 取 startO2，未知值兜底 60） */
function tankCapacity(id: string): number {
    const eff = getEquipmentEffects(id);
    return Math.max(0, (eff?.startO2 ?? 60));
}

/** 装备等级（数字越大越好） */
function airTankTier(id: string): number {
    if (id === 'airTankL') return 3;
    if (id === 'airTankM') return 2;
    if (id === 'airTankS') return 1;
    return 0;
}

/**
 * 选出本次下潜要带的氧气瓶（最多两瓶）。
 *
 * 规则：
 * - 从 consumables 库存里挑等级最高的两个氧气瓶（同款也算两瓶）
 * - 不足两件用 'airTankS'（保底兜底，永远视为可用）
 * - 至少返回一件（兜底单 S）
 *
 * 不在这里直接消耗库存，留给调用方消耗（避免发生"应用失败但库存已扣"的尴尬）
 */
function pickAirTanksForDive(): string[] {
    const ex = ensureExtractionState();
    const owned: string[] = [];
    if (ex.consumables) {
        for (const id of Object.keys(ex.consumables)) {
            if (id === 'airTankS' || id === 'airTankM' || id === 'airTankL') {
                const n = ex.consumables[id] | 0;
                for (let i = 0; i < n; i++) owned.push(id);
            }
        }
    }
    // 按 tier 降序
    owned.sort((a, b) => airTankTier(b) - airTankTier(a));

    const picked = owned.slice(0, 2);
    if (picked.length === 0) {
        // 完全没有 → 单瓶保底
        return ['airTankS'];
    }
    return picked;
}

/** 消耗本次下潜挑出的氧气瓶（保底 airTankS 不入 consumables，不消耗） */
function consumeAirTanks(tanks: string[]): void {
    const ex = ensureExtractionState();
    if (!ex.consumables) ex.consumables = {};
    for (const id of tanks) {
        if (id === 'airTankS' && (ex.consumables[id] || 0) === 0) {
            // 兜底瓶：库存里没有时不扣
            continue;
        }
        const cur = ex.consumables[id] || 0;
        if (cur > 0) {
            ex.consumables[id] = cur - 1;
            if (ex.consumables[id] === 0) delete ex.consumables[id];
        }
    }
}

/** 取本次下潜实际带着的氧气瓶 id 列表（用于 HUD 双圈、潜水员双瓶视觉） */
export function getActiveAirTanks(): string[] {
    return _activeAirTanks.slice();
}

/**
 * 在下潜开始前，按"自动选最优"规则把 equipped 拉到 stock 中最高 tier 的那件。
 *
 * 规则：
 * - 候选 = 保底装备 + equipmentStock[id] > 0 的所有同槽装备
 * - 选 tier 最大的那一件作为本次 equipped
 *
 * 这样玩家始终带着拥有的最好装备下水，无需手动切换；
 * 与 Shop 购买时的"自动装上更好"配合形成完整的"最优自动"体验。
 */
function autoSelectBestEquipment(): void {
    const ex = ensureExtractionState();
    if (!ex.equipped) ex.equipped = { bag: 'bag4', fins: 'finsBasic', suit: 'suitBasic' };
    if (!ex.equipmentStock) ex.equipmentStock = {};

    const pickBest = (slot: 'bag' | 'fins' | 'suit') => {
        const baseline = slot === 'bag' ? 'bag4' : slot === 'fins' ? 'finsBasic' : 'suitBasic';
        const upgrades = slot === 'bag'
            ? ['bag16', 'bag12', 'bag8']
            : slot === 'fins'
                ? ['finsRacing', 'finsEndurance']
                : ['suitCCR', 'suitDeep'];
        for (const id of upgrades) {
            if ((ex.equipmentStock[id] || 0) > 0) return id;
        }
        return baseline;
    };
    ex.equipped.bag = pickBest('bag');
    ex.equipped.fins = pickBest('fins');
    ex.equipped.suit = pickBest('suit');
}

// =============================================
// 应用装备效果
// =============================================

/**
 * 下潜启动时应用装备效果。
 *
 * 装备来源（消耗式装备模型）：
 *   - 背包：state.extraction.equipped.bag（默认保底 'bag4'）
 *   - 脚蹼：state.extraction.equipped.fins（默认保底 'finsBasic'）
 *   - 潜水衣：state.extraction.equipped.suit（默认保底 'suitBasic'）
 *   - 氧气瓶：从 consumables 自动挑等级最高的最多两瓶（无任何库存时保底单瓶 airTankS）
 *   一并从 ExtractionRegistry 取 effects 合并应用
 *
 * 阶段 2：未来如果加"出发准备页"，可以让玩家手动从 equipmentStock 选择装备一件作为本次出战；
 * 现在简单粗暴用 equipped。
 */
export function applyLoadoutForDive(): void {
    const ex = ensureExtractionState();

    // 卸载之前可能未清干净的旧覆盖（异常防御）
    if (_appliedSnapshot) restoreLoadoutAfterDive();

    // 下潜前先把"持有最好的"拉成 equipped（与"购买时自动装上"配合，确保任何时候都带最优）
    autoSelectBestEquipment();

    // 快照原始 CONFIG 值
    _appliedSnapshot = {
        lightRange: CONFIG.lightRange || 650,
        mazeMoveSpeed: (CONFIG.maze as any).moveSpeed || 24,
        breathO2Peak: (CONFIG.breath as any).o2PerBreathPeak || 2.5,
    };

    // 合并装备效果（背包 + 脚蹼 + 潜水衣）
    const merged: EquipmentEffects = {};
    const bagId = ex.equipped?.bag || 'bag4';
    const finsId = ex.equipped?.fins || 'finsBasic';
    const suitId = ex.equipped?.suit || 'suitBasic';

    const bagEff = getEquipmentEffects(bagId);
    if (bagEff?.inventorySlots != null) {
        merged.inventorySlots = bagEff.inventorySlots;
    } else {
        merged.inventorySlots = ex.bag.maxSlots;  // 兜底：用持久化的 maxSlots
    }

    const finsEff = getEquipmentEffects(finsId);
    if (finsEff) {
        if (finsEff.moveSpeedMul != null) merged.moveSpeedMul = finsEff.moveSpeedMul;
        if (finsEff.o2DrainMul != null) merged.o2DrainMul = finsEff.o2DrainMul;
    }

    const suitEff = getEquipmentEffects(suitId);
    if (suitEff?.maxDepthMeters != null) {
        merged.maxDepthMeters = suitEff.maxDepthMeters;
    }

    applyEffects(merged);

    // === 氧气瓶：从 consumables 自动挑最高的最多两瓶 ===
    _activeAirTanks = pickAirTanksForDive();
    consumeAirTanks(_activeAirTanks);
    // 把所有氧气瓶的 startO2 累加 → 本次最大氧气；player.o2 也设为该值（满槽下水）
    let totalO2 = 0;
    for (const id of _activeAirTanks) totalO2 += tankCapacity(id);
    if (totalO2 <= 0) totalO2 = 60;  // 极端兜底
    player.o2Max = totalO2;
    player.o2 = totalO2;

    // 把潜水衣的最大安全深度（米）写入 maze 运行时数据，给 HUD / 渲染层读
    const maze: any = state.mazeRescue;
    if (maze) {
        maze.maxDepthAllowed = merged.maxDepthMeters || 30;
        // 同步初始化 oxygenFeedback.o2DisplayAnim 到满值，避免环从 100 缩到 60 的视觉漂移
        if (maze.oxygenFeedback) {
            maze.oxygenFeedback.o2DisplayAnim = totalO2;
        }
    }
    // 调试日志（控制台一行，方便确认当次配置）
    const tankNames = _activeAirTanks.map(id => getItemDef(id)?.name || id).join(' + ');
    console.log('[Loadout] tanks=' + tankNames + ' totalO2=' + totalO2 + ' suit=' + suitId);
}

/**
 * 下潜结束（任何方式）时还原 CONFIG 默认值。
 */
export function restoreLoadoutAfterDive(): void {
    if (!_appliedSnapshot) return;
    CONFIG.lightRange = _appliedSnapshot.lightRange;
    (CONFIG.maze as any).moveSpeed = _appliedSnapshot.mazeMoveSpeed;
    (CONFIG.breath as any).o2PerBreathPeak = _appliedSnapshot.breathO2Peak;
    _appliedSnapshot = null;
    // 还原 o2Max 为主线/竞技场默认值，避免影响其他模式
    player.o2Max = 100;
    _activeAirTanks = [];
}

// =============================================
// 内部：把 effects 应用到 CONFIG / player
// =============================================

function applyEffects(eff: EquipmentEffects): void {
    if (eff.inventorySlots != null) {
        setBagMaxSlots(eff.inventorySlots);
    }
    if (eff.flashlightRangeMul != null) {
        CONFIG.lightRange = (_appliedSnapshot!.lightRange) * eff.flashlightRangeMul;
    }
    if (eff.moveSpeedMul != null) {
        (CONFIG.maze as any).moveSpeed = (_appliedSnapshot!.mazeMoveSpeed) * eff.moveSpeedMul;
    }
    if (eff.o2DrainMul != null) {
        (CONFIG.breath as any).o2PerBreathPeak = (_appliedSnapshot!.breathO2Peak) * eff.o2DrainMul;
    }
    if (eff.startO2 != null) {
        // 兼容老路径：已废弃。新路径在 applyLoadoutForDive 里直接按双瓶累加设置 player.o2 / o2Max
        player.o2 = Math.min(player.o2Max || 100, eff.startO2);
    }
    // startRopeCount 阶段 1 暂不使用（绳索系统目前是无限的）
}

// =============================================
// 装备购买后的"立即生效"
// =============================================

/**
 * 玩家购买永久装备后立刻应用到 state.extraction（运行时数据）。
 * 阶段 1 仅支持背包（修改 maxSlots）。
 */
export function equipPermanent(itemId: string): boolean {
    const eff = getEquipmentEffects(itemId);
    if (!eff) return false;
    if (eff.inventorySlots != null) {
        setBagMaxSlots(eff.inventorySlots);
        return true;
    }
    return false;
}
