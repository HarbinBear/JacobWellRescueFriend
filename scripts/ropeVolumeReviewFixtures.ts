import { state, player, input } from '../src/core/state';
import { placeRopeAt, cancelRopePlacement, resetRopeMotion } from '../src/logic/Rope';
import { getRopeNet, projectOntoStrand } from '../src/logic/RopeNet';
import { pathLength, samplePolyline } from '../src/logic/Pathfinding';
import { getKarstTerrain, karstRay, type KarstTerrain } from '../src/world/KarstTerrain';
import { world, circleCollision } from '../src/world/continuous/Geometry';
import { worldSegmentClear } from '../src/world/continuous/Routes';
import { inspectVolumeFish } from './fishVolumeReviewFixtures';

type Point = { x: number; y: number };
let study: { rope: any; cross: any; center: Point; player: Point; angle: number; axis: number } | null = null;

function anchor(t: KarstTerrain, origin: Point, angle: number) {
    const dx = Math.cos(angle), dy = Math.sin(angle), hit = karstRay(t, origin.x, origin.y, dx, dy, 900);
    if (!hit.wall || hit.distance < 35) return null;
    return { point: { x: hit.x - dx * .3, y: hit.y - dy * .3 }, wall: hit.wall };
}
function createGuide(t: KarstTerrain, origin: Point, angle: number) {
    const a = anchor(t, origin, angle + Math.PI), b = anchor(t, origin, angle);
    if (!a || !b || Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) > 850) return null;
    cancelRopePlacement();
    if (!placeRopeAt(a) || !placeRopeAt(b)) { cancelRopePlacement(); return null; }
    const rope = state.rope.ropes[state.rope.ropes.length - 1];
    if (!rope || rope.path.length < 2 || rope.path.slice(1).some((p: Point, i: number) => !worldSegmentClear(rope.path[i], p))) return null;
    return rope;
}

/** 真实洞室内的固定引导绳；单绳不属于woven网，也不会单独拦鱼。 */
export function inspectVolumeRope() {
    study = null;
    if (!inspectVolumeFish('free')) return false;
    const t = getKarstTerrain(state.mazeRescue), w = world(); if (!t || !w) return false;
    state.fishEnemies = state.fishEnemies.slice(0, 1);
    const original = { x: player.x, y: player.y }, angle = player.angle;
    for (const distance of [90, 115, 65]) for (const turn of [1.1, .75, 1.5]) {
        const center = { x: player.x + Math.cos(angle) * distance, y: player.y + Math.sin(angle) * distance };
        if (circleCollision(center.x, center.y, 45)) continue;
        state.rope.ropes = [];
        const axis = angle + turn, rope = createGuide(t, center, axis);
        if (!rope || getRopeNet(state.rope.ropes).woven.size) continue;
        const fish = state.fishEnemies[0]; let fishPoint: Point | null = null;
        for (const side of [1, -1]) for (const offset of [35, 50]) {
            const p = { x: center.x - Math.sin(axis) * offset * side, y: center.y + Math.cos(axis) * offset * side };
            if (circleCollision(p.x, p.y, 30) || !worldSegmentClear(player, p, 14)) continue;
            const clear = rope.path.slice(1).every((b: Point, i: number) => {
                const q = projectOntoStrand(p, rope.path[i], b); return Math.hypot(p.x - q.x, p.y - q.y) > 27;
            });
            if (clear) { fishPoint = p; break; }
        }
        if (!fishPoint) continue;
        Object.assign(fish, fishPoint, { denX: fishPoint.x, denY: fishPoint.y, vx: 0, vy: 0,
            angle: axis, targetAngle: axis, animTime: .37 });
        study = { rope, cross: null, center, player: original, angle, axis };
        resetRopeMotion(); w.hidden = true; input.move = 0; state.flashlightOn = true;
        inspectVolumeRopeView(0);
        return { length: pathLength(rope.path), path: rope.path.map((p: Point) => ({ ...p })), nonWoven: true,
            anchors: { start: state.mazeRescue!.mazeWalls.indexOf(rope.startWall), end: state.mazeRescue!.mazeWalls.indexOf(rope.endWall) }, center, player: original,
            fish: { kind: fish.kind, x: fish.x, y: fish.y }, creation: 'placeRopeAt + buildWorldPath' };
    }
    state.rope.ropes = []; cancelRopePlacement(); resetRopeMotion(); return false;
}

/** 只动评审镜头，不改角色、绳路或洞形；固定镜头时暂停模拟。 */
export function inspectVolumeRopeView(index = 0) {
    if (!study || !state.rope.ropes.includes(study.rope)) return false;
    const w = world(); if (!w) return false; w.hidden = true;
    const length = pathLength(study.rope.path), along = Math.min(75, length * .2);
    const ahead = (p: Point) => (p.x - study!.player.x) * Math.cos(study!.angle) + (p.y - study!.player.y) * Math.sin(study!.angle);
    const anchorAt = ahead(study.rope.start) > ahead(study.rope.end) ? along : length - along;
    const p = index === 2 ? samplePolyline(study.rope.path, anchorAt) :
        index === 1 ? study.center : { x: (study.player.x + study.center.x) * .5, y: (study.player.y + study.center.y) * .5 };
    const zoom = index === 0 ? 1.05 : index === 1 ? 2.1 : 1.7;
    Object.assign(state.camera, { x: p.x, y: p.y, targetX: p.x, targetY: p.y, vx: 0, vy: 0,
        swayX: 0, swayY: 0, zoom, targetZoom: zoom });
    return { index, x: p.x, y: p.y, zoom };
}

/** 评审资格切换：实际剪网会整张拆除，此处关闭交叉仅恢复原单绳场景。 */
export function setVolumeRopeCrossing(enabled: boolean) {
    if (!study || !state.rope.ropes.includes(study.rope)) return false;
    if (!enabled) { state.rope.ropes = [study.rope]; study.cross = null; resetRopeMotion(); return { woven: 0, ropes: 1 }; }
    if (study.cross && state.rope.ropes.includes(study.cross)) return { woven: getRopeNet(state.rope.ropes).woven.size, ropes: 2 };
    const t = getKarstTerrain(state.mazeRescue); if (!t) return false;
    const center = samplePolyline(study.rope.path, pathLength(study.rope.path) * .5);
    for (const offset of [Math.PI / 2, 1, 2]) {
        state.rope.ropes = [study.rope];
        const cross = createGuide(t, center, study.axis + offset);
        const net = getRopeNet(state.rope.ropes);
        if (cross && net.woven.has(0) && net.woven.has(1)) {
            study.cross = cross; resetRopeMotion(); return { woven: net.woven.size, ropes: state.rope.ropes.length };
        }
    }
    state.rope.ropes = [study.rope]; resetRopeMotion(); return false;
}
