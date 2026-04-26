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
    bodyYaw: number,
    colors: DiverColors,
) {
    const cfg = CONFIG.diver;

    // ===== 鞭状踢水相位：从髋→膝→踝依次滞后，形成自由泳踢腿的 S 形鞭打 =====
    // 一个踢水周期的相位取值为 0~1，sin(phase·π) 得到 0→1→0 的发力波形
    // 输入侧 kickProgress 是"主动踢水"的相位推进，swimCycle 是漂浮/滑行时的低频自摆
    const activeStrength = kickStrength; // 主动踢水强度
    const idlePhaseWave = swimCycle;     // 漂浮时的低频摆动（-1~1）

    // 相位滞后：让髋-膝-踝在时间上错开，形成鞭状传导
    const hipPhase = kickProgress;
    const kneePhase = clamp(kickProgress - cfg.kickPhaseLagKnee, 0, 1);
    const anklePhase = clamp(kickProgress - cfg.kickPhaseLagAnkle, 0, 1);

    const hipWave = Math.sin(hipPhase * Math.PI) * activeStrength;
    const kneeWave = Math.sin(kneePhase * Math.PI) * activeStrength;
    const ankleWave = Math.sin(anklePhase * Math.PI) * activeStrength;

    // 转向修正（拐弯时整条腿外摆一点）
    const turnEase = easeStroke(turnProgress) * turnStrength;
    const turnOffset = turnEase * cfg.turnLegOffset;

    // 身体传导扭动（让腿在发力峰值时随躯干左右传导一点）
    const bodyWave = (Math.sin(hipPhase * Math.PI) * 2 - 1) * activeStrength * cfg.kickBodyWave * 0.25;

    // ===== 关键点坐标（局部坐标系：+x 为角色朝向，+y 为身体右侧） =====
    // 注意当前角色朝向 +x，腿往 -x 方向长出；因此 y 方向的侧向鞭摆由 side（-1/+1）决定左右
    const baseSpread = cfg.kickBaseSpread;

    // 髋点：小幅度鞭摆 + 漂浮自摆
    const hipSwayY = side * (hipWave * cfg.kickAmpHip + idlePhaseWave * cfg.legKickAmplitude * 6)
                   + bodyYaw * 0.35 + turnOffset * 0.25;
    const hipPX = hipX;
    const hipPY = hipY + hipSwayY;

    // 膝点：沿 -x 延伸 thighLength，并做相位滞后的侧向鞭摆
    // 少量前后位移（大腿根驱动）保留一点"推水"感，但不主导
    const kneeForward = -cfg.thighLength + hipWave * 0.6;
    const kneeLateral = side * (kneeWave * cfg.kickAmpKnee + idlePhaseWave * cfg.legKickAmplitude * 10)
                      + turnOffset * 0.75 + bodyWave * 0.4
                      + side * baseSpread; // 自然张开
    const kneePX = hipPX + kneeForward;
    const kneePY = hipPY + kneeLateral;

    // 踝点：从膝再延伸 calfLength，更强的鞭摆滞后（小腿尾随）
    const ankleForward = -cfg.calfLength + kneeWave * 0.4;
    const ankleLateral = side * (ankleWave * cfg.kickAmpAnkle + idlePhaseWave * cfg.legKickAmplitude * 6)
                       + turnOffset * 0.3;
    const anklePX = kneePX + ankleForward;
    const anklePY = kneePY + ankleLateral;

    // ===== 绘制大腿（锥形填充：髋端粗，膝端略细） =====
    drawTaperedLimb(renderCtx, hipPX, hipPY, kneePX, kneePY,
        cfg.thighWidthHip, cfg.thighWidthKnee, colors.suit, '#1c262c');

    // ===== 绘制小腿（锥形填充：膝端略粗，踝端最细） =====
    drawTaperedLimb(renderCtx, kneePX, kneePY, anklePX, anklePY,
        cfg.calfWidthKnee, cfg.calfWidthAnkle, colors.suit, '#1c262c');

    // ===== 膝盖关节小圆（表现屈伸） =====
    renderCtx.fillStyle = '#1c262c';
    renderCtx.beginPath();
    renderCtx.arc(kneePX, kneePY, cfg.kneeCapRadius, 0, Math.PI * 2);
    renderCtx.fill();

    // ===== 绘制蛙鞋（现代开趾蛙鞋剪影 + 柔性反弹） =====
    // 脚蹼的"根部方向"由小腿朝向决定（踝→膝的反向量是脚后跟方向，脚蹼往反向即 -x 继续延伸）
    const calfDX = anklePX - kneePX;
    const calfDY = anklePY - kneePY;
    const calfLen = Math.hypot(calfDX, calfDY) || 1;
    // 脚背朝向（沿小腿延长线）
    const footDirX = calfDX / calfLen;
    const footDirY = calfDY / calfLen;

    // 蛙鞋尾端的柔性鞭打：用 ankleWave 与 kneeWave 的差分作为"材质滞后于骨骼"的反弹
    const whipSignal = (ankleWave - kneeWave);
    // 加上转向偏转与漂浮自摆，让蛙鞋末端有一个小角度偏摆
    const finTipAngle = side * (cfg.finWhipAmp * whipSignal
                              + idlePhaseWave * cfg.legKickAmplitude * 0.8
                              + turnEase * cfg.finTurnSkew);

    // 蛙鞋额外基础开合（保留老参数做微调）
    const extraSpread = cfg.finSpreadBase
                     + Math.abs(idlePhaseWave) * cfg.finSpreadSwim
                     + activeStrength * cfg.finSpreadStroke * 0.5;

    drawSwimFin(renderCtx, anklePX, anklePY, footDirX, footDirY, finTipAngle, extraSpread, colors, cfg);

    // ===== 脚踝接点（蛙鞋与小腿之间的小圆，掩盖拼接边） =====
    renderCtx.fillStyle = colors.suit;
    renderCtx.beginPath();
    renderCtx.arc(anklePX, anklePY, Math.max(1.8, cfg.calfWidthAnkle * 0.55), 0, Math.PI * 2);
    renderCtx.fill();
}

// 绘制锥形四边形肢段（两端粗细不同的实心条带，带侧边暗色描线）
function drawTaperedLimb(
    renderCtx: CanvasRenderingContext2D,
    ax: number, ay: number,
    bx: number, by: number,
    widthA: number, widthB: number,
    fillColor: string,
    edgeColor: string,
) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    // 法线方向（垂直于肢段）
    const nx = -dy / len;
    const ny = dx / len;

    const halfA = widthA * 0.5;
    const halfB = widthB * 0.5;

    const p1x = ax + nx * halfA, p1y = ay + ny * halfA;
    const p2x = bx + nx * halfB, p2y = by + ny * halfB;
    const p3x = bx - nx * halfB, p3y = by - ny * halfB;
    const p4x = ax - nx * halfA, p4y = ay - ny * halfA;

    // 主体填充
    renderCtx.fillStyle = fillColor;
    renderCtx.beginPath();
    renderCtx.moveTo(p1x, p1y);
    renderCtx.lineTo(p2x, p2y);
    renderCtx.lineTo(p3x, p3y);
    renderCtx.lineTo(p4x, p4y);
    renderCtx.closePath();
    renderCtx.fill();

    // 两端圆头（避免肢段交接处露出锐角）
    renderCtx.beginPath();
    renderCtx.arc(ax, ay, halfA, 0, Math.PI * 2);
    renderCtx.arc(bx, by, halfB, 0, Math.PI * 2);
    renderCtx.fill();

    // 侧边暗色勾边，增强轮廓
    renderCtx.strokeStyle = edgeColor;
    renderCtx.lineWidth = 1;
    renderCtx.beginPath();
    renderCtx.moveTo(p1x, p1y);
    renderCtx.lineTo(p2x, p2y);
    renderCtx.moveTo(p4x, p4y);
    renderCtx.lineTo(p3x, p3y);
    renderCtx.stroke();
}

// 绘制现代开趾蛙鞋：根部鞋套 → 颈部收束 → 叶片外扩 → 尖端圆润
// 参数：ankleX/Y 为踝点（蛙鞋根部中心）；dirX/dirY 为脚背朝向（沿小腿延长线，单位向量）
// tipAngle 为末端柔性偏摆角（弧度，相对脚背方向）
function drawSwimFin(
    renderCtx: CanvasRenderingContext2D,
    ankleX: number, ankleY: number,
    dirX: number, dirY: number,
    tipAngle: number,
    extraSpread: number,
    colors: DiverColors,
    cfg: typeof CONFIG.diver,
) {
    const totalLen = cfg.finShapeLength;
    const rootLen = totalLen * cfg.finShapeRootRatio;
    const bellyLen = totalLen * cfg.finShapeBellyRatio;

    // 宽度（叠加 extraSpread 作为小幅调整，避免完全相同的蛙鞋剪影）
    const rootHalf = (cfg.finShapeRootWidth + extraSpread * 0.25) * 0.5;
    const neckHalf = cfg.finShapeNeckWidth * 0.5;
    const bellyHalf = (cfg.finShapeBellyWidth + extraSpread * 0.35) * 0.5;
    const tipHalf = cfg.finShapeTipWidth * 0.5;

    // 根部方向（沿 dir，即小腿延长线，蛙鞋往脚趾方向延伸）
    const fx = dirX, fy = dirY;
    // 法线（蛙鞋宽度方向）
    const nx = -dirY, ny = dirX;

    // 柔性偏摆：让"颈部之后"的段沿 tipAngle 做一个小角度偏转
    // 用 cos/sin 构造偏转向量（以脚背方向为 0 角）
    const cosA = Math.cos(tipAngle);
    const sinA = Math.sin(tipAngle);
    const bentFx = fx * cosA + nx * sinA;
    const bentFy = fy * cosA + ny * sinA;
    const bentNx = -bentFy;
    const bentNy = bentFx;

    // 关键中轴点
    // 根：鞋套后缘（踝点稍微往脚跟方向一点，避免被小腿圆盖住）
    const rootCX = ankleX - fx * 1.0;
    const rootCY = ankleY - fy * 1.0;
    // 颈：鞋套前缘/叶片起点
    const neckCX = ankleX + fx * rootLen;
    const neckCY = ankleY + fy * rootLen;
    // 腹：叶片最宽处（已进入弯折段）
    const bellyCX = ankleX + fx * rootLen + bentFx * (bellyLen - rootLen);
    const bellyCY = ankleY + fy * rootLen + bentFy * (bellyLen - rootLen);
    // 尖：叶片末端
    const tipCX = ankleX + fx * rootLen + bentFx * (totalLen - rootLen);
    const tipCY = ankleY + fy * rootLen + bentFy * (totalLen - rootLen);

    // 剪影左右边线（四段点：root / neck / belly / tip，每点一对 ±half）
    const rootLX = rootCX + nx * rootHalf, rootLY = rootCY + ny * rootHalf;
    const rootRX = rootCX - nx * rootHalf, rootRY = rootCY - ny * rootHalf;
    const neckLX = neckCX + nx * neckHalf, neckLY = neckCY + ny * neckHalf;
    const neckRX = neckCX - nx * neckHalf, neckRY = neckCY - ny * neckHalf;
    const bellyLX = bellyCX + bentNx * bellyHalf, bellyLY = bellyCY + bentNy * bellyHalf;
    const bellyRX = bellyCX - bentNx * bellyHalf, bellyRY = bellyCY - bentNy * bellyHalf;
    const tipLX = tipCX + bentNx * tipHalf, tipLY = tipCY + bentNy * tipHalf;
    const tipRX = tipCX - bentNx * tipHalf, tipRY = tipCY - bentNy * tipHalf;

    // ===== 先画叶片（fin 颜色） =====
    renderCtx.fillStyle = colors.fin;
    renderCtx.beginPath();
    // 左边：root → neck → belly → tip（用曲线圆滑过渡）
    renderCtx.moveTo(rootLX, rootLY);
    renderCtx.lineTo(neckLX, neckLY);
    renderCtx.quadraticCurveTo(
        (neckLX + bellyLX) * 0.5 + bentNx * 1.2,
        (neckLY + bellyLY) * 0.5 + bentNy * 1.2,
        bellyLX, bellyLY
    );
    renderCtx.quadraticCurveTo(
        (bellyLX + tipLX) * 0.5 + bentNx * 0.6,
        (bellyLY + tipLY) * 0.5 + bentNy * 0.6,
        tipLX, tipLY
    );
    // 尖端圆弧
    renderCtx.quadraticCurveTo(
        tipCX + bentFx * tipHalf * 0.9, tipCY + bentFy * tipHalf * 0.9,
        tipRX, tipRY
    );
    // 右边：tip → belly → neck → root
    renderCtx.quadraticCurveTo(
        (bellyRX + tipRX) * 0.5 - bentNx * 0.6,
        (bellyRY + tipRY) * 0.5 - bentNy * 0.6,
        bellyRX, bellyRY
    );
    renderCtx.quadraticCurveTo(
        (neckRX + bellyRX) * 0.5 - bentNx * 1.2,
        (neckRY + bellyRY) * 0.5 - bentNy * 1.2,
        neckRX, neckRY
    );
    renderCtx.lineTo(rootRX, rootRY);
    // 后缘回根
    renderCtx.quadraticCurveTo(
        rootCX - fx * rootHalf * 0.8, rootCY - fy * rootHalf * 0.8,
        rootLX, rootLY
    );
    renderCtx.closePath();
    renderCtx.fill();

    // ===== 中轴筋条（深色中线，增加蛙鞋识别度） =====
    renderCtx.strokeStyle = 'rgba(0,0,0,0.35)';
    renderCtx.lineWidth = 1.3;
    renderCtx.beginPath();
    renderCtx.moveTo(neckCX, neckCY);
    renderCtx.quadraticCurveTo(bellyCX, bellyCY, tipCX - bentFx * 1.5, tipCY - bentFy * 1.5);
    renderCtx.stroke();

    // ===== 鞋套（根部橡胶包裹，颜色比叶片更深，表现脚背被蛙鞋包住） =====
    const bootColor = colors.suit;
    renderCtx.fillStyle = bootColor;
    renderCtx.beginPath();
    renderCtx.moveTo(rootLX, rootLY);
    renderCtx.lineTo(neckLX, neckLY);
    renderCtx.quadraticCurveTo(neckCX, neckCY, neckRX, neckRY);
    renderCtx.lineTo(rootRX, rootRY);
    renderCtx.quadraticCurveTo(
        rootCX - fx * rootHalf * 0.8, rootCY - fy * rootHalf * 0.8,
        rootLX, rootLY
    );
    renderCtx.closePath();
    renderCtx.fill();

    // 鞋套与叶片的过渡高光
    renderCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    renderCtx.lineWidth = 1;
    renderCtx.beginPath();
    renderCtx.moveTo(neckLX, neckLY);
    renderCtx.quadraticCurveTo(neckCX, neckCY, neckRX, neckRY);
    renderCtx.stroke();
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
    const leftKickWave = easeStroke(leftKickProgress) * leftKickStrength;
    const rightKickWave = easeStroke(rightKickProgress) * rightKickStrength;
    const kickWave = leftKickWave - rightKickWave;
    const bodyRoll = turnAmount * 0.12 + turnVisual * 0.08 + kickWave * 0.035 + Math.sin(time * (cfg.idleDriftSpeed * 0.95)) * 0.02 * idleBlend;
    const bodyYaw = turnAmount * 1.2 + turnVisual * 0.65 + kickWave * 0.28;
    const torsoCompress = 1 - forwardVisual * 0.035;
    const swimCycle = Math.sin(time * cfg.legKickFrequency);

    const leftArmKick = leftKickWave;
    const rightArmKick = rightKickWave;
    const leftArmTurn = easeStroke(leftTurnProgress) * leftTurnStrength;
    const rightArmTurn = easeStroke(rightTurnProgress) * rightTurnStrength;
    const armClose = swimBlend * cfg.armCloseBySpeed;

    const leftArmUpper = Math.PI + 0.68 - armClose + Math.sin(time * cfg.armIdleFrequency) * cfg.armIdleAmplitude * idleBlend + leftArmKick * cfg.armKickSwing - leftArmTurn * cfg.armTurnSwing + turnVisual * 0.08;
    const rightArmUpper = Math.PI - 0.68 + armClose - Math.sin(time * cfg.armIdleFrequency) * cfg.armIdleAmplitude * idleBlend - rightArmKick * cfg.armKickSwing + rightArmTurn * cfg.armTurnSwing + turnVisual * 0.08;
    const leftArmLower = leftArmUpper + 0.22 - leftArmKick * 0.08 + leftArmTurn * 0.12 - armClose * 0.18;
    const rightArmLower = rightArmUpper - 0.22 + rightArmKick * 0.08 - rightArmTurn * 0.12 + armClose * 0.18;

    renderCtx.save();
    renderCtx.translate(x + driftX, y + driftY);
    renderCtx.rotate(angle + bodyRoll);

    drawLegAndFin(renderCtx, -8.2, -4.2, -1, leftKickProgress, leftKickStrength, leftTurnProgress, leftTurnStrength, swimCycle * idleBlend, bodyYaw, c);
    drawLegAndFin(renderCtx, -8.2, 4.2, 1, rightKickProgress, rightKickStrength, rightTurnProgress, rightTurnStrength, -swimCycle * idleBlend, bodyYaw, c);

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
