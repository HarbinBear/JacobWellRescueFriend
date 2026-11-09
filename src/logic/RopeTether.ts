import { activeWorld, circleCollision } from '../world/continuous/Geometry';
import { routeWorldTether, worldSegmentClear } from '../world/continuous/Routes';
import { fishKnotPoint } from './FishGeometry';
import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import { getActiveMapContext, isLineOfSight } from '../world/Visibility';
import { circleHitsRock, rockSegmentClear } from '../world/RockGeometry';
import { buildAvoidedPath, pathLength } from './Pathfinding';
import { ropeEndpointPoint, traceWovenRopes, detachTetherEnd } from './Rope';
import type { RopeEndpoint, TetherLine } from './InteractionTypes';
import type { RopePoint } from './RopeNet';

function bodyFor(endpoint: RopeEndpoint) {
    return endpoint.kind === 'player' ? player : endpoint.kind === 'fish' ? endpoint.fish : null;
}

function canMove(body: any, from: RopePoint, to: RopePoint) {
    const context = getActiveMapContext();
    const radius = activeWorld() ? (body===player?18:CONFIG.fishEnemy.size*(body.kind==='shoal'?.18:body.kind==='rammer'?.48:body.kind==='provoked'?.64:.38)) : (state.screen === 'mazeRescue' ? CONFIG.maze.playerRadius : CONFIG.playerRadius);
    if(activeWorld()){
        if(body!==player&&body.bound){const knot=fishKnotPoint(body);if(circleCollision(to.x+knot.x-body.x,to.y+knot.y-body.y,1.5))return false;}
        return !circleCollision(to.x,to.y,radius)&&worldSegmentClear(from,to,radius)&&!traceWovenRopes(from,to,radius);
    }
    const row = Math.floor(to.y / context.tileSize), col = Math.floor(to.x / context.tileSize);
    if (row < 0 || col < 0 || row >= context.rows || col >= context.cols || context.map[row]?.[col] === 2) return false;
    if ((context.walls || []).some(wall => circleHitsRock(wall, to.x, to.y, radius))) return false;
    return rockSegmentClear(context.walls || [], from, to, radius) && !traceWovenRopes(from, to, radius);
}

function routeLine(link: TetherLine, start: RopePoint, end: RopePoint) {
    if(activeWorld())return routeWorldTether(link,start,end);
    if (isLineOfSight(start.x, start.y, end.x, end.y, Infinity)) return [{ ...start }, { ...end }];
    // Full routing is needed only when the moving endpoint invalidates the old final leg.
    const old = link.path;
    if (old.length > 2 && rockSegmentClear(getActiveMapContext().walls || [], start, old[1], CONFIG.ropeAvoidPadding) &&
        rockSegmentClear(getActiveMapContext().walls || [], old[old.length - 2], end, CONFIG.ropeAvoidPadding)) {
        return [{ ...start }, ...old.slice(1, -1), { ...end }];
    }
    return buildAvoidedPath(start, end, CONFIG.ropeAvoidPadding);
}


function pullBody(endpoint: RopeEndpoint, neighbour: RopePoint, extension: number, otherMoves: boolean) {
    const body = bodyFor(endpoint);
    if (!body) return;
    const at = ropeEndpointPoint(endpoint), dx = neighbour.x - at.x, dy = neighbour.y - at.y;
    const distance = Math.hypot(dx, dy) || 1, nx = dx / distance, ny = dy / distance;
    const mass = activeWorld() ? (body === player ? (otherMoves ? .10 : .68) : endpoint.fish?.kind==='shoal' ? 2.1 : endpoint.fish?.kind==='curious' ? 1.6 : endpoint.fish?.kind==='rammer' ? 1.0 : .8) : (body === player ? (otherMoves ? .34 : .68) : .8);
    const along = body.vx * nx + body.vy * ny;
    const force = Math.max(0, Math.min(1.25, extension * CONFIG.fishInteraction.tetherSpring - along * .06)) * mass;
    body.vx += nx * force;
    body.vy += ny * force;
    // A short, swept correction bounds stretch without teleporting through terrain or nets.
    if (extension > CONFIG.fishInteraction.tetherStretch) {
        if (along < 0) { body.vx -= nx * along; body.vy -= ny * along; }
        const correction = Math.min(2.2, (extension - CONFIG.fishInteraction.tetherStretch) * .08) * mass;
        const from = { x: body.x, y: body.y }, to = { x: body.x + nx * correction, y: body.y + ny * correction };
        if (canMove(body, from, to)) { body.x = to.x; body.y = to.y; }
    }
}

export function updateRopeTethers() {
    for (const link of (state.rope.links || []).slice()) {
        for (const end of ['start', 'end'] as const) {
            const endpoint = link[end];
            if (endpoint.kind === 'fish' && (!endpoint.fish?.bound || !state.fishEnemies.includes(endpoint.fish))) detachTetherEnd(link, end);
            if (endpoint.kind === 'rope' && endpoint.rope && !state.rope.ropes.includes(endpoint.rope)) detachTetherEnd(link, end);
        }
        if(!state.rope.links.includes(link))continue;
        link.age++;
        const start = ropeEndpointPoint(link.start), end = ropeEndpointPoint(link.end);
        link.path = routeLine(link, start, end);
        if (link.path.length === 2) {
            const dx = end.x - start.x, dy = end.y - start.y, distance = Math.hypot(dx, dy) || 1;
            const sag = Math.min(10, Math.max(0, link.length - distance) * .22);
            if (sag > .1) {
                const pieces = Math.max(4, Math.ceil(distance / 12)), curve: RopePoint[] = [];
                for (let i = 0; i <= pieces; i++) {
                    const t = i / pieces, offset = Math.sin(t * Math.PI) * sag;
                    curve.push({ x: start.x + dx * t - dy / distance * offset, y: start.y + dy * t + dx / distance * offset });
                }
                if (curve.slice(1).every((p, i) => rockSegmentClear(getActiveMapContext().walls || [], curve[i], p))) link.path = curve;
            }
        }
        if (link.path.length < 2 || link.start.kind === 'loose' || link.end.kind === 'loose') { link.tension = 0; continue; }
        const extension = Math.max(0, pathLength(link.path) - link.length);
        link.tension = Math.min(1, extension / CONFIG.fishInteraction.tetherStretch);
        if (!extension) continue;
        pullBody(link.start, link.path[1], extension, !!bodyFor(link.end));
        pullBody(link.end, link.path[link.path.length - 2], extension, !!bodyFor(link.start));
    }
}
