import { sweepRopeNet } from './RopeNet';
import type { RopeGroup, RopeHit, RopeNet, RopePoint } from './RopeNet';

export type NetContactKind = 'glide' | 'rebound' | 'snag';
export interface RopeBody extends RopePoint { vx: number; vy: number }
export interface NetApproach extends RopePoint {
    kind: NetContactKind;
    nx: number;
    ny: number;
    density: number;
    strength: number;
}
export interface NetContactView extends NetApproach {
    phase: number;
    pull: number;
    escape: number;
}

interface NetPull {
    group: RopeGroup;
    point: RopePoint;
    nx: number;
    ny: number;
    amount: number;
    velocity: number;
    width: number;
    driven: boolean;
    age: number;
}
interface Contact extends NetApproach {
    pull: NetPull;
    phase: number;
    escape: number;
    depth: number;
    speed: number;
    side: number;
    gap: number;
    cooldown: number;
    surface: RopePoint;
}
interface Motion {
    contacts: WeakMap<RopeBody, Contact>;
    pulls: NetPull[];
}
const motionByNet = new WeakMap<RopeNet, Motion>();
const densityRadius = 86;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const unit = (n: number) => clamp(n, 0, 1);

function motionFor(net: RopeNet): Motion {
    let motion = motionByNet.get(net);
    if (!motion) {
        motion = { contacts: new WeakMap(), pulls: [] };
        motionByNet.set(net, motion);
    }
    return motion;
}

export function resetNetMotion(net: RopeNet) {
    motionByNet.delete(net);
}

function densityAt(group: RopeGroup, point: RopePoint, nx: number, ny: number): number {
    let density = .045;
    for (const knot of group.knots) {
        density += Math.max(0, 1 - Math.hypot(point.x - knot.x, point.y - knot.y) / densityRadius) * .16;
        if (density >= 1) return 1;
    }
    for (const { a, b } of group.strands) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
        const dx = point.x - a.x, dy = point.y - a.y;
        const distance = Math.abs(dx * uy - dy * ux);
        if (distance >= densityRadius) continue;
        const halfChord = Math.sqrt(densityRadius * densityRadius - distance * distance);
        const along = dx * ux + dy * uy;
        const localLength = Math.max(0, Math.min(len, along + halfChord) - Math.max(0, along - halfChord));
        const across = .35 + .65 * Math.abs(nx * uy - ny * ux);
        density += .14 * localLength / (2 * densityRadius) * (1 - distance / densityRadius) * across;
        if (density >= 1) return 1;
    }
    return density;
}

function response(net: RopeNet, hit: RopeHit, vx: number, vy: number, referenceSpeed: number): NetApproach {
    const nx = -hit.nx, ny = -hit.ny;
    const density = densityAt(net.groups.get(hit.rope)!, hit.point, nx, ny);
    const speed = Math.max(0, vx * nx + vy * ny);
    const load = density * (.12 + .98 * Math.min(1.7, speed / referenceSpeed));
    return { ...hit.surface, nx, ny, density, strength: unit(load), kind: load < .50 ? 'glide' : load < .84 ? 'rebound' : 'snag' };
}

function movingNetHit(net: RopeNet, from: RopePoint, to: RopePoint, radius: number) {
    const hasLoad = !!motionByNet.get(net)?.pulls.length;
    return sweepRopeNet(net, from, to, radius, hasLoad ? (p, i) => deformNetPoint(net, p, i) : undefined);
}

export function netResponseAlong(net: RopeNet, from: RopePoint, to: RopePoint, radius: number, vx: number, vy: number, referenceSpeed: number) {
    const hit = movingNetHit(net, from, to, radius);
    if (!hit) return null;
    return {
        ...response(net, hit, vx, vy, referenceSpeed),
        ropeIndex: hit.rope,
        entry: { x: from.x + (to.x - from.x) * hit.time, y: from.y + (to.y - from.y) * hit.time },
    };
}

export function stepNetMotion(net: RopeNet) {
    const motion = motionByNet.get(net);
    if (!motion) return;
    for (let i = motion.pulls.length - 1; i >= 0; i--) {
        const pull = motion.pulls[i];
        pull.age++;
        if (pull.driven && pull.age < 2) continue;
        pull.driven = false;
        pull.velocity = (pull.velocity - pull.amount * .044) * .9;
        pull.amount += pull.velocity;
        if (Math.abs(pull.amount) + Math.abs(pull.velocity) < .09) motion.pulls.splice(i, 1);
    }
}

export function deformNetPoint(net: RopeNet, point: RopePoint, ropeIndex: number): RopePoint {
    const group = net.groups.get(ropeIndex), motion = motionByNet.get(net);
    if (!group || !motion?.pulls.length) return point;
    let dx = 0, dy = 0;
    for (const pull of motion.pulls) {
        if (pull.group !== group) continue;
        const distance = Math.hypot(point.x - pull.point.x, point.y - pull.point.y);
        const falloff = 1 - distance / pull.width;
        if (falloff <= 0) continue;
        const deflection = pull.amount * falloff * falloff * (3 - 2 * falloff);
        dx += pull.nx * deflection;
        dy += pull.ny * deflection;
    }
    if (Math.abs(dx) + Math.abs(dy) < .001) return point;
    let pin = 1;
    for (const anchor of group.pins) pin = Math.min(pin, Math.hypot(point.x - anchor.x, point.y - anchor.y) / 25);
    const scale = Math.min(pin, 48 / (Math.hypot(dx, dy) || 1));
    return { x: point.x + dx * scale, y: point.y + dy * scale };
}

export function viewNetContact(net: RopeNet, body: RopeBody): NetContactView | null {
    const contact = motionByNet.get(net)?.contacts.get(body);
    if (!contact || contact.cooldown > 0) return null;
    const { kind, density, strength, phase, escape, nx, ny, pull } = contact;
    const point = deformNetPoint(net, pull.point, pull.group.indices.values().next().value);
    return { ...point, kind, density, strength, nx, ny, phase, escape, pull: unit(pull.amount / 36) };
}

function release(contact: Contact, body: RopeBody, impulse: number) {
    contact.cooldown = 12;
    contact.pull.driven = false;
    contact.pull.velocity = -Math.min(5.2, 1 + contact.pull.amount * .17);
    const sideSpeed = body.vy * contact.nx - body.vx * contact.ny;
    body.vx = -contact.nx * impulse - contact.ny * sideSpeed;
    body.vy = -contact.ny * impulse + contact.nx * sideSpeed;
}

export function moveThroughNet(
    net: RopeNet, body: RopeBody, from: RopePoint, radius: number, referenceSpeed: number,
    intent: RopePoint, canOccupy: (x: number, y: number) => boolean,
): NetContactKind | null {
    if (!net.woven.size) return null;
    const motion = motionFor(net);
    let contact = motion.contacts.get(body);
    const dx = body.x - from.x, dy = body.y - from.y;
    if (contact?.cooldown > 0) {
        if (--contact.cooldown === 0) motion.contacts.delete(body);
        return null;
    }
    if (!contact) {
        const hit = movingNetHit(net, from, body, radius);
        if (!hit) return null;
        const impact = response(net, hit, dx, dy, referenceSpeed);
        const speed = Math.max(0, dx * impact.nx + dy * impact.ny);
        const pull: NetPull = {
            group: net.groups.get(hit.rope)!, point: hit.point, nx: impact.nx, ny: impact.ny,
            width: 55 + impact.density * 49, amount: 0, velocity: 0, driven: true, age: 0,
        };
        contact = {
            ...impact, pull, surface: hit.surface, phase: 0, escape: 0, depth: -speed * hit.time,
            speed, side: 0, gap: -((from.x - hit.surface.x) * impact.nx + (from.y - hit.surface.y) * impact.ny) - speed * hit.time,
            cooldown: 0,
        };
        motion.contacts.set(body, contact);
        motion.pulls.push(pull);
    }
    contact.phase++;
    const { kind, nx, ny, density, strength, phase, pull } = contact;
    const inward = dx * nx + dy * ny;
    if (kind === 'glide') {
        // Drag acts in the direction crossing the strand. Leave lateral swimming intact.
        const drag = inward * (.08 + density * .34) * Math.max(0, 1 - (phase - 1) / 7);
        const x = body.x - drag * nx, y = body.y - drag * ny;
        if (canOccupy(x, y)) { body.x = x; body.y = y; }
        body.vx -= drag * nx;
        body.vy -= drag * ny;
        if (phase === 1) { pull.amount = 3 + strength * 13; pull.velocity = Math.min(3.4, inward * .35); }
        pull.driven = false;
        const distance = (body.x - contact.x) * nx + (body.y - contact.y) * ny;
        if (Math.abs(distance) > radius + 8 || phase >= 54) {
            contact.cooldown = 3;
        }
        return kind;
    }

    const effort = clamp((intent.x * nx + intent.y * ny) / 8, -1, 1);
    const sideEffort = clamp((intent.y * nx - intent.x * ny) / 8, -1, 1);
    const snagged = kind === 'snag';
    const target = snagged ? radius + 11 + 10 * density : 0;
    const slack = snagged ? 0 : 8;
    const displacement = snagged ? contact.depth - target : Math.max(0, contact.depth - slack);
    contact.speed = clamp((contact.speed - displacement * (.048 + .037 * density) + effort * (snagged ? .26 : .3)) * .88, -10, 14);
    const previousDepth = contact.depth;
    contact.depth = Math.min(43, contact.depth + contact.speed);
    const limit = snagged ? radius * .85 : 34;
    contact.side = clamp(contact.side + (dy * nx - dx * ny) * (snagged ? .16 : .6), -limit, limit);
    const tug = snagged && phase > 7 ? Math.sin(phase * .66) * (1.4 + Math.abs(sideEffort) * 2.8) : 0;
    const x = contact.surface.x + nx * (contact.depth - contact.gap) - ny * (contact.side + tug);
    const y = contact.surface.y + ny * (contact.depth - contact.gap) + nx * (contact.side + tug);
    if (canOccupy(x, y)) {
        body.x = x;
        body.y = y;
        body.vx = x - from.x;
        body.vy = y - from.y;
    } else {
        body.x = from.x;
        body.y = from.y;
        body.vx = body.vy = 0;
        contact.depth = previousDepth;
        contact.speed *= -.24;
    }
    pull.amount = Math.max(0, contact.depth) * .96 + tug * .46;
    pull.velocity = 0;
    pull.age = 0;
    pull.driven = true;
    if (snagged) {
        const backingOut = Math.max(0, -effort);
        contact.escape = unit(contact.escape + .007 - .003 * density + (.034 - .012 * density) * backingOut + .014 * Math.abs(sideEffort));
        if (contact.escape >= 1) release(contact, body, 6 + strength * 3);
    } else if ((phase >= 5 && contact.depth < -.5) || phase >= 36 || Math.abs(contact.side) >= 33) {
        release(contact, body, clamp(-contact.speed, 2.2, 7));
    }
    return kind;
}
