import type { FishEnemy } from './FishEnemy';

// Transient presentation state: never copied into a save and never advanced by drawing.
export interface FishSwimMotion {
    phase: number; clock: number; speed: number; acceleration: number; turnRate: number;
    amplitude: number; bend: number; roll: number; finSpread: number; drive: number;
}
interface Motion extends FishSwimMotion { intent: number; previousSpeed: number; beatOffset: number }
export interface FishSwimSample { x: number; y: number; vx: number; vy: number; angle: number }
const motions = new WeakMap<FishEnemy, Motion>();
const TAU = Math.PI * 2;
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const angleDelta = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const blend = (a: number, b: number, response: number, dt: number) => a + (b - a) * (1 - Math.exp(-response * dt));

function initial(fish: FishEnemy): Motion {
    return { phase: (Number.isFinite(fish.animTime) ? fish.animTime : 0) % TAU, clock: 0,
        speed: 0, previousSpeed: 0, acceleration: 0, turnRate: 0, amplitude: .035,
        bend: 0, roll: 0, finSpread: .65, drive: 0, intent: -1, beatOffset: ((fish.animTime || 0) % 1) * 1.45 };
}
/** Pure fallback for a restored/new/frozen fish; repeated renders have no side effects. */
export function getFishSwimMotion(fish: FishEnemy): Readonly<FishSwimMotion> {
    return motions.get(fish) || initial(fish);
}
export function beginFishSwimStep(fish: FishEnemy): FishSwimSample {
    let motion = motions.get(fish);
    if (!motion) { motion = initial(fish); motions.set(fish, motion); }
    motion.intent = -1;
    return { x: fish.x, y: fish.y, vx: fish.vx, vy: fish.vy, angle: fish.angle };
}

/** Called by the existing target-steering AI. Units remain world-units / 60Hz step. */
export function steerFishSwim(fish: FishEnemy, heading: number, speed: number, turnFactor: number) {
    let motion = motions.get(fish);
    if (!motion) { motion = initial(fish); motions.set(fish, motion); }
    fish.targetAngle = heading;
    const error = angleDelta(heading - fish.angle);
    fish.angle += error * clamp(turnFactor, 0, .25);
    const c = Math.cos(fish.angle), s = Math.sin(fish.angle);
    let forward = fish.vx * c + fish.vy * s, sideways = -fish.vx * s + fish.vy * c;
    const cruise = fish.state === 'roam' || fish.state === 'returning';
    // Short propulsive bouts followed by a real coast; turns and starting below cruise speed take priority.
    const stroke = !cruise || Math.abs(error) > .45 || forward < speed * .62 ||
        (motion.clock + motion.beatOffset) % 1.45 < .43;
    const drive = speed > 0 && stroke ? clamp((speed - forward) / Math.max(.1, speed * .32)) : 0;
    motion.intent = drive;
    forward *= drive ? .965 : .988;
    sideways *= .78;
    if (drive) forward += speed * .12 * drive;
    // A zero request means stop propulsion, not teleport the velocity to zero.
    if (speed > 0 && forward > speed) forward = Math.max(speed, forward - Math.max(.06, speed * .10));
    fish.vx = forward * c - sideways * s;
    fish.vy = forward * s + sideways * c;
}

/** Finish one simulation step after actual movement/collision, including early-return states. */
export function finishFishSwimStep(fish: FishEnemy, before: FishSwimSample, frames = 1, restrained = false) {
    const motion = motions.get(fish);
    if (!motion || !Number.isFinite(frames) || frames <= 0) return;
    const dt = Math.min(frames, 3) / 60;
    const dx = fish.x - before.x, dy = fish.y - before.y;
    const quiet = restrained || fish.bound || fish.state === 'bound' || fish.stunFrames > 0 || fish.state === 'stunned';
    const distance = Math.hypot(dx, dy);
    // A teleport or a newly restored object must not wind up a huge tail/turn impulse.
    const speed = distance > 40 * frames ? 0 : distance / frames;
    const acceleration = clamp((speed - motion.previousSpeed) / frames, -2, 2);
    const turn = clamp(angleDelta(fish.angle - before.angle) / frames, -.28, .28);
    const facing = Math.cos(fish.angle), side = Math.sin(fish.angle);
    const slip = speed > .12 ? clamp((-fish.vx * side + fish.vy * facing) / Math.max(.6, speed), -1, 1) : 0;
    const active = fish.state === 'flee' || fish.state === 'hit' || fish.state === 'lunge' && fish.lungeCharge >= 1;
    const inferred = active ? 1 : acceleration > .025 ? .85 : fish.state === 'fear' ? .35 : .15;
    const drive = quiet ? 0 : motion.intent >= 0 ? motion.intent : inferred;
    motion.drive = blend(motion.drive, drive, drive > motion.drive ? 14 : 10, dt);
    motion.speed = blend(motion.speed, speed, 14, dt);
    motion.acceleration = blend(motion.acceleration, acceleration, 12, dt);
    motion.turnRate = blend(motion.turnRate, quiet ? 0 : turn, 18, dt);
    const power = motion.drive, velocity = clamp(motion.speed / 8);
    const amplitude = quiet ? .012 : .025 + power * (.15 + velocity * .15);
    motion.amplitude = blend(motion.amplitude, amplitude, 12, dt);
    const bend = quiet ? 0 : clamp(motion.turnRate * 2.5 - slip * .14, -.5, .5);
    motion.bend = blend(motion.bend, bend, 18, dt);
    motion.roll = blend(motion.roll, quiet ? 0 : clamp(motion.turnRate * -2.2, -.38, .38), 14, dt);
    const brake = clamp(-motion.acceleration * 3);
    motion.finSpread = blend(motion.finSpread, quiet ? .18 : clamp(.72 - velocity * .4 - power * .25 + brake * .45 + Math.abs(bend) * .5, .18, 1), 12, dt);
    // Integrate frequency, rather than multiplying an ever-growing animTime by a new rate.
    const frequency = quiet ? .35 : .55 + power * (1.35 + velocity * 1.6);
    motion.phase = (motion.phase + TAU * frequency * dt) % TAU;
    motion.clock += dt;
    motion.previousSpeed = speed;
}
