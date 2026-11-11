import { getRopeNet } from '../logic/RopeNet';
import type { RopeNet, RopePoint } from '../logic/RopeNet';
import { getWovenPath } from './RopeVisualPath';
import { buildRopeVolumeMesh, supportsRopeVolume, validRopeVolumePath, ROPE_VOLUME_RADIUS,
    ROPE_VOLUME_MAX_RINGS, type RopeVolumeSource } from './RopeVolumeMesh';

interface Snapshot { rope: RopeVolumeSource; flags: string; values: unknown[]; }
const flags = (r: RopeVolumeSource) => [!!r.startWall, !!r.endWall, !!r.startLoose, !!r.endLoose,
    !!r.startOnRope, !!r.endOnRope, r.mode || ''].join('/');
function snapshot(rope: RopeVolumeSource, path: readonly RopePoint[] = rope.path): Snapshot {
    return { rope, flags: flags(rope), values: Array.isArray(path) ? path.reduce<unknown[]>((a, p) => {
        a.push(p?.x, p?.y); return a;
    }, []) : [] };
}
function same(ropes: readonly RopeVolumeSource[], saved: Snapshot[], paths?: ReadonlyMap<RopeVolumeSource, readonly RopePoint[]>) {
    if (ropes.length !== saved.length) return false;
    for (let i = 0; i < ropes.length; i++) {
        const r = ropes[i], s = saved[i], source = paths?.get(r) || r.path, path = Array.isArray(source) ? source : [];
        if (s.rope !== r || s.flags !== flags(r) || s.values.length !== path.length * 2) return false;
        for (let j = 0; j < path.length; j++) {
            if (!Object.is(path[j]?.x, s.values[j * 2]) || !Object.is(path[j]?.y, s.values[j * 2 + 1])) return false;
        }
    }
    return true;
}
function segmentInBox(ax: number, ay: number, bx: number, by: number, l: number, r: number, t: number, b: number) {
    let enter = 0, leave = 1;
    for (const [start, delta, low, high] of [[ax, bx - ax, l, r], [ay, by - ay, t, b]]) {
        if (Math.abs(delta) < 1e-12) { if (start < low || start > high) return false; continue; }
        const a = (low - start) / delta, z = (high - start) / delta;
        enter = Math.max(enter, Math.min(a, z)); leave = Math.min(leave, Math.max(a, z));
        if (enter > leave) return false;
    }
    return true;
}
function inRange(path: readonly RopePoint[], cx: number, cy: number, halfW: number, halfH: number,
    light: { x: number; y: number; radius: number }, pad = 20) {
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        if (segmentInBox(a.x, a.y, b.x, b.y, cx - halfW - pad, cx + halfW + pad, cy - halfH - pad, cy + halfH + pad)) return true;
        if (light.radius <= 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
        const t = length2 ? Math.max(0, Math.min(1, ((light.x - a.x) * dx + (light.y - a.y) * dy) / length2)) : 0;
        if (Math.hypot(a.x + dx * t - light.x, a.y + dy * t - light.y) <= light.radius + pad) return true;
    }
    return false;
}

/** Four persistent buffers; only changed membership or actual visual positions trigger uploads. */
export class RopeVolumePass {
    private buffers: WebGLBuffer[] = [];
    private topology: Snapshot[] = [];
    private selected: Snapshot[] = [];
    private net: RopeNet | null = null;
    private netIndices = new Map<RopeVolumeSource, number>();
    private meshRejected = 0;
    private meshFallbackReason = '';
    private included = new Set<RopeVolumeSource>();
    private disposed = false;
    private topologyTooLarge = false;
    count = 0;
    triangles = 0;
    bytes = 0;
    revision = 0;
    builds = 0;
    rejected = 0;
    failure = '';
    fallbackReason = '';
    constructor(private gl: WebGLRenderingContext) {
        for (let i = 0; i < 4; i++) {
            const buffer = gl.createBuffer();
            if (!buffer) { this.buffers.forEach(b => gl.deleteBuffer(b)); throw Error('实体绳缓冲区分配失败'); }
            this.buffers.push(buffer);
        }
    }
    prepare(ropes: readonly RopeVolumeSource[], _time: number, cx: number, cy: number, halfW: number, halfH: number,
        enabled: boolean, light: { x: number; y: number; radius: number }, surfaceY: number,
        pose: (point: RopePoint, originalRopeIndex: number) => RopePoint = point => point) {
        if (this.disposed) return;
        if (!same(ropes, this.topology)) {
            this.topology = ropes.map(rope => snapshot(rope));
            const valid = ropes.filter(validRopeVolumePath);
            // Bound the quadratic junction scan too; never silently omit a crossing rope.
            this.topologyTooLarge = valid.reduce((n, rope) => n + rope.path.length - 1, 0) > 2048;
            this.net = null; this.netIndices.clear();
            if (!this.topologyTooLarge) {
                // A fresh array bypasses RopeNet's length-only cache when coordinates were edited in place.
                this.net = getRopeNet(valid);
                valid.forEach((rope, index) => this.netIndices.set(rope, index));
            }
        }
        const paths = new Map<RopeVolumeSource, readonly RopePoint[]>();
        const candidates: RopeVolumeSource[] = [];
        let samplingRejected = 0;
        const fallbackReason = this.failure ? 'upload-failed' : this.topologyTooLarge ? 'topology-budget' : '';
        this.fallbackReason = fallbackReason;
        if (enabled && !this.failure && !this.topologyTooLarge && Number.isFinite(surfaceY)) {
            ropes.forEach((rope, originalIndex) => {
                if (!supportsRopeVolume(rope)) return;
                const index = this.netIndices.get(rope);
                const posed = index !== undefined && !!this.net && (this.net.woven.has(index) || rope.startOnRope || rope.endOnRope);
                // Rest bounds include the dynamics' maximum 48-unit displacement before the exact visual test.
                if (!inRange(rope.path, cx, cy, halfW, halfH, light, posed ? 68 : 20)) return;
                const sampled = posed ? getWovenPath(this.net!, index!, rope.path, ROPE_VOLUME_MAX_RINGS) : rope.path;
                if (!sampled) { samplingRejected++; return; }
                const path = posed ? sampled.map(point => pose(point, originalIndex)) : sampled;
                if (!path.every(point => point.y >= surfaceY + ROPE_VOLUME_RADIUS * 2) ||
                    !inRange(path, cx, cy, halfW, halfH, light)) return;
                candidates.push(rope); paths.set(rope, path);
            });
        }
        this.fallbackReason ||= samplingRejected ? 'path-budget' : this.meshFallbackReason;
        this.rejected = samplingRejected + this.meshRejected;
        if (same(candidates, this.selected, paths)) return;
        this.selected = candidates.map(rope => snapshot(rope, paths.get(rope)));
        this.revision++;
        this.included.clear(); this.count = this.triangles = this.bytes = this.meshRejected = 0;
        this.meshFallbackReason = '';
        this.fallbackReason = fallbackReason || (samplingRejected ? 'path-budget' : '');
        this.rejected = samplingRejected;
        if (!candidates.length) return;
        const mesh = buildRopeVolumeMesh(candidates, paths);
        this.builds++;
        this.meshRejected = mesh.rejected.length;
        this.rejected += this.meshRejected;
        this.meshFallbackReason = mesh.rejected.length ? mesh.rejected[0].reason : '';
        this.fallbackReason = samplingRejected ? 'path-budget' : this.meshFallbackReason;
        if (!mesh.ropes.length) return;
        const gl = this.gl;
        try {
            [mesh.positions, mesh.normals, mesh.colors, mesh.indices].forEach((data, i) => {
                const target = i === 3 ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
                gl.bindBuffer(target, this.buffers[i]); gl.bufferData(target, data, gl.STATIC_DRAW);
            });
            this.included = new Set(mesh.ropes);
            this.count = mesh.ropes.length; this.triangles = mesh.indices.length / 3;
            this.bytes = mesh.positions.byteLength + mesh.normals.byteLength + mesh.colors.byteLength + mesh.indices.byteLength;
        } catch (error) {
            this.failure = String(error); // Leave every rope in the complete 2D fallback on upload failure.
            this.fallbackReason = 'upload-failed';
            console.warn('[实体绳] 回退二维绘制', error);
        }
    }
    contains(rope: RopeVolumeSource) { return this.included.has(rope); }
    draw(shadow = false) {
        if (!this.count || this.disposed) return;
        const gl = this.gl;
        for (let i = 0; i < (shadow ? 1 : 3); i++) {
            gl.enableVertexAttribArray(i); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 0, 0);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers[3]);
        gl.drawElements(gl.TRIANGLES, this.triangles * 3, gl.UNSIGNED_SHORT, 0);
        gl.disableVertexAttribArray(2);
    }
    dispose() {
        if (this.disposed) return;
        this.buffers.forEach(buffer => this.gl.deleteBuffer(buffer)); this.buffers = [];
        this.included.clear(); this.topology = []; this.selected = [];
        this.net = null; this.netIndices.clear(); this.meshRejected = this.rejected = 0;
        this.count = this.triangles = this.bytes = 0; this.revision++; this.disposed = true;
    }
}
