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
    // 鞭腿加速 boost（0~1）：输入加速瘦间提升鞭腿频率与幅度
    kickDrive?: number;
    // 角色身份（每个独立的腿部相位时钟按此 id 缓存；player/npc 各一个）
    id?: string;
};

// 模块级腿部相位时钟：每个角色独立追踪，由 drawDiver 每帧按速度+boost 推进
// phase 取值 0~1，freq 为单帧推进比例
const legClocks: Map<string, { phase: number }> = new Map();

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
    legPhase: number,
    ampNorm: number,
    turnProgress: number,
    turnStrength: number,
    bodyYaw: number,
    colors: DiverColors,
) {
    const cfg = CONFIG.diver;

    // ===== 相位波形：俯视 2D 模拟上下打水 =====
    // 一条腿的完整鞭打周期为 legPhase ∈ [0,1)：
    //   0.0  腿完全收起（膝微弯、脚蹼抬离水平面）
    //   0.5  腿伸直到底（发力瞬间，腿最长、脚蹼水平展开最长、往后甩出最远）
    //   1.0  回到收起
    // 主视觉三层叠加：
    //   1) 腿前后伸缩（kickStretchAmp） ——让腿的总长度像呼吸一样变化
    //   2) 脚蹼长度脉动（finLengthPulse） ——脚蹼在踢到底时最长
    //   3) 脚蹼沿身体轴挥拍（finSweepAmp） ——踢到底时脚蹼往后甩出一段，再回收
    // ampNorm（0~1）由速度 + kickDrive 综合驱动，ampNorm=0 时腿停住不动

    // 髋→膝→踝相位滞后（鞭状传导）
    // 注意：滞后只用于"前后伸缩"和"脚蹼脉动"的时间差，不产生任何左右分量
    const hipPh = legPhase;
    const kneePh = ((legPhase - cfg.kickPhaseLagKnee) % 1 + 1) % 1;
    const anklePh = ((legPhase - cfg.kickPhaseLagAnkle) % 1 + 1) % 1;

    // 发力波形：sin(2π·phase) 得到 -1→+1→-1 的鞭打（+1 = 下踢到底，-1 = 上抬到顶）
    // ampNorm 作为总强度开关：0=完全不动
    // hipWave 仅保留给将来使用，当前不参与任何侧向计算
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _hipWave = Math.sin(hipPh * Math.PI * 2) * ampNorm;
    const kneeWave = Math.sin(kneePh * Math.PI * 2) * ampNorm;
    const ankleWave = Math.sin(anklePh * Math.PI * 2) * ampNorm;

    // 转向修正（侧向唯一来源，只有在玩家转向时才产生侧向位移）
    const turnEase = easeStroke(turnProgress) * turnStrength;
    const turnOffset = turnEase * cfg.turnLegOffset;

    // ===== 关键点坐标（局部坐标系：+x 为角色朝向，-x 为腿延伸方向） =====
    // 侧向位移只来自 turnOffset 和 side * kickBaseSpread（基础张开，静态值）
    // 所有与 wave 相关的 side 侧向项全部清零，避免脚蹼在左右方向画圈

    // 髋点：基本不动，只有轻微 bodyYaw 和转向偏移
    const hipPX = hipX;
    const hipPY = hipY + bodyYaw * 0.3 + turnOffset * 0.2;

    // 大腿：沿 -x 延伸，长度随 kneeWave 伸缩（纯前后运动）
    const thighStretch = kneeWave * cfg.kickStretchAmp * 0.6;
    const kneeForward = -(cfg.thighLength + thighStretch);
    // 侧向：只有转向修正 + 静态基础张开（side * kickBaseSpread 当前为 0）
    const kneeLateral = side * cfg.kickBaseSpread + turnOffset * 0.7;
    const kneePX = hipPX + kneeForward;
    const kneePY = hipPY + kneeLateral;

    // 小腿：沿 -x 延伸，叠加更强的鞭状伸缩（纯前后运动）
    const calfStretch = ankleWave * cfg.kickStretchAmp * 0.8;
    const ankleForward = -(cfg.calfLength + calfStretch);
    // 侧向：只保留转向修正（衰减到 0.25，膝盖侧向的延续）
    const ankleLateral = turnOffset * 0.25;
    const anklePX = kneePX + ankleForward;
    const anklePY = kneePY + ankleLateral;

    // ===== 绘制大腿 =====
    drawTaperedLimb(renderCtx, hipPX, hipPY, kneePX, kneePY,
        cfg.thighWidthHip, cfg.thighWidthKnee, colors.suit, '#1c262c');

    // ===== 绘制小腿 =====
    drawTaperedLimb(renderCtx, kneePX, kneePY, anklePX, anklePY,
        cfg.calfWidthKnee, cfg.calfWidthAnkle, colors.suit, '#1c262c');

    // ===== 膝盖关节小圆 =====
    renderCtx.fillStyle = '#1c262c';
    renderCtx.beginPath();
    renderCtx.arc(kneePX, kneePY, cfg.kneeCapRadius, 0, Math.PI * 2);
    renderCtx.fill();

    // ===== 脚蹼挥拍：沿身体朝向轴的切向位移（主视觉三） =====
    // 踢到底（ankleWave=+1）时脚蹼整体往后甩一段；上抬时脚蹼往前收回
    // 切向 = -x 方向（身体后方），所以 ankleX 向 -x 再推一段
    const finSweepX = -ankleWave * cfg.finSweepAmp;  // 向身体后方的额外位移
    // 挥拍的起点也就变成了新的 ankle 位置
    const finAnchorX = anklePX + finSweepX;
    const finAnchorY = anklePY;

    // ===== 绘制蛙鞋 =====
    // 脚蹼朝向仍然沿小腿延长线
    const calfDX = anklePX - kneePX;
    const calfDY = anklePY - kneePY;
    const calfLen = Math.hypot(calfDX, calfDY) || 1;
    const footDirX = calfDX / calfLen;
    const footDirY = calfDY / calfLen;

    // 蛙鞋末端柔性偏摆：只保留"转向修正"（玩家主动转弯时脚蹼偏转一点方向）
    // **关键**：完全去掉 side * whipSignal 分量——左右腿本来用 side 相反符号驱动会形成"画圈"错觉
    // 俯视 2D 下鞭腿是上下运动投影，脚蹼末端不应该有任何左右偏摆
    const finTipAngle = turnEase * cfg.finTurnSkew * side;

    // 蛙鞋长度脉动（主视觉之二）：踢到底时最长，抬起时缩短
    const finLengthFactor = 1 + ankleWave * cfg.finLengthPulse;
    const extraSpread = cfg.finSpreadBase + ampNorm * cfg.finSpreadStroke * 0.6;

    drawSwimFin(renderCtx, finAnchorX, finAnchorY, footDirX, footDirY, finTipAngle,
        extraSpread, finLengthFactor, colors, cfg);

    // ===== 脚踝接点（画在原踝位置，连接小腿末端和脚蹼根） =====
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
    finLengthFactor: number,
    colors: DiverColors,
    cfg: typeof CONFIG.diver,
) {
    const totalLen = cfg.finShapeLength * finLengthFactor;
    const rootLen = cfg.finShapeLength * cfg.finShapeRootRatio;  // 鞋套段不随脉动缩放，保持与脚踝贴合
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

    // ===== 腿部相位时钟：完全由速度 + kickDrive boost 自驱（渲染侧自持） =====
    // 速度归一化：玩家手动挡 maxSpeed=11，自动挡/NPC 一般 4~6，这里用 6 做归一化让两种模式都能进入高频段
    const speedRefMax = 6;
    const speedNorm = clamp(speed / speedRefMax, 0, 1);
    const kickDriveVal = clamp(motion.kickDrive ?? 0, 0, 1);
    // 频率：base + speedNorm 主导 + kickDrive 加速瞬间 boost
    // kickDrive boost 降到 0.3 倍，避免手动挡加速瞬间腿摆得过快
    const freq = cfg.legAutoFreqBase
               + speedNorm * cfg.legAutoFreqBoost
               + kickDriveVal * cfg.legAutoFreqBoost * 0.3;
    // 幅度：由速度主导（静止时=0 → 腿不动），kickDrive 给加速瞬间的额外鞭打
    const ampNorm = clamp(speedNorm + kickDriveVal * 0.5, 0, 1);

    // 取/建本角色的相位时钟
    const clockId = motion.id ?? 'anon';
    let clock = legClocks.get(clockId);
    if (!clock) {
        clock = { phase: 0 };
        legClocks.set(clockId, clock);
    }
    // 速度极低时让相位缓慢归到 0（腿收起停住），避免"停下时腿还半弯"
    if (ampNorm < 0.02) {
        // 距离 0 或 1 谁近就往哪收（相位是周期的，0 和 1 视作同一收腿姿态）
        const distTo0 = Math.min(clock.phase, 1 - clock.phase);
        if (distTo0 > 0.005) {
            clock.phase += (clock.phase < 0.5 ? -1 : 1) * 0.02;
            clock.phase = ((clock.phase % 1) + 1) % 1;
        }
    } else {
        clock.phase = (clock.phase + freq) % 1;
    }
    const legPhaseVal = clock.phase;

    drawLegAndFin(renderCtx, -8.2, -4.2, -1, legPhaseVal, ampNorm, leftTurnProgress, leftTurnStrength, bodyYaw, c);
    // 右腿相位 +0.5，实现左右交替鞭打
    drawLegAndFin(renderCtx, -8.2, 4.2, 1, (legPhaseVal + 0.5) % 1, ampNorm, rightTurnProgress, rightTurnStrength, bodyYaw, c);

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
