// 家场景状态机
//
// phase 推进：
//   arriving        男主从屏幕右侧走到桌边（约 3.5s 自动演出）
//      ↓
//   waiting_knock   屋内静一拍 → 敲门声 → 男主走向门口（约 2.0s）
//      ↓ 若 girlWillCome=true
//   dialogue        女孩入场 → 对话 → 女孩离场
//      ↓
//   free            玩家在屋内自由片刻（点屋内热点 / 看夜色 / 点"睡觉"）
//      ↓
//   sleeping        黑场 → nightIndex++ → 切回营地
//
//   若 girlWillCome=false：waiting_knock 直接跳过 dialogue 进 free。
//
// 入口：MazeLogic.goHome() 切换到本场景。
// 退出：sleeping 阶段结束后调用 exitHomeScene()。

import { state } from '../core/state';
import { logicW, logicH } from '../render/Canvas';
import { setMan, setGirl, tickActors, consumePendingMoves } from './HomeActors';
import {
    beginDialogue,
    tick as tickDialogue,
    isDialogueEnded,
    resetDialogue,
    onTapAdvance,
} from './DialogueRunner';
import { pickSceneForNight, getSceneById } from './scripts/_index';
import { playSFX } from '../audio/AudioManager';
import { saveMazeProgress } from '../logic/MazeSave';
import { saveStoryProgress } from './StoryProgressSave';

// =============================================
// 时长（帧；60fps）
// =============================================
const ARRIVING_FRAMES = 210;       // 3.5s
const KNOCK_AT_FRAME = 90;         // 进入 waiting_knock 后 1.5s 敲门
const KNOCK_TO_DOOR_FRAMES = 120;  // 2s 走到门口
const FADE_BLACK_FRAMES = 90;      // 1.5s 黑场
const FADE_IN_FRAMES = 60;         // 1s 由黑入景

// =============================================
// 入口：从营地切到家场景
//
// overrideSceneId：传入指定 sceneId 时进入"沙盒重玩"，使用该 scene 数据并不触发主存档推进。
//                  普通流程不传，根据 nightIndex 自动选 scene。
// =============================================
export function enterHomeScene(overrideSceneId?: string) {
    let sceneId: string | null;
    if (overrideSceneId) {
        sceneId = overrideSceneId;
    } else {
        sceneId = pickSceneForNight(state.story2.nightIndex + 1);
    }
    const willCome = !!sceneId;

    const cw = logicW;
    const ch = logicH;

    state.home = {
        phase: 'arriving',
        timeInPhase: 0,
        sceneId: sceneId ?? '',
        girlWillCome: willCome,
        dialogue: {
            nodeIndex: 0,
            textProgress: 0,
            autoAdvanceTimer: 0,
            waitingForTap: false,
            ended: false,
        },
        actors: {
            man:  { x: cw * 1.05, y: ch * 0.62, targetX: cw * 0.22, targetY: ch * 0.62, pose: 'walk' },
            girl: { x: cw * 1.10, y: ch * 0.62, targetX: cw * 1.10, targetY: ch * 0.62, visible: false, pose: 'stand' },
        },
        hotspotsClicked: [],
        sleepBtnVisible: false,
        knockPlayed: false,
        fadeAlpha: 1,
        fadeMode: 'in',
    } as any;
    (state.home as any)._fadeDurationFrames = FADE_IN_FRAMES;
    (state.home as any)._fadeFrameTimer = 0;

    state.screen = 'home_evening';
    resetDialogue();

    void setMan;
    void setGirl;
}

// =============================================
// 离开家场景：黑场结束后调用
//
// 沙盒模式（_isProgressSandbox=true）下：不推进 nightIndex / dayHadAnyDive，直接回主菜单。
// 普通模式：nightIndex++、dayHadAnyDive=false，回到营地。
// =============================================
function exitHomeScene() {
    const sandbox = !!(state as any)._isProgressSandbox;
    state.home = null;
    resetDialogue();

    if (sandbox) {
        (state as any)._isProgressSandbox = false;
        state.screen = 'menu';
        return;
    }

    state.story2.nightIndex = (state.story2.nightIndex || 0) + 1;
    state.story2.dayHadAnyDive = false;
    state.screen = 'mazeRescue';
    saveMazeProgress();
    saveStoryProgress();
}

// =============================================
// 主循环：每帧调用
// =============================================
export function updateHome() {
    const home: any = state.home;
    if (!home) return;
    if (state.screen !== 'home_evening') return;

    const cw = logicW;
    const ch = logicH;

    home.timeInPhase++;

    // 黑场推进（与 phase 无关，独立）
    updateFade();

    // 让脚本里 'move' 动作可以用屏幕实际尺寸计算目标
    consumePendingMoves(cw, ch);

    // 演员位置插值
    tickActors();

    switch (home.phase) {
        case 'arriving':
            updateArriving(cw, ch);
            break;
        case 'waiting_knock':
            updateWaitingKnock(cw, ch);
            break;
        case 'dialogue':
            tickDialogue();
            // 当对话标记为 ended 后，让女孩走到 exit
            if (isDialogueEnded()) {
                const girl = home.actors.girl;
                // 还没安排离场就安排
                if (girl.visible && girl.targetX < cw) {
                    girl.targetX = cw * 1.1;
                    girl.targetY = ch * 0.62;
                    girl.pose = 'walk';
                }
                if (girl.x >= cw * 1.05) {
                    girl.visible = false;
                    enterFree();
                }
            }
            break;
        case 'free':
            // 等玩家点睡觉按钮 / 屋内热点
            home.sleepBtnVisible = true;
            break;
        case 'sleeping':
            updateSleeping();
            break;
    }
}

function updateArriving(cw: number, ch: number) {
    const home: any = state.home;
    // 给男主目标点 = desk
    home.actors.man.targetX = cw * 0.22;
    home.actors.man.targetY = ch * 0.62;
    if (home.timeInPhase >= ARRIVING_FRAMES) {
        gotoPhase('waiting_knock');
    }
}

function updateWaitingKnock(cw: number, ch: number) {
    const home: any = state.home;
    if (!home.knockPlayed && home.timeInPhase >= KNOCK_AT_FRAME && home.girlWillCome) {
        home.knockPlayed = true;
        try { playSFX('uiSecondary'); } catch { /* 无音效兜底 */ }
        // 男主朝门口走
        home.actors.man.targetX = cw * 0.7;
        home.actors.man.targetY = ch * 0.62;
        home.actors.man.pose = 'walk';
    }
    if (home.timeInPhase >= KNOCK_TO_DOOR_FRAMES) {
        if (home.girlWillCome) {
            // 进入对话：让女孩从门外出现
            home.actors.girl.x = cw * 1.05;
            home.actors.girl.y = ch * 0.62;
            home.actors.girl.targetX = cw * 0.78;
            home.actors.girl.targetY = ch * 0.62;
            home.actors.girl.visible = true;
            home.actors.girl.pose = 'walk';
            beginCurrentScene();
            gotoPhase('dialogue');
        } else {
            // 她不来 → 直接进 free
            gotoPhase('free');
        }
    }
}

function beginCurrentScene() {
    const home: any = state.home;
    if (!home || !home.sceneId) return;
    const scene = getSceneById(home.sceneId);
    if (scene) beginDialogue(scene);
}

function enterFree() {
    gotoPhase('free');
}

function updateSleeping() {
    const home: any = state.home;
    // 等到黑场满
    if (home.fadeAlpha >= 1 && home.fadeMode === 'out') {
        exitHomeScene();
    }
}

function updateFade() {
    const home: any = state.home;
    if (home.fadeMode === 'none') return;
    const total = (home as any)._fadeDurationFrames || 60;
    (home as any)._fadeFrameTimer = ((home as any)._fadeFrameTimer || 0) + 1;
    const t = Math.min(1, (home as any)._fadeFrameTimer / total);
    if (home.fadeMode === 'in') {
        home.fadeAlpha = 1 - t;
        if (t >= 1) home.fadeMode = 'none';
    } else if (home.fadeMode === 'out') {
        home.fadeAlpha = t;
        // 由各 phase 自己监听 fadeAlpha>=1 来决定下一步
    }
}

function gotoPhase(p: string) {
    const home: any = state.home;
    if (!home) return;
    home.phase = p;
    home.timeInPhase = 0;
}

// =============================================
// 玩家点击屏幕：分发到当前 phase
// 由 input.ts 调用
// =============================================
export function handleHomeTap(tx: number, ty: number) {
    const home: any = state.home;
    if (!home) return;

    // 黑场期间忽略点击
    if (home.fadeMode !== 'none') return;

    if (home.phase === 'dialogue') {
        // 任意点击都推进对话
        onTapAdvance();
        return;
    }

    if (home.phase === 'free') {
        // 检查是否点了"睡觉"按钮
        const cw = logicW, ch = logicH;
        const btnRect = getSleepBtnRect(cw, ch);
        if (tx >= btnRect.x && tx <= btnRect.x + btnRect.w &&
            ty >= btnRect.y && ty <= btnRect.y + btnRect.h) {
            try { playSFX('uiPrimary'); } catch { /* */ }
            startSleep();
            return;
        }
        // 后续可在此处理屋内热点（窗台/合影/抽屉等）
    }

    // arriving / waiting_knock / sleeping 阶段忽略点击（可加 skip 选项以后再说）
}

export function getSleepBtnRect(cw: number, ch: number) {
    const w = 132, h = 40;
    return { x: cw - w - 18, y: ch - h - 24, w, h };
}

// =============================================
// 沙盒重玩：从剧情进度页指定 sceneId 进入家场景
// 不推进 nightIndex，结束后回主菜单
// =============================================
export function replayNight(sceneId: string) {
    (state as any)._isProgressSandbox = true;
    enterHomeScene(sceneId);
}

function startSleep() {
    const home: any = state.home;
    if (!home) return;
    home.phase = 'sleeping';
    home.timeInPhase = 0;
    home.sleepBtnVisible = false;
    home.fadeMode = 'out';
    home.fadeAlpha = 0;
    (home as any)._fadeDurationFrames = FADE_BLACK_FRAMES;
    (home as any)._fadeFrameTimer = 0;
}
