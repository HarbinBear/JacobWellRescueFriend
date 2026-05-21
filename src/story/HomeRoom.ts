// ===========================================================
// 家场景 · 屋内坐标系 + 锚点 + 资源配置中心
//
// 屋内是一个"宽于屏幕"的横向卷轴场景：
//   - 屋内逻辑宽度 ROOM_WIDTH = 1920（任意单位，比屏幕宽 cw 大）
//   - 屋内高度对齐到屏幕高度 ch（背景图按屏高拉伸，按 ROOM_WIDTH 横向铺开）
//   - 摄像机 cameraX 表示屏幕左边缘在屋内坐标系里的 x，取值范围 [0, ROOM_WIDTH - cw]
//
// 5 个功能分区（功能位置写死，定稿背景图的实际像素布局需要适配这套锚点）：
//
//   x = 0 ───── 384 ───── 768 ───── 1152 ───── 1536 ───── 1920
//        │玄关  │ 桌+收音机 │ 窗      │ 照片墙   │ 床/抽屉   │
//        │ door │ desk      │ window  │ photos   │ bed       │
// ===========================================================

import { registerImage } from '../render/ImageAssets';

// ---- 屋内逻辑尺寸 ----
export const ROOM_WIDTH = 1920;

// ---- 锚点（屋内 x 坐标）----
//   y 坐标在渲染时由屏幕高度推导（actors 站在地板线上）
export const ANCHORS = {
    door:    180,   // 玄关 · 女孩入场点 / 男主到家时第一步
    desk:    640,   // 桌子 · 男主默认位置
    window:  960,   // 窗户中心 · 中性对话位
    photos:  1280,  // 照片墙
    bed:     1740,  // 床 · 入睡终点
} as const;

// 角色站立的地板线 y（屏幕高度的比例 0~1）
export const FLOOR_Y_RATIO = 0.78;

// ---- 资源 key ----
export const HOME_ASSET_KEYS = {
    bgNight: 'home_bg_night',
};

// ---- 启动时调用一次，预加载家场景图片资源 ----
let _registered = false;
export function ensureHomeAssetsRegistered() {
    if (_registered) return;
    _registered = true;
    registerImage(HOME_ASSET_KEYS.bgNight, 'images/home/living_room_night.png');
}

// ---- 工具：把"屋内 x"转换为"屏幕 x"（考虑当前 cameraX）----
export function roomXToScreenX(roomX: number, cameraX: number): number {
    return roomX - cameraX;
}

// ---- 工具：clamp cameraX 到合法范围 ----
export function clampCameraX(cameraX: number, screenWidth: number): number {
    const maxX = Math.max(0, ROOM_WIDTH - screenWidth);
    if (cameraX < 0) return 0;
    if (cameraX > maxX) return maxX;
    return cameraX;
}

// ---- 工具：根据"想居中观察的屋内 x"反推 cameraX ----
export function cameraXForFocus(focusRoomX: number, screenWidth: number): number {
    return clampCameraX(focusRoomX - screenWidth / 2, screenWidth);
}
