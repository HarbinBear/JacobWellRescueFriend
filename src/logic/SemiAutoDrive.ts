import { CONFIG } from '../core/config';
import { state, input } from '../core/state';
import { processJoystickDrive } from './JoystickDrive';
import { playSFX } from '../audio/AudioManager';

/** 恒定基础恢复；sprintDuration 仍表示满槽全力推进的净消耗时间。 */
export function getSemiAutoEnergyRates() {
    const cfg = CONFIG.semiAutoDrive;
    const recovery = 1 / Math.max(.1, cfg.recoveryDuration);
    const fullDrain = recovery + 1 / Math.max(.1, cfg.sprintDuration);
    const exponent = Math.max(1, cfg.drainExponent);
    return { recovery, fullDrain, exponent, sustainablePower: Math.pow(recovery / fullDrain, 1 / exponent) };
}

/** 松手只撤掉推力，不瞬间补满，也不改变恒定恢复速率。 */
export function releaseSemiAutoDrive(): void {
    const sd = state.semiAutoDrive;
    sd.pushStartedAt = null;
    sd.thrusting = false;
    sd.inputPower = sd.outputPower = 0;
    input.move = 0;
    input.speedUp = false;
}

export function updateSemiAutoJoystick(dx: number, dy: number, speedUp?: boolean): void {
    if (CONFIG.driveMode !== 'semiAuto') return;
    const sd = state.semiAutoDrive;
    const distance = Math.hypot(dx, dy);
    if (distance <= 10) { releaseSemiAutoDrive(); return; }
    input.move = 1;
    input.targetAngle = Math.atan2(dy, dx);
    input.speedUp = speedUp ?? distance > 35;
    sd.inputPower = speedUp === undefined ? .3 + .7 * Math.min(1, (distance - 10) / 30) : speedUp ? 1 : .3;
    if (sd.pushStartedAt === null) sd.pushStartedAt = Date.now();
    sd.thrusting = true;
}

export function processSemiAutoDrive(moveSpeed = CONFIG.moveSpeed): boolean {
    if (CONFIG.driveMode !== 'semiAuto') return false;
    const blocked = state.rope?.hold?.active || state.fishBite?.active ||
        (state.screen === 'mazeRescue' && state.mazeRescue?.retreatHolding);
    if (blocked || input.move === 0) releaseSemiAutoDrive();
    const sd = state.semiAutoDrive, cfg = CONFIG.semiAutoDrive;
    const now = Date.now(), previousAt = sd.lastUpdateAt;
    const dt = previousAt === null ? 1 / 60 : Math.max(0, Math.min(.1, (now - previousAt) / 1000));
    sd.lastUpdateAt = now;
    const rates = getSemiAutoEnergyRates();
    const requested = input.move > 0 ? Math.max(0, Math.min(1, sd.inputPower)) : 0;
    const wasExhausted = sd.exhausted;
    if (dt > 0) {
        // Include this frame's recovery before limiting work. Surplus at a full tank is discarded.
        const budget = sd.remaining + rates.recovery * dt;
        const affordable = Math.pow(Math.max(0, budget) / (dt * rates.fullDrain), 1 / rates.exponent);
        sd.outputPower = Math.min(requested, affordable);
        sd.remaining = Math.max(0, Math.min(1, budget - dt * rates.fullDrain * Math.pow(sd.outputPower, rates.exponent)));
        if (sd.remaining < 1e-9) sd.remaining = 0;
        sd.exhausted = requested > rates.sustainablePower && sd.remaining === 0;
    } else {
        // Duplicate timestamps must not spend energy or momentarily restore full thrust.
        sd.outputPower = sd.remaining > 0 ? requested : Math.min(requested, rates.sustainablePower);
        sd.exhausted = requested > rates.sustainablePower && sd.remaining === 0;
    }
    sd.thrusting = sd.outputPower > 0;
    if (sd.exhausted && !wasExhausted) {
        sd.depletedAt = now;
        playSFX('uiSecondary', { volume: .65, playbackRate: .7 });
    } else if (!sd.exhausted && wasExhausted) {
        sd.recoveredAt = now;
    }
    const effortTarget = sd.thrusting ? .45 + sd.outputPower * .55 : 0;
    sd.effort += (effortTarget - sd.effort) * (1 - Math.exp(-dt / Math.max(.01, cfg.kickFadeDuration)));
    if (sd.effort < .005) sd.effort = 0;
    processJoystickDrive(moveSpeed, sd.thrusting, sd.outputPower);
    return true;
}
