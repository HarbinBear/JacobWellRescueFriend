import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import type { DiveSupply } from '../logic/Marker';
import { getPlayerRopeEnds, getRopeDeformedPoint, ropeAnchorPoint } from '../logic/Rope';
import { canUseRopeWheel, getRopeCancelProgress, getRopeSelfProgress, getRopeWheelAim } from '../logic/RopeWheel';
import { getRopeControlPosition, getSelfSockets } from '../logic/InteractionLayout';
import { fishName, fishShape } from '../logic/FishGeometry';
import { ctx } from './Canvas';

const INK = '#0d2028', THREAD = '#9ae5d6', TIED = '#ffd89e';
const LABEL = { rock: '岩壁', strand: '绳线', knot: '绳结', fish: '鱼', self: '自己' };

export const getWheelBtnPos = getRopeControlPosition;

export function getDiveSupplyButton() {
    const supply = state.wheel.nearbyInfo as DiveSupply | null;
    if (!supply || state.wheel.open || state.interaction.task || !canUseRopeWheel()) return null;
    const center = getWheelBtnPos();
    return { x: center.x - 80, y: center.y + 22, radius: 24, supply };
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2);
}

function drawSpool() {
    ctx.lineWidth = 1.65; ctx.lineCap = 'round';
    circle(ctx, -2, -2, 6.5); ctx.stroke(); circle(ctx, -2, -2, 2.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, 4.5); ctx.bezierCurveTo(3, 4.5, 3.5, 8, 8, 8); ctx.stroke();
}

export function drawWheelButton() {
    if (!canUseRopeWheel() || state.wheel.open) return;
    const { x, y } = getWheelBtnPos(), radius = CONFIG.marker.btnRadius;
    const active = state.rope.active, busy = !!state.interaction.task;
    const color = active || busy ? TIED : THREAD;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(8,25,34,.88)'; ctx.strokeStyle = color; ctx.lineWidth = 1.4;
    circle(ctx, 0, 0, radius - 3); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = .35; circle(ctx, 0, 0, radius + 2); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(0, -8);
    if (busy) {
        ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(-6, 6); ctx.lineTo(6, -6); ctx.stroke();
    } else drawSpool();
    ctx.restore(); ctx.fillStyle = '#e8f3ef'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(busy ? '取消' : active ? '接终点' : '起绳', 0, 12); ctx.restore();
    const attached = getPlayerRopeEnds().length;
    if (attached) {
        ctx.fillStyle = TIED; ctx.font = '10px Arial'; ctx.textAlign = 'center';
        ctx.fillText('腰扣连接 ' + attached, x, y + radius + 12);
    }
    drawDiveSupplyButton();
}

function drawDiveSupplyButton() {
    const button = getDiveSupplyButton();
    if (!button) return;
    const { x, y, radius, supply } = button;
    ctx.save(); circle(ctx, x, y, radius); ctx.fillStyle = 'rgba(14,31,42,.9)'; ctx.fill(); ctx.strokeStyle = '#8cafc6'; ctx.stroke();
    ctx.fillStyle = '#d8eef9'; ctx.font = '11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(supply.kind === 'oxygen' ? '补氧' : '拾取', x, y);
    if (supply.kind === 'pickup') { ctx.font = '10px Arial'; ctx.fillText(supply.item.label, x, y + radius + 8, 85); }
    ctx.restore();
}

export function drawWheel() {
    if (!canUseRopeWheel() || !state.wheel.open) return;
    const { centerX: x, centerY: y, expandProgress } = state.wheel;
    const { wheelInnerRadius: inner, wheelOuterRadius: outer } = CONFIG.marker;
    const aim = getRopeWheelAim(), valid = !!aim?.target, cancel = getRopeCancelProgress();
    const color = valid ? (state.rope.active ? TIED : THREAD) : '#a2bbc5';
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = .7 + .3 * expandProgress;
    circle(ctx, 0, 0, outer); ctx.fillStyle = 'rgba(9,22,30,.92)'; ctx.strokeStyle = '#597e89'; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();

    for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI / 16, vx = Math.cos(angle), vy = Math.sin(angle), length = i % 4 === 0 ? 9 : 4;
        ctx.strokeStyle = i % 4 === 0 ? '#799ca5' : 'rgba(129,170,178,.37)';
        ctx.beginPath(); ctx.moveTo(vx * (outer - length - 4), vy * (outer - length - 4)); ctx.lineTo(vx * (outer - 4), vy * (outer - 4)); ctx.stroke();
    }
    if (aim && aim.target?.kind !== 'self') {
        const vx = Math.cos(aim.angle), vy = Math.sin(aim.angle);
        const knob = outer - 10;
        ctx.lineWidth = valid ? 2 : 1.15; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(vx * inner, vy * inner); ctx.lineTo(vx * knob, vy * knob); ctx.stroke();
        circle(ctx, vx * knob, vy * knob, valid ? 6 : 4); ctx.fillStyle = color; ctx.fill();
    }
    circle(ctx, 0, 0, inner); ctx.fillStyle = INK; ctx.strokeStyle = '#597e89'; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
    if (cancel > 0) {
        ctx.strokeStyle = TIED; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, inner, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cancel); ctx.stroke();
    }
    ctx.fillStyle = color; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(aim?.target ? LABEL[aim.target.kind] : state.rope.active ? '接终点' : '起绳', 0, 0);
    ctx.fillStyle = '#c2d3d6'; ctx.font = '11px Arial';
    ctx.fillText(state.rope.active && !aim ? '长按中心撤回未完成的绳' : '只选方向 · 中心取消', 0, outer + 13);
    ctx.restore();
    if (state.rope.active) {
        const socket = getSelfSockets(x, y, outer)[0], selected = aim?.target?.kind === 'self';
        ctx.save(); circle(ctx, socket.x, socket.y, socket.radius); ctx.fillStyle = selected ? '#3d3c2b' : INK; ctx.fill();
        ctx.strokeStyle = selected ? TIED : '#9bafa6'; ctx.lineWidth = selected ? 2 : 1.2; ctx.stroke();
        ctx.fillStyle = selected ? TIED : '#d9e5d8'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const progress = getRopeSelfProgress();
        if (progress > 0) { ctx.strokeStyle = TIED; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(socket.x,socket.y,socket.radius+3,-Math.PI/2,-Math.PI/2+progress*Math.PI*2); ctx.stroke(); }
        ctx.fillText('自己', socket.x, socket.y); ctx.font = '9px Arial'; ctx.fillText('停留确认腰扣', socket.x, socket.y + socket.radius + 10); ctx.restore();
    }
}

export function drawRopeAimWorld(g: CanvasRenderingContext2D) {
    const aim = getRopeWheelAim();
    if (!aim) return;
    const target = aim.target;
    const point = target?.ropeIndex === undefined ? target ? ropeAnchorPoint(target.anchor) : aim.pointer
        : getRopeDeformedPoint(target.anchor.point, target.ropeIndex);
    const zoom = Math.max(.5, state.camera.zoom), color = target ? (state.rope.active ? TIED : THREAD) : 'rgba(176,204,209,.52)';
    g.save(); g.lineWidth = 1.45 / zoom; g.strokeStyle = color;
    if (target?.anchor.fish) {
        const fish = target.anchor.fish, shape = fishShape(fish);
        g.save(); g.translate(fish.x, fish.y); g.rotate(fish.angle);
        g.beginPath(); g.ellipse(0, 0, shape.length + 4, shape.radius + 4, 0, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    if (target?.kind === 'self' && state.rope.current.path.length > 1) {
        const path = state.rope.current.path;
        g.beginPath(); g.moveTo(path[0].x, path[0].y); for (const p of path.slice(1)) g.lineTo(p.x, p.y); g.stroke();
    }
    g.setLineDash([3 / zoom, 4 / zoom]);
    g.beginPath(); const angle = Math.atan2(point.y - player.y, point.x - player.x);
    g.moveTo(player.x + Math.cos(angle) * 13, player.y + Math.sin(angle) * 13); g.lineTo(point.x, point.y); g.stroke(); g.setLineDash([]);
    g.translate(point.x, point.y); g.scale(1 / zoom, 1 / zoom); g.lineWidth = 1.65;
    circle(g, 0, 0, target ? 8 : 5); g.fillStyle = INK; g.fill(); g.stroke();
    if (target) {
        circle(g, 0, 0, 2.6); g.fillStyle = color; g.fill(); g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';

    }
    g.restore();
}
