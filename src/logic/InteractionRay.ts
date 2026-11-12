import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import { getActiveMapContext } from '../world/Visibility';
import { rayHitsRock, circleHitsRock } from '../world/RockGeometry';
import { getKarstTerrain, karstRay } from '../world/KarstTerrain';
import { activeWorld, circleCollision } from '../world/continuous/Geometry';
import { fishShape, fishKnotPoint, fishNetHandlePoint } from './FishGeometry';
import { getRopeContact, getRopeDeformedPoint } from './Rope';
import { projectOntoStrand } from './RopeNet';
import type { FishEnemy } from './FishEnemy';
import type { RopePoint } from './RopeNet';
import type { TetherLine } from './InteractionTypes';

export interface DirectionHit {
    kind: 'fish' | 'fishKnot' | 'net' | 'rope' | 'link' | 'rock';
    distance: number;
    point: RopePoint;
    restPoint?: RopePoint;
    fish?: FishEnemy;
    rope?: any;
    ropeIndex?: number;
    link?: TetherLine;
    wall?: any;
}

/** All distances here are measured collision results, never thumb-selected reach. */
export function rayCircle(origin: RopePoint, angle: number, center: RopePoint, radius: number, range: number) {
    const dx = Math.cos(angle), dy = Math.sin(angle), x = center.x - origin.x, y = center.y - origin.y;
    const along = x * dx + y * dy, across = x * dy - y * dx;
    if (Math.abs(across) > radius) return null;
    const chord = Math.sqrt(Math.max(0, radius * radius - across * across));
    if (along + chord < 0 || along - chord > range) return null;
    return Math.max(0, along - chord);
}

export function rayStrand(origin: RopePoint, angle: number, a: RopePoint, b: RopePoint, range: number, radius = 2.5) {
    const dx = Math.cos(angle), dy = Math.sin(angle), sx = b.x - a.x, sy = b.y - a.y;
    const length = Math.hypot(sx, sy);
    let best = Infinity;
    for (const p of [a, b]) {
        const t = rayCircle(origin, angle, p, radius, range);
        if (t !== null) best = Math.min(best, t);
    }
    if (length > .001) {
        const ux = sx / length, uy = sy / length;
        const side = (origin.x - a.x) * -uy + (origin.y - a.y) * ux;
        const speed = dx * -uy + dy * ux;
        if (Math.abs(speed) > 1e-8) for (const border of [-radius, radius]) {
            const t = (border - side) / speed;
            const along = (origin.x + dx * t - a.x) * ux + (origin.y + dy * t - a.y) * uy;
            if (t >= 0 && t <= range && along >= 0 && along <= length) best = Math.min(best, t);
        }
        const q = projectOntoStrand(origin, a, b);
        if (Math.hypot(q.x - origin.x, q.y - origin.y) <= radius) best = 0;
    }
    return best <= range ? { distance: best, point: projectOntoStrand({ x: origin.x + dx * best, y: origin.y + dy * best }, a, b) } : null;
}

function rayBox(origin: RopePoint, angle: number, x: number, y: number, size: number, range: number) {
    const d = [Math.cos(angle), Math.sin(angle)], o = [origin.x, origin.y], low = [x, y];
    let enter = 0, exit = range;
    for (let axis = 0; axis < 2; axis++) {
        if (Math.abs(d[axis]) < 1e-8) { if (o[axis] < low[axis] || o[axis] > low[axis] + size) return null; }
        else {
            const a = (low[axis] - o[axis]) / d[axis], b = (low[axis] + size - o[axis]) / d[axis];
            enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
        }
    }
    return enter <= exit ? enter : null;
}

export function firstRockHit(angle: number, range: number): DirectionHit | null {
    const map = getActiveMapContext(), dx = Math.cos(angle), dy = Math.sin(angle);
    let hit: DirectionHit | null = null;
    const add = (distance: number | null, wall?: any) => {
        if (distance === null || distance > range || hit && distance >= hit.distance) return;
        hit = { kind: 'rock', distance, point: { x: player.x + dx * distance, y: player.y + dy * distance }, wall };
    };
    const terrain=getKarstTerrain(state.screen==='mazeRescue'?state.mazeRescue:null);
    if(terrain){
        const contact=karstRay(terrain,player.x,player.y,dx,dy,range+.01);
        if(contact.wall)add(contact.distance,contact.wall);
        const w=(state.mazeRescue as any).continuous;for(const wall of [...w.banks,...w.boundaries])add(rayHitsRock(wall,player.x,player.y,dx,dy,range+.01),wall);
        return hit;
    }
    for (const wall of map.walls || []) {
        const distance = wall.rockPolygon ? rayHitsRock(wall, player.x, player.y, dx, dy, range + .01)
            : rayCircle(player, angle, wall, wall.r, range);
        add(distance, wall);
    }
    const end = { x: player.x + dx * range, y: player.y + dy * range }, ts = map.tileSize;
    for (let r = Math.floor(Math.min(player.y, end.y) / ts); r <= Math.floor(Math.max(player.y, end.y) / ts); r++) {
        for (let c = Math.floor(Math.min(player.x, end.x) / ts); c <= Math.floor(Math.max(player.x, end.x) / ts); c++) {
            if (map.map[r]?.[c] === 2) add(rayBox(player, angle, c * ts, r * ts, ts, range));
        }
    }
    return hit;
}

function rayFish(angle: number, fish: FishEnemy, range: number) {
    const shape = fishShape(fish), c = Math.cos(fish.angle), s = Math.sin(fish.angle);
    const x = player.x - fish.x, y = player.y - fish.y;
    const ox = (x * c + y * s) / shape.length, oy = (-x * s + y * c) / shape.radius;
    const dx = Math.cos(angle - fish.angle) / shape.length, dy = Math.sin(angle - fish.angle) / shape.radius;
    const a = dx * dx + dy * dy, b = ox * dx + oy * dy, k = ox * ox + oy * oy - 1;
    const det = b * b - a * k;
    if (det < 0 || a < 1e-9) return null;
    const exit = (-b + Math.sqrt(det)) / a, enter = Math.max(0, (-b - Math.sqrt(det)) / a);
    if (exit < 0 || enter > range) return null;
    const contact = k <= 0 ? Math.min(18, exit, range) : enter;
    return { distance: enter, point: { x: player.x + Math.cos(angle) * contact, y: player.y + Math.sin(angle) * contact } };
}

export function fishLocalPoint(fish: FishEnemy, point: RopePoint) {
    const x = point.x - fish.x, y = point.y - fish.y, c = Math.cos(fish.angle), s = Math.sin(fish.angle);
    return { x: x * c + y * s, y: -x * s + y * c };
}
export function fishWorldPoint(fish: FishEnemy, local: RopePoint) {
    const c = Math.cos(fish.angle), s = Math.sin(fish.angle);
    return { x: fish.x + local.x * c - local.y * s, y: fish.y + local.x * s + local.y * c };
}

/** Fish are important entities: the ray may reach them through a front net,
 * but never through a rock or another nearer fish. Empty water never selects. */
export function firstInteractionHit(angle: number, range: number, handles = false, fishOnly = false): DirectionHit | null {
    const rock = firstRockHit(angle, range), limit = rock ? rock.distance - .1 : range;
    const continuous = activeWorld(), walls = continuous ? [] : getActiveMapContext().walls || [];
    let important: DirectionHit | null = null;
    const addFish = (hit: DirectionHit) => {
        if (hit.distance > limit || important && hit.distance >= important.distance) return;
        const { x, y } = hit.point;
        if (continuous ? circleCollision(x, y, 0) : walls.some(w => circleHitsRock(w, x, y, 0))) return;
        important = hit;
    };
    for (const fish of state.fishEnemies as FishEnemy[]) {
        if (fish.dead || Math.hypot(fish.x - player.x, fish.y - player.y) > range + fishShape(fish).length) continue;
        const body = rayFish(angle, fish, limit);
        if (body) addFish({ kind: 'fish', fish, ...body });
        if (!handles) continue;
        const choices: { kind: 'fishKnot' | 'net'; point: RopePoint }[] = [];
        if (fish.bound) choices.push({ kind: 'fishKnot', point: fishKnotPoint(fish) });
        if (getRopeContact(fish)?.kind === 'snag') choices.push({ kind: 'net', point: fishNetHandlePoint(fish) });
        for (const choice of choices) {
            const distance = rayCircle(player, angle, choice.point, 4.5, limit);
            if (distance !== null) addFish({ ...choice, fish, distance });
        }
    }
    if (important || fishOnly) return important;
    let first: DirectionHit | null = rock;
    const add = (hit: DirectionHit) => { if (!first || hit.distance < first.distance - .01) first = hit; };
    state.rope.ropes.forEach((rope, index) => {
        for (let i = 1; i < rope.path.length; i++) {
            const a = rope.path[i - 1], b = rope.path[i], pieces = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
            const end={x:player.x+Math.cos(angle)*range,y:player.y+Math.sin(angle)*range};
            const low=[Math.min(player.x,end.x)-51,Math.min(player.y,end.y)-51],high=[Math.max(player.x,end.x)+51,Math.max(player.y,end.y)+51];
            const begin=[a.x,a.y],span=[b.x-a.x,b.y-a.y];let enter=0,exit=1;
            for(let axis=0;axis<2;axis++){
                if(Math.abs(span[axis])<1e-8){if(begin[axis]<low[axis]||begin[axis]>high[axis])enter=2;}
                else{const t1=(low[axis]-begin[axis])/span[axis],t2=(high[axis]-begin[axis])/span[axis];enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));}
            }
            if(enter>exit)continue;
            const first=Math.max(1,Math.ceil(enter*pieces-1e-8)),last=Math.min(pieces,Math.floor(exit*pieces+1e-8)+1),start=(first-1)/pieces;
            let rest={x:a.x+(b.x-a.x)*start,y:a.y+(b.y-a.y)*start},previous=getRopeDeformedPoint(rest,index);
            for (let j = first; j <= last; j++) {
                const next = { x: a.x + (b.x - a.x) * j / pieces, y: a.y + (b.y - a.y) * j / pieces };
                const posed = getRopeDeformedPoint(next, index), hit = rayStrand(player, angle, previous, posed, limit);
                if (hit) {
                    const len = Math.hypot(posed.x - previous.x, posed.y - previous.y) || 1;
                    const t = Math.min(1, Math.hypot(hit.point.x - previous.x, hit.point.y - previous.y) / len);
                    add({ kind: 'rope', ...hit, rope, ropeIndex: index,
                        restPoint: { x: rest.x + (next.x - rest.x) * t, y: rest.y + (next.y - rest.y) * t } });
                }
                previous = posed; rest = next;
            }
        }
    });
    for (const link of state.rope.links) for (let i = 1; i < link.path.length; i++) {
        const hit = rayStrand(player, angle, link.path[i - 1], link.path[i], limit);
        if (hit) add({ kind: 'link', link, ...hit });
    }
    return first;
}
