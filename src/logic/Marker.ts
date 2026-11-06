import { CONFIG } from '../core/config';
import { input, state } from '../core/state';
import { ExtractionEnabled, findNearbyPickupTarget, performPickupTarget } from '../extraction';
import { findNearbyOxygenTank, startInstallTank } from './OxygenTank';
import { advanceRopeWheelPress, canUseRopeWheel, refreshRopeWheelAim } from './RopeWheel';

type Pickup = NonNullable<ReturnType<typeof findNearbyPickupTarget>>;
export type DiveSupply = { kind: 'oxygen'; id: number } | { kind: 'pickup'; item: Pickup };

function getDiveSupply(): DiveSupply | null {
    const tank = findNearbyOxygenTank();
    if (tank) return { kind: 'oxygen', id: tank.id };
    const item = ExtractionEnabled?.() ? findNearbyPickupTarget() : null;
    return item ? { kind: 'pickup', item } : null;
}

export function updateWheelButtonVisibility() {
    advanceRopeWheelPress();
    const wheel = state.wheel;
    wheel.btnVisible = canUseRopeWheel();
    wheel.btnActive = wheel.btnVisible;
    if (wheel.open) {
        refreshRopeWheelAim();
        return;
    }
    const moving = CONFIG.driveMode === 'manual'
        ? Object.keys(state.manualDrive?.activeTouches || {}).length > 0
        : input.move !== 0;
    wheel.nearbyInfo = wheel.btnVisible && !moving && state.screen === 'mazeRescue' ? getDiveSupply() : null;
}

export function performDiveSupply(selected: DiveSupply) {
    const actual = canUseRopeWheel() ? getDiveSupply() : null;
    if (!actual || actual.kind !== selected.kind) return false;
    if (actual.kind === 'oxygen' && selected.kind === 'oxygen' && actual.id === selected.id) {
        const tank = state.mazeRescue?.oxygenTanks?.find(tank => tank.id === actual.id && !tank.consumed);
        if (!tank) return false;
        startInstallTank(tank.id);
        tank.holdProgress = 1;
        tank.isBeingInstalled = true;
        return true;
    }
    if (actual.kind === 'pickup' && selected.kind === 'pickup' &&
        actual.item.kind === selected.item.kind && actual.item.id === selected.item.id) {
        const result = performPickupTarget(actual.item);
        if (!result.ok && result.reason === 'bagFull') console.log('[Pickup] 背包已满，无法拾取');
        return result.ok;
    }
    return false;
}
