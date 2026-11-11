import type { KarstChamber } from './KarstChambers';

// 小范围沉积形体样例：依附求场时实际找到的洞顶，不重塑洞室、不切平岩壁。
export interface SpeleothemStudy { x: number; y: number; radius: number; minY: number }
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function planSpeleothems(rooms: KarstChamber[], entranceX: number, seam: number): SpeleothemStudy | null {
    const room = [...rooms].sort((a, b) => Math.hypot(a.x - entranceX, a.y - seam) - Math.hypot(b.x - entranceX, b.y - seam))[0];
    return room ? { x: room.x, y: room.y, radius: Math.max(220, Math.min(330, room.radius)), minY: seam + 80 } : null;
}
export function speleothemWeight(s: SpeleothemStudy, x: number, y: number, z: number) {
    return smooth(64, 112, z) * (1 - smooth(360, 420, z)) * smooth(s.minY, s.minY + 100, y)
        * (1 - smooth(s.radius * .65, s.radius * 1.35, Math.hypot(x - s.x, y - s.y)));
}
// 长度在水平 x/z 上连续，竖直方向由现有洞顶扫描落根。宽根向细尖收束，三根不排成行。
export function speleothemCeiling(s: SpeleothemStudy, x: number, z: number) {
    const R = s.radius;
    const pendant = (px: number, pz: number, radius: number, height: number) => {
        const d = Math.hypot(x - px, (z - pz) * 1.06);
        return height * Math.pow(Math.max(0, 1 - d / radius), 1.35)
            + 42 * Math.pow(Math.max(0, 1 - d / (radius * 2.0)), 2.3);
    };
    const a = pendant(s.x + R * .15, 155, 59, 245);
    const b = pendant(s.x + R * .48, 277, 40, 170);
    const c = pendant(s.x - R * .50, 315, 29, 125);
    // 石幔在纵深上弯曲、变厚、收边，底缘高低不同，不是一片直板。
    const phase = (z - 100) / 60, center = s.x - R * .28 + Math.sin(phase) * 26 + Math.sin(phase * 2.1) * 7;
    const width = 28 + 4 * Math.sin(phase * 1.3), side = Math.max(0, 1 - Math.abs(x - center) / width);
    const ends = smooth(72, 115, z) * (1 - smooth(290, 365, z));
    const curtain = (170 + 50 * Math.cos(phase * .8)) * Math.pow(side, 1.15) * ends;
    const peak = Math.max(a, b, c, curtain);
    return Math.min(300, peak + (a + b + c + curtain - peak) * .15);
}
