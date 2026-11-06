import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import type { DiveSupply } from '../logic/Marker';
import { getRopeDeformedPoint } from '../logic/Rope';
import { canUseRopeWheel, getRopeCancelProgress, getRopePressProgress, getRopeWheelAim } from '../logic/RopeWheel';
import { ctx } from './Canvas';

const INK = '#0d2028';
const THREAD = '#9ae5d6';
const TIED = '#ffd89e';
const LABEL = { rock: '岩壁', strand: '绳线', knot: '绳结' };

export function getWheelBtnPos(width = CONFIG.screenWidth, height = CONFIG.screenHeight) {
    const margin = CONFIG.marker.wheelOuterRadius + 12;
    const footer = CONFIG.driveMode === 'semiAuto' && CONFIG.semiAutoDrive.staminaPosition === 'bottom'
        ? Math.max(18, CONFIG.uiSafeBottom || 18) + 36 : 0;
    return {
        x: Math.max(margin, Math.min(width - margin, width * CONFIG.marker.btnXRatio)),
        y: Math.max(margin, Math.min(height - margin - footer, height * CONFIG.marker.btnYRatio)),
    };
}

export function getDiveSupplyButton() {
    const supply = state.wheel.nearbyInfo as DiveSupply | null;
    if (!supply || state.wheel.open || !canUseRopeWheel()) return null;
    const center = getWheelBtnPos();
    return { x: center.x - CONFIG.marker.btnRadius - 36, y: center.y, radius: 24, supply };
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
}

function drawSpool() {
    ctx.lineWidth = 1.65;
    ctx.lineCap = 'round';
    circle(ctx, -2, -2, 6.5);
    ctx.stroke();
    circle(ctx, -2, -2, 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, 4.5);
    ctx.bezierCurveTo(3, 4.5, 3.5, 8, 8, 8);
    ctx.stroke();
}

export function drawWheelButton() {
    if (!canUseRopeWheel() || state.wheel.open) return;
    const { x, y } = getWheelBtnPos();
    const radius = CONFIG.marker.btnRadius;
    const active = state.rope.active;
    const color = active ? TIED : THREAD;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(8,25,34,.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    circle(ctx, 0, 0, radius - 3);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = .35;
    circle(ctx, 0, 0, radius + 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const progress = getRopePressProgress();
    if (progress > 0) {
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, radius + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
    }
    ctx.save();
    ctx.translate(0, -8);
    drawSpool();
    ctx.restore();
    ctx.fillStyle = '#e8f3ef';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(active ? '收绳' : '起绳', 0, 12);
    ctx.fillStyle = '#b8cbc9';
    ctx.font = '10px Arial';
    ctx.fillText('稍按再拖', 0, radius + 12);
    ctx.restore();
    drawDiveSupplyButton();
}

function drawDiveSupplyButton() {
    const button = getDiveSupplyButton();
    if (!button) return;
    const { x, y, radius, supply } = button;
    ctx.save();
    circle(ctx, x, y, radius);
    ctx.fillStyle = 'rgba(14,31,42,.9)';
    ctx.fill();
    ctx.strokeStyle = '#8cafc6';
    ctx.stroke();
    ctx.fillStyle = '#d8eef9';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(supply.kind === 'oxygen' ? '补氧' : '拾取', x, y);
    if (supply.kind === 'pickup') {
        ctx.font = '10px Arial';
        ctx.fillText(supply.item.label, x, y + radius + 8, 85);
    }
    ctx.restore();
}

export function drawWheel() {
    if (!canUseRopeWheel() || !state.wheel.open) return;
    const { centerX: x, centerY: y, expandProgress } = state.wheel;
    const { wheelInnerRadius: inner, wheelOuterRadius: outer } = CONFIG.marker;
    const aim = getRopeWheelAim();
    const valid = !!aim?.target;
    const cancel = getRopeCancelProgress();
    const color = valid ? (state.rope.active ? TIED : THREAD) : '#a2bbc5';
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = .7 + .3 * expandProgress;
    circle(ctx, 0, 0, outer);
    ctx.fillStyle = 'rgba(9,22,30,.86)';
    ctx.strokeStyle = '#597e89';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    circle(ctx, 0, 0, inner + (outer - inner) * .5);
    ctx.strokeStyle = 'rgba(129,170,178,.22)';
    ctx.stroke();

    for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI / 16;
        const x = Math.cos(angle), y = Math.sin(angle);
        const length = i % 4 === 0 ? 9 : 4;
        ctx.strokeStyle = i % 4 === 0 ? '#799ca5' : 'rgba(129,170,178,.37)';
        ctx.beginPath();
        ctx.moveTo(x * (outer - length - 4), y * (outer - length - 4));
        ctx.lineTo(x * (outer - 4), y * (outer - 4));
        ctx.stroke();
    }
    if (aim) {
        const vx = Math.cos(aim.angle), vy = Math.sin(aim.angle);
        const reach = aim.reach / CONFIG.ropeAnchorDistance;
        const knob = inner + (outer - inner - 8) * reach;
        ctx.lineWidth = valid ? 2 : 1.15;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(vx * inner, vy * inner);
        ctx.lineTo(vx * knob, vy * knob);
        ctx.stroke();
        circle(ctx, vx * knob, vy * knob, valid ? 6 : 4);
        ctx.fillStyle = color;
        ctx.fill();
    }
    circle(ctx, 0, 0, inner);
    ctx.fillStyle = INK;
    ctx.strokeStyle = '#597e89';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    if (cancel > 0) {
        ctx.strokeStyle = TIED;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, inner, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cancel);
        ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(aim?.target ? LABEL[aim.target.kind] : state.rope.active ? '收绳' : '起绳', 0, 0);
    ctx.fillStyle = '#c2d3d6';
    ctx.font = '11px Arial';
    const hint = valid ? '松手系绳' : aim ? '转向或拖远找结点' : '按住拖动，选结点';
    ctx.fillText(hint, 0, -outer - 9);
    if (state.rope.active && !aim) ctx.fillText('长按中心撤回这段绳', 0, outer + 10);
    ctx.restore();
}

export function drawRopeAimWorld(g: CanvasRenderingContext2D) {
    const aim = getRopeWheelAim();
    if (!aim) return;
    const target = aim.target;
    const point = target?.ropeIndex === undefined
        ? target?.anchor.point ?? aim.pointer
        : getRopeDeformedPoint(target.anchor.point, target.ropeIndex);
    const zoom = Math.max(.5, state.camera.zoom);
    const color = target ? (state.rope.active ? TIED : THREAD) : 'rgba(176,204,209,.52)';
    g.save();
    g.lineWidth = 1.45 / zoom;
    g.strokeStyle = color;
    g.setLineDash?.([3 / zoom, 4 / zoom]);
    g.beginPath();
    const angle = Math.atan2(point.y - player.y, point.x - player.x);
    g.moveTo(player.x + Math.cos(angle) * 13, player.y + Math.sin(angle) * 13);
    g.lineTo(point.x, point.y);
    g.stroke();
    g.setLineDash?.([]);
    g.translate(point.x, point.y);
    g.scale(1 / zoom, 1 / zoom);
    g.lineWidth = 1.65;
    circle(g, 0, 0, target ? 8 : 5);
    g.fillStyle = INK;
    g.fill();
    g.stroke();
    if (target) {
        circle(g, 0, 0, 2.6);
        g.fillStyle = color;
        g.fill();
        g.font = 'bold 11px Arial';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const label = `${LABEL[target.kind]} · ${state.rope.active ? '终点' : '起点'}`;
        const width = g.measureText(label).width + 12;
        g.fillStyle = 'rgba(8,24,32,.91)';
        g.fillRect(-width / 2, -30, width, 16);
        g.fillStyle = color;
        g.fillText(label, 0, -22);
    }
    g.restore();
}
