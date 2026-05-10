// 撤离玩法独立存档（key: extraction_save_v1）
//
// 与 maze_save_v3 物理隔离的原因：
// - 玩家清掉迷宫存档（换地图）→ 经济数据不丢
// - 玩家清掉经济存档（重置经济）→ 迷宫数据不丢
// - 经济玩法可以单独关闭（CONFIG.extraction.enabled = false）
//
// 详见 design/extraction/07-engineering-isolation.md §3

import { state } from '../../core/state';
import { saveJSON, loadJSON, removeKey } from '../../core/SaveStorage';
import {
    ExtractionState,
    getExtractionState,
    getInitialExtractionState,
    patchExtractionState,
} from './ExtractionState';

export const EXTRACTION_SAVE_KEY = 'extraction_save_v1';
export const EXTRACTION_SAVE_VERSION = 1;

interface ExtractionSaveData {
    version: number;
    timestamp: number;
    state: ExtractionState;
}

/**
 * 是否存在撤离存档
 */
export function hasExtractionSave(): boolean {
    const data = loadJSON<ExtractionSaveData>(EXTRACTION_SAVE_KEY);
    if (!data) return false;
    if (data.version !== EXTRACTION_SAVE_VERSION) return false;
    if (!data.state) return false;
    return true;
}

/**
 * 保存当前撤离玩法进度
 *
 * 注意：保存时会**清空 diveSession**，因为它是运行时数据；
 * 背包(bag.items) 也清空，因为下潜中存档不应保留临时背包内容
 * （成功撤离会自动入仓库，死亡撤离会清空，本就不该跨 session 保留）。
 */
export function saveExtractionProgress(): boolean {
    const ex = getExtractionState();
    if (!ex) {
        console.warn('[ExtractionSave] state.extraction 未初始化，跳过保存');
        return false;
    }

    // 拷贝一份用于序列化，避免修改运行时数据
    const snapshot: ExtractionState = {
        version: ex.version,
        coins: ex.coins,
        reputation: ex.reputation,
        warehouse: ex.warehouse.slice(),
        nextItemId: ex.nextItemId,
        bag: {
            // 永久装备的容量保存（运行时由装备效果覆盖；这里存当前值）
            maxSlots: ex.bag.maxSlots,
            // 不保存背包临时内容（稀疏槽位保持空）
            items: new Array(Math.max(1, ex.bag.maxSlots | 0)).fill(null) as any,
        },
        diveSession: {
            pickedRelicIds: [],
        },
        consumables: { ...(ex.consumables || {}) },
        ownedEquipment: (ex.ownedEquipment || []).slice(),
        // shop 是运行时态，不保存
        flags: {
            tutorialShown: ex.flags.tutorialShown,
        },
        stats: {
            totalCoinsEarned: ex.stats.totalCoinsEarned,
            totalDives: ex.stats.totalDives,
            totalPickups: ex.stats.totalPickups,
        },
    };

    const data: ExtractionSaveData = {
        version: EXTRACTION_SAVE_VERSION,
        timestamp: Date.now(),
        state: snapshot,
    };

    const ok = saveJSON(EXTRACTION_SAVE_KEY, data);
    if (ok) {
        try {
            const approxSize = JSON.stringify(data).length;
            const kb = Math.round(approxSize / 1024);
            console.log('[ExtractionSave] 已保存（v1），大小约 ' + kb + ' KB（金币=' + ex.coins + '，仓库 ' + ex.warehouse.length + ' 件）');
        } catch (e) { /* 忽略 */ }
    }
    return ok;
}

/**
 * 从本地读取并恢复撤离玩法进度
 * 读不到/版本不兼容/数据损坏时不影响游戏，state.extraction 会被初始化为新手起步状态。
 */
export function loadExtractionProgress(): boolean {
    const data = loadJSON<ExtractionSaveData>(EXTRACTION_SAVE_KEY);
    if (!data) {
        // 没有存档：初始化为新手起步状态
        (state as any).extraction = getInitialExtractionState();
        console.log('[ExtractionSave] 无存档，初始化为新手起步状态');
        return false;
    }
    if (data.version !== EXTRACTION_SAVE_VERSION) {
        console.warn('[ExtractionSave] 存档版本不兼容（' + data.version + ' vs ' + EXTRACTION_SAVE_VERSION + '），重置');
        (state as any).extraction = getInitialExtractionState();
        return false;
    }
    if (!data.state) {
        console.warn('[ExtractionSave] 存档数据不完整，重置');
        (state as any).extraction = getInitialExtractionState();
        return false;
    }

    // 老存档兜底：补缺失字段
    const patched = patchExtractionState(data.state);
    (state as any).extraction = patched;
    console.log('[ExtractionSave] 存档恢复成功（v1），金币=' + patched.coins + '，仓库 ' + patched.warehouse.length + ' 件');
    return true;
}

/**
 * 清除撤离存档（GM 调试用 / 玩家主动重置经济）
 */
export function clearExtractionSave(): void {
    removeKey(EXTRACTION_SAVE_KEY);
    (state as any).extraction = getInitialExtractionState();
    console.log('[ExtractionSave] 撤离存档已清除并重置为新手起步状态');
}
