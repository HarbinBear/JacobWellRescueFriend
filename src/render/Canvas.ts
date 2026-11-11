import { CONFIG } from '../core/config';
import { getWindowMetrics, WindowMetrics } from '../core/WindowMetrics';

// Create canvas
export const canvas = wx.createCanvas();
export let ctx = canvas.getContext('2d');

// 同步绘制一层前景；所有旧绘制函数仍使用同一个实时绑定，异常时也归还主画布。
export function withCanvasContext(target: CanvasRenderingContext2D, draw: () => void) {
    const previous = ctx; ctx = target;
    try { draw(); } finally { ctx = previous; }
}

// 高清适配：使用设备像素比，解决文字和图形模糊问题
export let dpr = getWindowMetrics().pixelRatio;

// 画布物理尺寸 = 逻辑尺寸 × 设备像素比
canvas.width = CONFIG.screenWidth * dpr;
canvas.height = CONFIG.screenHeight * dpr;

// 逻辑尺寸（供绘制代码使用，等同于 CONFIG.screenWidth/Height）
export let logicW = CONFIG.screenWidth;
export let logicH = CONFIG.screenHeight;

// 缩放绘图上下文，让后续所有绘制代码仍使用逻辑像素坐标
ctx.scale(dpr, dpr);

export function resizeCanvas(metrics: WindowMetrics): boolean {
    const changed = logicW !== metrics.windowWidth || logicH !== metrics.windowHeight || dpr !== metrics.pixelRatio;
    logicW = CONFIG.screenWidth = metrics.windowWidth;
    logicH = CONFIG.screenHeight = metrics.windowHeight;
    CONFIG.uiSafeTop = metrics.safeTop;
    CONFIG.uiSafeBottom = metrics.safeBottom;
    CONFIG.uiSafeLeft = metrics.safeLeft;
    CONFIG.uiSafeRight = metrics.safeRight;
    dpr = metrics.pixelRatio;
    if (changed) {
        canvas.width = Math.round(logicW * dpr);
        canvas.height = Math.round(logicH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return changed;
}
