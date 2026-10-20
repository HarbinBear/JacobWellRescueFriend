import { CONFIG } from '../core/config';
import { input, player } from '../core/state';
import { updateAutoDriveVisual } from './ManualDrive';

/** 自动挡与半自动共用同一套物理；半自动只决定此刻是否允许供力。 */
export function processJoystickDrive(moveSpeed: number, thrusting = input.move > 0, power = input.speedUp ? 1 : .3): number {
    player.targetAngle = input.targetAngle;
    let angleDiff = player.targetAngle - player.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    player.angle += angleDiff * CONFIG.turnSpeed;
    const speed = moveSpeed * Math.max(0, Math.min(1, power));
    if (thrusting) {
        player.vx += Math.cos(player.targetAngle) * speed * CONFIG.acceleration;
        player.vy += Math.sin(player.targetAngle) * speed * CONFIG.acceleration;
    }
    player.vx *= CONFIG.waterDrag;
    player.vy *= CONFIG.waterDrag;
    updateAutoDriveVisual(angleDiff * CONFIG.turnSpeed, thrusting);
    return angleDiff;
}
