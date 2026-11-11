import type { NetRope, RopePoint } from '../logic/RopeNet';

export interface RopeVolumeSource extends NetRope {
    startWall?: unknown;
    endWall?: unknown;
    mode?: string;
}
export const ROPE_VOLUME_RADIUS = 1.15;
export const ROPE_VOLUME_SIDES = 8;
export const ROPE_VOLUME_STEP = 16;
export const ROPE_VOLUME_MAX_RINGS = 1024;
export const ROPE_VOLUME_MAX_VERTICES = 16384;
export type RopeVolumeRejection = 'not-fixed' | 'invalid-path' | 'tight-turn' | 'budget';
export interface RopeVolumeRange {
    rope: RopeVolumeSource;
    vertexStart: number;
    vertexCount: number;
    indexStart: number;
    indexCount: number;
    ringCount: number;
}
/** World coordinates, linear albedo. Rejected ropes must retain their complete 2D drawing. */
export interface RopeVolumeMesh {
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    indices: Uint16Array;
    ropes: RopeVolumeSource[];
    ranges: RopeVolumeRange[];
    rejected: { rope: RopeVolumeSource; reason: RopeVolumeRejection }[];
}

export function validRopeVolumePath(rope: RopeVolumeSource): boolean {
    return Array.isArray(rope?.path) && rope.path.length >= 2 && rope.path.every(p =>
        p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e7 && Math.abs(p.y) < 1e7);
}
export function supportsRopeVolume(rope: RopeVolumeSource): boolean {
    return !!rope?.startWall && !!rope.endWall && !rope.startLoose && !rope.endLoose &&
        !rope.startOnRope && !rope.endOnRope && (!rope.mode || rope.mode === 'tight') && validRopeVolumePath(rope);
}
interface Direction { x: number; y: number; length: number; }
interface Ring extends RopePoint { nx: number; ny: number; miter: number; distance: number; }

function pathRings(rope: RopeVolumeSource): Ring[] | RopeVolumeRejection {
    if (!validRopeVolumePath(rope)) return 'invalid-path';
    if (!supportsRopeVolume(rope)) return 'not-fixed';
    const points: RopePoint[] = [];
    for (const p of rope.path) {
        const last = points[points.length - 1];
        if (!last || last.x !== p.x || last.y !== p.y) points.push(p);
    }
    if (points.length < 2) return 'invalid-path';
    const directions: Direction[] = [];
    let count = 1;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) return 'tight-turn';
        count += Math.ceil(length / ROPE_VOLUME_STEP);
        if (count > ROPE_VOLUME_MAX_RINGS) return 'budget';
        directions.push({ x: dx / length, y: dy / length, length });
    }
    const joins: { nx: number; ny: number; miter: number; extension: number }[] = [];
    for (let i = 0; i < points.length; i++) {
        const before = directions[Math.max(0, i - 1)], after = directions[Math.min(directions.length - 1, i)];
        const dot = Math.max(-1, Math.min(1, before.x * after.x + before.y * after.y));
        // Near reversals cannot form a finite, non-overlapping tube; keep the original whole rope.
        if (dot < -.5) return 'tight-turn';
        const length = Math.hypot(before.x + after.x, before.y + after.y);
        const miter = 1 / Math.sqrt((1 + dot) * .5);
        joins.push({ nx: -(before.y + after.y) / length, ny: (before.x + after.x) / length,
            miter, extension: ROPE_VOLUME_RADIUS * Math.sqrt(Math.max(0, (1 - dot) / (1 + dot))) });
    }
    for (let i = 0; i < directions.length; i++) {
        if (directions[i].length < joins[i].extension + joins[i + 1].extension + .001) return 'tight-turn';
    }
    const rings: Ring[] = [{ ...points[0], ...joins[0], distance: 0 }];
    let distance = 0;
    for (let i = 0; i < directions.length; i++) {
        const a = points[i], b = points[i + 1], d = directions[i], pieces = Math.ceil(d.length / ROPE_VOLUME_STEP);
        for (let j = 1; j <= pieces; j++) {
            const t = j / pieces;
            rings.push({ x: j === pieces ? b.x : a.x + (b.x - a.x) * t,
                y: j === pieces ? b.y : a.y + (b.y - a.y) * t,
                ...(j === pieces ? joins[i + 1] : { nx: -d.y, ny: d.x, miter: 1 }), distance: distance + d.length * t });
        }
        distance += d.length;
    }
    return rings;
}

export function buildRopeVolumeMesh(ropes: readonly RopeVolumeSource[]): RopeVolumeMesh {
    const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
    const accepted: RopeVolumeSource[] = [], ranges: RopeVolumeRange[] = [], rejected: RopeVolumeMesh['rejected'] = [];
    const sides = ROPE_VOLUME_SIDES, radius = ROPE_VOLUME_RADIUS;
    for (const rope of ropes) {
        const rings = pathRings(rope);
        if (typeof rings === 'string') { rejected.push({ rope, reason: rings }); continue; }
        const vertexStart = positions.length / 3, vertexCount = rings.length * sides + 2 * (sides + 1);
        if (vertexStart + vertexCount > ROPE_VOLUME_MAX_VERTICES) { rejected.push({ rope, reason: 'budget' }); continue; }
        const indexStart = indices.length;
        for (let i = 0; i < rings.length; i++) {
            const ring = rings[i];
            for (let j = 0; j < sides; j++) {
                const angle = j * Math.PI * 2 / sides, c = Math.cos(angle), s = Math.sin(angle);
                positions.push(ring.x + ring.nx * radius * c * ring.miter, ring.y + ring.ny * radius * c * ring.miter, radius * s);
                const nx = ring.nx * c / ring.miter, ny = ring.ny * c / ring.miter, length = Math.hypot(nx, ny, s);
                normals.push(nx / length, ny / length, s / length);
                // Subtle fibre variation in albedo only; lighting remains entirely in the shared shader.
                const fibre = 1 + .035 * Math.sin(ring.distance * .26 + angle * 3) + .018 * Math.sin(ring.distance * .071);
                colors.push(.40 * fibre, .385 * fibre, .31 * fibre);
                if (i === 0) continue;
                const a = vertexStart + (i - 1) * sides + j, b = vertexStart + (i - 1) * sides + (j + 1) % sides;
                indices.push(a, b, b + sides, a, b + sides, a + sides);
            }
        }
        for (const end of [0, rings.length - 1]) {
            const ring = rings[end], sign = end === 0 ? -1 : 1;
            const nx = ring.ny * sign, ny = -ring.nx * sign, centre = positions.length / 3;
            positions.push(ring.x, ring.y, 0); normals.push(nx, ny, 0); colors.push(.39, .375, .30);
            for (let j = 0; j < sides; j++) {
                const source = (vertexStart + end * sides + j) * 3;
                positions.push(positions[source], positions[source + 1], positions[source + 2]);
                normals.push(nx, ny, 0); colors.push(.39, .375, .30);
            }
            for (let j = 0; j < sides; j++) {
                const a = centre + 1 + j, b = centre + 1 + (j + 1) % sides;
                if (end === 0) indices.push(centre, b, a); else indices.push(centre, a, b);
            }
        }
        accepted.push(rope);
        ranges.push({ rope, vertexStart, vertexCount, indexStart, indexCount: indices.length - indexStart, ringCount: rings.length });
    }
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors),
        indices: new Uint16Array(indices), ropes: accepted, ranges, rejected };
}
