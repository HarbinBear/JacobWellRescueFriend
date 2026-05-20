// 旧主线（熊子/潘子）的 13 个 stage 已全部废弃。
// 本类降级为通用文字提示工具，迷宫/竞技场仍可调用 showText 弹一行 alert。
// 视觉特效（屏震 / 红屏）已迁到 state.fx，由各系统直接读写，不再走本类。
// 新主线（《唐老师的救援》）的对话由 src/story/DialogueRunner.ts（阶段 3 新增）驱动。

import { state } from '../core/state';

export class StoryManager {
    constructor() {}

    // 保留 update 空壳，避免 game.ts 调用链断裂。
    update() {
        // no-op
    }

    showText(msg: string, color: string, duration: number = 3000) {
        state.alertMsg = msg;
        state.alertColor = color;
        if (state.msgTimer) clearTimeout(state.msgTimer as any);
        state.msgTimer = setTimeout(() => {
            state.alertMsg = '';
        }, duration) as any;
    }
}
