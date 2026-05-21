// ===========================================================
// 家场景 · 屋内坐标系 + 锚点 + 资源配置中心
//
// 屋内是一个"宽于屏幕"的横向卷轴场景：
//   - ROOM_WIDTH 与当前背景图的实际像素宽度一致（运行时由 setRoomWidth 设置）
//   - 在背景图未加载完成前，使用 DEFAULT_ROOM_WIDTH 兜底
//   - 摄像机 cameraX = 屏幕左边缘在屋内坐标系里的 x，范围 [0, ROOM_WIDTH - cw]
//
// 锚点用**比例**定义（0~1），代表在屋内画面的横向位置。
// 实际屋内 x = 比例 × ROOM_WIDTH（由 anchorRoomX 计算）。
//
// 5 个功能分区在当前占位图（living_room_night.png 1536×1024）的实际比例：
//
//   左 ────────────────────────────────── 右
//   照片墙   桌+台灯+收音机   壁炉   窗户   沙发书架   玄关门
//   0.08     0.18             0.35   0.50   0.65       0.92
// ===========================================================

import { registerImage, getImage } from '../render/ImageAssets';

// 背景图默认宽度（占位图 1536×1024 的宽度）
export const DEFAULT_ROOM_WIDTH = 1536;
export let ROOM_WIDTH: number = DEFAULT_ROOM_WIDTH;

// 让背景图加载完成后由渲染层校正 ROOM_WIDTH
export function setRoomWidth(w: number) {
    if (w > 0 && Math.abs(w - ROOM_WIDTH) > 1) {
        ROOM_WIDTH = w;
    }
}

// ---- 锚点（屋内画面比例 0~1）----
// 比例式锚点对各种背景图尺寸都自适应，只要更换图时更新这里的比例即可。
export const ANCHOR_RATIOS = {
    photos: 0.08,   // 照片墙（小学毕业照伏笔在这里）
    desk:   0.18,   // 桌+台灯+收音机（男主默认位置）
    fire:   0.35,   // 壁炉（火光动效）
    window: 0.50,   // 窗户（星星动效）
    sofa:   0.65,   // 沙发/书架（中性对话位）
    door:   0.92,   // 玄关门（女孩进出场）
} as const;

// 计算锚点的屋内 x
export function anchorRoomX(key: keyof typeof ANCHOR_RATIOS): number {
    return ANCHOR_RATIOS[key] * ROOM_WIDTH;
}

// 旧调用方使用的"ANCHORS"对象语义保留，但用 getter 派生（兼容 HomeActors / HomeScene）
export const ANCHORS = {
    get door()   { return anchorRoomX('door'); },
    get desk()   { return anchorRoomX('desk'); },
    get window() { return anchorRoomX('window'); },
    get photos() { return anchorRoomX('photos'); },
    get sofa()   { return anchorRoomX('sofa'); },
    get fire()   { return anchorRoomX('fire'); },
    // bed 已不存在于这张图，复用 sofa 位置兼容旧脚本
    get bed()    { return anchorRoomX('sofa'); },
};

// 角色站立的地板线 y（屏幕高度的比例 0~1）
export const FLOOR_Y_RATIO = 0.82;

// ---- 资源 key ----
export const HOME_ASSET_KEYS = {
    bgNight: 'home_bg_night',
    girlStand:   'home_girl_stand',
    girlTalk:    'home_girl_talk',
    girlPlayful: 'home_girl_playful',
};

// ---- 启动时调用一次，预加载家场景图片资源 ----
let _registered = false;
export function ensureHomeAssetsRegistered() {
    if (_registered) return;
    _registered = true;
    registerImage(HOME_ASSET_KEYS.bgNight,     'images/home/living_room_night.png');
    registerImage(HOME_ASSET_KEYS.girlStand,   'images/home/characters/girl_stand.png');
    registerImage(HOME_ASSET_KEYS.girlTalk,    'images/home/characters/girl_talk.png');
    registerImage(HOME_ASSET_KEYS.girlPlayful, 'images/home/characters/girl_playful.png');
}

// ---- 渲染时调用：确认 ROOM_WIDTH 与图同步 ----
export function syncRoomWidthFromImage() {
    const img = getImage(HOME_ASSET_KEYS.bgNight);
    if (img && img.width) setRoomWidth(img.width);
}

// ---- 工具 ----
export function roomXToScreenX(roomX: number, cameraX: number): number {
    return roomX - cameraX;
}

// 屏幕宽度对应"屋内宽度"的多少。值越大左右视野越宽。
// 与 RenderHomeScene.SCREEN_VIEW_RATIO 保持一致。
const SCREEN_VIEW_RATIO = 0.5;

function viewWidthInRoom(_screenWidth: number): number {
    return ROOM_WIDTH * SCREEN_VIEW_RATIO;
}

export function clampCameraX(cameraX: number, screenWidth: number): number {
    const viewW = viewWidthInRoom(screenWidth);
    const maxX = Math.max(0, ROOM_WIDTH - viewW);
    if (cameraX < 0) return 0;
    if (cameraX > maxX) return maxX;
    return cameraX;
}

export function cameraXForFocus(focusRoomX: number, screenWidth: number): number {
    const viewW = viewWidthInRoom(screenWidth);
    return clampCameraX(focusRoomX - viewW / 2, screenWidth);
}

// 屋内 x 转屏幕 x（考虑横向缩放：屏幕宽度对应 viewW 屋内宽度）
export function roomXToScreenXScaled(roomX: number, cameraX: number, screenWidth: number): number {
    const viewW = viewWidthInRoom(screenWidth);
    return ((roomX - cameraX) / viewW) * screenWidth;
}
