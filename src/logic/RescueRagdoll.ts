// Passive, damped angular joints. Only acceleration, water drag and the tow line
// supply motion; there is no swim clock or music-driven animation in this state.
export interface LimpJoint { angle: number; velocity: number }
export interface RescueRagdollState {
    bodyVelocity: number;
    lastVx: number; lastVy: number;
    joints: LimpJoint[];
}
export interface RescueLimpPose {
    lu: number; ll: number; ru: number; rl: number;
    leftThigh: number; leftShin: number; rightThigh: number; rightShin: number;
    head: number;
}
const rests = [-2.25, -2.9, 2.1, 2.8, -2.85, -2.35, 2.75, 2.3, .48];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function createRescueRagdoll(vx = 0, vy = 0): RescueRagdollState {
    return { bodyVelocity: 2.4, lastVx: vx, lastVy: vy,
        joints: rests.map((angle, i) => ({ angle, velocity: (i % 2 ? -1 : 1) * (i === 8 ? 5 : 3) })) };
}

export function stepRescueRagdoll(r: RescueRagdollState, angle: number, vx: number, vy: number,
    towAngle: number | null, dt = 1 / 60): number {
    const step = clamp(dt, 0, 1 / 30);
    const ax = clamp((vx - r.lastVx) * 60, -180, 180);
    const ay = clamp((vy - r.lastVy) * 60, -180, 180);
    r.lastVx = vx; r.lastVy = vy;
    // The torso lags the rope direction. An untethered body slowly lists sideways.
    const target = towAngle == null ? Math.PI / 2 + .45 : towAngle;
    const torque = wrap(target - angle) * (towAngle == null ? .9 : 4.2);
    r.bodyVelocity += (torque - r.bodyVelocity * 2.8) * step;
    r.bodyVelocity = clamp(r.bodyVelocity, -5, 5);
    angle = wrap(angle + r.bodyVelocity * step);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const localAx = ax * cos + ay * sin, localAy = -ax * sin + ay * cos;
    const flowAngle = Math.atan2(vy, vx) + Math.PI - angle;
    const speed = Math.min(8, Math.hypot(vx, vy));
    r.joints.forEach((j, i) => {
        const distal = i === 1 || i === 3 || i === 5 || i === 7;
        const rest = rests[i];
        const inertia = (localAx * Math.sin(j.angle) - localAy * Math.cos(j.angle)) * (distal ? .085 : .055);
        const drag = Math.sin(flowAngle - j.angle) * speed * (i === 8 ? .35 : 1.6);
        const gravity = Math.cos(angle + j.angle) * (i === 8 ? 1.1 : 1.8);
        const parent = distal ? r.joints[i - 1].velocity * -.7 : -r.bodyVelocity * 1.4;
        const stiffness = i === 8 ? 6 : distal ? 2.4 : 3.8;
        j.velocity += (wrap(rest - j.angle) * stiffness + inertia + drag + gravity + parent - j.velocity * 2.6) * step;
        j.velocity = clamp(j.velocity, -8, 8);
        j.angle += j.velocity * step;
        const limit = i === 8 ? .65 : distal ? 1.15 : .9;
        if (Math.abs(j.angle - rest) > limit) {
            j.angle = rest + Math.sign(j.angle - rest) * limit;
            j.velocity *= -.18;
        }
    });
    return angle;
}

export function getRescueLimpPose(r: RescueRagdollState): RescueLimpPose {
    const a = r.joints.map(j => j.angle);
    return { lu: a[0], ll: a[1], ru: a[2], rl: a[3],
        leftThigh: a[4], leftShin: a[5], rightThigh: a[6], rightShin: a[7], head: a[8] };
}
