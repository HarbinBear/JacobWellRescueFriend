import { CONFIG } from '../core/config';
import { state, input } from '../core/state';
import { processJoystickDrive } from './JoystickDrive';
import { playSFX } from '../audio/AudioManager';

/** 松手撤掉推力，体力在逻辑更新中逐渐恢复，绝不瞬间补满。 */
export function releaseSemiAutoDrive(): void {
    const sd = state.semiAutoDrive;
    sd.pushStartedAt = null;
    sd.thrusting = false;
    sd.inputPower = 0;
    if (sd.restStartedAt === null) sd.restStartedAt = Date.now();
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
    // 触屏：由行程连续映射 .3~1；键盘保留普通/Shift 两档。
    sd.inputPower = speedUp === undefined ? .3 + .7 * Math.min(1, (distance - 10) / 30) : speedUp ? 1 : .3;
    if (sd.pushStartedAt === null) sd.pushStartedAt = Date.now();
    sd.restStartedAt = null;
    sd.thrusting = !sd.exhausted && sd.remaining > 0;
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
    sd.thrusting = input.move > 0 && !sd.exhausted && sd.remaining > 0;
    if (sd.thrusting) {
        sd.remaining = Math.max(0, sd.remaining - dt * Math.pow(sd.inputPower, cfg.drainExponent) / Math.max(.1, cfg.sprintDuration));
        if (sd.remaining <= 0) {
            sd.remaining = 0; sd.exhausted = true; sd.thrusting = false; sd.depletedAt = now;
            playSFX('uiSecondary', { volume: .65, playbackRate: .7 });
        }
    } else if (input.move === 0) {
        const recoveryStart = (sd.restStartedAt ?? now) + cfg.recoveryDelay * 1000;
        const recoverDt = Math.min(dt, Math.max(0, (now - Math.max(previousAt ?? now, recoveryStart)) / 1000));
        sd.remaining = Math.min(1, sd.remaining + recoverDt / Math.max(.1, cfg.recoveryDuration));
        if (sd.exhausted && sd.remaining >= cfg.resumeThreshold) { sd.exhausted = false; sd.recoveredAt = now; }
    }
    const effortTarget = sd.thrusting ? .45 + sd.inputPower * .55 : 0;
    sd.effort += (effortTarget - sd.effort) * (1 - Math.exp(-dt / Math.max(.01, cfg.kickFadeDuration)));
    if (sd.effort < .005) sd.effort = 0;
    processJoystickDrive(moveSpeed, sd.thrusting, sd.inputPower);
    return true;
}
