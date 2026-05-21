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
//
// 屋内是一个宽于屏幕的横向卷轴场景（ROOM_WIDTH=1920，见 HomeRoom.ts）。
// 所有 actor 坐标都用"屋内 x"（0~ROOM_WIDTH），渲染时通过 cameraX 平移到屏幕。

import { state } from '../core/state';
import { logicW, logicH } from '../render/Canvas';
import { tickActors, consumePendingMoves } from './HomeActors';
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
import {
    ANCHORS,
    FLOOR_Y_RATIO,
    ROOM_WIDTH,
    clampCameraX,
    cameraXForFocus,
    ensureHomeAssetsRegistered,
} from './HomeRoom';

// =============================================
// 时长（帧；60fps）
// =============================================
const ARRIVING_FRAMES = 210;       // 3.5s
const KNOCK_AT_FRAME = 90;         // 进入 waiting_knock 后 1.5s 敲门
const KNOCK_TO_DOOR_FRAMES = 120;  // 2s 走到门口
const FADE_BLACK_FRAMES = 90;      // 1.5s 黑场
const FADE_IN_FRAMES = 60;         // 1s 由黑入景

// 镜头横向移动的插值速度（每帧靠近 target 的比例）
const CAMERA_LERP = 0.05;

// =============================================
// 入口：从营地切到家场景
//
// overrideSceneId：传入指定 sceneId 时进入"沙盒重玩"，使用该 scene 数据并不触发主存档推进。
//                  普通流程不传，根据 nightIndex 自动选 scene。
// =============================================
export function enterHomeScene(overrideSceneId?: string) {
    ensureHomeAssetsRegistered();

    let sceneId: string | null;
    if (overrideSceneId) {
        sceneId = overrideSceneId;
    } else {
        sceneId = pickSceneForNight(state.story2.nightIndex + 1);
    }
    const willCome = !!sceneId;

    const cw = logicW;
    const ch = logicH;
    const floorY = ch * FLOOR_Y_RATIO;

    // 初始镜头：聚焦"桌子"位置（男主默认归宿）
    const initialCameraX = cameraXForFocus(ANCHORS.desk, cw);

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
            // 男主从右屏外（屋内坐标系外侧）走入屋内 → 朝 desk 走
            man:  {
                x: ROOM_WIDTH + 120, y: floorY,
                targetX: ANCHORS.desk, targetY: floorY,
                pose: 'walk',
            },
            // 女孩初始隐藏，进 dialogue 时再从 door 外面出现
            girl: {
                x: ANCHORS.door - 80, y: floorY,
                targetX: ANCHORS.door - 80, targetY: floorY,
                visible: false, pose: 'stand',
            },
        },
        hotspotsClicked: [],
        sleepBtnVisible: false,
        knockPlayed: false,
        fadeAlpha: 1,
        fadeMode: 'in',
        cameraX: initialCameraX,
        cameraTargetX: initialCameraX,
        cameraInited: false,
        cameraUserDx: 0,
        cameraUserIdleFrames: 99999, // 初始视为已"空闲"，由 phase 自动控制镜头
    } as any;
    (state.home as any)._fadeDurationFrames = FADE_IN_FRAMES;
    (state.home as any)._fadeFrameTimer = 0;

    state.screen = 'home_evening';
    resetDialogue();
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

    // 镜头处理流程（玩家拖拽 vs phase 自动接管）：
    //   1. 累加空闲帧数
    //   2. 若有玩家本帧拖拽 dx → 直接修改 cameraX，重置空闲计数
    //   3. 否则按 phase 默认意图设置 cameraTargetX（在下面 switch 里）
    //   4. 空闲足够久时让 cameraX 朝 cameraTargetX 插值
    home.cameraUserIdleFrames = (home.cameraUserIdleFrames || 0) + 1;
    if (home.cameraUserDx && cameraAllowsUserDrag(home.phase)) {
        home.cameraX = clampCameraX(home.cameraX - home.cameraUserDx, cw);
        // 拖动后 cameraTargetX 暂时跟着走，避免下一帧瞬间拉回
        home.cameraTargetX = home.cameraX;
        home.cameraUserIdleFrames = 0;
    }
    home.cameraUserDx = 0;

    switch (home.phase) {
        case 'arriving':
            updateArriving(cw, ch);
            break;
        case 'waiting_knock':
            updateWaitingKnock(cw, ch);
            break;
        case 'dialogue':
            updateDialogue(cw, ch);
            break;
        case 'free':
            home.sleepBtnVisible = true;
            // free 阶段镜头跟随男主（柔和）
            home.cameraTargetX = cameraXForFocus(home.actors.man.x, cw);
            break;
        case 'sleeping':
            updateSleeping();
            break;
    }

    // 空闲一段时间后，让镜头朝 phase 默认意图回归
    // RECENTER_DELAY_FRAMES 之前完全尊重玩家拖拽，之后才插值
    const RECENTER_DELAY_FRAMES = 120; // 2s 空闲后开始回归
    if (home.cameraUserIdleFrames >= RECENTER_DELAY_FRAMES) {
        home.cameraTargetX = clampCameraX(home.cameraTargetX, cw);
        const lerp = home.phase === 'dialogue' ? CAMERA_LERP * 1.6 : CAMERA_LERP;
        home.cameraX += (home.cameraTargetX - home.cameraX) * lerp;
        if (Math.abs(home.cameraTargetX - home.cameraX) < 0.5) {
            home.cameraX = home.cameraTargetX;
        }
    } else {
        // 玩家刚操作不久：让 cameraTargetX 保持为 cameraX，
        // 这样 phase 在 switch 里设的 target 会被记下来，但本帧不生效（避免画面被瞬移拉回）。
        // 注意：phase 已经设了 cameraTargetX，我们不修改它——只是这一帧不做插值。
    }
}

// 当前 phase 是否允许玩家拖拽镜头
function cameraAllowsUserDrag(phase: string): boolean {
    // 入场/敲门/睡眠等纯演出阶段不让玩家干扰
    if (phase === 'arriving') return false;
    if (phase === 'sleeping') return false;
    // dialogue / waiting_knock / free 都允许拖拽
    return true;
}

function updateArriving(cw: number, ch: number) {
    const home: any = state.home;
    const floorY = ch * FLOOR_Y_RATIO;
    home.actors.man.targetX = ANCHORS.desk;
    home.actors.man.targetY = floorY;
    home.actors.man.pose = 'walk';

    // 镜头聚焦 desk
    home.cameraTargetX = cameraXForFocus(ANCHORS.desk, cw);

    if (home.timeInPhase >= ARRIVING_FRAMES) {
        gotoPhase('waiting_knock');
    }
}

function updateWaitingKnock(cw: number, ch: number) {
    const home: any = state.home;
    const floorY = ch * FLOOR_Y_RATIO;

    if (!home.knockPlayed && home.timeInPhase >= KNOCK_AT_FRAME && home.girlWillCome) {
        home.knockPlayed = true;
        try { playSFX('uiSecondary'); } catch { /* 无音效兜底 */ }
        // 男主朝门口走（站在门口屋内一侧）
        home.actors.man.targetX = ANCHORS.door - 80;
        home.actors.man.targetY = floorY;
        home.actors.man.pose = 'walk';
        // 镜头挪向门口
        home.cameraTargetX = cameraXForFocus(ANCHORS.door - 40, cw);
    }

    if (home.timeInPhase >= KNOCK_TO_DOOR_FRAMES) {
        if (home.girlWillCome) {
            // 进入对话：让女孩从门外（屋内右侧）走入屋内
            home.actors.girl.x = ANCHORS.door + 60;            // 起点：门外（右屏外）
            home.actors.girl.y = floorY;
            home.actors.girl.targetX = ANCHORS.door - 30;      // 目标：屋内门旁
            home.actors.girl.targetY = floorY;
            home.actors.girl.visible = true;
            home.actors.girl.pose = 'walk';
            beginCurrentScene();
            gotoPhase('dialogue');
        } else {
            gotoPhase('free');
        }
    }
}

function updateDialogue(cw: number, _ch: number) {
    const home: any = state.home;
    tickDialogue();

    // 对话期间，镜头聚焦门口（男主已走到 door-80，女孩在 door-30）
    // 两人都靠在门口附近——镜头取门口位置即可保证两人都在画面里
    home.cameraTargetX = cameraXForFocus(ANCHORS.door - 50, cw);

    if (isDialogueEnded()) {
        const girl = home.actors.girl;
        // 女孩还在屋内 → 让她朝 door 外面（右屏外）走
        if (girl.visible && girl.targetX < ANCHORS.door + 60) {
            girl.targetX = ANCHORS.door + 100;
            girl.pose = 'walk';
        }
        if (girl.x >= ANCHORS.door + 40) {
            girl.visible = false;
            enterFree();
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
    // 入睡前镜头柔和挪向床位
    home.cameraTargetX = cameraXForFocus(ANCHORS.bed, logicW);
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
    (home as any)._fadeFrameTimer = 0;
}

// =============================================
// 玩家拖拽镜头：由 input.ts touchmove 调用
// dx：手指本次移动的 x 增量（手指右滑 dx > 0）
//
// 屏幕 dx → 屋内 dx 的换算：屏幕宽度 screenWidth 对应屋内 ROOM_WIDTH * 0.5
// 所以 roomDx = dx * (ROOM_WIDTH * 0.5 / screenWidth)
// =============================================
const SCREEN_VIEW_RATIO_FOR_INPUT = 0.5; // 与 RenderHomeScene 保持一致

export function handleHomeDrag(dx: number, screenWidth: number) {
    const home: any = state.home;
    if (!home) return;
    if (home.fadeMode !== 'none') return;
    const viewW = ROOM_WIDTH * SCREEN_VIEW_RATIO_FOR_INPUT;
    const roomDx = dx * (viewW / screenWidth);
    home.cameraUserDx = (home.cameraUserDx || 0) + roomDx;
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

    // arriving / waiting_knock / sleeping 阶段忽略点击
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
