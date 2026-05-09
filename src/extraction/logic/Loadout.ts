// 出发准备 + 装备运行时效果应用
//
// 阶段 1 简化版：
// - 没有"出发准备页"，下潜开始瞬间默认应用：4 格背包 + 普通脚蹼 +（如果有）默认电池/氧气瓶
// - 阶段 2 加入完整的出发准备 UI 后，这里会读 state.extraction.loadout 来决定装备
//
// 详见 design/extraction/04-loadout-and-inventory.md §五、§七

import { CONFIG } from '../../core/config';
import { player } from '../../core/state';
import { getEquipmentEffects, EquipmentEffects } from '../core/ExtractionRegistry';
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

// =============================================
// 应用装备效果
// =============================================

/**
 * 下潜启动时应用装备效果。
 *
 * 阶段 1：硬编码默认装备组合：
 *   - 背包：state.extraction.bag.maxSlots（来自永久装备，默认 4）
 *   - 脚蹼：阶段 1 不区分，统一 1.0×
 *   - 氧气瓶：阶段 1 用默认起始 100（与原迷宫一致）
 *   - 电池：阶段 1 用默认照射距离
 *
 * 阶段 2：从 state.extraction.loadout 读取玩家选择的装备 id，并合成 effects。
 */
export function applyLoadoutForDive(): void {
    const ex = ensureExtractionState();

    // 卸载之前可能未清干净的旧覆盖（异常防御）
    if (_appliedSnapshot) restoreLoadoutAfterDive();

    // 快照原始 CONFIG 值
    _appliedSnapshot = {
        lightRange: CONFIG.lightRange || 650,
        mazeMoveSpeed: (CONFIG.maze as any).moveSpeed || 24,
        breathO2Peak: (CONFIG.breath as any).o2PerBreathPeak || 2.5,
    };

    // 阶段 1：合并所有效果（目前只有背包）
    const merged: EquipmentEffects = {};
    // 背包容量（永久装备）—— 阶段 1 直接用 state.extraction.bag.maxSlots（已经记录了"当前装备的背包大小"）
    merged.inventorySlots = ex.bag.maxSlots;

    applyEffects(merged);
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
        player.o2 = Math.min(150, eff.startO2);
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
