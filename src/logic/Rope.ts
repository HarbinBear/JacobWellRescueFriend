import { CONFIG } from '../core/config';
import { state, player, createLooseRope } from '../core/state';
import { buildAvoidedPath, pathLength } from './Pathfinding';
import { getActiveMapContext } from '../world/Visibility';
import { fishWorldPoint } from './InteractionRay';
import { getRopeTopology, ropeSpanAt, planRopeRemoval, isRemovalPlanValid, ropePathSlice } from './RopeTopology';
import type { RopeRemovalPlan, RopeSpan, RopeNode } from './RopeTopology';
import { closestRockPoint, circleHitsRock } from '../world/RockGeometry';
import { getKarstTerrain, karstNearest } from '../world/KarstTerrain';
import { isLineOfSight } from '../world/Visibility';
import { getRopeNet, pointOnStrand, projectOntoStrand, sweepRopeNet } from './RopeNet';
import { applyNetBodyImpulse, deformNetPoint, moveThroughNet, netResponseAlong, resetNetMotion, stepNetMotion, viewNetContact, releaseNetBody, remapNetMotion, steadyNetBody, captureFishNetContacts, restoreFishNetContacts, validateFishNetContacts } from './RopeDynamics';
import { fishKnotPoint } from './FishGeometry';
import type { FishEnemy } from './FishEnemy';
import type { RopeBody } from './RopeDynamics';
import type { RopePoint, NetRope } from './RopeNet';
import type { RopeEndpoint, RopeCut, TetherLine } from './InteractionTypes';

function getActiveWalls() {
    return state.screen === 'mazeRescue' && state.mazeRescue ? state.mazeRescue.mazeWalls : state.walls;
}

export function findNearestWall(x: number, y: number, maxDist: number): any {
    let nearest: any = null, minDist = maxDist;
    const walls = getActiveWalls();
    if (!walls) return null;
    const terrain=getKarstTerrain(state.screen==='mazeRescue'?state.mazeRescue:null);
    if(terrain){
        const p=karstNearest(terrain,x,y,maxDist);if(p.wall){nearest=p.wall;minDist=p.dist;}
        const w=(state.mazeRescue as any).continuous;
        for(const wall of [...w.banks,...w.boundaries]){const q=closestRockPoint(wall,x,y);if(q.dist<minDist){nearest=wall;minDist=q.dist;}}
        return nearest?{wall:nearest,dist:minDist}:null;
    }
    for (const wall of walls) {
        const point = closestRockPoint(wall, x, y);
        if (wall.rockPolygon && walls.some(other => other !== wall && circleHitsRock(other, point.x, point.y, 0))) continue;
        if (point.dist < minDist) { minDist = point.dist; nearest = wall; }
    }
    return nearest ? { wall: nearest, dist: minDist } : null;
}

export interface RopeAnchor {
    point: RopePoint;
    wall?: any;
    onRope?: boolean;
    rope?: any;
    fish?: FishEnemy;
    self?: boolean;
    fishContact?: RopePoint;
}

export function playerRopePoint(): RopePoint {
    return { x: player.x - Math.cos(player.angle) * 7, y: player.y - Math.sin(player.angle) * 7 };
}

export function ropeAnchorPoint(anchor: RopeAnchor): RopePoint {
    if (anchor.fish) return anchor.fishContact ? fishWorldPoint(anchor.fish, anchor.fishContact) : fishKnotPoint(anchor.fish);
    if (anchor.self) return playerRopePoint();
    const index = anchor.onRope && anchor.rope ? state.rope.ropes.indexOf(anchor.rope) : -1;
    return index >= 0 ? getRopeDeformedPoint(anchor.point, index) : anchor.point;
}

export function ropeEndpointPoint(endpoint: RopeEndpoint): RopePoint {
    if (endpoint.kind === 'player') return playerRopePoint();
    if (endpoint.kind === 'fish' && endpoint.fish) return fishKnotPoint(endpoint.fish);
    if (endpoint.kind === 'rope' && endpoint.rope) {
        const index = state.rope.ropes.indexOf(endpoint.rope);
        if (index >= 0) return getRopeDeformedPoint(endpoint.point, index);
    }
    return endpoint.point;
}

function endpointFor(anchor: RopeAnchor): RopeEndpoint {
    return { kind: anchor.fish ? 'fish' : anchor.self ? 'player' : anchor.onRope ? 'rope' : 'rock',
        point: { ...(anchor.onRope ? anchor.point : ropeAnchorPoint(anchor)) }, fish: anchor.fish, wall: anchor.wall, rope: anchor.rope };
}

function startRopeAt(anchor: RopeAnchor) {
    const start = { ...(anchor.onRope ? anchor.point : ropeAnchorPoint(anchor)) };
    state.rope.active = true;
    state.rope.current = {
        start, startWall: anchor.wall || null, startOnRope: !!anchor.onRope,
        startAttachment: endpointFor(anchor),
        path: buildAvoidedPath(start, player, CONFIG.ropeAvoidPadding), slackFactor: 1, time: 0,
    };
}

export function cancelRopePlacement() {
    state.rope.active = false;
    state.rope.current = createLooseRope();
}

function insertJunctions(points: RopePoint[]) {
    for (const p of points) for (const rope of state.rope.ropes) {
        for (let i = rope.path.length - 1; i > 0; i--) {
            const a = rope.path[i - 1], b = rope.path[i];
            if (pointOnStrand(p, a, b) && Math.hypot(p.x - a.x, p.y - a.y) > .025 &&
                Math.hypot(p.x - b.x, p.y - b.y) > .025) rope.path.splice(i, 0, { ...p });
        }
    }
}

function endRopeAt(anchor: RopeAnchor): boolean {
    const current = state.rope.current;
    const source = current.startAttachment;
    const dynamic = source?.kind === 'fish' || !!anchor.fish || !!anchor.self;
    const start = dynamic && source ? ropeEndpointPoint(source) : current.start;
    const end = dynamic ? ropeAnchorPoint(anchor) : anchor.point;
    if (!state.rope.active || !start || Math.hypot(start.x - end.x, start.y - end.y) < 12 ||
        (source?.fish && (!source.fish.bound || !state.fishEnemies.includes(source.fish))) ||
        (source?.fish && source.fish === anchor.fish)) return false;
    if (anchor.self && getPlayerRopeEnds().length >= CONFIG.fishInteraction.maxPlayerLinks) return false;
    const path = buildAvoidedPath(start, end, CONFIG.ropeAvoidPadding);
    if (path.length < 2 || path.slice(1).some((p, i) => !isLineOfSight(path[i].x, path[i].y, p.x, p.y, Infinity))) return false;
    const ropes = state.rope.ropes, strands = getRopeNet(ropes).strands;
    if (current.startOnRope && !strands.some(s => pointOnStrand(source?.point || start, s.a, s.b))) {
        cancelRopePlacement(); return false;
    }
    if (!dynamic && path.slice(1).every((b, i) => strands.some(s => pointOnStrand(path[i], s.a, s.b) && pointOnStrand(b, s.a, s.b)))) return false;
    const junctions = [current.startOnRope && (source?.point || start), anchor.onRope && anchor.point].filter(Boolean) as RopePoint[];
    insertJunctions(junctions);
    if (dynamic) {
        state.rope.links.push({ id: state.interaction.nextLinkId++, start: source || endpointFor({ point: start,
            wall: current.startWall, onRope: current.startOnRope }), end: endpointFor(anchor), path,
            length: Math.max(CONFIG.fishInteraction.tetherSlack, pathLength(path) + 12), tension: 0, age: 0 });
        if (junctions.length) replaceGuideRopes(ropes.slice());
    } else {
        replaceGuideRopes(ropes.concat({ start: { ...start }, startWall: current.startWall, startOnRope: current.startOnRope,
            end: { ...end }, endWall: anchor.wall || null, endOnRope: !!anchor.onRope, path, slackFactor: 0, mode: 'tight' }));
    }
    cancelRopePlacement();
    return true;
}

/** Only the animation completion uses this commit primitive. Preview never does. */
export function placeRopeAt(anchor: RopeAnchor): boolean {
    if (anchor.self && !state.rope.active) return false;
    if (state.rope.active) return endRopeAt(anchor);
    startRopeAt(anchor);
    return true;
}

export function traceWovenRopes(from: RopePoint, to: RopePoint, radius: number) {
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length) return null;
    return sweepRopeNet(getRopeNet(state.rope.ropes), from, to, radius);
}

export function resolveWovenRopeContact(body: RopeBody, from: RopePoint, radius: number, intent: RopePoint,
    canOccupy: (x: number, y: number) => boolean) {
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length) return null;
    return moveThroughNet(getRopeNet(state.rope.ropes), body, from, radius, body === player ? 3.6 : 13, intent, canOccupy);
}

export function applyRopeBodyImpulse(body: RopeBody, vx: number, vy: number) {
    applyNetBodyImpulse(getRopeNet(state.rope.ropes), body, vx, vy);
}

export function getRopeContact(body: RopeBody) {
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length) return null;
    return viewNetContact(getRopeNet(state.rope.ropes), body);
}

export function steadyRopeContact(body: RopeBody) {
    return steadyNetBody(getRopeNet(state.rope.ropes), body);
}

export function releaseRopeContact(body: RopeBody) {
    releaseNetBody(getRopeNet(state.rope.ropes), body);
}

export function getRopeApproach(body: RopeBody, radius: number) {
    const speed = Math.hypot(body.vx, body.vy);
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length || speed < .7 || getRopeContact(body)) return null;
    const ahead = Math.min(42, 112 / speed);
    const result = getRopeResponseAlong(body, { x: body.x + body.vx * ahead, y: body.y + body.vy * ahead }, radius, body.vx, body.vy);
    return result && isLineOfSight(body.x, body.y, result.x, result.y, 120) ? result : null;
}

export function getRopeResponseAlong(from: RopePoint, to: RopePoint, radius: number, vx: number, vy: number) {
    if (state.screen !== 'mazeRescue' || !state.rope.ropes.length) return null;
    return netResponseAlong(getRopeNet(state.rope.ropes), from, to, radius, vx, vy, from === player ? 3.6 : 13, from as RopeBody);
}

export function getRopeDeformedPoint(point: RopePoint, ropeIndex: number) {
    return state.screen === 'mazeRescue' ? deformNetPoint(getRopeNet(state.rope.ropes), point, ropeIndex) : point;
}

export function updateRopeMotion() {
    if (state.rope.ropes.length) stepNetMotion(getRopeNet(state.rope.ropes));
    state.rope.fading = (state.rope.fading || []).filter(f => Date.now() - f.startedAt < f.duration);
}

export function resetRopeMotion() {
    if (state.rope.ropes.length) resetNetMotion(getRopeNet(state.rope.ropes));
}

export function captureFishNetState() {
    return captureFishNetContacts(getRopeNet(state.rope.ropes), state.fishEnemies);
}

/** Call after restoring fish/rope objects and resetting transient rope motion. */
export function restoreFishNetState(data: unknown) {
    return restoreFishNetContacts(getRopeNet(state.rope.ropes), state.fishEnemies, data);
}

export function validateFishNetState(data: unknown, fish: FishEnemy[], ropes: NetRope[]): boolean {
    if (data === undefined) return true;
    if (!Array.isArray(fish) || !Array.isArray(ropes) || ropes.some(r => !r || !Array.isArray(r.path) || r.path.length < 2 ||
        r.threadId !== undefined && (!Number.isSafeInteger(r.threadId) || r.threadId < 0) ||
        r.path.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)))) return false;
    return validateFishNetContacts(getRopeNet(ropes), fish, data);
}

export function updateRopeSystem() {
    if (!state.rope.active || !state.rope.current.start) return;
    const current = state.rope.current, source = current.startAttachment;
    if (source?.fish && (!source.fish.bound || !state.fishEnemies.includes(source.fish))) { cancelRopePlacement(); return; }
    if (source) current.start = { ...(source.kind === 'fish' ? ropeEndpointPoint(source) : source.point) };
    current.time += 1 / 60;
    current.path = buildAvoidedPath(source ? ropeEndpointPoint(source) : current.start, player, CONFIG.ropeAvoidPadding);
}

export function getPlayerRopeEnds() {
    const ends: { link: TetherLine; end: 'start' | 'end' }[] = [];
    for (const link of state.rope.links || []) {
        if (link.start.kind === 'player') ends.push({ link, end: 'start' });
        if (link.end.kind === 'player') ends.push({ link, end: 'end' });
    }
    return ends;
}

export function removeTether(link: TetherLine): boolean {
    if (!state.rope.links.includes(link)) return false;
    addRopeFade(link.path);
    state.rope.links = state.rope.links.filter(item => item !== link);
    return true;
}
export function detachTetherEnd(link: TetherLine, end: 'start' | 'end'): boolean {
    return link[end].kind !== 'loose' && removeTether(link);
}

export function unbindFish(fish: FishEnemy): boolean {
    if (!fish.bound || !state.fishEnemies.includes(fish)) return false;
    fish.bound = false;
    fish.state = fish.stunFrames > 0 ? 'stunned' : 'roam';
    fish.stateTimer = 0;
    for (const link of state.rope.links.slice()) for (const end of ['start', 'end'] as const) {
        if (link[end].kind === 'fish' && link[end].fish === fish) detachTetherEnd(link, end);
    }
    if (state.rope.current.startAttachment?.fish === fish) cancelRopePlacement();
    return true;
}


function pathContains(rope: any, point: RopePoint) {
    return rope.path.slice(1).some((b: RopePoint, i: number) => pointOnStrand(point, rope.path[i], b));
}
export function addRopeFade(path: RopePoint[]) {
    if (path.length < 2) return;
    state.rope.fading.push({ path: path.map(p => ({ ...p })), startedAt: Date.now(), duration: CONFIG.fishInteraction.ropeFadeMs });
}
function posedSpan(span: RopeSpan) {
    const index = state.rope.ropes.indexOf(span.rope), points: RopePoint[] = [];
    for (let i = 1; i < span.path.length; i++) {
        const a = span.path[i - 1], b = span.path[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x,b.y - a.y)/8));
        for (let j = i === 1 ? 0 : 1; j <= n; j++) points.push(getRopeDeformedPoint({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n},index));
    }
    return points;
}
export function currentRopeTopology() {
    const attachments: {rope:any;point:RopePoint}[]=[];
    for (const link of state.rope.links) for (const end of [link.start,link.end]) if(end.kind==='rope'&&end.rope) attachments.push({rope:end.rope,point:end.point});
    return getRopeTopology(state.rope.ropes,attachments);
}
export function getRopeRemoval(cuts: RopeCut[], angle=0): RopeRemovalPlan {
    const topology=currentRopeTopology(),selected:RopeSpan[]=[];
    for(const cut of cuts){const span=ropeSpanAt(topology,cut.rope,cut.point,angle);if(span&&!selected.includes(span))selected.push(span);}
    const plan=planRopeRemoval(topology,selected),removed=new Set(plan.removed.map(s=>s.rope));
    plan.links=state.rope.links.filter(link=>[link.start,link.end].some(end=>end.kind==='rope'&&removed.has(end.rope)));
    return plan;
}

/** No physical loose tips are created by an intentional removal. Every leftover
 * connection must still be supported; decorative sinking snapshots are separate. */
function replaceGuideRopes(next: any[], replacements = new Map<any,any[]>()) {
    const previous=state.rope.ropes,oldNet=getRopeNet(previous),newNet=getRopeNet(next),indices=new Map<number,number[]>();
    previous.forEach((rope,i)=>indices.set(i,(replacements.get(rope)||[rope]).map(r=>next.indexOf(r)).filter(n=>n>=0)));
    remapNetMotion(oldNet,newNet,indices);
    const detached:TetherLine[]=[];
    for(const link of state.rope.links) for(const end of [link.start,link.end]) {
        if(end.kind!=='rope'||!replacements.has(end.rope))continue;
        const replacement=replacements.get(end.rope)!.find(r=>pathContains(r,end.point));
        if(replacement)end.rope=replacement;else detached.push(link);
    }
    for(const link of detached)removeTether(link);
    const source=state.rope.current.startAttachment;
    if(source?.kind==='rope'&&replacements.has(source.rope)){
        const replacement=replacements.get(source.rope)!.find(r=>pathContains(r,source.point));
        if(replacement)source.rope=replacement;else cancelRopePlacement();
    }
    state.rope.ropes=next;
}

export function applyRopeRemoval(plan:RopeRemovalPlan):boolean{
    if(!isRemovalPlanValid(plan,state.rope.ropes))return false;
    const removed=new Set(plan.removed.map(s=>s.rope));
    for(const origin of removed){
        const path: RopePoint[]=origin.path;
        addRopeFade(posedSpan({rope:origin,path} as RopeSpan));
    }
    const replacements=new Map<any,any[]>();for(const origin of removed)replacements.set(origin,[]);
    // No surviving geometry moves: untouched ropes retain their valid anchors and tension.
    replaceGuideRopes(state.rope.ropes.filter(r=>!removed.has(r)),replacements);
    return true;
}
export function cutGuideRopes(cuts: RopeCut[]): boolean {return applyRopeRemoval(getRopeRemoval(cuts));}
export function detachGuideEnd(rope:any,end:'start'|'end'):boolean {
    if(!state.rope.ropes.includes(rope))return false;
    const neighbour=rope.path[end==='start'?1:rope.path.length-2],at=rope[end];
    const point={x:at.x+(neighbour.x-at.x)*.05,y:at.y+(neighbour.y-at.y)*.05};
    return applyRopeRemoval(getRopeRemoval([{rope,point}]));
}
export function fishPocketCuts(fish:FishEnemy):RopeCut[]{
    const contact=getRopeContact(fish);
    return contact?.kind==='snag'?(contact.caughtThreads||[]).map(t=>({rope:state.rope.ropes[t.rope],point:{...t.point}})).filter(c=>!!c.rope):[];
}
export function cutTether(link:TetherLine,_point:RopePoint):boolean{return removeTether(link);}
