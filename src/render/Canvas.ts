import { CONFIG } from '../core/config';

// Create canvas
export const canvas = wx.createCanvas();
export const ctx = canvas.getContext('2d');

// 高清适配：使用设备像素比，解决文字和图形模糊问题
const sysInfo = wx.getSystemInfoSync();
export const dpr = sysInfo.pixelRatio || 2;

// 画布物理尺寸 = 逻辑尺寸 × 设备像素比
canvas.width = CONFIG.screenWidth * dpr;
canvas.height = CONFIG.screenHeight * dpr;

// 逻辑尺寸（供绘制代码使用，等同于 CONFIG.screenWidth/Height）
export const logicW = CONFIG.screenWidth;
export const logicH = CONFIG.screenHeight;

// 缩放绘图上下文，让后续所有绘制代码仍使用逻辑像素坐标
ctx.scale(dpr, dpr);
