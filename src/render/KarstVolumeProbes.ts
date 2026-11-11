// 与分块网格共用的密度采样：正值为水，负值为岩石。未知分块不能制造落点。
export interface VolumeProbeField {
    x: number; y: number; step: number; cols: number; rows: number;
    z: Float32Array; values: Int8Array;
}
export interface VolumeProbeHit {
    x: number; y: number; z: number; nx: number; ny: number; nz: number; distance: number;
}
export type VolumeProbeSample = (x: number, y: number, z: number) => number;

export function sampleVolumeProbe(field: VolumeProbeField, x: number, y: number, z: number) {
    const gx = (x - field.x) / field.step, gy = (y - field.y) / field.step, layers = field.z;
    if (gx < 0 || gy < 0 || gx > field.cols - 1 || gy > field.rows - 1 || z < layers[0] || z > layers[layers.length - 1]) return NaN;
    // 纵深层间距不同，不能直接以 z / step 寻址。
    let lo = 0, hi = layers.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (layers[mid] <= z) lo = mid; else hi = mid; }
    const ix = Math.min(field.cols - 2, Math.floor(gx)), iy = Math.min(field.rows - 2, Math.floor(gy));
    const tx = gx - ix, ty = gy - iy, tz = (z - layers[lo]) / (layers[hi] - layers[lo]);
    const plane = field.cols * field.rows, base = (lo * field.rows + iy) * field.cols + ix, v = field.values;
    const a = v[base] + (v[base + 1] - v[base]) * tx;
    const b = v[base + field.cols] + (v[base + field.cols + 1] - v[base + field.cols]) * tx;
    const c = v[base + plane] + (v[base + plane + 1] - v[base + plane]) * tx;
    const d = v[base + plane + field.cols] + (v[base + plane + field.cols + 1] - v[base + plane + field.cols]) * tx;
    return (a + (b - a) * ty) * (1 - tz) + (c + (d - c) * ty) * tz;
}

export function raycastVolumeProbe(sample: VolumeProbeSample, x: number, y: number, z: number,
    dx: number, dy: number, dz: number, maxDistance: number): VolumeProbeHit | null {
    const length = Math.hypot(dx, dy, dz);
    if (!length || maxDistance <= 0) return null;
    dx /= length; dy /= length; dz /= length;
    // 光源在实体里，或路径尚未加载时，不能越过未知区域猜一个更远的后壁。
    const first = sample(x, y, z);
    if (!Number.isFinite(first) || first <= 0) return null;
    let previous = 0;
    for (let distance = Math.min(12, maxDistance); ; distance = Math.min(distance + 12, maxDistance)) {
        const value = sample(x + dx * distance, y + dy * distance, z + dz * distance);
        if (!Number.isFinite(value)) return null;
        if (value <= 0) {
            let low = previous, high = distance;
            for (let i = 0; i < 7; i++) {
                const middle = (low + high) * .5, f = sample(x + dx * middle, y + dy * middle, z + dz * middle);
                if (!Number.isFinite(f)) return null;
                if (f > 0) low = middle; else high = middle;
            }
            const hit = (low + high) * .5, hx = x + dx * hit, hy = y + dy * hit, hz = z + dz * hit;
            const center = sample(hx, hy, hz), epsilon = 2;
            const derivative = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) ? (a - b) / (epsilon * 2)
                : Number.isFinite(a) ? (a - center) / epsilon : Number.isFinite(b) ? (center - b) / epsilon : 0;
            const nx = derivative(sample(hx + epsilon, hy, hz), sample(hx - epsilon, hy, hz));
            const ny = derivative(sample(hx, hy + epsilon, hz), sample(hx, hy - epsilon, hz));
            const nz = derivative(sample(hx, hy, hz + epsilon), sample(hx, hy, hz - epsilon));
            const normalLength = Math.hypot(nx, ny, nz);
            if (normalLength < 1e-6) return null;
            return { x: hx, y: hy, z: hz, nx: nx / normalLength, ny: ny / normalLength, nz: nz / normalLength, distance: hit };
        }
        if (distance >= maxDistance) return null;
        previous = distance;
    }
}
