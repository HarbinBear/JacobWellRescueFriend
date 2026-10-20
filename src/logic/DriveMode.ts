import { CONFIG } from '../core/config';
import type { DriveMode } from '../core/config/character';
import { state, input, touches, player, createSemiAutoDriveState } from '../core/state';

/** 取消所有移动输入和半自动供力状态，用于模式切换/场景切换/系统中断。 */
export function resetDriveInput(refillStamina = false): void {
    const previous = state.semiAutoDrive;
    input.move = 0;
    input.speedUp = false;
    input.targetAngle = player.angle;
    touches.joystickId = null;
    state.semiAutoDrive = createSemiAutoDriveState();
    if (!refillStamina) {
        state.semiAutoDrive.remaining = previous.remaining;
        state.semiAutoDrive.exhausted = previous.exhausted;
        state.semiAutoDrive.restStartedAt = Date.now();
        state.semiAutoDrive.lastUpdateAt = Date.now();
    }
    state.manualDrive.activeTouches = {};
    state.manualDrive.hasInput = false;
}

export function setDriveMode(mode: DriveMode): void {
    CONFIG.driveMode = mode;
    resetDriveInput(true);
    const md = state.manualDrive;
    md.leftKickProgress = md.rightKickProgress = 0;
    md.leftKickStrength = md.rightKickStrength = 0;
    md.leftTurnProgress = md.rightTurnProgress = 0;
    md.leftTurnStrength = md.rightTurnStrength = 0;
    md.forwardVisual = md.turnVisual = md.kickDrive = 0;
}

export function cycleDriveMode(): void {
    const modes: DriveMode[] = ['auto', 'manual', 'semiAuto'];
    setDriveMode(modes[(modes.indexOf(CONFIG.driveMode) + 1) % modes.length]);
}
