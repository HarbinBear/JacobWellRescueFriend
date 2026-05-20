// 主线（《唐老师的救援》）剧情进度存档
//
// 与 MazeSave 分离：MazeSave 存"营地玩法状态"（地图种子、绳索、装备等），
// 本模块存"主线推进状态"（nightIndex / knownNights / dayHadAnyDive / 剧情 flag）。
//
// 单 key 体积小（< 1KB），不需要压缩。
//
// 调用时机：
//   - HomeScene.exitHomeScene() 推进 nightIndex 后写一次
//   - DialogueScene 的 onComplete 给 knownNights 加一项后写一次（由 HomeScene 在 sleeping 阶段完成统一存）
//   - 主菜单"新游戏"清空时调用 clearStoryProgress()
//   - 启动时 loadStoryProgress() 恢复

import { state } from '../core/state';
import { saveJSON, loadJSON, removeKey } from '../core/SaveStorage';

const KEY = 'story2_v1';
const VERSION = 1;

interface StoryProgressData {
    version: number;
    timestamp: number;
    nightIndex: number;
    flags: { [key: string]: boolean };
    knownNights: string[];
    girlVisitCount: number;
    girlMissedCount: number;
}

export function saveStoryProgress(): boolean {
    const data: StoryProgressData = {
        version: VERSION,
        timestamp: Date.now(),
        nightIndex: state.story2.nightIndex || 0,
        flags: { ...state.story2.flags },
        knownNights: state.story2.knownNights.slice(),
        girlVisitCount: state.story2.girlVisitCount || 0,
        girlMissedCount: state.story2.girlMissedCount || 0,
    };
    return saveJSON(KEY, data);
}

export function loadStoryProgress(): boolean {
    const data = loadJSON<StoryProgressData>(KEY);
    if (!data) return false;
    if (data.version !== VERSION) {
        console.warn('[StoryProgress] 版本不兼容，丢弃。档=' + data.version + ' 当前=' + VERSION);
        return false;
    }
    state.story2.nightIndex = data.nightIndex || 0;
    state.story2.flags = data.flags || {};
    state.story2.knownNights = Array.isArray(data.knownNights) ? data.knownNights.slice() : [];
    state.story2.girlVisitCount = data.girlVisitCount || 0;
    state.story2.girlMissedCount = data.girlMissedCount || 0;
    state.story2.dayHadAnyDive = false; // 启动时一律视为新一天
    console.log('[StoryProgress] 恢复成功，第 ' + state.story2.nightIndex + ' 晚，已解锁 ' + state.story2.knownNights.length + ' 个 scene');
    return true;
}

export function clearStoryProgress(): void {
    removeKey(KEY);
    state.story2.nightIndex = 0;
    state.story2.flags = {};
    state.story2.knownNights = [];
    state.story2.girlVisitCount = 0;
    state.story2.girlMissedCount = 0;
    state.story2.dayHadAnyDive = false;
}
