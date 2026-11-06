import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import { circleHitsRock, closestRockPoint, rayHitsRock } from '../world/RockGeometry';
import type { RockWall } from '../world/RockGeometry';
import { getActiveMapContext, isLineOfSight } from '../world/Visibility';
import { cancelRopePlacement, placeRopeAt } from './Rope';
import { resetDriveInput } from './DriveMode';
import type { RopeAnchor } from './Rope';
import { getRopeNet, projectOntoStrand } from './RopeNet';
import type { RopePoint } from './RopeNet';

const CANCEL_HOLD_MS = 650;
const DRAG_THRESHOLD = 9;
const OPEN_HOLD_MS = 170;
// Hand a drag to swimming before it reaches the joystick's 10 px dead zone.
const SWIM_HANDOFF_DISTANCE = 8;

type AnchorKind = 'rock' | 'strand' | 'knot';
interface AimTarget { kind: AnchorKind; anchor: RopeAnchor; ropeIndex?: number }
interface RopeAim { angle: number; reach: number; pointer: RopePoint; target: AimTarget | null }
interface Gesture { touchId: number; x: number; y: number; startX: number; startY: number; dragged: boolean; openedAt: number }
interface RopePress {
    touchId: number;
    start: RopePoint;
    center: RopePoint;
    startedAt: number;
    screen: string;
    maze: typeof state.mazeRescue;
}
let press: RopePress | null = null;
let gesture: Gesture | null = null;
let aim: RopeAim | null = null;

export function canUseRopeWheel() {
    return !state.fishBite?.active && (state.screen === 'play' && player.y > 0 ||
        state.screen === 'mazeRescue' && state.mazeRescue?.phase === 'play');
}

function rockHitDistance(wall: RockWall, dx: number, dy: number, range: number) {
    if (wall.rockPolygon) return rayHitsRock(wall, player.x, player.y, dx, dy, range);
    const wx = wall.x - player.x, wy = wall.y - player.y;
    const across = wx * dy - wy * dx;
    if (Math.abs(across) > wall.r) return range;
    const hit = wx * dx + wy * dy - Math.sqrt(Math.max(0, wall.r * wall.r - across * across));
    return hit > .001 && hit < range ? hit : range;
}

/** The thumb selects a direction and a reach. Along the ray, two strands at
 * different depths can both be selected. Between rays, the nearest point on a
 * strand or rock face makes small adjustments possible without pixel hunting. */
export function aimRopeAnchor(angle: number, reach: number): RopeAim {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const range = CONFIG.ropeAnchorDistance;
    const pointer = { x: player.x + dx * reach, y: player.y + dy * reach };
    const { strands, knots } = getRopeNet(state.rope.ropes);
    const walls: RockWall[] = (getActiveMapContext().walls || []).filter(wall =>
        Math.abs(player.x - wall.x) <= wall.r + range && Math.abs(player.y - wall.y) <= wall.r + range);
    const start = state.rope.active ? state.rope.current.start : null;
    let target: AimTarget | null = null;
    let best = Infinity;
    const consider = (kind: AnchorKind, point: RopePoint, wall?: any, ropeIndex?: number) => {
        const rx = point.x - player.x, ry = point.y - player.y;
        const depth = rx * dx + ry * dy;
        const lateral = Math.abs(rx * dy - ry * dx);
        const distance = Math.hypot(rx, ry);
        if (depth < 1 || lateral > 9 || distance > range ||
            (start && Math.hypot(point.x - start.x, point.y - start.y) < 12)) return;
        const snap = kind === 'knot' && lateral < 5 && Math.abs(depth - reach) < 12 ? 7 : 0;
        const score = Math.abs(depth - reach) + 2.1 * lateral - snap;
        if (score >= best || walls.some(w => rockHitDistance(w, rx / distance, ry / distance, distance) < distance - .02) ||
            !isLineOfSight(player.x, player.y, point.x, point.y, range)) return;
        best = score;
        target = { kind, anchor: { point, wall, onRope: !wall }, ropeIndex };
    };
    for (const knot of knots) consider('knot', { x: knot.x, y: knot.y }, undefined, knot.ropes.values().next().value);
    for (const { a, b, rope } of strands) {
        if (player.x + range < Math.min(a.x, b.x) || player.x - range > Math.max(a.x, b.x) ||
            player.y + range < Math.min(a.y, b.y) || player.y - range > Math.max(a.y, b.y)) continue;
        consider('strand', projectOntoStrand(pointer, a, b), undefined, rope);
        const sx = b.x - a.x, sy = b.y - a.y;
        const cross = dx * sy - dy * sx;
        if (Math.abs(cross) < 1e-6) continue;
        const t = ((a.x - player.x) * dy - (a.y - player.y) * dx) / cross;
        if (t >= 0 && t <= 1) consider('strand', { x: a.x + sx * t, y: a.y + sy * t }, undefined, rope);
    }
    for (const wall of walls) {
        const addSurface = (x: number, y: number) => {
            const length = Math.hypot(player.x - x, player.y - y);
            if (length < .25) return;
            // Keep the exact surface anchor just inside the water for line-of-sight and routing.
            const point = { x: x + (player.x - x) * .25 / length, y: y + (player.y - y) * .25 / length };
            if (!circleHitsRock(wall, point.x, point.y, 0)) consider('rock', point, wall);
        };
        const projected = closestRockPoint(wall, pointer.x, pointer.y);
        addSurface(projected.x, projected.y);
        const hit = rockHitDistance(wall, dx, dy, range);
        if (hit > .25 && hit < range) addSurface(player.x + dx * hit, player.y + dy * hit);
    }
    return { angle, reach, pointer, target };
}

export function startRopeWheelPress(touchId: number, x: number, y: number, centerX: number, centerY: number) {
    if (!canUseRopeWheel() || state.wheel.open || press) return false;
    press = { touchId, start: { x, y }, center: { x: centerX, y: centerY }, startedAt: Date.now(),
        screen: state.screen, maze: state.mazeRescue };
    return true;
}

export function cancelRopeWheelPress(touchId?: number) {
    if (!press || (touchId !== undefined && press.touchId !== touchId)) return false;
    press = null;
    return true;
}

export function passRopePressToSwim(touchId: number, x: number, y: number) {
    if (press?.touchId !== touchId || Math.hypot(x - press.start.x, y - press.start.y) <= SWIM_HANDOFF_DISTANCE) return null;
    const origin = press.start;
    press = null;
    return origin;
}

export function getRopePressProgress(now = Date.now()) {
    return press ? Math.max(0, Math.min(1, (now - press.startedAt) / OPEN_HOLD_MS)) : 0;
}

export function advanceRopeWheelPress() {
    if (!press) return;
    if (!canUseRopeWheel() || press.screen !== state.screen || press.maze !== state.mazeRescue) {
        press = null;
        return;
    }
    if (getRopePressProgress() < 1) return;
    const { touchId, start: { x, y }, center, startedAt } = press;
    press = null;
    state.wheel.open = true;
    state.wheel.expandProgress = 0;
    state.wheel.touchId = touchId;
    state.wheel.centerX = center.x;
    state.wheel.centerY = center.y;
    gesture = { touchId, x, y, startX: x, startY: y, dragged: false, openedAt: startedAt };
    aim = null;
    resetDriveInput();
}

export function refreshRopeWheelAim() {
    if (!state.wheel.open || !gesture || !canUseRopeWheel() || !gesture.dragged) {
        aim = null;
        return;
    }
    const { wheelInnerRadius: inner, wheelOuterRadius: outer } = CONFIG.marker;
    const dx = gesture.x - state.wheel.centerX, dy = gesture.y - state.wheel.centerY;
    const distance = Math.hypot(dx, dy);
    if (distance <= inner) { aim = null; return; }
    const fraction = Math.min(1, (distance - inner) / Math.max(1, outer - inner));
    aim = aimRopeAnchor(Math.atan2(dy, dx), CONFIG.ropeAnchorDistance * fraction);
}

export function moveRopeWheelGesture(touchId: number, x: number, y: number) {
    if (!state.wheel.open || gesture?.touchId !== touchId) return false;
    gesture.x = x;
    gesture.y = y;
    gesture.dragged ||= Math.hypot(x - gesture.startX, y - gesture.startY) >= DRAG_THRESHOLD;
    refreshRopeWheelAim();
    return true;
}

export function getRopeWheelAim() {
    return state.wheel.open && canUseRopeWheel() ? aim : null;
}

export function getRopeCancelProgress(now = Date.now()) {
    if (!state.wheel.open || !state.rope.active || !gesture || gesture.dragged) return 0;
    if (Math.hypot(gesture.x - state.wheel.centerX, gesture.y - state.wheel.centerY) > CONFIG.marker.wheelInnerRadius) return 0;
    return Math.min(1, (now - gesture.openedAt) / CANCEL_HOLD_MS);
}

export function finishRopeWheelGesture(touchId: number, x: number, y: number, cancelled: boolean) {
    if (!state.wheel.open || gesture?.touchId !== touchId) return null;
    let changed = false;
    if (!cancelled && canUseRopeWheel()) {
        if (!aim || Math.hypot(x - gesture.x, y - gesture.y) > 1) moveRopeWheelGesture(touchId, x, y);
        if (aim?.target) changed = placeRopeAt(aim.target.anchor);
        else if (getRopeCancelProgress() >= 1) {
            cancelRopePlacement();
            changed = true;
        }
    }
    state.wheel.open = false;
    state.wheel.expandProgress = 0;
    state.wheel.touchId = null;
    gesture = null;
    aim = null;
    return changed;
}
