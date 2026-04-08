import { CONFIG } from '../core/config';

type DiverColors = {
    suit: string;
    body: string;
    tank: string;
    mask: string;
    fin: string;
    accent: string;
    skin: string;
};

type DiverMotion = {
    animTime?: number;
    hasTank?: boolean;
    vx?: number;
    vy?: number;
    leftKickProgress?: number;
    rightKickProgress?: number;
    leftKickStrength?: number;
    rightKickStrength?: number;
    leftTurnProgress?: number;
    rightTurnProgress?: number;
    leftTurnStrength?: number;
    rightTurnStrength?: number;
    forwardVisual?: number;
    turnVisual?: number;
};

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

function easeStroke(progress: number) {
    const p = clamp(progress, 0, 1);
    return Math.sin(p * Math.PI);
}

function drawRoundRectPath(renderCtx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    renderCtx.beginPath();
    renderCtx.moveTo(x + radius, y);
    renderCtx.lineTo(x + w - radius, y);
    renderCtx.arcTo(x + w, y, x + w, y + radius, radius);
    renderCtx.lineTo(x + w, y + h - radius);
    renderCtx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    renderCtx.lineTo(x + radius, y + h);
    renderCtx.arcTo(x, y + h, x, y + h - radius, radius);
    renderCtx.lineTo(x, y + radius);
    renderCtx.arcTo(x, y, x + radius, y, radius);
    renderCtx.closePath();
}

function drawCapsule(renderCtx: CanvasRenderingContext2D, cx: number, cy: number, length: number, radius: number) {
    const half = length / 2;
    const inner = Math.max(0, half - radius);
    renderCtx.beginPath();
    renderCtx.arc(cx + inner, cy, radius, -Math.PI / 2, Math.PI / 2);
    renderCtx.arc(cx - inner, cy, radius, Math.PI / 2, -Math.PI / 2);
    renderCtx.closePath();
}

function drawArm(
    renderCtx: CanvasRenderingContext2D,
    shoulderX: number,
    shoulderY: number,
    upperAngle: number,
    lowerAngle: number,
    colors: DiverColors,
) {
    const upperLen = 8.2;
    const lowerLen = 8.4;
    const elbowX = shoulderX + Math.cos(upperAngle) * upperLen;
    const elbowY = shoulderY + Math.sin(upperAngle) * upperLen;
    const handX = elbowX + Math.cos(lowerAngle) * lowerLen;
    const handY = elbowY + Math.sin(lowerAngle) * lowerLen;

    renderCtx.strokeStyle = colors.suit;
    renderCtx.lineCap = 'round';
    renderCtx.lineJoin = 'round';
    renderCtx.lineWidth = 5.2;
    renderCtx.beginPath();
    renderCtx.moveTo(shoulderX, shoulderY);
    renderCtx.lineTo(elbowX, elbowY);
    renderCtx.lineTo(handX, handY);
    renderCtx.stroke();
}

function drawLegAndFin(
    renderCtx: CanvasRenderingContext2D,
    hipX: number,
    hipY: number,
    side: number,
    kickProgress: number,
    kickStrength: number,
    turnProgress: number,
    turnStrength: number,
    swimCycle: number,
    colors: DiverColors,
) {
    const cfg = CONFIG.diver;
    const kickEase = easeStroke(kickProgress) * kickStrength;
    const turnEase = easeStroke(turnProgress) * turnStrength;
    const idleLift = swimCycle * cfg.legKickAmplitude;
    const turnOffset = turnEase * cfg.turnLegOffset;

    const kneeX = hipX - cfg.kickRecoverLength + kickEase * (cfg.kickDriveLength + cfg.kickRecoverLength) - turnOffset;
    const kneeY = hipY + side * (idleLift * 2.8 + turnOffset * 0.65);
    const ankleX = kneeX - 8.8 + kickEase * 7.2;
    const ankleY = kneeY + side * (idleLift * 2.0 + turnOffset * 0.45);

    renderCtx.strokeStyle = colors.suit;
    renderCtx.lineCap = 'round';
    renderCtx.lineJoin = 'round';
    renderCtx.lineWidth = 5.2;
    renderCtx.beginPath();
    renderCtx.moveTo(hipX, hipY);
    renderCtx.lineTo(kneeX, kneeY);
    renderCtx.lineTo(ankleX, ankleY);
    renderCtx.stroke();

    const finLen = 13.5 + kickEase * 1.2;
    const finSpread = cfg.finSpreadBase + kickEase * cfg.finSpreadStroke + Math.abs(swimCycle) * cfg.finSpreadSwim;
    const finAngle = side * (0.12 + idleLift * 0.18 + turnEase * cfg.finTurnSkew);

    const tipX = ankleX - finLen;
    const tipY = ankleY + side * finAngle * finLen * 0.35;
    const baseUpX = ankleX + 1.0;
    const baseUpY = ankleY - finSpread * 0.38;
    const baseDownX = ankleX + 1.0;
    const baseDownY = ankleY + finSpread * 0.38;
    const splitX = ankleX - finLen * 0.72;
    const splitY = ankleY + side * finAngle * finLen * 0.22;

    renderCtx.fillStyle = colors.fin;
    renderCtx.beginPath();
    renderCtx.moveTo(baseUpX, baseUpY);
    renderCtx.lineTo(tipX, tipY);
    renderCtx.lineTo(splitX, splitY + 1.6);
    renderCtx.lineTo(baseDownX, baseDownY);
    renderCtx.lineTo(splitX, splitY - 1.6);
    renderCtx.closePath();
    renderCtx.fill();
}

export function drawDiver(
    renderCtx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    colors: Partial<DiverColors> | null = null,
    motion: DiverMotion = {},
) {
    const defaultColors: DiverColors = {
        suit: '#2d3b43',
        body: '#576b74',
        tank: '#c7d8df',
        mask: '#8ea1ab',
        fin: '#24343b',
        accent: '#5f7078',
        skin: '#ceb29c',
    };
    const c: DiverColors = {
        ...defaultColors,
        ...(colors || {}),
        fin: colors?.fin || colors?.suit || defaultColors.fin,
        accent: colors?.accent || defaultColors.accent,
        skin: colors?.skin || defaultColors.skin,
    };

    const cfg = CONFIG.diver;
    const time = motion.animTime ?? Date.now() / 150;
    const hasTank = motion.hasTank !== false;
    const vx = motion.vx ?? 0;
    const vy = motion.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    const idleBlend = clamp(1 - speed / 1.2, 0, 1);
    const swimBlend = clamp(speed / 3.5, 0, 1);

    const leftKickProgress = clamp(motion.leftKickProgress ?? 0, 0, 1);
    const rightKickProgress = clamp(motion.rightKickProgress ?? 0, 0, 1);
    const leftKickStrength = clamp(motion.leftKickStrength ?? 0, 0, 1);
    const rightKickStrength = clamp(motion.rightKickStrength ?? 0, 0, 1);
    const leftTurnProgress = clamp(motion.leftTurnProgress ?? 0, 0, 1);
    const rightTurnProgress = clamp(motion.rightTurnProgress ?? 0, 0, 1);
    const leftTurnStrength = clamp(motion.leftTurnStrength ?? 0, 0, 1);
    const rightTurnStrength = clamp(motion.rightTurnStrength ?? 0, 0, 1);
    const forwardVisual = clamp(motion.forwardVisual ?? 0, 0, 1);
    const turnVisual = clamp(motion.turnVisual ?? 0, -1, 1);

    let turnAmount = 0;
    if (speed > 0.18) {
        const velAngle = Math.atan2(vy, vx);
        turnAmount = clamp(normalizeAngle(velAngle - angle) / (Math.PI * 0.5), -1, 1);
    }

    const driftX = Math.sin(time * cfg.idleDriftSpeed) * 1.2 * idleBlend + Math.sin(time * (cfg.idleDriftSpeed * 1.8)) * 0.12;
    const driftY = Math.cos(time * (cfg.idleDriftSpeed * 0.82)) * 0.8 * idleBlend;
    const bodyRoll = turnAmount * 0.12 + turnVisual * 0.08 + Math.sin(time * (cfg.idleDriftSpeed * 0.95)) * 0.02 * idleBlend;
    const bodyYaw = turnAmount * 1.2 + turnVisual * 0.65;
    const torsoCompress = 1 - forwardVisual * 0.035;
    const swimCycle = Math.sin(time * cfg.legKickFrequency);

    const leftArmKick = easeStroke(leftKickProgress) * leftKickStrength;
    const rightArmKick = easeStroke(rightKickProgress) * rightKickStrength;
    const leftArmTurn = easeStroke(leftTurnProgress) * leftTurnStrength;
    const rightArmTurn = easeStroke(rightTurnProgress) * rightTurnStrength;

    const leftArmUpper = Math.PI + 0.68 + Math.sin(time * cfg.armIdleFrequency) * cfg.armIdleAmplitude * idleBlend + leftArmKick * cfg.armKickSwing - leftArmTurn * cfg.armTurnSwing + turnVisual * 0.08;
    const rightArmUpper = Math.PI - 0.68 - Math.sin(time * cfg.armIdleFrequency) * cfg.armIdleAmplitude * idleBlend - rightArmKick * cfg.armKickSwing + rightArmTurn * cfg.armTurnSwing + turnVisual * 0.08;
    const leftArmLower = leftArmUpper + 0.22 - leftArmKick * 0.08 + leftArmTurn * 0.12;
    const rightArmLower = rightArmUpper - 0.22 + rightArmKick * 0.08 - rightArmTurn * 0.12;

    renderCtx.save();
    renderCtx.translate(x + driftX, y + driftY);
    renderCtx.rotate(angle + bodyRoll);

    drawLegAndFin(renderCtx, -8.2, -4.2, -1, leftKickProgress, leftKickStrength, leftTurnProgress, leftTurnStrength, swimCycle * idleBlend, c);
    drawLegAndFin(renderCtx, -8.2, 4.2, 1, rightKickProgress, rightKickStrength, rightTurnProgress, rightTurnStrength, -swimCycle * idleBlend, c);

    renderCtx.save();
    renderCtx.scale(torsoCompress, 1);

    const bodyGradient = renderCtx.createLinearGradient(10, 0, -16, 0);
    bodyGradient.addColorStop(0, c.body);
    bodyGradient.addColorStop(0.65, c.suit);
    bodyGradient.addColorStop(1, '#1c262c');
    renderCtx.fillStyle = bodyGradient;
    renderCtx.beginPath();
    renderCtx.moveTo(13.5, 0);
    renderCtx.bezierCurveTo(10, -8.8, -4, -10.6, -14.2, -4.5);
    renderCtx.quadraticCurveTo(-17.2, 0, -14.2, 4.5);
    renderCtx.bezierCurveTo(-4, 10.6, 10, 8.8, 13.5, 0);
    renderCtx.closePath();
    renderCtx.fill();

    renderCtx.fillStyle = 'rgba(255,255,255,0.08)';
    renderCtx.beginPath();
    renderCtx.ellipse(2.5, -2.8 + bodyYaw * 0.15, 9.5, 2.6, -0.18, 0, Math.PI * 2);
    renderCtx.fill();

    if (hasTank) {
        renderCtx.save();
        renderCtx.translate(-0.8, bodyYaw * 0.5);
        const tankGradient = renderCtx.createLinearGradient(8, 0, -10, 0);
        tankGradient.addColorStop(0, '#eef5f8');
        tankGradient.addColorStop(0.28, c.tank);
        tankGradient.addColorStop(0.65, '#9eb3bd');
        tankGradient.addColorStop(1, '#748894');
        renderCtx.fillStyle = tankGradient;
        drawCapsule(renderCtx, -1.4, 0, 17.5, 4.2);
        renderCtx.fill();

        renderCtx.fillStyle = '#485962';
        drawRoundRectPath(renderCtx, 4.5, -2.3, 3.8, 4.6, 1.2);
        renderCtx.fill();

        renderCtx.strokeStyle = 'rgba(32,40,46,0.65)';
        renderCtx.lineWidth = 1.3;
        renderCtx.beginPath();
        renderCtx.moveTo(-5.2, -5.2);
        renderCtx.lineTo(-5.2, 5.2);
        renderCtx.moveTo(1.8, -5.2);
        renderCtx.lineTo(1.8, 5.2);
        renderCtx.stroke();
        renderCtx.restore();
    }

    renderCtx.restore();

    drawArm(renderCtx, 4.3, -6.2, leftArmUpper, leftArmLower, c);
    drawArm(renderCtx, 4.3, 6.2, rightArmUpper, rightArmLower, c);

    renderCtx.fillStyle = c.suit;
    renderCtx.beginPath();
    renderCtx.arc(15.8, 0, 6.5, 0, Math.PI * 2);
    renderCtx.fill();

    renderCtx.fillStyle = 'rgba(255,255,255,0.08)';
    renderCtx.beginPath();
    renderCtx.ellipse(14.2, -2.2, 3.6, 1.7, -0.25, 0, Math.PI * 2);
    renderCtx.fill();

    renderCtx.fillStyle = c.mask;
    renderCtx.strokeStyle = '#162027';
    renderCtx.lineWidth = 1.1;
    renderCtx.beginPath();
    renderCtx.ellipse(18.3, 0, 4.1, 3.4, 0, 0, Math.PI * 2);
    renderCtx.fill();
    renderCtx.stroke();

    renderCtx.restore();
}

export function drawLungs(renderCtx: CanvasRenderingContext2D, x: number, y: number, o2: number) {
    renderCtx.save();
    renderCtx.translate(x, y);

    let breath = Math.sin(Date.now() / 800) * 0.05;
    renderCtx.scale(1 + breath, 1 + breath);

    const w = 40, h = 60, gap = 6;

    renderCtx.fillStyle = '#888';
    renderCtx.beginPath();
    renderCtx.moveTo(-3, -h / 2 - 10); renderCtx.lineTo(3, -h / 2 - 10);
    renderCtx.lineTo(3, -h / 2 - 20); renderCtx.lineTo(-3, -h / 2 - 20);
    renderCtx.fill();

    drawLungLobe(renderCtx, -w / 2 - gap / 2, 0, w, h, o2, true);
    drawLungLobe(renderCtx, w / 2 + gap / 2, 0, w, h, o2, false);

    renderCtx.fillStyle = '#fff';
    renderCtx.font = 'bold 16px Arial';
    renderCtx.textAlign = 'center';
    renderCtx.fillText(Math.floor(o2) + '%', 0, 5);

    if (o2 < 30) {
        let alpha = 0.5 + Math.sin(Date.now() / 100) * 0.5;
        renderCtx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
        renderCtx.font = 'bold 14px Arial';
        renderCtx.fillText('WARNING', 0, h / 2 + 20);
    }

    renderCtx.restore();
}

function drawLungLobe(renderCtx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o2: number, isLeft: boolean) {
    renderCtx.save();
    renderCtx.translate(x, y);

    renderCtx.beginPath();
    if (isLeft) {
        renderCtx.moveTo(w / 2, -h / 2);
        renderCtx.bezierCurveTo(w / 2, -h / 2, -w / 2, -h / 2 + 15, -w / 2, 0);
        renderCtx.bezierCurveTo(-w / 2, h / 2 - 5, 0, h / 2, w / 2, h / 2);
        renderCtx.lineTo(w / 2, -h / 2);
    } else {
        renderCtx.moveTo(-w / 2, -h / 2);
        renderCtx.bezierCurveTo(-w / 2, -h / 2, w / 2, -h / 2 + 15, w / 2, 0);
        renderCtx.bezierCurveTo(w / 2, h / 2 - 5, 0, h / 2, -w / 2, h / 2);
        renderCtx.lineTo(-w / 2, -h / 2);
    }
    renderCtx.closePath();

    renderCtx.fillStyle = 'rgba(20, 0, 0, 0.9)';
    renderCtx.fill();
    renderCtx.strokeStyle = '#311';
    renderCtx.lineWidth = 2;
    renderCtx.stroke();
    renderCtx.clip();

    let fillHeight = h * (o2 / 100);
    let fillY = h / 2 - fillHeight;

    let lungColor = 'rgba(237, 106, 106, 1)';
    if (o2 < 30) {
        let flash = Math.floor(Date.now() / 200) % 2 === 0;
        lungColor = flash ? 'rgba(237, 106, 106, 1)' : 'rgba(98, 54, 54, 1)';
    }

    renderCtx.fillStyle = lungColor;
    renderCtx.fillRect(-w, fillY, w * 2, fillHeight);

    renderCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    renderCtx.lineWidth = 1;
    renderCtx.beginPath();
    if (isLeft) {
        renderCtx.moveTo(w / 4, -h / 4); renderCtx.quadraticCurveTo(0, 0, -w / 4, h / 4);
        renderCtx.moveTo(w / 4, -h / 4); renderCtx.quadraticCurveTo(w / 4, 0, 0, h / 3);
    } else {
        renderCtx.moveTo(-w / 4, -h / 4); renderCtx.quadraticCurveTo(0, 0, w / 4, h / 4);
        renderCtx.moveTo(-w / 4, -h / 4); renderCtx.quadraticCurveTo(-w / 4, 0, 0, h / 3);
    }
    renderCtx.stroke();

    renderCtx.restore();
}

export function drawDiverSilhouette(renderCtx: CanvasRenderingContext2D, x: number, y: number, color: string, isDead: boolean = false) {
    renderCtx.save();
    renderCtx.translate(x, y);
    if (isDead) renderCtx.rotate(Math.PI / 2);

    renderCtx.fillStyle = color;
    renderCtx.beginPath();
    renderCtx.arc(0, -24, 8, 0, Math.PI * 2);
    renderCtx.fill();

    drawRoundRectPath(renderCtx, -10, -20, 20, 34, 8);
    renderCtx.fill();

    drawRoundRectPath(renderCtx, -6, -10, 12, 18, 5);
    renderCtx.fillStyle = 'rgba(255,255,255,0.18)';
    renderCtx.fill();

    renderCtx.fillStyle = color;
    drawRoundRectPath(renderCtx, -4, -2, 8, 20, 3);
    renderCtx.fill();

    renderCtx.beginPath();
    renderCtx.moveTo(-4, 18);
    renderCtx.lineTo(-14, 32);
    renderCtx.lineTo(-7, 30);
    renderCtx.lineTo(-2, 21);
    renderCtx.closePath();
    renderCtx.fill();

    renderCtx.beginPath();
    renderCtx.moveTo(4, 18);
    renderCtx.lineTo(14, 32);
    renderCtx.lineTo(7, 30);
    renderCtx.lineTo(2, 21);
    renderCtx.closePath();
    renderCtx.fill();

    renderCtx.restore();
}
