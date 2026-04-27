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

    // 鞘腿自动驱动：本帧来自输入的总推进强度（需要 deltaForward 累积后才能归一化）
    let driveAccum = 0;

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

        // --- 计算输入方向与身体朝向的夹角（用于转向渐进动画） ---
        // inputAngleWorld 表示本次输入希望潜水员朝向的世界角度
        const inputAngleWorld = Math.atan2(inputY, inputX);
        let bodyInputDiff = inputAngleWorld - player.angle;
        // 归一化到 [-π, π]
        while (bodyInputDiff > Math.PI) bodyInputDiff -= Math.PI * 2;
        while (bodyInputDiff < -Math.PI) bodyInputDiff += Math.PI * 2;
        const bodyInputAbs = Math.abs(bodyInputDiff);

        // 掉头程度 t：0 = 完全同向，1 = 完全反向；在 bigTurnThreshold 附近用 blendWidth 做软过渡
        // t = 0 时正常移动+转向；t = 1 时只转身不推进（仅靠惯性滑行）
        const bigTurnHalfWidth = Math.max(0.01, cfg.bigTurnBlendWidth * 0.5);
        const bigTurnLow = cfg.bigTurnThreshold - bigTurnHalfWidth;
        const bigTurnHigh = cfg.bigTurnThreshold + bigTurnHalfWidth;
        let bigTurnT: number;
        if (bodyInputAbs <= bigTurnLow) bigTurnT = 0;
        else if (bodyInputAbs >= bigTurnHigh) bigTurnT = 1;
        else {
            const u = (bodyInputAbs - bigTurnLow) / (bigTurnHigh - bigTurnLow);
            // smoothstep，避免硬切
            bigTurnT = u * u * (3 - 2 * u);
        }

        // 推进融合系数：同向（bigTurnT=0）时乘 cos(diff)（0~1），大掉头时降到 bigTurnThrustFactor
        const forwardBlend = Math.max(0, Math.cos(bodyInputAbs));
        const thrustBlendFactor = forwardBlend * (1 - bigTurnT) + cfg.bigTurnThrustFactor * bigTurnT;

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
            // 推进受转向渐进系数调制：同向全量，大掉头阶段几乎为 0（仅靠惯性滑行）
            const deltaForward = thrustPower * distanceRatio * forwardDot * thrustBlendFactor;
            const deltaTurn = turnPower * distanceRatio * turnAmount;

            if (deltaForward > 0.0001) {
                player.vx += cosA * deltaForward;
                player.vy += sinA * deltaForward;
                // 累积本帧输入驱动量（后续用于推动 kickDrive、驱动鞘腿时钟）
                driveAccum += deltaForward;
            }

            if (deltaTurn > 0.0001 && turnSign !== 0) {
                player.angle += turnSign * deltaTurn;
                player.targetAngle = player.angle;
            }

            // 大掉头阶段额外施加朝向补偿：保证即使侧向分量很小，身体也能迅速转向输入方向
            // 这一部分只改角度，不改速度，速度由水阻自然衰减形成"滑行"观感
            if (bigTurnT > 0.001 && bodyInputAbs > 0.001) {
                const assistStep = cfg.bigTurnAssist * bigTurnT * distanceRatio *
                    Math.min(1, bodyInputAbs / Math.PI * 2);
                const assistSign = bodyInputDiff > 0 ? 1 : -1;
                player.angle += assistSign * assistStep;
                player.targetAngle = player.angle;
            }

            md.hasInput = true;

            const inputAngle = inputAngleWorld;
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
        // 动作表现：大掉头时压低"前进踢水"表现、抬高"转向修正"表现
        const kickVisual = forwardDot * visualProgress * (1 - bigTurnT);
        const turnVisualSigned = turnSign * turnAmount * visualProgress;
        const kickStrengthNorm = wasFinished ? 0 : Math.min(1, (0.28 + forwardDot * 0.52 + frameDist * 0.018) * (1 - bigTurnT * 0.85));
        const turnStrengthNorm = wasFinished ? 0 : Math.min(1, 0.2 + turnAmount * 0.55 + frameDist * 0.015 + bigTurnT * 0.35);

        // 手动挡视觉：左右手/左右腿同步发力（双手一起划）
        // 转向仍按 turnVisualTarget 的正负号驱动身体侧倾，左右 turn 强度取同值即可
        const kickStrengthClamped = Math.min(1, kickStrengthNorm);
        const turnStrengthClamped = Math.min(1, turnStrengthNorm);
        leftKickProgressTarget = Math.max(leftKickProgressTarget, visualProgress);
        rightKickProgressTarget = Math.max(rightKickProgressTarget, visualProgress);
        leftKickStrengthTarget = Math.max(leftKickStrengthTarget, kickStrengthClamped);
        rightKickStrengthTarget = Math.max(rightKickStrengthTarget, kickStrengthClamped);
        leftTurnProgressTarget = Math.max(leftTurnProgressTarget, visualProgress);
        rightTurnProgressTarget = Math.max(rightTurnProgressTarget, visualProgress);
        leftTurnStrengthTarget = Math.max(leftTurnStrengthTarget, turnStrengthClamped);
        rightTurnStrengthTarget = Math.max(rightTurnStrengthTarget, turnStrengthClamped);

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

    // 鞭腿自动驱动 kickDrive 更新：
    // kickDrive 现在只表示"加速瞬间的短暂 boost"，不再是腿部动画的唯一驱动源
    // 腿部动画主要由速度驱动（渲染侧按 speed/maxSpeed 算），kickDrive 只在加速时给腿额外的鞭打力度和频率
    // - 有输入时，按 driveAccum 的比例向上推
    // - 无输入时，以 kickDriveDecay 缓慢衰减
    const driveTarget = Math.min(1, driveAccum / Math.max(0.1, cfg.thrustMax * 0.6));
    if (md.hasInput && driveTarget > md.kickDrive) {
        md.kickDrive = Math.min(1, md.kickDrive + cfg.kickDriveRise * Math.max(driveTarget - md.kickDrive, 0.1));
    } else {
        md.kickDrive = Math.max(0, md.kickDrive - cfg.kickDriveDecay);
    }

    return true;
}

/**
 * 自动挡（摇杆/AI）模式下更新潜水员动作视觉信号
 *
 * 自动挡分支不会调用 processManualDrive()，因此 state.manualDrive 的各项运行态
 * 动画字段永远停留在 0，drawDiver 接不到任何手脚动作信号。这里补一个轻量级
 * 更新器：根据玩家当前速度、角速度和是否在加速，把 forwardVisual、turnVisual、
 * 左右转向动作强度以及 kickDrive 写成合理值，保证：
 *   - 有速度时潜水员腿部相位时钟会继续推进（靠渲染侧 speedNorm）
 *   - 有转向时身体侧倾、手臂做转向修正
 *   - 加速时 kickDrive 给腿一点额外鞭打 boost
 *
 * 参数：
 *   angleDiff  本帧想要转过的角度差（有符号，按世界坐标）
 *   isThrust   本帧是否在主动推进（input.move 大于 0 或 AI 移动）
 */
export function updateAutoDriveVisual(angleDiff: number, isThrust: boolean): void {
    const md = state.manualDrive;
    if (!md) return;
    const cfg = CONFIG.manualDrive;

    // 速度归一化：用作手动挡同一套 maxSpeed 基准，保证自动挡下动画节奏与手动挡接近
    const speed = Math.hypot(player.vx, player.vy);
    const speedRef = Math.max(0.1, cfg.maxSpeed);
    const speedNorm = Math.max(0, Math.min(1, speed / speedRef));

    // 转向信号：angleDiff 越大身体侧倾/手臂划转越夸张；约 0.22 弧度（约 12°）就接近满量
    // 正常巡游的小转向也能驱动出明显视觉——关键是让转向时身体动画明显加强
    const turnAbs = Math.min(1, Math.abs(angleDiff) / 0.22);
    // turnVisual 带符号：正值 = 向左侧倾/左手内收，负值 = 向右侧倾/右手内收
    const turnVisualTarget = Math.max(-1, Math.min(1, angleDiff / 0.22));
    // 左右 turn 强度同时抬高（自动挡没有"左右腿独立"概念），让两侧手臂对称参与转向修正
    const turnStrengthTarget = turnAbs;
    const turnProgressTarget = turnAbs;

    // 前进信号：推进中且速度非零时，forwardVisual 给 speedNorm 大小，让身体轻微前倾压缩
    const forwardVisualTarget = isThrust ? speedNorm : speedNorm * 0.6;

    // kickDrive：推进时把当前 kickDrive 抬到与速度匹配的水平；无推进时按配置衰减
    const kickDriveTargetBoost = isThrust ? Math.min(1, speedNorm + 0.15) : 0;

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

    // 自动挡踢水动作复用速度相位时钟驱动，leftKickProgress / rightKickProgress 不需要写
    // 但 forwardVisual / turnVisual / left*Turn* / right*Turn* 必须写
    md.forwardVisual = moveScalar(md.forwardVisual, forwardVisualTarget, cfg.kickStrengthRise, cfg.kickStrengthDecay);
    md.turnVisual = moveSignedScalar(md.turnVisual, turnVisualTarget, cfg.kickStrengthRise, cfg.kickStrengthDecay);

    md.leftTurnProgress = moveScalar(md.leftTurnProgress, turnProgressTarget, cfg.kickProgressRate, cfg.kickRecoverRate);
    md.rightTurnProgress = moveScalar(md.rightTurnProgress, turnProgressTarget, cfg.kickProgressRate, cfg.kickRecoverRate);
    md.leftTurnStrength = moveScalar(md.leftTurnStrength, turnStrengthTarget, cfg.kickStrengthRise, cfg.kickStrengthDecay);
    md.rightTurnStrength = moveScalar(md.rightTurnStrength, turnStrengthTarget, cfg.kickStrengthRise, cfg.kickStrengthDecay);

    // kickDrive 使用自己的 rise/decay（与手动挡 kickDriveRise/Decay 保持一致）
    if (kickDriveTargetBoost > md.kickDrive) {
        md.kickDrive = Math.min(1, md.kickDrive + cfg.kickDriveRise * Math.max(kickDriveTargetBoost - md.kickDrive, 0.1));
    } else {
        md.kickDrive = Math.max(0, md.kickDrive - cfg.kickDriveDecay);
    }

    // 自动挡不写 left/right KickProgress / Strength（让渲染侧完全用速度驱动腿部相位时钟）
    md.hasInput = isThrust;
}