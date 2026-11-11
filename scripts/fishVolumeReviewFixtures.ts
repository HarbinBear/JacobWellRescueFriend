import { CONFIG } from '../src/core/config';
import { state, player, input, createRopeState, createFishBumpState } from '../src/core/state';
import { createFishEnemy, type FishEnemy } from '../src/logic/FishEnemy';
import { resetInteractions } from '../src/logic/Interaction';
import { getRopeContact, resetRopeMotion, updateRopeMotion } from '../src/logic/Rope';
import { snapCameraToPlayer } from '../src/logic/CameraLogic';
import { getKarstTerrain, karstRay, karstSegmentClear, type KarstTerrain } from '../src/world/KarstTerrain';
import { world, circleCollision } from '../src/world/continuous/Geometry';
import { moveContinuousFish } from '../src/world/continuous/Runtime';
import { inspectSpeleothems, inspectVolumeSite } from './karstReviewFixtures';

type Point = { x: number; y: number };
// 浏览器评审入口：保留当前地图、洞腔、灯光和真实鱼/绳网逻辑，不进入旧岩洞小样。
export function inspectVolumeFish(mode: 'free' | 'snag' = 'free') {
    const w = world(), t = getKarstTerrain(state.mazeRescue);
    if (!w || t?.generation !== 'volume' || !(inspectSpeleothems() || inspectVolumeSite(0))) return false;
    const initialAngle = player.angle;
    let angle = initialAngle, positions: Point[] | null = null;
    for (const offset of [0, .3, -.3, .65, -.65, 1, -1, Math.PI]) {
        angle = initialAngle + offset;
        const c = Math.cos(angle), s = Math.sin(angle);
        const pair = [{ x: player.x + c * 120, y: player.y + s * 120 },
            { x: player.x + c * 155 - s * 48, y: player.y + s * 155 + c * 48 }];
        if (pair.every(p => !circleCollision(p.x, p.y, 30) && karstSegmentClear(t, player, p, 16))) { positions = pair; break; }
    }
    if (!positions) return false;
    resetInteractions(); state.rope = createRopeState(); resetRopeMotion();
    state.fishBite = null; state.fishBump = createFishBumpState(); state.npc.active = false;
    state.flashlightOn = true; CONFIG.infiniteO2 = true; player.o2 = player.o2Max;
    player.angle = player.targetAngle = input.targetAngle = angle;
    const kinds = ['curious', 'piranha'] as const;
    const fishes = positions.map((p, i) => {
        const fish = createFishEnemy(p.x, p.y, p.x, p.y, 180, kinds[i]);
        Object.assign(fish, { worldId: w.nextFishId++, angle: angle + Math.PI, targetAngle: angle + Math.PI,
            vx: -Math.cos(angle) * .35, vy: -Math.sin(angle) * .35, animTime: .37 + i });
        return fish;
    });
    state.fishEnemies = fishes; w.hidden = false;
    const caught = mode === 'snag' && arrangeSnag(t, fishes[0], angle);
    snapCameraToPlayer();
    return { mode, caught, fishCount: fishes.length, ropes: state.rope.ropes.length,
        fish: fishes.map(f => ({ kind: f.kind, x: f.x, y: f.y, worldId: (f as any).worldId,
            contact: getRopeContact(f)?.kind || null })), player: { x: player.x, y: player.y, angle } };
}

function wallAnchor(t: KarstTerrain, origin: Point, angle: number) {
    const dx = Math.cos(angle), dy = Math.sin(angle), hit = karstRay(t, origin.x, origin.y, dx, dy, 1200);
    if (!hit.wall || hit.distance < 20) return null;
    return { point: { x: origin.x + dx * (hit.distance - .3), y: origin.y + dy * (hit.distance - .3) }, wall: hit.wall };
}

function arrangeSnag(t: KarstTerrain, fish: FishEnemy, angle: number) {
    const forward = { x: Math.cos(angle), y: Math.sin(angle) }, across = { x: -forward.y, y: forward.x };
    const anchorAngle = angle + Math.PI / 2;
    for (const distance of [85, 110, 135]) {
        const center = { x: player.x + forward.x * distance, y: player.y + forward.y * distance };
        const start = { x: center.x + forward.x * 58, y: center.y + forward.y * 58 };
        if (circleCollision(center.x, center.y, 48) || circleCollision(start.x, start.y, 30) || !karstSegmentClear(t, player, start, 18)) continue;
        const ropes: any[] = [];
        const strand = (origin: Point, direction: number) => {
            const a = wallAnchor(t, origin, direction + Math.PI), b = wallAnchor(t, origin, direction);
            if (a && b && karstSegmentClear(t, a.point, b.point)) ropes.push({ start: a.point, end: b.point,
                startWall: a.wall, endWall: b.wall, path: [a.point, b.point], mode: 'tight', slackFactor: 0 });
        };
        for (const offset of [-24, -12, 0, 12, 24]) strand({ x: center.x - forward.x * offset, y: center.y - forward.y * offset }, anchorAngle);
        for (const offset of [-22, 0, 22]) for (const turn of [Math.PI / 3, Math.PI * 2 / 3]) {
            strand({ x: center.x + across.x * offset, y: center.y + across.y * offset }, anchorAngle + turn);
        }
        if (ropes.length < 5) continue;
        state.rope.ropes = ropes; resetRopeMotion();
        Object.assign(fish, start, { angle: angle + Math.PI, targetAngle: angle + Math.PI, vx: 0, vy: 0 });
        // 用正常运动和真实绳网碰撞取得 contact；不设置 bound、stunned 或伪造 snag。
        for (let step = 0; step < 60; step++) {
            updateRopeMotion(); fish.vx = -forward.x * 3.7; fish.vy = -forward.y * 3.7;
            moveContinuousFish(fish, { x: fish.vx, y: fish.vy });
            if (getRopeContact(fish)?.kind === 'snag') { fish.vx = fish.vy = 0; return true; }
        }
    }
    state.rope.ropes = []; resetRopeMotion();
    Object.assign(fish, { x: player.x + forward.x * 120, y: player.y + forward.y * 120, vx: 0, vy: 0 });
    return false;
}
