import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import { getActiveMapContext, isLineOfSight } from '../world/Visibility';
import { rockSegmentClear } from '../world/RockGeometry';
import { activeWorld } from '../world/continuous/Geometry';
import { fishKnotPoint, fishNetHandlePoint, fishName } from './FishGeometry';
import { firstInteractionHit, fishLocalPoint, fishWorldPoint } from './InteractionRay';
import { fishPocketCuts, getPlayerRopeEnds, getRopeDeformedPoint, getRopeRemoval, playerRopePoint, ropeEndpointPoint } from './Rope';
import { isRemovalPlanValid } from './RopeTopology';
import { projectOntoStrand } from './RopeNet';
import { getSelfSockets } from './InteractionLayout';
import type { ActionAim, ActionGesture, ActionTarget } from './InteractionTypes';
import type { RopePoint } from './RopeNet';

export function interactionScope(): object { return state.screen === 'mazeRescue' && state.mazeRescue ? state.mazeRescue : state.rope; }
export function isInteractionPlay() {
    return !state.fishBite?.active && (state.screen === 'play' && player.y > 0 ||
        state.screen === 'mazeRescue' && state.mazeRescue?.phase === 'play' || state.screen === 'fishArena' && state.fishArena?.phase === 'fight');
}
export function actionTargetPoint(target: ActionTarget): RopePoint {
    if (target.kind === 'fish') return target.localPoint ? fishWorldPoint(target.fish!, target.localPoint) : target.point;
    if (target.kind === 'fishKnot') return fishKnotPoint(target.fish!);
    if (target.kind === 'net') return fishNetHandlePoint(target.fish!);
    if (target.kind === 'self') return ropeEndpointPoint(target.link![target.end!]);
    if (target.rope) { const i = state.rope.ropes.indexOf(target.rope); return i >= 0 ? getRopeDeformedPoint(target.point, i) : target.point; }
    if (target.kind === 'tether') {
        let best = target.point, distance = Infinity;
        for (let i = 1; i < target.link!.path.length; i++) {
            const q = projectOntoStrand(target.point, target.link!.path[i - 1], target.link!.path[i]), d = Math.hypot(q.x - target.point.x, q.y - target.point.y);
            if (d < distance) { distance = d; best = q; }
        }
        return best;
    }
    return target.point;
}
export function actionTargetLabel(target: ActionTarget) {
    if (target.kind === 'fish') return '敲晕 · ' + fishName(target.fish!);
    if (target.kind === 'fishKnot') return '解鱼绳 · ' + fishName(target.fish!);
    if (target.kind === 'net') return '拆这张网 · ' + new Set(target.removal?.removed.map(s=>s.rope)||[]).size + '根绳';
    if (target.kind === 'self') return '解自己 · 绳' + target.link!.id;
    if (target.kind === 'tether') return '拆牵引绳 · ' + target.link!.id;
    return '拆整组绳 · ' + new Set(target.removal?.removed.map(s=>s.rope)||[]).size + '根';
}
export function isActionTargetValid(target: ActionTarget) {
    if (target.fish && (target.fish.dead || !state.fishEnemies.includes(target.fish))) return false;
    if (target.removal && !isRemovalPlanValid(target.removal, state.rope.ropes)) return false;
    if (target.kind === 'fishKnot') return !!target.fish?.bound;
    if (target.kind === 'net') return !!target.removal?.selected.length && fishPocketCuts(target.fish!).length > 0;
    if (target.kind === 'cut' || target.kind === 'untie') return !!target.removal?.selected.length;
    if (target.kind === 'self') return state.rope.links.includes(target.link!) && target.link![target.end!].kind === 'player';
    if (target.kind === 'tether') return state.rope.links.includes(target.link!);
    return target.kind === 'fish';
}
export function visibleInteractionPoint(point: RopePoint, range = Infinity) {
    return isLineOfSight(player.x, player.y, point.x, point.y, range) &&
        (activeWorld() || rockSegmentClear(getActiveMapContext().walls || [], player, point));
}

/** Legacy reach arguments are ignored; only the ray direction chooses targets. */
export function pickActionTarget(angle: number, _legacyReach?: number, fishOnly = false): ActionAim {
    const range = CONFIG.fishInteraction.actionRange, hit = firstInteractionHit(angle, range, !fishOnly, fishOnly);
    const pointer = { x: player.x + Math.cos(angle) * range, y: player.y + Math.sin(angle) * range };
    let target: ActionTarget | null = null;
    if (hit?.fish) {
        target = { kind: hit.kind as 'fish' | 'fishKnot' | 'net', fish: hit.fish, point: hit.point,
            localPoint: hit.kind === 'fish' ? fishLocalPoint(hit.fish, hit.point) : undefined };
        if (hit.kind === 'net') { target.cuts = fishPocketCuts(hit.fish); target.removal = getRopeRemoval(target.cuts, angle); }
    } else if (hit?.kind === 'rope') {
        const point = hit.restPoint!, rope = hit.rope;
        const end = Math.hypot(point.x - rope.start.x, point.y - rope.start.y) < 5 ? 'start'
            : Math.hypot(point.x - rope.end.x, point.y - rope.end.y) < 5 ? 'end' : undefined;
        target = { kind: end ? 'untie' : 'cut', rope, point, end, removal: getRopeRemoval([{ rope, point }], angle) };
    } else if (hit?.kind === 'link') target = { kind: 'tether', link: hit.link, point: hit.point };
    return { angle, reach: range, pointer, target };
}
function sameTarget(a: ActionTarget, b: ActionTarget) {
    if (a.kind !== b.kind) return false;
    if (a.fish) return a.fish === b.fish;
    if (a.link) return a.link === b.link && a.end === b.end;
    const sa = a.removal?.selected[0], sb = b.removal?.selected[0];
    return !!sa && !!sb && a.removal?.removed[0]?.rope === b.removal?.removed[0]?.rope;
}
export function aimActionGesture(gesture: ActionGesture, preserveTarget = false): ActionAim | null {
    if (gesture.scope !== interactionScope() || !isInteractionPlay() || preserveTarget && gesture.selectionLost) return null;
    const { wheelRadius: outer, wheelInnerRadius: inner } = CONFIG.fishInteraction;
    const dx = gesture.x - gesture.centerX, dy = gesture.y - gesture.centerY;
    const ends = getPlayerRopeEnds();
    if (gesture.dragged) for (const socket of getSelfSockets(gesture.centerX, gesture.centerY, outer, ends.length)) {
        if (Math.hypot(gesture.x - socket.x, gesture.y - socket.y) <= socket.radius) {
            const { link, end } = ends[socket.index], point = playerRopePoint();
            return { angle: player.angle, reach: 0, pointer: point, target: { kind: 'self', link, end, point } };
        }
    }
    if (gesture.dragged && Math.hypot(dx, dy) <= inner) return null;
    const next = pickActionTarget(gesture.dragged ? Math.atan2(dy, dx) : player.angle, undefined, !gesture.dragged);
    const previous = state.interaction.aim?.target;
    if (preserveTarget && previous) {
        const valid = isActionTargetValid(previous) && !!next.target && sameTarget(previous, next.target);
        if (!valid) gesture.selectionLost = true;
        return { ...next, target: valid ? previous : null };
    }
    return next;
}
