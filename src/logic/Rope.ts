import { CONFIG } from '../core/config';
import { state, player, createLooseRope } from '../core/state';
import { buildAvoidedPath } from './Pathfinding';
import { closestRockPoint, circleHitsRock } from '../world/RockGeometry';
import { isLineOfSight } from '../world/Visibility';
import { getRopeNet, pointOnStrand, sweepRopeNet } from './RopeNet';
import { deformNetPoint, moveThroughNet, netResponseAlong, resetNetMotion, stepNetMotion, viewNetContact } from './RopeDynamics';
import type { RopeBody } from './RopeDynamics';
import type { RopePoint } from './RopeNet';

function getActiveWalls() {
    if (state.screen === 'mazeRescue' && state.mazeRescue) {
        return state.mazeRescue.mazeWalls;
    }
    return state.walls;
}

// 辅助函数：在 maxDist 范围内找最近的墙壁
export function findNearestWall(x: number, y: number, maxDist: number): any {
    let nearest: any = null;
    let minDist = maxDist;
    const walls = getActiveWalls();
    if(!walls) return null;
    for(let wall of walls) {
        const point=closestRockPoint(wall,x,y);
        if(wall.rockPolygon && walls.some(other=>other!==wall && circleHitsRock(other,point.x,point.y,0)))continue;
        let dist = point.dist;
        if(dist < minDist) {
            minDist = dist;
            nearest = wall;
        }
    }
    if(!nearest) return null;
    return { wall: nearest, dist: minDist };
}

export interface RopeAnchor {
    point: RopePoint;
    wall?: any;
    onRope?: boolean;
}

function startRopeAt(anchor: RopeAnchor) {
    const { point, wall, onRope } = anchor;
    state.rope.active = true;
    state.rope.current = {
        start: point, startWall: wall || null, startOnRope: !!onRope,
        path: buildAvoidedPath(point, { x: player.x, y: player.y }, CONFIG.ropeAvoidPadding),
        slackFactor: 1, time: 0,
    };
}

export function cancelRopePlacement() {
    state.rope.active = false;
    state.rope.current = createLooseRope();
}

function endRopeAt(anchor: RopeAnchor): boolean {
    const { start, startWall, startOnRope } = state.rope.current;
    if (!state.rope.active || !start || Math.hypot(start.x - anchor.point.x, start.y - anchor.point.y) < 12) return false;
    const path = buildAvoidedPath(start, anchor.point, CONFIG.ropeAvoidPadding);
    if (path.length < 2) return false;
    if (path.slice(1).some((p, i) =>
        !isLineOfSight(path[i].x, path[i].y, p.x, p.y, Infinity))) return false;
    const ropes = state.rope.ropes;
    const strands = getRopeNet(ropes).strands;
    if (startOnRope && !strands.some(s => pointOnStrand(start, s.a, s.b))) {
        cancelRopePlacement();
        return false;
    }
    if (path.slice(1).every((b, i) => strands.some(s => pointOnStrand(path[i], s.a, s.b) && pointOnStrand(b, s.a, s.b)))) return false;
    // Insert selected endpoints into their parent paths so the exact join survives saving.
    for (const p of [startOnRope && start, anchor.onRope && anchor.point]) {
        if (!p) continue;
        for (const rope of ropes) {
            for (let i = rope.path.length - 1; i > 0; i--) {
                const a = rope.path[i - 1], b = rope.path[i];
                if (pointOnStrand(p, a, b) && Math.hypot(p.x - a.x, p.y - a.y) > .025 &&
                    Math.hypot(p.x - b.x, p.y - b.y) > .025) rope.path.splice(i, 0, p);
            }
        }
    }
    // Replace the list so the collision geometry is rebuilt, even after a remove/add pair.
    state.rope.ropes = ropes.concat({
        start, startWall, startOnRope, end: anchor.point, endWall: anchor.wall || null,
        endOnRope: anchor.onRope, path, slackFactor: 0, mode: 'tight',
    });
    cancelRopePlacement();
    return true;
}

export function placeRopeAt(anchor: RopeAnchor): boolean {
    if (state.rope.active) return endRopeAt(anchor);
    startRopeAt(anchor);
    return true;
}

export function traceWovenRopes(from: RopePoint, to: RopePoint, radius: number) {
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length) return null;
    return sweepRopeNet(getRopeNet(state.rope.ropes), from, to, radius);
}

// The diver's sustained kick and a fish's burst use different speed ranges.
const impactReference = (body: RopePoint & { kind?: string }) => {
    if (body === player) return 3.6;
    // A curious fish's broad fins load the mesh even on a slow approach.
    return body.kind === 'curious' ? 2.55 : 13;
};

export function resolveWovenRopeContact(
    body: RopeBody, from: RopePoint, radius: number, intent: RopePoint,
    canOccupy: (x: number, y: number) => boolean,
) {
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length) return null;
    return moveThroughNet(getRopeNet(state.rope.ropes), body, from, radius, impactReference(body), intent, canOccupy);
}

export function getRopeContact(body: RopeBody) {
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length) return null;
    return viewNetContact(getRopeNet(state.rope.ropes), body);
}

export function getRopeApproach(body: RopeBody, radius: number) {
    const speed = Math.hypot(body.vx, body.vy);
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length || speed < .7 || getRopeContact(body)) return null;
    const ahead = Math.min(42, 112 / speed);
    const aim = { x: body.x + body.vx * ahead, y: body.y + body.vy * ahead };
    const result = getRopeResponseAlong(body, aim, radius, body.vx, body.vy);
    return result && isLineOfSight(body.x, body.y, result.x, result.y, 120) ? result : null;
}

export function getRopeResponseAlong(from: RopePoint, to: RopePoint, radius: number, vx: number, vy: number) {
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length) return null;
    return netResponseAlong(getRopeNet(state.rope.ropes), from, to, radius, vx, vy, impactReference(from));
}

export function getRopeDeformedPoint(point: RopePoint, ropeIndex: number) {
    if (state.screen !== 'mazeRescue') return point;
    return deformNetPoint(getRopeNet(state.rope.ropes), point, ropeIndex);
}

export function updateRopeMotion() {
    if (state.rope.ropes.length) stepNetMotion(getRopeNet(state.rope.ropes));
}

export function resetRopeMotion() {
    if (state.rope.ropes.length) resetNetMotion(getRopeNet(state.rope.ropes));
}

export function updateRopeSystem() {
    if (!state.rope.active || !state.rope.current.start) return;
    const current = state.rope.current;
    current.time += 1 / 60;
    current.path = buildAvoidedPath(current.start, { x: player.x, y: player.y }, CONFIG.ropeAvoidPadding);
}
