import { CONFIG } from '../src/core/config';
import { state, player, input } from '../src/core/state';
import { createFishEnemy, updateFishEnemy, type FishEnemy } from '../src/logic/FishEnemy';
import { getFishSwimMotion } from '../src/logic/FishSwimMotion';
import { world, circleCollision } from '../src/world/continuous/Geometry';
import { inspectVolumeFish } from './fishVolumeReviewFixtures';

// Browser-only test inputs. Targets/speeds are scripted; actual AI steering,
// collision and swim animation advance through the normal updateFishEnemy path.
// This is explicitly a controlled motion study, not autonomous fish behaviour.
const DURATION = 25;
let study: { fish: FishEnemy; world: ReturnType<typeof world>; x: number; y: number;
    radius: number; route: number; time: number; remainder: number; near: boolean } | null = null;
let request = 0, previousTime = 0;
const phases = [
    { end: 2, name: '悬停', speed: 0, direction: 1 },
    { end: 5, name: '起游与巡游', speed: .72, direction: 1 },
    { end: 6.5, name: '短促加速', speed: 1.55, direction: 1 },
    { end: 9.5, name: '停止推进与滑行', speed: 0, direction: 1 },
    { end: 13, name: '左转回身', speed: 1.18, direction: -1 },
    { end: 16.5, name: '右转回身', speed: 1.18, direction: 1 },
    { end: 20, name: '巡游', speed: .72, direction: 1 },
    { end: 22, name: '再次加速', speed: 1.15, direction: -1 },
    { end: DURATION, name: '收尾滑行', speed: 0, direction: -1 },
];
function phase() { return phases.find(p => study!.time < p.end) || phases[phases.length - 1]; }

export function stopFishMotionStudy(resume = false) {
    if (request) cancelAnimationFrame(request);
    request = 0; previousTime = 0;
    if (resume && study?.world === world()) world()!.hidden = false;
}

export function inspectFishMotionStudy(near = false) {
    stopFishMotionStudy();
    if (!inspectVolumeFish('free')) return false;
    const w = world(); if (!w) return false;
    const angle = player.angle;
    let arena: { x: number; y: number; radius: number } | null = null;
    search: for (const radius of [105, 85, 65]) {
        for (const distance of [165, 200, 135]) for (const offset of [0, .3, -.3, .6, -.6]) {
            const a = angle + offset, x = player.x + Math.cos(a) * distance, y = player.y + Math.sin(a) * distance;
            if (!circleCollision(x, y, radius + 12)) { arena = { x, y, radius }; break search; }
        }
        if (arena) break;
    }
    if (!arena) { w.hidden = true; return false; }
    const fish = createFishEnemy(arena.x, arena.y, arena.x, arena.y, arena.radius, 'piranha');
    Object.assign(fish, { worldId: w.nextFishId++, vx: 0, vy: 0, angle: 0, targetAngle: 0,
        animTime: .37, state: 'roam', stateTimer: 0, roamTimer: 99999 });
    state.fishEnemies = [fish]; w.hidden = true; input.move = 0;
    player.angle = player.targetAngle = input.targetAngle = Math.atan2(arena.y - player.y, arena.x - player.x);
    CONFIG.infiniteO2 = true; state.flashlightOn = true;
    study = { fish, world: w, ...arena, route: arena.radius * .40, time: 0, remainder: 0, near };
    const zoom = near ? 1.9 : 1.2;
    Object.assign(state.camera, { x: arena.x + (near ? 18 : 0), y: arena.y + (near ? 5 : 0), zoom, targetZoom: zoom, swayX: 0, swayY: 0 });
    return fishMotionStudyStatus();
}

export function setFishMotionStudyLegacy(legacy = false) {
    CONFIG.karst.volumeFishMotion = !legacy;
    return !legacy;
}

export function stepFishMotionStudy(seconds = 1 / 60) {
    const s = study;
    if (!s || s.world !== world() || !state.fishEnemies.includes(s.fish) || s.time >= DURATION) return fishMotionStudyStatus();
    s.remainder += Math.max(0, Math.min(.1, seconds));
    while (s.remainder >= 1 / 60 && s.time < DURATION) {
        s.remainder -= 1 / 60;
        const fish = s.fish, p = phase(), polar = Math.atan2(fish.y - s.y, fish.x - s.x);
        // A moving target on a small loop changes turn requests without teleporting the fish.
        const ahead = polar + p.direction * .85;
        fish.roamTargetX = p.speed ? s.x + Math.cos(ahead) * s.route : fish.x + Math.cos(fish.angle) * 100;
        fish.roamTargetY = p.speed ? s.y + Math.sin(ahead) * s.route : fish.y + Math.sin(fish.angle) * 100;
        // Finish each burst with a horizontal steering request so its following
        // true inertial coast stays in the fixed camera and existing flashlight.
        // Steering remains production AI; no heading, velocity or position is snapped.
        if (s.time >= 5.9 && s.time < 6.5 || s.time >= 21.4 && s.time < 22) {
            fish.roamTargetX = fish.x + (s.time < 10 ? -120 : 120);
            fish.roamTargetY = fish.y;
        }
        fish.roamTimer = 99999; fish.state = 'roam'; fish.alertTimer = 0;
        const cfg = CONFIG.fishEnemy, before = { roamSpeed: cfg.roamSpeed, turnSpeedRoam: cfg.turnSpeedRoam,
            detectRange: cfg.detectRange, safeDistance: cfg.safeDistance,
            interactionDistance: CONFIG.fishInteraction.safeDistance, flashlight: state.flashlightOn };
        try {
            cfg.roamSpeed = p.speed; cfg.turnSpeedRoam = p.speed > 1 ? .12 : .07;
            cfg.detectRange = cfg.safeDistance = CONFIG.fishInteraction.safeDistance = 0; state.flashlightOn = false;
            updateFishEnemy(fish, 1);
        } finally {
            cfg.roamSpeed = before.roamSpeed; cfg.turnSpeedRoam = before.turnSpeedRoam;
            cfg.detectRange = before.detectRange; cfg.safeDistance = before.safeDistance;
            CONFIG.fishInteraction.safeDistance = before.interactionDistance; state.flashlightOn = before.flashlight;
        }
        s.time = Math.min(DURATION, s.time + 1 / 60);
        s.world.elapsed += 1 / 60;
    }
    return fishMotionStudyStatus();
}

export function fishMotionStudyStatus() {
    if (!study) return null;
    const { fish, time, x, y, radius, near } = study;
    return { scope: 'Controlled AI targets/speeds; production motion, collision and rendering',
        time, duration: DURATION, phase: phase().name, commandSpeed: phase().speed, near,
        legacyPose: !CONFIG.karst.volumeFishMotion, arena: { x, y, radius },
        screen: { x: .5 + (fish.x - state.camera.x) * state.camera.zoom / CONFIG.screenWidth,
            y: .5 + (fish.y - state.camera.y) * state.camera.zoom / CONFIG.screenHeight },
        fish: { x: fish.x, y: fish.y, vx: fish.vx, vy: fish.vy, angle: fish.angle,
            blocked: circleCollision(fish.x, fish.y, 6) }, motion: { ...getFishSwimMotion(fish) } };
}

export function playFishMotionStudy(near = false, legacy = false) {
    if (!inspectFishMotionStudy(near)) return false;
    setFishMotionStudyLegacy(legacy);
    const frame = (now: number) => {
        if (!study || study.world !== world() || !state.fishEnemies.includes(study.fish)) { stopFishMotionStudy(); return; }
        if (previousTime) stepFishMotionStudy((now - previousTime) / 1000);
        previousTime = now;
        const output = document.getElementById('phase');
        if (output) output.textContent = '受控动作 · ' + phase().name + ' · ' + study.time.toFixed(1) + ' / 25秒';
        request = study.time < DURATION ? requestAnimationFrame(frame) : 0;
    };
    request = requestAnimationFrame(frame); return true;
}
