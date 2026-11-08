import { CONFIG } from '../core/config';
import { getUILayout } from '../core/UILayout';
import { player, state } from '../core/state';
import { actionTargetLabel, actionTargetPoint, isInteractionPlay } from '../logic/ActionTargets';
import { getActionControlPosition, getSelfSockets } from '../logic/InteractionLayout';
import { getPlayerRopeEnds, getRopeDeformedPoint, getRopeContact, ropeAnchorPoint, ropeEndpointPoint } from '../logic/Rope';
import { fishShape, fishHeadPoint, fishKnotPoint, fishNetHandlePoint } from '../logic/FishGeometry';
import { getInteractionWorkPose } from '../logic/Interaction';
import { sampleWorkMotion } from './InteractionPose';
import { getRopeWheelAim } from '../logic/RopeWheel';
import type { ActionTarget } from '../logic/InteractionTypes';
import type { RopePoint } from '../logic/RopeNet';

const INK = '#0b202a', READY = '#f5d59b', REMOVE = '#ffb18c', THREAD = '#a4e6d6';
const circle = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); };
function line(c: CanvasRenderingContext2D, points: RopePoint[]) {
    if (points.length < 2) return;
    c.beginPath(); c.moveTo(points[0].x, points[0].y); for (const p of points.slice(1)) c.lineTo(p.x, p.y); c.stroke();
}
function posedPath(rope: any, path: RopePoint[] = rope.path) {
    const index = state.rope.ropes.indexOf(rope), points: RopePoint[] = [];
    if (index < 0) return points;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
        for (let j = i === 1 ? 0 : 1; j <= n; j++) points.push(getRopeDeformedPoint({ x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n }, index));
    }
    return points;
}
function colorFor(target?: ActionTarget | null) { return target?.kind === 'fish' ? READY : target?.kind === 'self' || target?.kind === 'fishKnot' ? THREAD : REMOVE; }
function highlightTarget(c: CanvasRenderingContext2D, target: ActionTarget) {
    const zoom = Math.max(.5, state.camera.zoom);
    c.strokeStyle = colorFor(target); c.lineWidth = 2 / zoom;
    if (target.fish) {
        const fish = target.fish, shape = fishShape(fish);
        c.save(); c.translate(fish.x, fish.y); c.rotate(fish.angle);
        c.beginPath(); c.ellipse(0, 0, shape.length + 3, shape.radius + 3, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    }
    if (target.removal) for (const span of target.removal.removed) {
        c.strokeStyle = target.removal.selected.includes(span) ? REMOVE : '#d7997d'; c.lineWidth = 3 / zoom;
        line(c, posedPath(span.rope, span.path));
        for (const node of [span.start, span.end]) {
            const i = state.rope.ropes.indexOf(span.rope), p = getRopeDeformedPoint(node, i);
            circle(c, p.x, p.y, 3 / zoom); c.stroke();
        }
    }
    for(const link of target.removal?.links||[]){c.strokeStyle=REMOVE;c.lineWidth=3/zoom;line(c,link.path);}
    if (target.link) { c.strokeStyle = colorFor(target); c.lineWidth = 3 / zoom; line(c, target.link.path); }
}
export function drawActionPreviewWorld(c: CanvasRenderingContext2D) {
    const aim = state.interaction.aim;
    if (!state.interaction.gesture || !aim) return;
    const target = aim.target, point = target ? actionTargetPoint(target) : aim.pointer, zoom = Math.max(.5, state.camera.zoom);
    const color = target ? colorFor(target) : '#91a8b1';
    c.save(); c.lineCap = 'round';
    if (target) highlightTarget(c, target);
    if (target?.fish) {
        const fish = target.fish;
        const handles = [fishHeadPoint(fish)];
        if (fish.bound) handles.push(fishKnotPoint(fish));
        if (getRopeContact(fish)?.kind === 'snag') handles.push(fishNetHandlePoint(fish));
        c.strokeStyle = 'rgba(177,223,207,.65)'; c.lineWidth = 1 / zoom;
        for (const handle of handles) { circle(c, handle.x, handle.y, 4 / zoom); c.stroke(); }
    }
    c.strokeStyle = color; c.lineWidth = 1.2 / zoom; c.setLineDash([3 / zoom, 4 / zoom]);
    c.beginPath(); c.moveTo(player.x, player.y); c.lineTo(point.x, point.y); c.stroke(); c.setLineDash([]);
    c.translate(point.x, point.y); c.scale(1 / zoom, 1 / zoom); circle(c, 0, 0, target ? 8 : 4); c.stroke();
    c.beginPath(); c.moveTo(-12, 0); c.lineTo(-5, 0); c.moveTo(5, 0); c.lineTo(12, 0);
    c.moveTo(0, -12); c.lineTo(0, -5); c.moveTo(0, 5); c.lineTo(0, 12); c.stroke(); c.restore();
}
export function drawActionControls(c: CanvasRenderingContext2D) {
    if (!isInteractionPlay()) return;
    if (state.interaction.gesture) { drawActionSelector(c); return; }
    if (state.wheel.open) return;
    const button = getActionControlPosition(), busy = !!state.interaction.task;
    const disabled = state.fishBump.stunTimer > 0 || state.interaction.cooldown > 0;
    c.save(); c.translate(button.x, button.y); circle(c, 0, 0, button.radius); c.fillStyle = 'rgba(10,26,34,.92)'; c.fill();
    c.strokeStyle = disabled ? '#647a81' : READY; c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = '#e9d8b5'; c.lineWidth = 1.8;
    if (busy) { c.beginPath(); c.moveTo(-6, -9); c.lineTo(6, 3); c.moveTo(6, -9); c.lineTo(-6, 3); c.stroke(); }
    else { circle(c, -2, -4, 6); c.stroke(); circle(c, -2, -4, 2); c.stroke(); c.beginPath(); c.moveTo(4, 0); c.lineTo(10, 6); c.stroke(); }
    c.font = 'bold 11px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = disabled ? '#8c9ca0' : '#f5e5c4';
    c.fillText(busy ? '取消' : state.fishBump.stunTimer > 0 ? '晕了' : '动作', 0, 15); c.restore();
    if (!busy) { c.fillStyle = '#b4c2bd'; c.font = '10px Arial'; c.textAlign = 'center'; c.fillText('敲晕 / 拆绳', button.x, button.y + button.radius + 12); }
}
function drawActionSelector(c: CanvasRenderingContext2D) {
    const gesture = state.interaction.gesture!, aim = state.interaction.aim, target = aim?.target;
    const { wheelRadius: outer, wheelInnerRadius: inner } = CONFIG.fishInteraction, color = target ? colorFor(target) : '#9cb4bf';
    c.save(); c.translate(gesture.centerX, gesture.centerY); circle(c, 0, 0, outer);
    c.fillStyle = 'rgba(5,21,29,.91)'; c.fill(); c.strokeStyle = '#64818d'; c.lineWidth = 1; c.stroke();
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4; c.beginPath(); c.moveTo(Math.cos(a) * (outer - 10), Math.sin(a) * (outer - 10));
        c.lineTo(Math.cos(a) * (outer - 4), Math.sin(a) * (outer - 4)); c.stroke();
    }
    if (aim && target?.kind !== 'self') {
        const r = outer - 10; c.strokeStyle = color; c.lineWidth = 2;
        c.beginPath(); c.moveTo(Math.cos(aim.angle) * inner, Math.sin(aim.angle) * inner); c.lineTo(Math.cos(aim.angle) * r, Math.sin(aim.angle) * r); c.stroke();
        circle(c, Math.cos(aim.angle) * r, Math.sin(aim.angle) * r, 5); c.fillStyle = color; c.fill();
    }
    circle(c, 0, 0, inner); c.fillStyle = INK; c.fill(); c.strokeStyle = '#7b9ba5'; c.lineWidth = 1; c.stroke();
    c.fillStyle = color; c.font = 'bold 11px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(target ? target.kind === 'fish' ? '敲晕' : target.kind === 'fishKnot' || target.kind === 'self' || target.kind === 'untie' ? '解绳' : '拆段' : '取消', 0, 0);
    c.font = '10px Arial'; c.fillStyle = '#bfcecb'; c.fillText('只选方向 · 中心取消', 0, outer + 12); c.restore();
    const ends = getPlayerRopeEnds();
    for (const socket of getSelfSockets(gesture.centerX, gesture.centerY, outer, ends.length)) {
        const selected = target?.kind === 'self' && target.link === ends[socket.index].link;
        circle(c, socket.x, socket.y, socket.radius); c.fillStyle = selected ? '#274238' : INK; c.fill(); c.strokeStyle = selected ? THREAD : '#90a89b'; c.stroke();
        c.font = '10px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#d5e4d5';
        c.fillText(ends.length === 1 ? '自己' : '绳' + (socket.index + 1), socket.x, socket.y);
    }
}
export function drawRopeTethersWorld(c: CanvasRenderingContext2D, left: number, right: number, top: number, bottom: number) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const link of state.rope.links) {
        if (link.path.length < 2 || !link.path.some(p => p.x > left - 100 && p.x < right + 100 && p.y > top - 100 && p.y < bottom + 100)) continue;
        c.strokeStyle = link.tension > .7 ? '#ead2a0' : CONFIG.ropeTightColor; c.lineWidth = CONFIG.ropeTightWidth; line(c, link.path);
        for (const end of [link.start, link.end]) {
            if (end.kind === 'fish') continue;
            const p = ropeEndpointPoint(end); circle(c, p.x, p.y, 3); c.fillStyle = '#ebd8ab'; c.fill();
        }
    }
    c.restore();
}
export function drawRemovedRopesWorld(c: CanvasRenderingContext2D) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = CONFIG.ropeTightWidth;
    const now = Date.now();
    for (const fade of state.rope.fading) {
        const t = Math.min(1, Math.max(0, (now - fade.startedAt) / fade.duration));
        c.save(); c.globalAlpha = (1 - t) * (1 - t) * .72; c.strokeStyle = '#c7c0a2';
        c.translate(0, 18 * t + 8 * t * t); line(c, fade.path); c.restore();
    }
    c.restore();
}
export function drawInteractionWorkWorld(c: CanvasRenderingContext2D) {
    const task = state.interaction.task;
    if (!task || task.phase !== 'perform' || task.kind !== 'tie') return;
    const work = getInteractionWorkPose()!, p = work.progress, fish = task.anchor?.fish;
    c.save(); c.strokeStyle = '#e8d1a0'; c.lineWidth = 1.6;
    if (fish && !fish.bound && p > .18) {
        const shape = fishShape(fish); c.translate(fish.x, fish.y); c.rotate(fish.angle);
        for (let i = 0; i < 2; i++) {
            const span = Math.max(0, Math.min(1, (p - .18) / .37 * 2 - i));
            if (span > 0) { c.beginPath(); c.ellipse(-CONFIG.fishEnemy.size * (.12 + i * .30), 0, 3.3, shape.radius + 1,
                -.12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * span); c.stroke(); }
        }
    } else if (!fish && p > .2) {
        const point = ropeAnchorPoint(task.anchor!); c.translate(point.x, point.y);
        c.beginPath(); c.arc(0, 0, 4.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, (p - .2) / .38)); c.stroke();
    }
    c.restore();
}
/** Kept as a world hook for compatibility; all text/progress moved off the actor. */
export function drawInteractionOverlayWorld(c:CanvasRenderingContext2D){
    const pulse=state.interaction.impact;if(!pulse)return;
    const t=Math.max(0,Math.min(1,(Date.now()-pulse.startedAt)/260)),r=7+30*t;
    c.save();c.translate(pulse.point.x,pulse.point.y);c.rotate(pulse.angle);c.lineCap='round';
    c.globalAlpha=(1-t)*(1-t);c.strokeStyle=pulse.kind==='stun'?'#ffe3ab':'#e9eadb';c.lineWidth=2.4*(1-t)+.5;
    c.beginPath();c.arc(0,0,r,-1.3,1.3);c.stroke();c.lineWidth=1.2;c.beginPath();c.arc(0,0,r*.68,-1.1,1.1);c.stroke();
    for(let i=0;i<8;i++){const a=-1.55+i*.44,n=11+(i%3)*5;c.beginPath();c.moveTo(Math.cos(a)*r*.4,Math.sin(a)*r*.4);
        c.lineTo(Math.cos(a)*(r*.4+n*(1-t)),Math.sin(a)*(r*.4+n*(1-t)));c.stroke();}
    if(t<.28){c.fillStyle='#fff1c9';c.globalAlpha=(1-t/.28)*.75;c.beginPath();c.ellipse(0,0,4.5,7,0,0,Math.PI*2);c.fill();}
    c.restore();
}
export function getInteractionStatusRect() {
    const L = getUILayout(), x = L.left + (L.landscape ? (state.mazeRescue?.rockTrial ? 300 : 190) : 56);
    const right = CONFIG.screenWidth - (L.landscape ? Math.max(112, L.right) : L.right);
    return { x, y: L.top + (L.landscape ? 50 : 8), width: Math.min(240, right - x), height: 34 };
}
export function drawInteractionHUD(c: CanvasRenderingContext2D) {
    if (!isInteractionPlay()) return;
    const task = state.interaction.task, action = state.interaction.aim, rope = getRopeWheelAim(), feedback = state.interaction.feedback;
    let text = '', secondary = '', color = THREAD;
    if (task) {
        text = task.phase === 'approach' ? '靠近操作位置' : sampleWorkMotion(getInteractionWorkPose()!).phase;
        secondary = '移动或点取消可中断';
    } else if (state.interaction.gesture) {
        text = action?.target ? actionTargetLabel(action.target) : '转向，选择碰到的第一个对象';
        secondary = action?.target ? '松手执行 · 整段高亮为实际拆除范围' : '鱼优先于前方网线';
        color = colorFor(action?.target);
    } else if (state.wheel.open) {
        text = rope?.target ? rope.target.kind === 'fish' ? '绑鱼' : rope.target.kind === 'self' ? '系到自己腰扣' : '绑到' + (rope.target.kind === 'rock' ? '岩石' : '绳结') : '只选方向，不用拖远近';
        secondary = '松手后靠近并绑绳';
    } else if (feedback) { text = feedback.text; color = feedback.success ? READY : '#bdcfcb'; }
    else if (state.fishBump.stunTimer > 0) text = '撞晕了 · 马上恢复';
    if (!text) return;
    const rect = getInteractionStatusRect();
    c.save(); c.fillStyle = 'rgba(5,22,29,.82)'; c.fillRect(rect.x, rect.y, rect.width, secondary ? rect.height : 21);
    c.fillStyle = color; c.font = '11px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, rect.x + rect.width / 2, rect.y + 10.5, rect.width - 10);
    if (secondary) { c.fillStyle = '#a2b7b6'; c.font = '9px Arial'; c.fillText(secondary, rect.x + rect.width / 2, rect.y + 26, rect.width - 10); }
    c.restore();
}
