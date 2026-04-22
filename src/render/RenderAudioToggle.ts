// 全局音频开关按钮（顶部 GM 按钮左侧）
// 视觉设计：
// - 所有动画内容都裁剪在底圆之内，绝不跑到圆外
// - 开启时：一个音符图标在圆心原地匀速旋转
// - 静音时：音符停止旋转 + 红色斜线屏蔽
// - 开关切换通过 iconProgress(0~1) 平滑过渡

import { state } from '../core/state';
import { CONFIG } from '../core/config';

// 与 GM 按钮同规格，位置在 GM 按钮左边
import { BTN_RADIUS, BTN_X, BTN_Y } from '../gm/GMConfig';

export const AUDIO_BTN_RADIUS = BTN_RADIUS;
// 位于 GM 按钮左侧，之间留 12px 间距
export const AUDIO_BTN_X = BTN_X - (BTN_RADIUS * 2) - 12;
export const AUDIO_BTN_Y = BTN_Y;

// 击中检测（供 input.ts 使用）
export function hitAudioButton(tx: number, ty: number): boolean {
    return Math.hypot(tx - AUDIO_BTN_X, ty - AUDIO_BTN_Y) <= AUDIO_BTN_RADIUS + 5;
}

// 绘制音频开关按钮
export function drawAudioToggle(ctx: CanvasRenderingContext2D): void {
    const muted = state.audio.muted;
    const iconProgress = state.audio.iconProgress; // 0=静音视觉，1=开启视觉
    const phase = state.audio.animPhase;

    ctx.save();

    // ---- 底圆 ----
    ctx.globalAlpha = muted ? 0.5 : 0.8;
    ctx.fillStyle = muted ? '#555' : '#2a6b8a';
    ctx.beginPath();
    ctx.arc(AUDIO_BTN_X, AUDIO_BTN_Y, AUDIO_BTN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ---- 圆内裁切区，所有动画内容都绘制在此裁切范围内 ----
    ctx.save();
    ctx.beginPath();
    // 裁切半径比底圆略小一点点，避免边缘像素穿出
    ctx.arc(AUDIO_BTN_X, AUDIO_BTN_Y, AUDIO_BTN_RADIUS - 1, 0, Math.PI * 2);
    ctx.clip();

    // ---- 音符图标（开启时绕自身几何重心匀速旋转，关闭时回正）----
    // 关键设计：
    // 1) 符头、符杆、符旗几何严格对称、规整，看起来"标准"
    // 2) 旋转时围绕整图的几何重心（视觉重心），避免偏心甩动带来的不稳感
    // 3) 静音时角度插值回到 0（正立状态），而不是冻结在当前旋转角

    // 当前渲染角度：开启时用累积相位，静音时线性回落到 0（通过 iconProgress 加权）
    // 先把 phase 归一到 [-PI, PI]，再按 iconProgress 做权重，避免 muted 下卡在一个歪斜角度
    const normPhase = Math.atan2(Math.sin(phase), Math.cos(phase));
    const rotation = normPhase * iconProgress;

    ctx.save();
    ctx.translate(AUDIO_BTN_X, AUDIO_BTN_Y);
    ctx.rotate(rotation);

    // 图标按钮半径自适应缩放（以 18 为设计基准）
    const s = AUDIO_BTN_RADIUS / 18;
    ctx.scale(s, s);

    // 让音符绕自身几何重心旋转：把视觉重心（大约在符杆中段稍偏符头的位置）平移到原点
    // 符头中心 (0, 4)，符杆顶 (3.5, -8)，整体视觉重心近似 (1.4, -1.5)
    ctx.translate(-1.4, 1.5);

    // 颜色：静音时偏灰白，开启时纯白
    const iconColor = `rgba(255, 255, 255, ${(0.55 + 0.45 * iconProgress).toFixed(3)})`;
    ctx.fillStyle = iconColor;
    ctx.strokeStyle = iconColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // --- 符头：规整椭圆，水平放置，不做任何斜切 ---
    ctx.beginPath();
    ctx.ellipse(0, 4, 4.2, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- 符杆：完全垂直，贴在符头右侧 ---
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(3.5, 4);
    ctx.lineTo(3.5, -8);
    ctx.stroke();

    // --- 符旗：双层对称下垂（标准八分音符 ♪ 造型）---
    ctx.lineWidth = 1.8;
    // 第一层旗：从符杆顶向右下柔和弯曲
    ctx.beginPath();
    ctx.moveTo(3.5, -8);
    ctx.quadraticCurveTo(8, -6, 7.5, -2.5);
    ctx.stroke();
    // 第二层旗：稍短稍低，与第一层平行，加强音符辨识度
    ctx.beginPath();
    ctx.moveTo(3.5, -4.5);
    ctx.quadraticCurveTo(7.5, -3, 7, 0);
    ctx.stroke();

    ctx.restore(); // 恢复旋转前的状态

    // ---- 静音状态：红色斜线（同样在裁切区内，不会跑出圆外）----
    if (iconProgress < 0.99) {
        ctx.save();
        ctx.globalAlpha = 1 - iconProgress;
        ctx.strokeStyle = '#ff7070';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        // 从圆内左上到右下画一条斜线，长度 = 0.72 倍直径，确保两端在圆内
        const half = AUDIO_BTN_RADIUS * 0.72;
        ctx.moveTo(AUDIO_BTN_X - half, AUDIO_BTN_Y - half);
        ctx.lineTo(AUDIO_BTN_X + half, AUDIO_BTN_Y + half);
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore(); // 退出裁切

    ctx.restore();
    // 防止未使用警告：CONFIG 未来可作为入口扩展（例如按钮显隐的 debug 开关）
    void CONFIG;
}
