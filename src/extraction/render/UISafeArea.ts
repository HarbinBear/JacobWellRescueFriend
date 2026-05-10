// UI 安全区：统一所有 UI 元素的留白规则
//
// 屏幕顶部存在两个不可遮挡区域：
// 1. 微信小游戏右上角胶囊（关闭/胶囊按钮）—— 大约 88×32，紧贴右边
// 2. 设备前置摄像头 / 状态栏（iPhone 刘海等）—— 顶部 ~44px
//
// 因此所有"贴顶"UI 必须满足：
// - 顶部至少留出 SAFE_TOP（避开胶囊和摄像头）
// - 右上角至少留出 SAFE_RIGHT（不与胶囊重叠）
// - 顶部居中也要避开胶囊（胶囊横跨右上）
//
// 这个文件是单一数据源，外部任何贴顶 UI 都应 import 这里的常量。

/** 顶部安全留白：所有"贴顶"UI 的 y 起点最小值 */
export const SAFE_TOP = 62;

/** 右侧安全留白：避开微信胶囊（约 88px 宽 + 留白） */
export const SAFE_RIGHT = 110;

/** 左侧安全留白（贴左 UI 的 x 起点） */
export const SAFE_LEFT = 14;

/** 底部安全留白（贴底按钮的距底距离基线） */
export const SAFE_BOTTOM = 14;

/**
 * 计算"顶部右上区域可用宽度"：
 *   把胶囊区当作不可点击区
 *   返回从左侧到胶囊左边缘的可用横向空间宽度
 */
export function getTopUsableWidth(cw: number): number {
    return cw - SAFE_RIGHT;
}

/**
 * 一个常用的"贴左顶"按钮位置
 *   x = SAFE_LEFT，y = SAFE_TOP
 */
export function topLeftSlot(): { x: number; y: number } {
    return { x: SAFE_LEFT, y: SAFE_TOP };
}

/**
 * 一个常用的"贴右顶（避开胶囊）"按钮位置
 *   y = SAFE_TOP，x = cw - btnW - SAFE_RIGHT
 */
export function topRightSlot(cw: number, btnW: number): { x: number; y: number } {
    return { x: cw - btnW - SAFE_RIGHT, y: SAFE_TOP };
}
