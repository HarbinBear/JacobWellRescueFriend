import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { ctx } from './Canvas';
import { WheelSector } from '../logic/Marker';

// ============ 自适应按钮位置计算 ============
// 确保按钮+轮盘不超出屏幕边界

export function getWheelBtnPos(): { x: number; y: number } {
    const outerR = CONFIG.marker.wheelOuterRadius;
    const margin = outerR + 12; // 轮盘外径 + 安全边距
    const rawX = CONFIG.screenWidth * CONFIG.marker.btnXRatio;
    const rawY = CONFIG.screenHeight * CONFIG.marker.btnYRatio;
    // 限制按钮位置，使轮盘展开后不超出屏幕
    const x = Math.max(margin, Math.min(CONFIG.screenWidth - margin, rawX));
    const y = Math.max(margin, Math.min(CONFIG.screenHeight - margin, rawY));
    return { x, y };
}

// ============ 绘制轮盘交互按钮（替代旧绳索按钮） ============

export function drawWheelButton() {
    // 主线和迷宫模式都显示
    if (state.screen !== 'play' && state.screen !== 'mazeRescue') return;
    if (!state.wheel || !state.wheel.btnVisible) return;
    // 轮盘打开时不画按钮
    if (state.wheel.open) return;

    const { x: btnX, y: btnY } = getWheelBtnPos();
    const radius = CONFIG.marker.btnRadius;
    const time = Date.now() / 1000;
    // 是否为可交互态（false = 灰态，提示"停下就能交互"）
    const active = !!state.wheel.btnActive;

    ctx.save();

    if (active) {
        // =============== 可交互态（原样式）===============
        // 呼吸脉冲光晕
        const glowAlpha = 0.15 + Math.sin(time * 3) * 0.1;
        ctx.beginPath();
        ctx.arc(btnX, btnY, radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 180, 255, ${glowAlpha})`;
        ctx.fill();

        // 按钮底圆
        ctx.beginPath();
        ctx.arc(btnX, btnY, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10, 25, 40, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 中心图标：⊕ 符号（十字 + 圆）
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(btnX, btnY, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(btnX - 5, btnY);
        ctx.lineTo(btnX + 5, btnY);
        ctx.moveTo(btnX, btnY - 5);
        ctx.lineTo(btnX, btnY + 5);
        ctx.stroke();

        // 文字标签
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('标记', btnX, btnY + radius + 6);
    } else {
        // =============== 灰态（移动中，提示"停下就能交互"）===============
        // 不画呼吸光晕，整体压低透明度
        ctx.globalAlpha = 0.45;

        // 按钮底圆（偏灰色调）
        ctx.beginPath();
        ctx.arc(btnX, btnY, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(30, 35, 40, 0.75)';
        ctx.fill();
        // 虚线灰色描边，暗示"不可点击"
        ctx.strokeStyle = 'rgba(160, 170, 180, 0.5)';
        ctx.lineWidth = 1.5;
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([4, 3]);
        ctx.stroke();
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

        // 中心图标：⊕ 符号（灰色版本）
        ctx.strokeStyle = 'rgba(200, 210, 220, 0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(btnX, btnY, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(btnX - 5, btnY);
        ctx.lineTo(btnX + 5, btnY);
        ctx.moveTo(btnX, btnY - 5);
        ctx.lineTo(btnX, btnY + 5);
        ctx.stroke();

        // 文字标签：提示"停下"
        ctx.fillStyle = 'rgba(210, 220, 230, 0.6)';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('停下标记', btnX, btnY + radius + 6);
    }

    ctx.restore();
}

// ============ 绘制轮盘 ============

export function drawWheel() {
    if (!state.wheel || !state.wheel.open) return;

    const wheel = state.wheel;
    const sectors = wheel.sectors as WheelSector[];
    if (!sectors || sectors.length === 0) return;

    const { x: btnX, y: btnY } = getWheelBtnPos();
    const outerR = CONFIG.marker.wheelOuterRadius;
    const innerR = CONFIG.marker.wheelInnerRadius;

    // 展开动画缩放
    const expandProgress = wheel.expandProgress || 1;
    const scale = expandProgress;
    const alpha = expandProgress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(btnX, btnY);
    ctx.scale(scale, scale);

    // 单选项时不画间隔
    const gapAngle = sectors.length === 1 ? 0 : 0.07;

    for (let i = 0; i < sectors.length; i++) {
        const s = sectors[i];
        const isHighlight = (wheel.highlightIndex === i);
        const sStart = s.startAngle + gapAngle / 2;
        const sEnd = s.endAngle - gapAngle / 2;

        // 扇区背景
        ctx.beginPath();
        if (sectors.length === 1) {
            // 单选项：画完整圆环
            ctx.arc(0, 0, outerR, 0, Math.PI * 2);
            ctx.arc(0, 0, innerR, Math.PI * 2, 0, true);
        } else {
            ctx.arc(0, 0, outerR, sStart, sEnd);
            ctx.arc(0, 0, innerR, sEnd, sStart, true);
        }
        ctx.closePath();
        ctx.fillStyle = isHighlight ? 'rgba(60, 100, 140, 0.9)' : 'rgba(40, 60, 80, 0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100, 160, 220, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 扇区图标和文字位置
        let iconX: number, iconY: number;
        if (sectors.length === 1) {
            // 单选项：图标在正上方
            const iconR = (outerR + innerR) / 2;
            iconX = 0;
            iconY = -iconR;
        } else {
            const midAngle = (sStart + sEnd) / 2;
            const iconR = (outerR + innerR) / 2 + 2;
            iconX = Math.cos(midAngle) * iconR;
            iconY = Math.sin(midAngle) * iconR;
        }

        ctx.save();
        ctx.translate(iconX, iconY);

        // 根据 action 绘制图标
        drawSectorIcon(s.action, isHighlight);

        // 文字标签
        let labelOffsetY: number;
        if (sectors.length === 1) {
            labelOffsetY = 16;
        } else {
            labelOffsetY = 14;
        }
        ctx.fillStyle = isHighlight ? 'rgba(255,255,255,0.95)' : 'rgba(200,220,240,0.8)';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label, 0, labelOffsetY);

        ctx.restore();
    }

    // 中心死区
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 20, 30, 0.6)';
    ctx.fill();

    ctx.restore();
}

// ============ 扇区图标绘制 ============

function drawSectorIcon(action: string, highlight: boolean) {
    const color = highlight ? 'rgba(255,255,255,0.95)' : 'rgba(200,220,240,0.8)';

    switch (action) {
        case 'startRope': {
            // 绳索卷轴图标
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, -2, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, -2, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            break;
        }
        case 'endRope': {
            // 钉子 + 绳结图标
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-4, -2);
            ctx.lineTo(4, -2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 2, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            break;
        }
        case 'removeRope': {
            // 剪刀图标（橙色）
            ctx.strokeStyle = 'rgba(255, 150, 100, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-4, -4);
            ctx.lineTo(4, 4);
            ctx.moveTo(4, -4);
            ctx.lineTo(-4, 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(-4, 5, 2, 0, Math.PI * 2);
            ctx.arc(4, 5, 2, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
        case 'markDanger': {
            // 红叉小牌子
            ctx.fillStyle = CONFIG.marker.dangerColor;
            ctx.fillRect(-5, -5, 10, 8);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-3, -3);
            ctx.lineTo(3, 1);
            ctx.moveTo(3, -3);
            ctx.lineTo(-3, 1);
            ctx.stroke();
            break;
        }
        case 'markUnknown': {
            // 黄问号小牌子
            ctx.fillStyle = CONFIG.marker.unknownColor;
            ctx.fillRect(-5, -5, 10, 8);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', 0, -1);
            break;
        }
        case 'markSafe': {
            // 绿圈小牌子
            ctx.fillStyle = CONFIG.marker.safeColor;
            ctx.fillRect(-5, -5, 10, 8);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, -1, 3, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
        case 'removeMarker': {
            // 垃圾桶图标（红色）
            ctx.strokeStyle = 'rgba(200, 100, 80, 0.9)';
            ctx.lineWidth = 1.2;
            // 桶身
            ctx.beginPath();
            ctx.moveTo(-4, -2);
            ctx.lineTo(-3, 5);
            ctx.lineTo(3, 5);
            ctx.lineTo(4, -2);
            ctx.stroke();
            // 桶盖
            ctx.beginPath();
            ctx.moveTo(-5, -2);
            ctx.lineTo(5, -2);
            ctx.stroke();
            // 把手
            ctx.beginPath();
            ctx.moveTo(-2, -2);
            ctx.lineTo(-2, -4);
            ctx.lineTo(2, -4);
            ctx.lineTo(2, -2);
            ctx.stroke();
            break;
        }
    }
}
