// 对话脚本注册表
//
// 用法：
//   - HomeScene 在切入家场景前调用 pickSceneForNight(N) 决定本晚走哪个 scene
//   - DialogueRunner 用 getSceneById 取实际的 DialogueScene 数据
//
// 当前规则：
//   - 第 1/4/7 晚有专属 scene。
//   - 其它晚暂时按"最近一个有 scene 的晚"作为占位（避免空场），
//     等剧本扩充再细化。

import { DialogueScene } from './types';
import { night_01_arrival } from './night_01_arrival';
import { night_04_silent } from './night_04_silent';
import { night_07_milk } from './night_07_milk';

const ALL_SCENES: DialogueScene[] = [
    night_01_arrival,
    night_04_silent,
    night_07_milk,
];

export function getSceneById(id: string): DialogueScene | null {
    return ALL_SCENES.find(s => s.id === id) ?? null;
}

export function getAllScenes(): readonly DialogueScene[] {
    return ALL_SCENES;
}

/**
 * 给定即将到来的 nightIndex（1-based），返回该晚要播的 sceneId。
 * 若当晚没有专属 scene，返回 null（HomeScene 会让 girlWillCome=false，玩家直接进 free 段）。
 *
 * 当前阶段只有 night_01 / night_04 / night_07 三个 scene。
 * 中间的 night_02/03/05/06 都是"她没来"的夜——这是合理的常态，剧情设计上女孩不必每晚都来。
 */
export function pickSceneForNight(nightIndex: number): string | null {
    const exact = ALL_SCENES.find(s => s.nightIndex === nightIndex);
    if (exact) return exact.id;
    // 没专属 scene 的夜，让女孩不来；玩家进屋自由片刻直接睡觉
    return null;
}
