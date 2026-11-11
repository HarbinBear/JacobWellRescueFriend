import type { FishEnemy } from '../logic/FishEnemy';
import { fishShape } from '../logic/FishGeometry';

/** World-space fish geometry. Colours are linear RGB albedo, without baked light. */
export interface FishVolumeMesh {
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    indices: Uint16Array;
    fishCount: number;
}

type Point = [number, number, number];
type Color = [number, number, number];
interface Template { positions: number[]; colors: number[]; indices: number[]; }
interface Ring { x: number; y: number; z: number; }

const TAU = Math.PI * 2;
const SIDES = 16;
const templates: { [kind: string]: Template } = {};

export function supportsFishVolume(fish: FishEnemy): boolean {
    return !fish.dead && fish.state !== 'dying' &&
        (fish.kind === 'piranha' || fish.kind === 'curious');
}

function vertex(mesh: Template, p: Point, c: Color): number {
    const index = mesh.positions.length / 3;
    mesh.positions.push(p[0], p[1], p[2]);
    mesh.colors.push(c[0], c[1], c[2]);
    return index;
}

function mix(a: Color, b: Color, t: number): Color {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function unit(x: number, y: number, z: number): Point {
    const d = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / d, y / d, z / d];
}

/** Thin closed membrane: rounded outer corners and two quiet, embedded fin rays. */
function fin(mesh: Template, outline: Point[], normal: Point, color: Color, thickness = .012) {
    const rounded: Point[] = [];
    for (let j = 0; j < outline.length; j++) {
        const p = outline[j];
        if (j === 0 || j === outline.length - 1) { rounded.push(p); continue; }
        for (const neighbour of [outline[j - 1], outline[j + 1]]) {
            rounded.push([p[0] * .82 + neighbour[0] * .18, p[1] * .82 + neighbour[1] * .18,
                p[2] * .82 + neighbour[2] * .18]);
        }
    }
    outline = rounded;
    thickness *= .22;
    const edgeThickness = .0007;
    const centre: Point = [0, 0, 0];
    for (const p of outline) for (let k = 0; k < 3; k++) centre[k] += p[k] / outline.length;
    for (let k = 0; k < 3; k++) centre[k] = centre[k] * .45 + outline[0][k] * .55;
    const n = unit(normal[0], normal[1], normal[2]);
    const ids: number[][] = [];
    const centres: number[] = [];
    for (const side of [-1, 1]) {
        ids.push(outline.map(p => vertex(mesh,
            [p[0] + n[0] * side * edgeThickness, p[1] + n[1] * side * edgeThickness,
                p[2] + n[2] * side * edgeThickness], color)));
        centres.push(vertex(mesh,
            [centre[0] + n[0] * side * thickness, centre[1] + n[1] * side * thickness, centre[2] + n[2] * side * thickness],
            color));
    }
    // Outline winding can differ between the paired fins; orient each face outwards.
    const face = (a: number, b: number, c: number, nx: number, ny: number, nz: number) => {
        const p = mesh.positions;
        const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
        const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
        if ((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < 0) {
            mesh.indices.push(a, c, b);
        } else mesh.indices.push(a, b, c);
    };
    for (let j = 0; j < outline.length; j++) {
        const k = (j + 1) % outline.length;
        face(centres[0], ids[0][j], ids[0][k], -n[0], -n[1], -n[2]);
        face(centres[1], ids[1][j], ids[1][k], n[0], n[1], n[2]);
        const ex = (outline[j][0] + outline[k][0]) * .5 - centre[0];
        const ey = (outline[j][1] + outline[k][1]) * .5 - centre[1];
        const ez = (outline[j][2] + outline[k][2]) * .5 - centre[2];
        face(ids[0][j], ids[1][j], ids[1][k], ex, ey, ez);
        face(ids[0][j], ids[1][k], ids[0][k], ex, ey, ez);
    }
    const rayColor = mix(color, [.25, .31, .29], .14);
    for (const j of [Math.round(outline.length * .32), Math.round(outline.length * .65)]) {
        const end = outline[j], dx = end[0] - centre[0], dy = end[1] - centre[1], dz = end[2] - centre[2];
        const lateral = unit(n[1] * dz - n[2] * dy, n[2] * dx - n[0] * dz, n[0] * dy - n[1] * dx);
        for (const side of [-1, 1]) {
            const root: Point = [0, 0, 0], tip: Point = [0, 0, 0];
            for (let k = 0; k < 3; k++) {
                root[k] = centre[k] * .86 + end[k] * .14 + n[k] * side * (thickness * .86 + edgeThickness * .14 + .0009);
                tip[k] = centre[k] * .08 + end[k] * .92 + n[k] * side * (thickness * .08 + edgeThickness * .92 + .0009);
            }
            const left = vertex(mesh, [root[0] - lateral[0] * .004, root[1] - lateral[1] * .004, root[2] - lateral[2] * .004], color);
            const ridge = vertex(mesh, [root[0] + n[0] * side * .0015, root[1] + n[1] * side * .0015,
                root[2] + n[2] * side * .0015], rayColor);
            const right = vertex(mesh, [root[0] + lateral[0] * .004, root[1] + lateral[1] * .004, root[2] + lateral[2] * .004], color);
            const terminal = vertex(mesh, tip, color);
            face(left, ridge, terminal, n[0] * side, n[1] * side, n[2] * side);
            face(ridge, right, terminal, n[0] * side, n[1] * side, n[2] * side);
        }
    }
}

function ellipsoid(mesh: Template, centre: Point, radii: Point, color: Color, slices = 10, rings = 4) {
    const start = mesh.positions.length / 3;
    vertex(mesh, [centre[0], centre[1], centre[2] - radii[2]], color);
    for (let i = 1; i < rings; i++) {
        const a = Math.PI * i / rings;
        for (let j = 0; j < slices; j++) {
            const b = TAU * j / slices;
            vertex(mesh, [centre[0] + Math.sin(a) * Math.cos(b) * radii[0],
                centre[1] + Math.sin(a) * Math.sin(b) * radii[1], centre[2] - Math.cos(a) * radii[2]], color);
        }
    }
    const end = vertex(mesh, [centre[0], centre[1], centre[2] + radii[2]], color);
    for (let j = 0; j < slices; j++) {
        const k = (j + 1) % slices;
        mesh.indices.push(start, start + 1 + k, start + 1 + j);
        for (let i = 0; i < rings - 2; i++) {
            const a = start + 1 + i * slices + j, b = start + 1 + i * slices + k;
            mesh.indices.push(a, b, b + slices, a, b + slices, a + slices);
        }
        mesh.indices.push(end, end - slices + j, end - slices + k);
    }
}

/** Small solid grooves and lip rims following the body's actual curved surface. */
function tube(mesh: Template, path: Point[], radius: number, color: Color) {
    const start = mesh.positions.length / 3;
    const sides = 5;
    for (let i = 0; i < path.length; i++) {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        const tangent = unit(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const u = unit(-tangent[1], tangent[0], 0);
        const v: Point = [tangent[1] * u[2] - tangent[2] * u[1],
            tangent[2] * u[0] - tangent[0] * u[2], tangent[0] * u[1] - tangent[1] * u[0]];
        for (let j = 0; j < sides; j++) {
            const a = TAU * j / sides;
            vertex(mesh, [path[i][0] + radius * (u[0] * Math.cos(a) + v[0] * Math.sin(a)),
                path[i][1] + radius * (u[1] * Math.cos(a) + v[1] * Math.sin(a)),
                path[i][2] + radius * (u[2] * Math.cos(a) + v[2] * Math.sin(a))], color);
        }
        if (i === 0) continue;
        for (let j = 0; j < sides; j++) {
            const k = (j + 1) % sides, a = start + (i - 1) * sides + j, b = start + (i - 1) * sides + k;
            mesh.indices.push(a, b, b + sides, a, b + sides, a + sides);
        }
    }
}

function makeTemplate(curious: boolean): Template {
    const mesh: Template = { positions: [], colors: [], indices: [] };
    // x is the original swimming axis; y is anatomical up/down and z is side-to-side.
    const profile: Ring[] = curious ? [
        { x: -.73, y: .065, z: .044 }, { x: -.59, y: .20, z: .115 },
        { x: -.41, y: .365, z: .19 }, { x: -.16, y: .465, z: .23 },
        { x: .10, y: .49, z: .235 }, { x: .35, y: .425, z: .21 },
        { x: .55, y: .30, z: .16 }, { x: .70, y: .16, z: .09 },
        { x: .79, y: .045, z: .035 },
    ] : [
        { x: -1.08, y: .065, z: .041 }, { x: -.85, y: .12, z: .075 },
        { x: -.59, y: .235, z: .14 }, { x: -.29, y: .325, z: .205 },
        { x: .04, y: .365, z: .235 }, { x: .35, y: .35, z: .225 },
        { x: .64, y: .265, z: .172 }, { x: .88, y: .15, z: .10 },
        { x: 1.05, y: .055, z: .045 },
    ];
    // Monotone cubic mid-rings round the shoulder and tail without changing silhouette extrema.
    const slope = (i: number, key: 'y' | 'z') => {
        const a = profile[Math.max(0, i - 1)], b = profile[i], c = profile[Math.min(profile.length - 1, i + 1)];
        const before = i ? (b[key] - a[key]) / (b.x - a.x) : (c[key] - b[key]) / (c.x - b.x);
        const after = i < profile.length - 1 ? (c[key] - b[key]) / (c.x - b.x) : before;
        return before * after <= 0 ? 0 : 2 * before * after / (before + after);
    };
    const rings: Ring[] = [];
    for (let i = 0; i < profile.length; i++) {
        const a = profile[i];
        rings.push(a);
        if (i === profile.length - 1) continue;
        const b = profile[i + 1], dx = b.x - a.x;
        rings.push({ x: (a.x + b.x) * .5,
            y: (a.y + b.y) * .5 + (slope(i, 'y') - slope(i + 1, 'y')) * dx / 8,
            z: (a.z + b.z) * .5 + (slope(i, 'z') - slope(i + 1, 'z')) * dx / 8 });
    }
    const back: Color = curious ? [.055, .105, .10] : [.035, .075, .085];
    const flank: Color = curious ? [.29, .355, .32] : [.24, .30, .31];
    const belly: Color = [.48, .49, .43];
    const finColor: Color = curious ? [.11, .18, .15] : [.065, .12, .13];
    for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        for (let j = 0; j < SIDES; j++) {
            const a = TAU * j / SIDES, y = -Math.cos(a);
            const c = y < -.08 ? mix(back, flank, Math.pow((y + 1) / .92, .65)) :
                mix(flank, belly, Math.min(1, (y + .08) / 1.08));
            vertex(mesh, [ring.x, ring.y * y, ring.z * Math.sin(a)], c);
            if (i === 0) continue;
            const k = (j + 1) % SIDES, a0 = (i - 1) * SIDES + j, a1 = (i - 1) * SIDES + k;
            mesh.indices.push(a0, i * SIDES + j, i * SIDES + k, a0, i * SIDES + k, a1);
        }
    }
    const tail = vertex(mesh, [rings[0].x - .035, 0, 0], flank);
    const nose = vertex(mesh, [curious ? .815 : 1.10, .008, 0], flank);
    for (let j = 0; j < SIDES; j++) {
        const k = (j + 1) % SIDES, end = (rings.length - 1) * SIDES;
        mesh.indices.push(tail, j, k, nose, end + k, end + j);
    }

    const tailRoot = curious ? -.70 : -1.055, tailEnd = curious ? -1.36 : -1.64;
    for (const sign of [-1, 1]) {
        fin(mesh, [[tailRoot, sign * -.035, 0], [tailRoot - .14, sign * .16, 0],
            [tailEnd + .09, sign * (curious ? .55 : .66), .015],
            [tailEnd, sign * (curious ? .51 : .63), .02],
            [tailEnd + .08, sign * .30, .005], [tailEnd + .27, sign * .025, 0]], [0, 0, 1], finColor, .018);
    }
    fin(mesh, curious ? [[-.48, -.29, 0], [-.39, -.53, 0], [-.15, -.68, .01],
        [.05, -.72, .01], [.15, -.48, 0], [.36, -.40, 0]] :
        [[-.64, -.22, 0], [-.53, -.43, 0], [-.28, -.62, .01],
            [-.03, -.73, .01], [.06, -.44, 0], [.34, -.34, 0]], [0, 0, 1], finColor);
    fin(mesh, [[-.62, curious ? .23 : .20, 0], [-.54, curious ? .51 : .42, 0],
        [-.27, curious ? .57 : .51, 0], [-.12, curious ? .46 : .34, 0]], [0, 0, 1], finColor);
    for (const sign of [-1, 1]) {
        fin(mesh, [[.27, .11, sign * .215], [.13, .12, sign * .28],
            [-.22, .30, sign * .395], [-.35, .26, sign * .365],
            [-.13, .13, sign * .225]], [0, -.7, sign * .7], finColor, .014);
        fin(mesh, [[-.02, curious ? .43 : .32, sign * .07], [-.23, curious ? .56 : .47, sign * .16],
            [-.43, curious ? .53 : .44, sign * .11], [-.24, curious ? .39 : .28, sign * .05]],
        [0, .4, sign * .8], finColor, .009);
    }

    const surfaceZ = (x: number, y: number) => {
        let i = 0;
        while (i < rings.length - 2 && x > rings[i + 1].x) i++;
        const a = rings[i], b = rings[i + 1], t = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
        const ry = a.y + (b.y - a.y) * t, rz = a.z + (b.z - a.z) * t;
        return rz * Math.sqrt(Math.max(0, 1 - y * y / (ry * ry)));
    };
    for (const sign of [-1, 1]) {
        const eyeX = curious ? .465 : .655, eyeY = curious ? -.145 : -.105;
        const eyeZ = surfaceZ(eyeX, eyeY) + .008, eyeR = curious ? .092 : .071;
        ellipsoid(mesh, [eyeX, eyeY, sign * eyeZ], [eyeR, eyeR, .035], [.28, .32, .27]);
        ellipsoid(mesh, [eyeX + .011, eyeY, sign * (eyeZ + .027)], [eyeR * .67, eyeR * .72, .017],
            curious ? [.25, .255, .16] : [.23, .16, .11], 10, 3);
        ellipsoid(mesh, [eyeX + .018, eyeY, sign * (eyeZ + .042)], [eyeR * .39, eyeR * .46, .012],
            [.004, .008, .009], 8, 3);
        const gill: Point[] = [];
        for (let i = 0; i <= 6; i++) {
            const t = i / 6, y = (t - .44) * (curious ? .64 : .46);
            const x = (curious ? .25 : .40) - Math.sin(t * Math.PI) * .085;
            gill.push([x, y, sign * (surfaceZ(x, y) + .006)]);
        }
        tube(mesh, gill, .009, [.025, .048, .047]);
        const lip: Point[] = [];
        const end = curious ? .795 : 1.073, start = curious ? .65 : .86;
        for (let i = 0; i <= 3; i++) {
            const x = start + (end - start) * i / 3, y = .034 + .012 * (1 - i / 3);
            lip.push([x, y, sign * (surfaceZ(x, y) + .007)]);
        }
        tube(mesh, lip, .011, [.035, .054, .049]);
    }
    return mesh;
}

/** Build a small visible batch; overflow fish remain outside this batch (Uint16 limit). */
export function buildFishVolumeMesh(fishes: readonly FishEnemy[], timeSeconds: number,
    getStrain?: (fish: FishEnemy) => number): FishVolumeMesh {
    const batch: { fish: FishEnemy; mesh: Template }[] = [];
    let vertexCount = 0, indexCount = 0;
    for (const fish of fishes) {
        if (!supportsFishVolume(fish)) continue;
        const mesh = templates[fish.kind] || (templates[fish.kind] = makeTemplate(fish.kind === 'curious'));
        const count = mesh.positions.length / 3;
        if (vertexCount + count > 65535) break;
        vertexCount += count;
        indexCount += mesh.indices.length;
        batch.push({ fish, mesh });
    }
    const positions = new Float32Array(vertexCount * 3), colors = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3), indices = new Uint16Array(indexCount);
    let offset = 0, indexOffset = 0;
    for (const { fish, mesh } of batch) {
        const size = fishShape(fish).length / .95;
        const rawStrain = getStrain ? getStrain(fish) : 0;
        const strain = Number.isFinite(rawStrain) ? Math.max(-1, Math.min(1, rawStrain)) : 0;
        const turn = Math.atan2(Math.sin(fish.targetAngle - fish.angle), Math.cos(fish.targetAngle - fish.angle));
        const stunned = fish.state === 'stunned' || fish.stunFrames > 0;
        const quiet = stunned || fish.bound || fish.state === 'bound';
        const fast = fish.state === 'lunge' || fish.state === 'flee' || fish.state === 'fear' ||
            fish.state === 'bite' || fish.state === 'devour';
        const phase = fish.animTime * (fast ? 2.5 : fish.state === 'inspect' ? .6 : 1);
        const amplitude = quiet ? .035 : fast ? .20 : .135;
        const roll = Math.max(-.17, Math.min(.17, turn * .20)) + (stunned ? .15 : Math.sin(phase * .6) * .018);
        const cr = Math.cos(roll), sr = Math.sin(roll);
        const ca = Math.cos(fish.angle + strain * .31), sa = Math.sin(fish.angle + strain * .31);
        const sx = 1 - Math.abs(strain) * .11;
        const sy = (stunned ? .84 : fish.bound ? .94 : 1) * (1 + Math.abs(strain) * .16);
        const sz = fish.bound ? .88 : 1;
        for (let i = 0; i < mesh.positions.length; i += 3) {
            const x = mesh.positions[i], y = mesh.positions[i + 1];
            let z = mesh.positions[i + 2];
            const rear = Math.max(0, -x) / 1.64;
            // Bending increases smoothly along the tail; head and centreline remain anchored.
            z += Math.sin(phase - rear * 2.8) * amplitude * rear * rear;
            // Only lateral fins extend this far: a small breathing beat preserves the body surface.
            if (Math.abs(mesh.positions[i + 2]) > .27) {
                z += Math.sign(z) * Math.sin(phase * .8 + timeSeconds * .25) * .012;
            }
            const ry = (y * sy * cr - z * sz * sr) * size, rz = (y * sy * sr + z * sz * cr) * size;
            const p = offset * 3 + i;
            positions[p] = x * sx * size * ca - ry * sa;
            positions[p + 1] = x * sx * size * sa + ry * ca;
            positions[p + 2] = rz;
        }
        colors.set(mesh.colors, offset * 3);
        for (let i = 0; i < mesh.indices.length; i++) indices[indexOffset + i] = offset + mesh.indices[i];
        offset += mesh.positions.length / 3;
        indexOffset += mesh.indices.length;
    }
    // Compute bent normals before the large world translation, preserving the thin fin rays.
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
        const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
        normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
        normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
    }
    for (let i = 0; i < normals.length; i += 3) {
        const length = Math.sqrt(normals[i] * normals[i] + normals[i + 1] * normals[i + 1] + normals[i + 2] * normals[i + 2]);
        if (length > 1e-8) { normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length; }
        else { normals[i] = 0; normals[i + 1] = 0; normals[i + 2] = -1; }
    }
    offset = 0;
    for (const { fish, mesh } of batch) {
        for (let i = 0; i < mesh.positions.length; i += 3) {
            positions[offset + i] += fish.x;
            positions[offset + i + 1] += fish.y;
        }
        offset += mesh.positions.length;
    }
    return { positions, normals, colors, indices, fishCount: batch.length };
}
