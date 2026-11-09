export const karstClamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const karstMix = (a: number, b: number, t: number) => a + (b - a) * t;
export function karstSmooth(a: number, b: number, v: number) {
    const t = karstClamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
}
export function karstHash(x: number, y: number, seed: number) {
    let v = Math.imul((x | 0) ^ seed, 374761393) ^ Math.imul((y | 0) + seed, 668265263);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}
export function karstNoise(x: number, y: number, scale: number, seed: number) {
    const u = x / scale, v = y / scale, a = Math.floor(u), b = Math.floor(v);
    const fx = karstSmooth(0, 1, u - a), fy = karstSmooth(0, 1, v - b);
    return karstMix(karstMix(karstHash(a, b, seed), karstHash(a + 1, b, seed), fx),
        karstMix(karstHash(a, b + 1, seed), karstHash(a + 1, b + 1, seed), fx), fy) * 2 - 1;
}
