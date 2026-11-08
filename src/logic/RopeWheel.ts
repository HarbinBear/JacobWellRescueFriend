import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import { cancelRopePlacement, playerRopePoint } from './Rope';
import { beginRopeInteraction, cancelInteraction } from './Interaction';
import { interactionScope } from './ActionTargets';
import { firstInteractionHit, fishLocalPoint } from './InteractionRay';
import { getSelfSockets } from './InteractionLayout';
import { isFishStunned } from './FishHandling';
import { getRopeNet } from './RopeNet';
import type { RopeAnchor } from './Rope';
import type { RopePoint } from './RopeNet';

const CANCEL_HOLD_MS = 650, DRAG_THRESHOLD = 7;
export type AnchorKind = 'rock' | 'strand' | 'knot' | 'fish' | 'self';
export interface AimTarget { kind: AnchorKind; anchor: RopeAnchor; ropeIndex?: number }
export interface RopeAim { angle: number; reach: number; pointer: RopePoint; target: AimTarget | null }
interface Gesture { touchId: number; x: number; y: number; startX: number; startY: number; dragged: boolean; openedAt: number; scope: object; selectionLost?: boolean }
let gesture: Gesture | null = null, aim: RopeAim | null = null;
export function canUseRopeWheel() {
    return !state.fishBite?.active && state.fishBump.stunTimer <= 0 && !state.interaction.gesture &&
        (state.screen === 'play' && player.y > 0 || state.screen === 'mazeRescue' && state.mazeRescue?.phase === 'play');
}
/** The second legacy parameter has no effect. Collision determines the point. */
export function aimRopeAnchor(angle: number, _legacyReach?: number): RopeAim {
    const range = CONFIG.ropeAnchorDistance, hit = firstInteractionHit(angle, range);
    const pointer = { x: player.x + Math.cos(angle) * range, y: player.y + Math.sin(angle) * range };
    let target: AimTarget | null = null;
    if (hit?.kind === 'fish') {
        if ((hit.fish!.bound || isFishStunned(hit.fish!)) && state.rope.current.startAttachment?.fish !== hit.fish)
            target = { kind: 'fish', anchor: { point: hit.point, fish: hit.fish, fishContact: fishLocalPoint(hit.fish!, hit.point) } };
    } else if (hit?.kind === 'rope') {
        const point = hit.restPoint!, net = getRopeNet(state.rope.ropes);
        const knot = net.knots.find(k => Math.hypot(k.x - point.x, k.y - point.y) <= 4.5);
        const at = knot ? { x: knot.x, y: knot.y } : point;
        target = { kind: knot ? 'knot' : 'strand', anchor: { point: at, onRope: true, rope: hit.rope }, ropeIndex: hit.ropeIndex };
    } else if (hit?.kind === 'rock' && hit.wall) {
        const point = { x: hit.point.x - Math.cos(angle) * .3, y: hit.point.y - Math.sin(angle) * .3 };
        target = { kind: 'rock', anchor: { point, wall: hit.wall } };
    }
    const start = state.rope.active ? state.rope.current.start : null;
    if (target && start && Math.hypot(target.anchor.point.x - start.x, target.anchor.point.y - start.y) < 12) target = null;
    return { angle, reach: range, pointer, target };
}
export function startRopeWheelGesture(touchId: number, x: number, y: number, centerX: number, centerY: number) {
    if (!canUseRopeWheel() || state.wheel.open) return false;
    if (state.interaction.task) { cancelInteraction(true); return true; }
    state.wheel.open = true; state.wheel.expandProgress = 1; state.wheel.touchId = touchId;
    state.wheel.centerX = centerX; state.wheel.centerY = centerY;
    gesture = { touchId, x, y, startX: x, startY: y, dragged: false, openedAt: Date.now(), scope: interactionScope() };
    aim = null; return true;
}
export function refreshRopeWheelAim(preserveTarget = true) {
    if (!state.wheel.open || !gesture || !canUseRopeWheel() || !gesture.dragged || gesture.scope !== interactionScope() || preserveTarget && gesture.selectionLost) {
        aim = null; return;
    }
    const { wheelInnerRadius: inner, wheelOuterRadius: outer } = CONFIG.marker;
    if (state.rope.active) {
        const socket = getSelfSockets(state.wheel.centerX, state.wheel.centerY, outer)[0];
        if (Math.hypot(gesture.x - socket.x, gesture.y - socket.y) <= socket.radius) {
            const point = playerRopePoint(); aim = { angle: player.angle, reach: 0, pointer: point, target: { kind: 'self', anchor: { point, self: true } } }; return;
        }
    }
    const dx = gesture.x - state.wheel.centerX, dy = gesture.y - state.wheel.centerY;
    if (Math.hypot(dx, dy) <= inner) { aim = null; return; }
    const next = aimRopeAnchor(Math.atan2(dy, dx)), previous = aim?.target;
    if (preserveTarget && previous) {
        const valid = next.target?.kind === previous.kind && (previous.anchor.fish ? next.target?.anchor.fish === previous.anchor.fish
            : previous.anchor.rope ? next.target?.anchor.rope === previous.anchor.rope : next.target?.anchor.wall === previous.anchor.wall);
        if (!valid) gesture.selectionLost = true;
        aim = { ...next, target: valid ? previous : null };
    } else aim = next;
}
export function moveRopeWheelGesture(touchId: number, x: number, y: number) {
    if (!state.wheel.open || gesture?.touchId !== touchId) return false;
    gesture.x = x; gesture.y = y; gesture.selectionLost = false;
    gesture.dragged ||= Math.hypot(x - gesture.startX, y - gesture.startY) >= DRAG_THRESHOLD;
    refreshRopeWheelAim(false); return true;
}
export function getRopeWheelAim() { return state.wheel.open && canUseRopeWheel() ? aim : null; }
export function getRopeCancelProgress(now = Date.now()) {
    if (!state.wheel.open || !state.rope.active || !gesture || gesture.dragged) return 0;
    if (Math.hypot(gesture.x - state.wheel.centerX, gesture.y - state.wheel.centerY) > CONFIG.marker.wheelInnerRadius) return 0;
    return Math.min(1, (now - gesture.openedAt) / CANCEL_HOLD_MS);
}
export function finishRopeWheelGesture(touchId: number, x: number, y: number, cancelled: boolean) {
    if (!state.wheel.open || gesture?.touchId !== touchId) return null;
    let changed = false;
    if (!cancelled && canUseRopeWheel() && gesture.scope === interactionScope() && Math.hypot(x - gesture.x, y - gesture.y) <= 9) {
        const centered = gesture.dragged && Math.hypot(x - state.wheel.centerX, y - state.wheel.centerY) <= CONFIG.marker.wheelInnerRadius;
        if (aim?.target && !centered) changed = beginRopeInteraction(aim.target.anchor);
        else if (getRopeCancelProgress() >= 1) { cancelRopePlacement(); changed = true; }
    }
    state.wheel.open = false; state.wheel.expandProgress = 0; state.wheel.touchId = null; gesture = null; aim = null; return changed;
}
