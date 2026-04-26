// 全局音频开关按钮（顶部 GM 按钮左侧）——— 已被 HUDTopLeft 接管，但保留 `drawAudioIcon`
// 供 HUDTopLeft 直接调用（画在它给的位置上），本文件不再负责 hit-test 和自身位置管理
// 兼容保留：旧的 drawAudioToggle / hitAudioButton / 位置常量（其他模块暂未迁移时兜底；
// 实际 Render.ts 已停止调用 drawAudioToggle，左上角 HUD 管理器会调 drawAudioIcon 自己摆放）
//
// 视觉设计：
// - 所有动画内容都裁剪在底圆之内，绝不跑到圆外
// - 开启时：一个音符图标在圆心原地匀速旋转
// - 静音时：音符停止旋转 + 红色斜线屏蔽
// - 开关切换通过 iconProgress(0~1) 平滑过渡

import { state } from '../core/state';
import { CONFIG } from '../core/config';
import { toggleMuted as audioMgrToggleMuted } from '../audio/AudioManager';

// 与 GM 按钮同规格，位置在 GM 按钮左边
import { BTN_RADIUS, BTN_X, BTN_Y } from '../gm/GMConfig';

export const AUDIO_BTN_RADIUS = BTN_RADIUS;
// 位于 GM 按钮左侧，之间留 12px 间距（已废弃，仅保留常量）
export const AUDIO_BTN_X = BTN_X - (BTN_RADIUS * 2) - 12;
export const AUDIO_BTN_Y = BTN_Y;

// 击中检测（已废弃；左上角HUD管理器统一接管）
export function hitAudioButton(_tx: number, _ty: number): boolean {
    return false;
}

// 导出给 HUDTopLeft 的 toggleMuted（避免外部直接依赖AudioManager）
export function toggleMuted(): void {
    audioMgrToggleMuted();
}

// 绘制音符图标到任意位置（左上角 HUD 管理器调用）
// cx, cy 是图标中心；size 是图标直径
export function drawAudioIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    const muted = state.audio.muted;
    const iconProgress = state.audio.iconProgress; // 0=静音视觉，1=开启视觉
    const phase = state.audio.animPhase;
    const radius = size / 2 - 2;

    c.save();

    // 底圆
    c.globalAlpha = muted ? 0.55 : 0.85;
    c.fillStyle = muted ? '#555' : '#2a6b8a';
    c.beginPath();
    c.arc(cx, cy, radius, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 1.2;
    c.stroke();
    c.globalAlpha = 1;

    // 圆内裁切
    c.save();
    c.beginPath();
    c.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    c.clip();

    const normPhase = Math.atan2(Math.sin(phase), Math.cos(phase));
    const rotation = normPhase * iconProgress;

    c.save();
    c.translate(cx, cy);
    c.rotate(rotation);
    const s = radius / 18;
    c.scale(s, s);
    c.translate(-1.4, 1.5);

    const iconColor = `rgba(255, 255, 255, ${(0.55 + 0.45 * iconProgress).toFixed(3)})`;
    c.fillStyle = iconColor;
    c.strokeStyle = iconColor;
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // 符头
    c.beginPath();
    c.ellipse(0, 4, 4.2, 3, 0, 0, Math.PI * 2);
    c.fill();
    // 符杆
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(3.5, 4);
    c.lineTo(3.5, -8);
    c.stroke();
    // 符旗
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(3.5, -8);
    c.quadraticCurveTo(8, -6, 7.5, -2.5);
    c.stroke();
    c.beginPath();
    c.moveTo(3.5, -4.5);
    c.quadraticCurveTo(7.5, -3, 7, 0);
    c.stroke();

    c.restore();

    // 静音斜线
    if (iconProgress < 0.99) {
        c.save();
        c.globalAlpha = 1 - iconProgress;
        c.strokeStyle = '#ff7070';
        c.lineWidth = 2.2;
        c.lineCap = 'round';
        c.beginPath();
        const half = radius * 0.72;
        c.moveTo(cx - half, cy - half);
        c.lineTo(cx + half, cy + half);
        c.stroke();
        c.restore();
    }

    c.restore();
    c.restore();
    void CONFIG;
}

// 旧的 drawAudioToggle 保留为 no-op（不再在固定位置绘制，HUD 管理器接管）
export function drawAudioToggle(_ctx: CanvasRenderingContext2D): void {
    // 已废弃。左上角 HUD 管理器负责绘制。
}
