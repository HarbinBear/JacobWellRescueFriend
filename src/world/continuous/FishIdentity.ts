import { state } from '../../core/state';
import { activeWorld, world } from './Geometry';

interface FishIdentity { worldId?: number; }
interface FishIdentityCounter { nextFishId: number; }

export function isFishWorldId(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Assign identities before publishing a batch of fish into a continuous world.
 * Existing valid IDs never change: rope endpoints and saved references depend on them.
 * Duplicate IDs are ambiguous and must be rejected by the caller, not silently renumbered.
 * This explicit form also works while the world is being bootstrapped or restored.
 */
export function ensureFishIdentities(fishes: FishIdentity[], counter: FishIdentityCounter): void {
    const seen = new Set<FishIdentity>(), used = new Set<number>(), missing: FishIdentity[] = [];
    let next = isFishWorldId(counter.nextFishId) ? counter.nextFishId : 1;
    for (const fish of fishes) {
        if (seen.has(fish)) continue;
        seen.add(fish);
        if (!isFishWorldId(fish.worldId)) {
            missing.push(fish);
            continue;
        }
        if (used.has(fish.worldId)) throw new Error('连续世界鱼 ID 重复：' + fish.worldId);
        used.add(fish.worldId);
        next = Math.max(next, fish.worldId + 1);
    }
    // Validate the whole batch before changing any fish or the allocation counter.
    if (!isFishWorldId(next + missing.length)) throw new Error('连续世界鱼 ID 已超出安全整数范围');
    for (const fish of missing) fish.worldId = next++;
    counter.nextFishId = next;
}

/** GM/runtime creation keeps legacy modes unchanged and returns the same batch. */
export function registerContinuousFish<T extends object>(fishes: T[]): T[] {
    if (!activeWorld()) return fishes;
    const current = world();
    if (current) ensureFishIdentities([...state.fishEnemies, ...fishes] as FishIdentity[], current);
    return fishes;
}
