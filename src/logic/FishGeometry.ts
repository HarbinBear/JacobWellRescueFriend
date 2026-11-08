import { CONFIG } from '../core/config';
import type { FishEnemy } from './FishEnemy';

export function fishName(fish: FishEnemy) {
    return { piranha: '食人鱼', curious: '好奇鱼', rammer: '盾首鳗', provoked: '猎鲨', shoal: '银鳞鱼' }[fish.kind];
}

export function fishShape(fish: FishEnemy) {
    const size = CONFIG.fishEnemy.size;
    const scale = fish.kind === 'shoal' ? .39 : fish.kind === 'provoked' ? 1.35 : 1;
    return {
        length: size * scale * (fish.kind === 'rammer' ? 1.6 : .95),
        radius: size * (fish.kind === 'shoal' ? .16 : fish.kind === 'provoked' ? .52 : .38),
        head: size * (fish.kind === 'shoal' ? .20 : fish.kind === 'provoked' ? 1.05 : .63),
    };
}

function localPoint(fish: FishEnemy, x: number, y: number) {
    const c = Math.cos(fish.angle), s = Math.sin(fish.angle);
    return { x: fish.x + c * x - s * y, y: fish.y + s * x + c * y };
}

export function fishHeadPoint(fish: FishEnemy) {
    return localPoint(fish, fishShape(fish).head, 0);
}

export function fishKnotPoint(fish: FishEnemy) {
    return localPoint(fish, -CONFIG.fishEnemy.size * .15, fishShape(fish).radius + 5);
}

export function fishNetHandlePoint(fish: FishEnemy) {
    return localPoint(fish, -CONFIG.fishEnemy.size * .45, -fishShape(fish).radius - 16);
}
