import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { ctx } from './Canvas';
import { WheelSector } from '../logic/Marker';

// ============ 绘制轮盘交互按钮（替代旧绳索按钮） ============

export function drawWheelButton() {
    // 主线和迷宫模式都显示
    if (state.screen !== 'play' && state.screen !== 'mazeRescue') return;
    if (!state.wheel || !state.wheel.btnVisible) return;
    // 轮盘打开时不画按钮
    if (state.wheel.open) return;

    const btnX = CONFIG.screenWidth * CONFIG.marker.btnXRatio;
    const btnY = CONFIG.screenHeight * CONFIG.marker.btnYRatio;
    const radius = CONFIG.marker.btnRadius;
    const time = Date.now() / 1000;

    ctx.save();

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
    // 外圆
    ctx.beginPath();
    ctx.arc(btnX, btnY, 8, 0, Math.PI * 2);
    ctx.stroke();
    // 十字
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

    ctx.restore();
}

// ============ 绘制轮盘 ============

export function drawWheel() {
    if (!state.wheel || !state.wheel.open) return;

    const wheel = state.wheel;
    const sectors = wheel.sectors as WheelSector[];
    if (!sectors || sectors.length === 0) return;

    const btnX = CONFIG.screenWidth * CONFIG.marker.btnXRatio;
    const btnY = CONFIG.screenHeight * CONFIG.marker.btnYRatio;
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

    const gapAngle = 0.07; // 扇区间隔（弧度）

    for (let i = 0; i < sectors.length; i++) {
        const s = sectors[i];
        const isHighlight = (wheel.highlightIndex === i);
        const sStart = s.startAngle + gapAngle / 2;
        const sEnd = s.endAngle - gapAngle / 2;

        // 扇区背景
        ctx.beginPath();
        ctx.arc(0, 0, outerR, sStart, sEnd);
        ctx.arc(0, 0, innerR, sEnd, sStart, true);
        ctx.closePath();
        ctx.fillStyle = isHighlight ? 'rgba(60, 100, 140, 0.9)' : 'rgba(40, 60, 80, 0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100, 160, 220, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 扇区图标和文字
        const midAngle = (sStart + sEnd) / 2;
        const iconR = (outerR + innerR) / 2 + 4;
        const iconX = Math.cos(midAngle) * iconR;
        const iconY = Math.sin(midAngle) * iconR;

        ctx.save();
        ctx.translate(iconX, iconY);

        // 根据 action 绘制图标
        drawSectorIcon(s.action, isHighlight);

        // 文字标签
        const labelR = (outerR + innerR) / 2 - 10;
        const labelX = Math.cos(midAngle) * labelR - iconX;
        const labelY = Math.sin(midAngle) * labelR - iconY;
        ctx.fillStyle = isHighlight ? 'rgba(255,255,255,0.95)' : 'rgba(200,220,240,0.8)';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label, labelX, labelY);

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
