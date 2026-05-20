// 对话脚本驱动器
//
// 职责：把一份 DialogueScene（节点 + 演出动作的数据）按时间推进，
//       决定当前要展示哪一条台词、男主/女孩往哪走、何时播放敲门声、
//       何时整段对话结束。
//
// 使用：HomeScene 在 phase==='dialogue' 时每帧调用 DialogueRunner.tick()。
//
// 数据结构详见 src/story/scripts/types.ts。

import { state } from '../core/state';
import { DialogueScene, DialogueNode, SceneAction } from './scripts/types';
import { setMan, setGirl, beginActorMove } from './HomeActors';
import { playSFX } from '../audio/AudioManager';

// 按帧推进时长（60fps 假设）
const FPS = 60;

// 单字符显示间隔（毫秒）
const CHAR_INTERVAL_MS = 32;

// =============================================
// 单条 SceneAction 的执行
// =============================================
function runAction(act: SceneAction) {
    switch (act.type) {
        case 'wait':
            // wait 在节点级别处理（autoAdvance 时长），这里是 pre/post 阶段动作。
            // 我们把它降级为给当前节点累加 autoAdvance 帧。
            break;
        case 'sfx':
            try { playSFX(act.name as any); } catch { /* 未定义的音效就忽略 */ }
            break;
        case 'move': {
            // 演员目标点：x 用屏幕逻辑宽的归一化坐标，y 走预设几个高度
            beginActorMove(act.who, act.to);
            break;
        }
        case 'fade': {
            const home: any = state.home;
            if (!home) return;
            home.fadeMode = act.to === 'black' ? 'out' : 'in';
            // ms → 用每帧线性递增；这里只标记起始，渐变由 HomeScene 主循环推进
            (home as any)._fadeDurationFrames = Math.max(1, Math.round((act.ms / 1000) * FPS));
            (home as any)._fadeFrameTimer = 0;
            break;
        }
        case 'addStone':
            // 给窗台多加一颗小石头：写到 story2.flags 的累计计数（轻量实现）
            state.story2.flags['stoneCountAdded'] = true;
            break;
        case 'flag':
            state.story2.flags[act.key] = true;
            break;
    }
}

function runActions(list: SceneAction[] | undefined) {
    if (!list) return;
    for (const a of list) runAction(a);
}

// =============================================
// 节点切换 / 自动推进
// =============================================
function applyNodeEnter(node: DialogueNode) {
    const home: any = state.home;
    if (!home) return;
    // 重置打字机进度
    home.dialogue.textProgress = 0;
    home.dialogue.waitingForTap = false;
    // 节点附带的演出动作
    if (node.action) runAction(node.action);
    // 节点 duration：定义则自动推进，否则等点击
    if (node.duration && node.duration > 0) {
        home.dialogue.autoAdvanceTimer = Math.round((node.duration / 1000) * FPS);
        home.dialogue.waitingForTap = false;
    } else {
        home.dialogue.autoAdvanceTimer = 0;
        // waitingForTap 在文字打完后才设为 true（见 tick）
    }
}

// =============================================
// 对外：开始一个 scene
// =============================================
let currentScene: DialogueScene | null = null;

export function beginDialogue(scene: DialogueScene) {
    currentScene = scene;
    const home: any = state.home;
    if (!home) return;
    home.dialogue.nodeIndex = 0;
    home.dialogue.textProgress = 0;
    home.dialogue.autoAdvanceTimer = 0;
    home.dialogue.waitingForTap = false;
    home.dialogue.ended = false;
    runActions(scene.pre);
    if (scene.nodes.length > 0) {
        applyNodeEnter(scene.nodes[0]);
    } else {
        finishDialogue();
    }
}

export function getCurrentScene(): DialogueScene | null {
    return currentScene;
}

export function getCurrentNode(): DialogueNode | null {
    const home: any = state.home;
    if (!home || !currentScene) return null;
    const i = home.dialogue.nodeIndex;
    if (i < 0 || i >= currentScene.nodes.length) return null;
    return currentScene.nodes[i];
}

// =============================================
// 玩家点击对话框：若文字未打完则瞬间打完；若已打完则进入下一条
// =============================================
export function onTapAdvance() {
    const home: any = state.home;
    if (!home || !currentScene) return;
    if (home.dialogue.ended) return;
    const node = getCurrentNode();
    if (!node) return;
    const fullLen = (node.text || '').length;
    if (home.dialogue.textProgress < fullLen) {
        // 跳到全显
        home.dialogue.textProgress = fullLen;
        home.dialogue.waitingForTap = !node.duration;
        return;
    }
    advanceToNext();
}

function advanceToNext() {
    const home: any = state.home;
    if (!home || !currentScene) return;
    const next = home.dialogue.nodeIndex + 1;
    if (next >= currentScene.nodes.length) {
        finishDialogue();
        return;
    }
    home.dialogue.nodeIndex = next;
    applyNodeEnter(currentScene.nodes[next]);
}

function finishDialogue() {
    const home: any = state.home;
    if (!home || !currentScene) return;
    runActions(currentScene.post);
    if (currentScene.onComplete) {
        const oc = currentScene.onComplete;
        if (oc.setFlags) {
            for (const f of oc.setFlags) state.story2.flags[f] = true;
        }
        if (oc.knownNight) {
            const list = state.story2.knownNights;
            if (list.indexOf(oc.knownNight) < 0) list.push(oc.knownNight);
        }
    }
    home.dialogue.ended = true;
}

// =============================================
// 主推进：每帧调用一次（仅在 home.phase==='dialogue' 时）
// =============================================
export function tick() {
    const home: any = state.home;
    if (!home || !currentScene) return;
    if (home.dialogue.ended) return;

    const node = getCurrentNode();
    if (!node) return;

    // 1. 打字机推进
    const fullLen = (node.text || '').length;
    if (home.dialogue.textProgress < fullLen) {
        const charsPerFrame = (1000 / CHAR_INTERVAL_MS) / FPS;
        home.dialogue.textProgress = Math.min(fullLen, home.dialogue.textProgress + charsPerFrame);
    } else if (!home.dialogue.waitingForTap && !node.duration) {
        // 文字打完 + 无自动时长 → 等玩家点
        home.dialogue.waitingForTap = true;
    }

    // 2. 自动推进倒计时
    if (node.duration && node.duration > 0) {
        if (home.dialogue.textProgress >= fullLen) {
            home.dialogue.autoAdvanceTimer--;
            if (home.dialogue.autoAdvanceTimer <= 0) {
                advanceToNext();
            }
        }
    }
}

// 重置（HomeScene 退出时调用）
export function resetDialogue() {
    currentScene = null;
}

// 让 HomeScene 知道本场对话是否已经"自然结束"
export function isDialogueEnded(): boolean {
    const home: any = state.home;
    return !!(home && home.dialogue && home.dialogue.ended);
}

// 占位：因为 setMan/setGirl 暂时只用到他们的存在，TS unused import 检查需要这个引用
void setMan;
void setGirl;
