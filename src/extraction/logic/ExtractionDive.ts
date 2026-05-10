// 下潜钩子：MazeLogic 与撤离玩法的唯一接口
//
// 设计目标：
// - 现有 MazeLogic.startMazeDive / finishMazeDive 末尾各加一行钩子调用即可
// - 不让 MazeLogic 关心撤离玩法的内部结构
// - 钩子内部负责：装备应用、背包重置、撤离结算、存档落盘

import { CONFIG } from '../../core/config';
import { applyLoadoutForDive, restoreLoadoutAfterDive } from './Loadout';
import { resetPickupForDive } from './ItemPickup';
import { settleDiveExtraction, ExtractReason, DiveSettlement } from './Economy';
import { saveExtractionProgress } from '../core/ExtractionSave';
import { ensureExtractionState } from '../core/ExtractionState';

// =============================================
// 模块级状态：上一次撤离结算结果
// 由 onDiveEnd 写入，debrief UI 读取后展示
// =============================================
let _lastSettlement: DiveSettlement | null = null;

export function getLastSettlement(): DiveSettlement | null {
    return _lastSettlement;
}

export function clearLastSettlement(): void {
    _lastSettlement = null;
}

// =============================================
// 是否启用撤离玩法（统一开关）
// =============================================
function isExtractionEnabled(): boolean {
    const ex: any = (CONFIG as any).extraction;
    return ex && ex.enabled !== false;  // 默认启用
}

// =============================================
// 下潜开始钩子
// =============================================

/**
 * MazeLogic.startMazeDive 末尾调用。
 * 职责：
 * 1. 确保 state.extraction 已初始化
 * 2. 应用装备效果（背包大小、消耗品起始 O2 / 电池等）
 * 3. 清空本次拾取记录
 */
export function onDiveStart(): void {
    if (!isExtractionEnabled()) return;
    ensureExtractionState();
    applyLoadoutForDive();
    resetPickupForDive();
    // 注意：本次背包应当从空开始（玩家上次撤离时已经清空了）
    // 防御：以防万一上一次没清干净（保持稀疏槽位结构）
    const ex = ensureExtractionState();
    const n = Math.max(1, ex.bag.maxSlots | 0);
    ex.bag.items = new Array(n).fill(null) as any;
}

// =============================================
// 下潜结束钩子
// =============================================

/**
 * MazeLogic.finishMazeDive 末尾调用。
 * 职责：
 * 1. 还原装备效果对 CONFIG 的覆盖
 * 2. 按撤离原因结算背包（成功/半成功/失败）
 * 3. 保存撤离存档（金币、仓库已更新）
 *
 * @param reason 撤离原因，传入 MazeLogic 的 returnReason
 */
export function onDiveEnd(reason: string): void {
    if (!isExtractionEnabled()) return;

    // 把 MazeLogic 的 returnReason 映射到撤离玩法的 ExtractReason
    let mapped: ExtractReason;
    switch (reason) {
        case 'retreat':  mapped = 'retreat';  break;
        case 'o2':       mapped = 'o2';       break;
        case 'fishkill': mapped = 'fishkill'; break;
        case 'rescued':  mapped = 'rescued';  break;
        case 'beacon':   mapped = 'beacon';   break;
        default:         mapped = 'retreat';  break;
    }

    const settlement = settleDiveExtraction(mapped);
    _lastSettlement = settlement;

    // 还原 CONFIG 覆盖
    restoreLoadoutAfterDive();

    // 落盘
    saveExtractionProgress();
}

// =============================================
// 模块级"是否启用"导出（供 UI 渲染前检查）
// =============================================
export const ExtractionEnabled = isExtractionEnabled;
