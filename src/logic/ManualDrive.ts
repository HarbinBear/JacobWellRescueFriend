import { CONFIG } from '../core/config';
import { state, player } from '../core/state';

// --- 手动挡移动处理 ---

/**
 * 处理手动挡模式下的玩家移动
 *
 * 当前版本采用"逐触点、整段有效行程持续消费"的输入模型：
 * 1. 每个触点从按下到松开，只对应一次完整踢水生命周期
 * 2. 整段有效行程都会持续驱动移动与表现，不会只在前半段生效
 * 3. 同一段输入距离下，输入速度越快，推进和转向越强
 * 4. 左右腿按每次新输入的顺序左右轮流分配，不再取决于触点位置
 *
 * 返回 true 表示手动挡已处理移动，调用方应跳过自动挡逻辑
 */
export function processManualDrive(): boolean {
    if (!CONFIG.manualDrive.enabled) return false;
    const md = state.manualDrive;
    if (!md) return false;

    const cfg = CONFIG.manualDrive;

    const moveScalar = (current: number, target: number, rise: number, fall: number) => {
        if (target > current) return Math.min(target, current + rise);
        return Math.max(target, current - fall);
    };

    const moveSignedScalar = (current: number, target: number, rise: number, fall: number) => {
        const delta = target - current;
        if (Math.abs(delta) < 0.0001) return target;
        const step = delta > 0 ? rise : fall;
        if (Math.abs(delta) <= step) return target;
        return current + Math.sign(delta) * step;
    };

    md.hasInput = false;

    let strongestInputAngle = md.lastInputAngle;
    let strongestInputDelta = 0;

    let leftKickProgressTarget = 0;
    let rightKickProgressTarget = 0;
    let leftKickStrengthTarget = 0;
    let rightKickStrengthTarget = 0;
    let leftTurnProgressTarget = 0;
    let rightTurnProgressTarget = 0;
    let leftTurnStrengthTarget = 0;
    let rightTurnStrengthTarget = 0;
    let forwardVisualTarget = 0;
    let turnVisualTarget = 0;

    // 键盘虚拟触点允许持续产生新的单次输入生命周期，便于桌面调试
    const kbTouch = md.activeTouches[-1];
    if (kbTouch) {
        if (kbTouch.finished) {
            kbTouch.startX = kbTouch.currX;
            kbTouch.startY = kbTouch.currY;
            kbTouch.prevX = kbTouch.currX;
            kbTouch.prevY = kbTouch.currY;
            kbTouch.consumedDistance = 0;
            kbTouch.finished = false;
        }

        const kbDx = kbTouch.currX - kbTouch.prevX;
        const kbDy = kbTouch.currY - kbTouch.prevY;
        if (kbDx !== 0 || kbDy !== 0) {
            const norm = Math.hypot(kbDx, kbDy);
            const step = 20;
            kbTouch.currX += (kbDx / norm) * step;
            kbTouch.currY += (kbDy / norm) * step;
        }
    }

    const touchIds = Object.keys(md.activeTouches);
    for (const id of touchIds) {
        const td = md.activeTouches[id as any];
        if (!td) continue;

        const totalDx = td.currX - td.startX;
        const totalDy = td.currY - td.startY;
        const totalDist = Math.hypot(totalDx, totalDy);
        const frameDx = td.currX - td.prevX;
        const frameDy = td.currY - td.prevY;
        const frameDist = Math.hypot(frameDx, frameDy);

        if (totalDist < cfg.minSwipeDist) {
            td.prevX = td.currX;
            td.prevY = td.currY;
            continue;
        }

        let inputX = totalDx / totalDist;
        let inputY = totalDy / totalDist;
        if (cfg.reverseDir && Number(id) >= 0) {
            inputX = -inputX;
            inputY = -inputY;
        }

        const effectiveDistance = Math.max(cfg.minSwipeDist, cfg.effectiveDistance);
        const effectiveDistNow = Math.min(totalDist, effectiveDistance);
        const wasFinished = td.finished;
        const deltaDistance = wasFinished ? 0 : Math.max(0, effectiveDistNow - td.consumedDistance);
        const effectiveProgress = effectiveDistNow / effectiveDistance;
        const progressStrength = 0.35 + effectiveProgress * cfg.thrustDistanceScale;
        const speedStrength = frameDist * cfg.thrustSpeedScale;
        const thrustPower = Math.min(cfg.thrustMax, cfg.thrustBase + progressStrength + speedStrength);
        const turnPower = Math.min(cfg.turnMax, cfg.turnBase + frameDist * cfg.turnSpeedScale);

        const cosA = Math.cos(player.angle);
        const sinA = Math.sin(player.angle);
        const forwardDotRaw = inputX * cosA + inputY * sinA;
        const lateralDot = inputX * (-sinA) + inputY * cosA;
        const forwardDot = Math.max(0, forwardDotRaw);
        const backwardTurn = Math.max(0, -forwardDotRaw) * cfg.backwardTurnScale;
        const turnAmount = Math.min(1, Math.abs(lateralDot) + backwardTurn);

        let turnSign = 0;
        if (Math.abs(lateralDot) > 0.08) {
            turnSign = lateralDot > 0 ? 1 : -1;
        } else if (backwardTurn > 0.001) {
            turnSign = td.strokeSide;
        }

        if (deltaDistance > 0) {
            const distanceRatio = deltaDistance / effectiveDistance;
            const deltaForward = thrustPower * distanceRatio * forwardDot;
            const deltaTurn = turnPower * distanceRatio * turnAmount;

            if (deltaForward > 0.0001) {
                player.vx += cosA * deltaForward;
                player.vy += sinA * deltaForward;
            }

            if (deltaTurn > 0.0001 && turnSign !== 0) {
                player.angle += turnSign * deltaTurn;
                player.targetAngle = player.angle;
            }

            md.hasInput = true;

            const inputAngle = Math.atan2(inputY, inputX);
            const inputDelta = deltaDistance * (forwardDot + turnAmount + frameDist * 0.02);
            if (inputDelta > strongestInputDelta) {
                strongestInputDelta = inputDelta;
                strongestInputAngle = inputAngle;
            }
        }

        td.consumedDistance = Math.max(td.consumedDistance, effectiveDistNow);
        if (totalDist >= effectiveDistance) {
            td.finished = true;
        }

        const visualProgress = wasFinished ? 0 : effectiveProgress;
        const kickVisual = forwardDot * visualProgress;
        const turnVisualSigned = turnSign * turnAmount * visualProgress;
        const kickStrengthNorm = wasFinished ? 0 : Math.min(1, 0.28 + forwardDot * 0.52 + frameDist * 0.018);
        const turnStrengthNorm = wasFinished ? 0 : Math.min(1, 0.2 + turnAmount * 0.55 + frameDist * 0.015);

        if (td.strokeSide < 0) {
            leftKickProgressTarget = Math.max(leftKickProgressTarget, visualProgress);
            leftKickStrengthTarget = Math.max(leftKickStrengthTarget, Math.min(1, kickStrengthNorm));
            leftTurnProgressTarget = Math.max(leftTurnProgressTarget, visualProgress);
            leftTurnStrengthTarget = Math.max(leftTurnStrengthTarget, Math.min(1, turnStrengthNorm));
        } else {
            rightKickProgressTarget = Math.max(rightKickProgressTarget, visualProgress);
            rightKickStrengthTarget = Math.max(rightKickStrengthTarget, Math.min(1, kickStrengthNorm));
            rightTurnProgressTarget = Math.max(rightTurnProgressTarget, visualProgress);
            rightTurnStrengthTarget = Math.max(rightTurnStrengthTarget, Math.min(1, turnStrengthNorm));
        }

        forwardVisualTarget += kickVisual;
        turnVisualTarget += turnVisualSigned;

        td.prevX = td.currX;
        td.prevY = td.currY;
    }

    // 各向异性水阻
    const cosA = Math.cos(player.angle);
    const sinA = Math.sin(player.angle);
    const vForward = player.vx * cosA + player.vy * sinA;
    const vLateral = -player.vx * sinA + player.vy * cosA;

    const vForwardDamped = vForward * cfg.dragForward;
    const vLateralDamped = vLateral * cfg.dragLateral;

    player.vx = vForwardDamped * cosA - vLateralDamped * sinA;
    player.vy = vForwardDamped * sinA + vLateralDamped * cosA;

    // 限速
    let speed = Math.hypot(player.vx, player.vy);
    const maxSpd = cfg.maxSpeed;
    if (speed > maxSpd) {
        player.vx *= maxSpd / speed;
        player.vy *= maxSpd / speed;
        speed = maxSpd;
    }

    const carryRatio = maxSpd > 0.0001 ? Math.max(0, Math.min(1, speed / maxSpd)) : 0;
    const progressFall = Math.max(0.001, cfg.kickRecoverRate * (1 - carryRatio * 0.6));
    const strengthFall = Math.max(0.001, cfg.kickStrengthDecay * (1 - carryRatio * 0.5));
    const visualFall = Math.max(0.001, cfg.kickStrengthDecay * (1 - carryRatio * 0.55));

    md.lastInputAngle = strongestInputAngle;
    md.leftKickProgress = moveScalar(md.leftKickProgress, leftKickProgressTarget, cfg.kickProgressRate, progressFall);
    md.rightKickProgress = moveScalar(md.rightKickProgress, rightKickProgressTarget, cfg.kickProgressRate, progressFall);
    md.leftKickStrength = moveScalar(md.leftKickStrength, leftKickStrengthTarget, cfg.kickStrengthRise, strengthFall);
    md.rightKickStrength = moveScalar(md.rightKickStrength, rightKickStrengthTarget, cfg.kickStrengthRise, strengthFall);
    md.leftTurnProgress = moveScalar(md.leftTurnProgress, leftTurnProgressTarget, cfg.kickProgressRate, progressFall);
    md.rightTurnProgress = moveScalar(md.rightTurnProgress, rightTurnProgressTarget, cfg.kickProgressRate, progressFall);
    md.leftTurnStrength = moveScalar(md.leftTurnStrength, leftTurnStrengthTarget, cfg.kickStrengthRise, strengthFall);
    md.rightTurnStrength = moveScalar(md.rightTurnStrength, rightTurnStrengthTarget, cfg.kickStrengthRise, strengthFall);
    md.forwardVisual = moveScalar(md.forwardVisual, Math.min(1, forwardVisualTarget), cfg.kickStrengthRise, visualFall);
    md.turnVisual = moveSignedScalar(md.turnVisual, Math.max(-1, Math.min(1, turnVisualTarget)), cfg.kickStrengthRise, visualFall);

    return true;
}
