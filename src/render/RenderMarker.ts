import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { getMarkers, Marker } from '../logic/Marker';
import { pathLength, samplePolyline } from '../logic/Pathfinding';

// ============ 绘制所有标记（世界空间） ============

export function drawMarkersWorld(ctx: CanvasRenderingContext2D) {
    const markers = getMarkers();
    if (!markers || markers.length === 0) return;

    const time = Date.now() / 1000;

    for (const m of markers) {
        if (m.attachType === 'wall') {
            drawWallMarker(ctx, m, time);
        } else if (m.attachType === 'rope') {
            drawRopeMarker(ctx, m, time);
        }
    }
}

// ============ 绘制预览标记（轮盘高亮时在场景中显示半透明预览） ============

export function drawMarkerPreview(ctx: CanvasRenderingContext2D, markerType: string, wall: any, ropeIndex?: number, ropeT?: number) {
    if (!markerType || (markerType !== 'danger' && markerType !== 'unknown' && markerType !== 'safe')) return;

    ctx.save();
    ctx.globalAlpha = 0.5; // 半透明预览

    const cfg = CONFIG.marker;

    if (wall) {
        // 岩石预览
        const angle = Math.atan2(state.markers ? 0 : 0, 0) || Math.atan2(
            (typeof player !== 'undefined' ? player.y : 0) - wall.y,
            (typeof player !== 'undefined' ? player.x : 0) - wall.x
        );
        const surfaceX = wall.x + Math.cos(angle) * wall.r;
        const surfaceY = wall.y + Math.sin(angle) * wall.r;

        ctx.translate(surfaceX, surfaceY);
        ctx.rotate(angle);

        const colors = getMarkerColors(markerType);
        ctx.fillStyle = colors.stake;
        ctx.fillRect(0, -1.5, cfg.wallStakeLength, 3);

        const signX = cfg.wallStakeLength;
        ctx.fillStyle = colors.bg;
        ctx.beginPath();
        roundRect(ctx, signX, -cfg.wallSignHeight / 2, cfg.wallSignWidth, cfg.wallSignHeight, 2);
        ctx.fill();
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        drawMarkerSymbol(ctx, markerType, signX + cfg.wallSignWidth / 2, 0);
    } else if (ropeIndex !== undefined && ropeT !== undefined && state.rope && state.rope.ropes[ropeIndex]) {
        // 绳索预览
        const rope = state.rope.ropes[ropeIndex];
        if (rope.path && rope.path.length >= 2) {
            const totalLen = pathLength(rope.path);
            if (totalLen >= 1) {
                const d = ropeT * totalLen;
                const pt = samplePolyline(rope.path, d);
                ctx.translate(pt.x, pt.y);

                const colors = getMarkerColors(markerType);
                ctx.fillStyle = colors.stake;
                ctx.fillRect(-1, 0, 2, cfg.ropeTagStrapLength);

                const tagY = cfg.ropeTagStrapLength;
                ctx.fillStyle = colors.bg;
                ctx.beginPath();
                roundRect(ctx, -cfg.ropeTagWidth / 2, tagY, cfg.ropeTagWidth, cfg.ropeTagHeight, 1.5);
                ctx.fill();
                ctx.strokeStyle = colors.border;
                ctx.lineWidth = 1;
                ctx.stroke();

                drawMarkerSymbol(ctx, markerType, 0, tagY + cfg.ropeTagHeight / 2);
            }
        }
    }

    ctx.restore();
}

// ============ 岩石标记（插牌式） ============

function drawWallMarker(ctx: CanvasRenderingContext2D, m: Marker, time: number) {
    if (m.surfaceX === undefined || m.surfaceY === undefined || m.normalAngle === undefined) return;

    const cfg = CONFIG.marker;
    const angle = m.normalAngle;

    // 动画缩放
    let scale = 1;
    if (m.placeTimer > 0) {
        const progress = 1 - m.placeTimer / cfg.placeAnimDuration;
        if (progress < 0.25) {
            scale = progress / 0.25; // 短杆伸出
        } else if (progress < 0.6) {
            scale = 1 + 0.15 * Math.sin((progress - 0.25) / 0.35 * Math.PI); // 弹出过冲
        }
    }
    if (m.removeTimer > 0) {
        const progress = 1 - m.removeTimer / cfg.removeAnimDuration;
        if (progress < 0.33) {
            scale = 1 + 0.1 * (progress / 0.33); // 轻微膨胀
        } else {
            scale = 1.1 * (1 - (progress - 0.33) / 0.67); // 缩小消失
        }
    }
    if (scale <= 0.01) return;

    ctx.save();
    ctx.translate(m.surfaceX, m.surfaceY);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    // 获取标记颜色
    const colors = getMarkerColors(m.type);

    // 短杆
    ctx.fillStyle = colors.stake;
    ctx.fillRect(0, -1, cfg.wallStakeLength, 2);

    // 牌面
    const signX = cfg.wallStakeLength;
    const signW = cfg.wallSignWidth;
    const signH = cfg.wallSignHeight;
    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    roundRect(ctx, signX, -signH / 2, signW, signH, 2);
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 符号
    const symX = signX + signW / 2;
    const symY = 0;
    drawMarkerSymbol(ctx, m.type, symX, symY);

    ctx.restore();
}

// ============ 绳索标记（绑扎式） ============

function drawRopeMarker(ctx: CanvasRenderingContext2D, m: Marker, time: number) {
    if (m.ropeIndex === undefined || m.ropeT === undefined) return;
    if (!state.rope || !state.rope.ropes[m.ropeIndex]) return;

    const rope = state.rope.ropes[m.ropeIndex];
    if (!rope.path || rope.path.length < 2) return;

    const totalLen = pathLength(rope.path);
    if (totalLen < 1) return;

    const d = m.ropeT * totalLen;
    const pt = samplePolyline(rope.path, d);

    const cfg = CONFIG.marker;

    // 摆动
    const hash = m.id * 1.37;
    const sway = Math.sin(time * cfg.ropeTagSwaySpeed + hash) * cfg.ropeTagSwayAmplitude;

    // 动画缩放
    let scale = 1;
    if (m.placeTimer > 0) {
        const progress = 1 - m.placeTimer / cfg.placeAnimDuration;
        if (progress < 0.4) {
            scale = progress / 0.4;
        } else if (progress < 0.75) {
            scale = 1 + 0.2 * Math.sin((progress - 0.4) / 0.35 * Math.PI);
        }
    }
    if (m.removeTimer > 0) {
        const progress = 1 - m.removeTimer / cfg.removeAnimDuration;
        if (progress < 0.33) {
            scale = 1 + 0.1 * (progress / 0.33);
        } else {
            scale = 1.1 * (1 - (progress - 0.33) / 0.67);
        }
    }
    if (scale <= 0.01) return;

    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(sway);
    ctx.scale(scale, scale);

    const colors = getMarkerColors(m.type);

    // 绑带
    ctx.fillStyle = colors.stake;
    ctx.fillRect(-0.75, 0, 1.5, cfg.ropeTagStrapLength);

    // 标签
    const tagW = cfg.ropeTagWidth;
    const tagH = cfg.ropeTagHeight;
    const tagY = cfg.ropeTagStrapLength;
    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    roundRect(ctx, -tagW / 2, tagY, tagW, tagH, 1.5);
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 符号
    drawMarkerSymbol(ctx, m.type, 0, tagY + tagH / 2);

    ctx.restore();
}

// ============ 辅助函数 ============

function getMarkerColors(type: string) {
    const cfg = CONFIG.marker;
    switch (type) {
        case 'danger':
            return { bg: cfg.dangerColor, border: cfg.dangerBorder, stake: cfg.dangerStake };
        case 'unknown':
            return { bg: cfg.unknownColor, border: cfg.unknownBorder, stake: cfg.unknownStake };
        case 'safe':
            return { bg: cfg.safeColor, border: cfg.safeBorder, stake: cfg.safeStake };
        default:
            return { bg: '#888', border: '#aaa', stake: '#666' };
    }
}

function drawMarkerSymbol(ctx: CanvasRenderingContext2D, type: string, x: number, y: number) {
    ctx.save();
    ctx.translate(x, y);

    switch (type) {
        case 'danger': {
            // 白色 ×
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-4, -4);
            ctx.lineTo(4, 4);
            ctx.moveTo(4, -4);
            ctx.lineTo(-4, 4);
            ctx.stroke();
            break;
        }
        case 'unknown': {
            // 白色 ?
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', 0, 0);
            break;
        }
        case 'safe': {
            // 白色 ○
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
    }

    ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
