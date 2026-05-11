import { CONFIG } from '../core/config';
import { drawRelicIconAt } from './RenderRelic';
import type { RelicKind } from '../logic/Relic';

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
    /**
     * 携带的氧气瓶数量（0=无瓶；1=单瓶；2=双瓶 左右腋下各一只）
     * 不传时按 hasTank 兼容老逻辑（hasTank=true → 1, false → 0）。
     */
    tankCount?: number;
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
    // 自动挡巡航姿态：为 true 时双手完全贴身收起向后伸直（流线型下潜），
    // 为 false 则保持原带臂摇摆/划水姿态。适用于在摇杆／自动挡移动时
    // 突出“没有划手动作”的贴身巡航观感。
    autoSwim?: boolean;
    /**
     * 气嘴脱落→捞回塞嘴 动画数据（由 CollisionImpact 启动，Logic/MazeLogic 每帧推进）。
     * active=false 时按原样渲染（气嘴藏在嘴里不显示）；
     * active=true 时画一个脱开的气嘴+软管，右手脱离原动画去抓气嘴再送回嘴边。
     *   阶段（t = timer / duration）：
     *     A 0.00~0.20  气嘴被撞飞：从嘴部向前外侧弹出
     *     B 0.20~0.55  右手伸出去"捞"气嘴
     *     C 0.55~0.90  抓到气嘴后把它拖回嘴部
     *     D 0.90~1.00  到位，手臂归位
     */
    regulatorAnim?: {
        active: boolean;
        timer: number;
        duration: number;
        strength: number;
    };
    /**
     * 双手抱拾取物动画。
     * 阶段：A 双手伸向地面物品；B 物品从起点飞到双手中心；C 抱回胸前；D 手臂归位、物品淡出。
     * itemKind 与 RelicKind / DroppedItem.itemId 同字符串，用于 drawRelicIconAt 绘制。
     * fromX/fromY 是物品在世界中的起点（用于阶段 A→B 的世界→局部插值）。
     */
    carryItemAnim?: {
        active: boolean;
        timer: number;
        duration: number;
        itemKind: string;
        fromX: number;
        fromY: number;
    };
    /**
     * 双臂张开"迎接氧气"动画（与 regulator/carry 互斥；优先级最低）。
     * 阶段：A 张开（手臂渐入）；B 保持张开；C 归位。
     */
    welcomeArmsAnim?: {
        active: boolean;
        timer: number;
        duration: number;
    };
};

// 模块级腿部相位时钟：每个角色独立追踪，由 drawDiver 每帧按速度+boost 推进
// phase 取值 0~1，freq 为单帧推进比例
const legClocks: Map<string, { phase: number }> = new Map();

// 模块级"躯干波动相位时钟"：驱动全身扭动（yaw / roll / compress / 手臂常驻摆动）
// 与腿部时钟分开，因为 idle 时腿停摆但身体仍需微幅呼吸
// bodyPhase ∈ [0,1)，idle 时低速推进、forward 时与腿部时钟同频推进
const bodyClocks: Map<string, { phase: number }> = new Map();

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

// 手臂长度常量（用于反解去抓气嘴时的手腕限位）
const ARM_UPPER_LEN = 8.2;
const ARM_LOWER_LEN = 8.4;
const ARM_MAX_REACH = ARM_UPPER_LEN + ARM_LOWER_LEN;

/**
 * 以"伸向手腕目标点"的方式绘制手臂（局部坐标系：+x 为角色朝向）。
 * 简单策略：upperAngle = lowerAngle = atan2(targetDy, targetDx)，两段共线直接去抓。
 * 若距离 > 最大伸展，按单位向量截断到最大伸展；若距离 < 最小展开（ARM_MAX_REACH * 0.3），
 * 为了避免手臂"缩进身体里"，强制拉到最小展开距离并保持方向。
 * 返回实际手腕位置（给上层画气嘴用）。
 */
function drawArmReach(
    renderCtx: CanvasRenderingContext2D,
    shoulderX: number,
    shoulderY: number,
    targetX: number,
    targetY: number,
    colors: DiverColors,
): { wristX: number; wristY: number; angle: number } {
    const dx = targetX - shoulderX;
    const dy = targetY - shoulderY;
    let dist = Math.hypot(dx, dy);
    if (dist < 0.001) dist = 0.001;
    const ang = Math.atan2(dy, dx);

    // 长度限位：目标太远 → 伸直；目标太近 → 不画成反折，按最小 40% 伸展
    const minReach = ARM_MAX_REACH * 0.4;
    const reach = Math.max(minReach, Math.min(ARM_MAX_REACH, dist));

    // 两段的弯曲点：在上臂末端、下臂起点（肘关节）
    // 为了让手臂不像硬棍子，让肘略微离直线一点（向外侧偏）
    const elbowFrac = ARM_UPPER_LEN / ARM_MAX_REACH;
    const straightElbowX = shoulderX + Math.cos(ang) * reach * elbowFrac;
    const straightElbowY = shoulderY + Math.sin(ang) * reach * elbowFrac;
    // 法线偏移（让肘稍微拱出去）
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    // 距离越短，肘拱得越明显（最多 2.2 像素）
    const bendAmt = (1 - Math.min(1, dist / ARM_MAX_REACH)) * 2.2 + 0.6;
    const elbowX = straightElbowX + nx * bendAmt;
    const elbowY = straightElbowY + ny * bendAmt;

    const wristX = shoulderX + Math.cos(ang) * reach;
    const wristY = shoulderY + Math.sin(ang) * reach;

    renderCtx.strokeStyle = colors.suit;
    renderCtx.lineCap = 'round';
    renderCtx.lineJoin = 'round';
    renderCtx.lineWidth = 5.2;
    renderCtx.beginPath();
    renderCtx.moveTo(shoulderX, shoulderY);
    renderCtx.lineTo(elbowX, elbowY);
    renderCtx.lineTo(wristX, wristY);
    renderCtx.stroke();

    return { wristX, wristY, angle: ang };
}

/**
 * 绘制气嘴（regulator mouthpiece）+ 软管。
 * 局部坐标系：+x 为角色朝向；mouthX/Y 是嘴部位置；regX/Y 是气嘴当前位置；
 * hoseAnchorX/Y 是软管"身体端"锚点（一般取背后氧气瓶肩膀位置，这里用胸前肩点作为近似）。
 */
function drawRegulatorAndHose(
    renderCtx: CanvasRenderingContext2D,
    regX: number,
    regY: number,
    hoseAnchorX: number,
    hoseAnchorY: number,
    regAngle: number,
    colors: DiverColors,
) {
    // --- 软管：从胸前锚点到气嘴的三次贝塞尔，中间控制点给一个垂下的弧度 ---
    const midX = (hoseAnchorX + regX) * 0.5;
    const midY = (hoseAnchorY + regY) * 0.5;
    // 软管弯曲：中点往朝向正方向（+x）和 +y 方向各拉一点，让软管像自然垂着
    const ctrl1X = hoseAnchorX + (midX - hoseAnchorX) * 0.5 + 2;
    const ctrl1Y = hoseAnchorY + (midY - hoseAnchorY) * 0.5 + 3;
    const ctrl2X = regX - Math.cos(regAngle) * 3;
    const ctrl2Y = regY - Math.sin(regAngle) * 3 + 2.5;

    renderCtx.strokeStyle = '#1a2228';
    renderCtx.lineCap = 'round';
    renderCtx.lineWidth = 2.4;
    renderCtx.beginPath();
    renderCtx.moveTo(hoseAnchorX, hoseAnchorY);
    renderCtx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, regX, regY);
    renderCtx.stroke();
    // 软管的橡胶波纹高光
    renderCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    renderCtx.lineWidth = 1.0;
    renderCtx.beginPath();
    renderCtx.moveTo(hoseAnchorX, hoseAnchorY);
    renderCtx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, regX, regY);
    renderCtx.stroke();

    // --- 气嘴本体：朝向 regAngle（咬嘴朝前、出气口朝后） ---
    renderCtx.save();
    renderCtx.translate(regX, regY);
    renderCtx.rotate(regAngle);
    // 机身（灰黑圆角矩形）
    renderCtx.fillStyle = '#2a3238';
    drawRoundRectPath(renderCtx, -3.2, -2.6, 6.4, 5.2, 1.4);
    renderCtx.fill();
    // 前端咬嘴（稍亮的橡胶色突出口）
    renderCtx.fillStyle = colors.accent;
    drawRoundRectPath(renderCtx, 1.5, -1.6, 2.4, 3.2, 1.0);
    renderCtx.fill();
    // 排气膜高光
    renderCtx.fillStyle = 'rgba(255,255,255,0.12)';
    renderCtx.beginPath();
    renderCtx.ellipse(-0.4, -0.2, 1.6, 0.9, 0, 0, Math.PI * 2);
    renderCtx.fill();
    // 侧面排气口（小圆点）
    renderCtx.fillStyle = '#14181c';
    renderCtx.beginPath();
    renderCtx.arc(-1.6, 1.6, 0.6, 0, Math.PI * 2);
    renderCtx.fill();
    renderCtx.restore();
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
    // tankCount 优先：传 0/1/2 直接生效；不传则按 hasTank 推（true→1, false→0）
    const tankCount = motion.tankCount != null
        ? Math.max(0, Math.min(2, motion.tankCount | 0))
        : (motion.hasTank !== false ? 1 : 0);
    const vx = motion.vx ?? 0;
    const vy = motion.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    const idleBlend = clamp(1 - speed / 1.2, 0, 1);
    const swimBlend = clamp(speed / 3.5, 0, 1);

    const autoSwim = motion.autoSwim === true;
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

    // ===== 躯干波动相位时钟（全身动画统一驱动源） =====
    // 三种状态叠加推进：
    //   idle：低频常驻（漂浮呼吸）
    //   forward：随腿部速度同频推进（身体扭动带动踢水）
    //   turn：附加高频小扰动（转向时肌肉紧张）
    const clockId = motion.id ?? 'anon';
    let bodyClock = bodyClocks.get(clockId);
    if (!bodyClock) {
        bodyClock = { phase: 0 };
        bodyClocks.set(clockId, bodyClock);
    }
    const speedRefMaxForBody = 6;
    const speedNormForBody = clamp(speed / speedRefMaxForBody, 0, 1);
    const turnAbsVisual = Math.abs(turnVisual);
    // 身体扭动频率：idle 慢 + forward 随速度加快 + turn 再加一点
    const bodyFreq = cfg.bodyWaveIdleFreq
                   + speedNormForBody * cfg.bodyWaveForwardFreq
                   + turnAbsVisual * cfg.bodyWaveTurnFreq;
    bodyClock.phase = (bodyClock.phase + bodyFreq) % 1;
    // 主波形（-1→+1 正弦），以及相位领先量（供头部做蛇形传导）
    const bodyWave = Math.sin(bodyClock.phase * Math.PI * 2);
    const bodyWaveHead = Math.sin((bodyClock.phase + cfg.bodyWaveHeadLead) * Math.PI * 2);
    // 二次谐波：让 compress / roll 呈现"踢两次身体起伏一次"的自然节奏
    const bodyWave2 = Math.sin(bodyClock.phase * Math.PI * 4);

    // 身体扭动幅度：三种场景加权
    // - idle 幅度小且常驻
    // - forward 幅度中等，与速度成比例
    // - turn 幅度最大
    const bodySwayAmp = cfg.bodyWaveIdleAmp * idleBlend
                      + cfg.bodyWaveForwardAmp * speedNormForBody
                      + cfg.bodyWaveTurnAmp * turnAbsVisual;

    let turnAmount = 0;
    if (speed > 0.18) {
        const velAngle = Math.atan2(vy, vx);
        turnAmount = clamp(normalizeAngle(velAngle - angle) / (Math.PI * 0.5), -1, 1);
    }

    // idle 下的漂浮位移（原有逻辑保留，但加一个与躯干波同步的呼吸轻漂）
    const driftX = Math.sin(time * cfg.idleDriftSpeed) * 1.2 * idleBlend + Math.sin(time * (cfg.idleDriftSpeed * 1.8)) * 0.12
                 + bodyWave2 * cfg.bodyIdleDriftAmp * idleBlend;
    const driftY = Math.cos(time * (cfg.idleDriftSpeed * 0.82)) * 0.8 * idleBlend
                 + bodyWave * cfg.bodyIdleDriftAmp * 0.6 * idleBlend;

    const leftKickWave = easeStroke(leftKickProgress) * leftKickStrength;
    const rightKickWave = easeStroke(rightKickProgress) * rightKickStrength;
    const kickWave = leftKickWave - rightKickWave;

    // ===== 身体 roll（绕前进轴的侧倾，用垂直缩放模拟） =====
    // 转向时大幅侧倾（向转向内侧），前进时小幅摇摆，idle 时只有微弱呼吸
    const bodyRoll = turnVisual * cfg.rollTurnFactor
                   + turnAmount * 0.08
                   + bodyWave * bodySwayAmp * cfg.rollWaveFactor
                   + kickWave * 0.02;

    // ===== 身体 yaw（俯视下的左右扭动，驱动 S 型曲线） =====
    // 转向时强烈偏向输入侧，前进时周期性左右扭动，idle 时低频漂动
    const bodyYaw = turnAmount * 1.0
                  + turnVisual * cfg.yawTurnFactor
                  + bodyWave * bodySwayAmp * cfg.yawWaveFactor
                  + kickWave * 0.22;

    // ===== 躯干前后呼吸压缩 =====
    // forward 时随腿部相位做呼吸，idle 时随 bodyWave2 轻微起伏
    const compressWave = bodyWave2 * cfg.compressWaveAmp * (idleBlend * 0.5 + speedNormForBody);
    const torsoCompress = 1 - forwardVisual * 0.035 + compressWave;

    // ===== 头部相对躯干的相位领先（蛇形传导：头先动、身后跟） =====
    // headYawLead 表示头部额外的 yaw 偏移（世界坐标下头比身体更早完成扭动）
    const headYawLead = bodyWaveHead * bodySwayAmp * cfg.headLeadFactor
                      + turnVisual * cfg.headTurnLead;

    const swimCycle = Math.sin(time * cfg.legKickFrequency);
    void swimCycle; // 保留符号防未来引用

    const leftArmKick = leftKickWave;
    const rightArmKick = rightKickWave;
    const leftArmTurn = easeStroke(leftTurnProgress) * leftTurnStrength;
    const rightArmTurn = easeStroke(rightTurnProgress) * rightTurnStrength;
    const armClose = swimBlend * cfg.armCloseBySpeed;

    // 自动挡巡航：双手完全收起贴身（身体局部坐标下 +x 为身体朝向，手臂从肩部向 -x 伸向后方 = 角度 π）
    // blend 用 swimBlend 控制渐变：静止时手张开漂浮，移动时逐渐收拢为贴身姿态
    const autoBlend = autoSwim ? swimBlend : 0;
    const baseOpenL = Math.PI + 0.68 - armClose;
    const baseOpenR = Math.PI - 0.68 + armClose;
    const baseTuckL = Math.PI + 0.28;
    const baseTuckR = Math.PI - 0.28;
    const baseL = baseOpenL * (1 - autoBlend) + baseTuckL * autoBlend;
    const baseR = baseOpenR * (1 - autoBlend) + baseTuckR * autoBlend;
    const strokeScale = 1 - autoBlend * 0.9;

    // ===== 手臂常驻动画：idle + forward 都要有 =====
    // - idle 时靠 armIdleAmplitude * idleBlend 做低频轻摆（原有）
    // - forward 时（即使 autoSwim 贴身），让手臂随身体波 bodyWave 做轻微反相摆动
    //   左右反相：一侧外展时另一侧内收，模拟流体阻力带来的自然抖动
    //   幅度用 armBodyWaveAmp 控制，autoSwim 下不完全收死（保留 40%）
    const armBodySway = bodyWave * cfg.armBodyWaveAmp
                      * (1 - autoBlend * 0.6)  // 贴身姿态下衰减但不归零
                      * (idleBlend * 0.6 + speedNormForBody);

    const leftArmUpperBase = baseL
        + Math.sin(time * cfg.armIdleFrequency) * cfg.armIdleAmplitude * idleBlend
        + armBodySway
        + leftArmKick * cfg.armKickSwing * strokeScale
        - leftArmTurn * cfg.armTurnSwing
        + turnVisual * cfg.armTurnLeanFactor;
    const rightArmUpperBase = baseR
        - Math.sin(time * cfg.armIdleFrequency) * cfg.armIdleAmplitude * idleBlend
        - armBodySway
        - rightArmKick * cfg.armKickSwing * strokeScale
        + rightArmTurn * cfg.armTurnSwing
        + turnVisual * cfg.armTurnLeanFactor;
    // 前臂在巡航姿态下也贴身伸直：把原本的 ±0.22 偏转衰减掉
    const forearmOffset = 0.22 * (1 - autoBlend * 0.85);
    const leftArmLowerBase = leftArmUpperBase + forearmOffset - leftArmKick * 0.08 * strokeScale + leftArmTurn * 0.12 - armClose * 0.18;
    const rightArmLowerBase = rightArmUpperBase - forearmOffset + rightArmKick * 0.08 * strokeScale - rightArmTurn * 0.12 + armClose * 0.18;

    // ===== 双臂张开"迎接氧气"动画：直接对手臂角度做 blend（与 carry/regulator 互斥） =====
    // 张开目标姿态：上臂指向身侧偏后（向外张），前臂顺势再外展一点 —— 形似"双臂张开拥抱迎接"
    // 局部坐标：+x 为身体朝向，π 为正后方；左肩 y=-6.2，右肩 y=+6.2
    // 左手目标角 π+0.95（上臂朝左后方约 54° 外展）；右手对称 π-0.95
    const wa = motion.welcomeArmsAnim;
    const welcomeActiveRaw = !!(wa && wa.active && wa.duration > 0);
    // welcome 优先级最低：carryItem 先过滤；regulator 不影响左手但会接管右手，
    // 所以 welcome 与 regulator 共存时也允许（regulator 后续会覆盖右手姿态）
    const carryWillTakeover = !!(motion.carryItemAnim && motion.carryItemAnim.active);
    const welcomeActive = welcomeActiveRaw && !carryWillTakeover;

    let welcomeBlend = 0;
    if (welcomeActive) {
        const tw = Math.min(1, Math.max(0, wa!.timer / wa!.duration));
        // A 0~0.30 张开（smoothstep 渐入）；B 0.30~0.70 保持；C 0.70~1.00 归位
        if (tw < 0.30) {
            const a = tw / 0.30;
            welcomeBlend = a * a * (3 - 2 * a);
        } else if (tw < 0.70) {
            welcomeBlend = 1;
        } else {
            const c2 = (tw - 0.70) / 0.30;
            const ec = c2 * c2 * (3 - 2 * c2);
            welcomeBlend = 1 - ec;
        }
    }

    // 张开动画期间叠加一点"接受能量"的呼吸抖动（让张开不死板）
    const welcomeBreath = welcomeActive
        ? Math.sin((wa!.timer / Math.max(1, wa!.duration)) * Math.PI * 4) * 0.05 * welcomeBlend
        : 0;

    const leftArmTargetUpper  = Math.PI + 0.95 + welcomeBreath;
    const leftArmTargetLower  = leftArmTargetUpper + 0.18;
    const rightArmTargetUpper = Math.PI - 0.95 - welcomeBreath;
    const rightArmTargetLower = rightArmTargetUpper - 0.18;

    const leftArmUpper  = leftArmUpperBase  + (leftArmTargetUpper  - leftArmUpperBase)  * welcomeBlend;
    const leftArmLower  = leftArmLowerBase  + (leftArmTargetLower  - leftArmLowerBase)  * welcomeBlend;
    const rightArmUpper = rightArmUpperBase + (rightArmTargetUpper - rightArmUpperBase) * welcomeBlend;
    const rightArmLower = rightArmLowerBase + (rightArmTargetLower - rightArmLowerBase) * welcomeBlend;

    renderCtx.save();
    renderCtx.translate(x + driftX, y + driftY);
    renderCtx.rotate(angle + bodyRoll);
    // 用 Y 轴压缩模拟 3D 侧倾（roll）：bodyRoll 越大身体越"侧过去"，Y 方向被压扁
    // rollSquash 是额外的 Y 缩放因子，最多 cfg.rollSquashMax 的压缩量
    const rollSquash = 1 - Math.abs(bodyRoll) * cfg.rollSquashFactor;
    const rollSquashClamped = Math.max(1 - cfg.rollSquashMax, rollSquash);
    renderCtx.scale(1, rollSquashClamped);

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
    // 幅度：由速度主导（静止时=低幅常驻呼吸，不再归零） + kickDrive 给加速瞬间的额外鞭打
    // idle 也给一点微幅（cfg.legIdleAmpNorm），让双腿在静止漂浮时做呼吸式抽动
    const idleLegAmp = cfg.legIdleAmpNorm * idleBlend;
    const ampNorm = clamp(speedNorm + kickDriveVal * 0.5 + idleLegAmp, 0, 1);

    // 取/建本角色的相位时钟
    let clock = legClocks.get(clockId);
    if (!clock) {
        clock = { phase: 0 };
        legClocks.set(clockId, clock);
    }
    // 速度极低且无 idle 幅度时才让相位归零；只要 idle 下还保留微幅，就让相位持续推进（维持呼吸感）
    if (ampNorm < 0.02) {
        const distTo0 = Math.min(clock.phase, 1 - clock.phase);
        if (distTo0 > 0.005) {
            clock.phase += (clock.phase < 0.5 ? -1 : 1) * 0.02;
            clock.phase = ((clock.phase % 1) + 1) % 1;
        }
    } else {
        // idle 时用较低频率（bodyClock 节奏一致），前进时沿用原频率
        const effectiveFreq = idleLegAmp > 0 && speedNorm < 0.05
            ? cfg.legAutoFreqBase * cfg.legIdleFreqFactor
            : freq;
        clock.phase = (clock.phase + effectiveFreq) % 1;
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

    if (tankCount > 0) {
        renderCtx.save();
        renderCtx.translate(-0.8, bodyYaw * 0.5);
        const tankGradient = renderCtx.createLinearGradient(8, 0, -10, 0);
        tankGradient.addColorStop(0, '#eef5f8');
        tankGradient.addColorStop(0.28, c.tank);
        tankGradient.addColorStop(0.65, '#9eb3bd');
        tankGradient.addColorStop(1, '#748894');
        renderCtx.fillStyle = tankGradient;
        if (tankCount >= 2) {
            // 双瓶：左右腋下各一只略小的气瓶（沿 y 轴 ±3.6）
            // 单瓶尺寸 17.5×4.2 → 双瓶各 14×3.2，使总宽接近原观感但更壮
            const tankLen = 14;
            const tankR = 3.2;
            const tankYOffset = 3.6;
            // 左瓶
            drawCapsule(renderCtx, -1.4, -tankYOffset, tankLen, tankR);
            renderCtx.fill();
            // 右瓶
            drawCapsule(renderCtx, -1.4, tankYOffset, tankLen, tankR);
            renderCtx.fill();
            // 阀门接头：每瓶一只小方块
            renderCtx.fillStyle = '#485962';
            drawRoundRectPath(renderCtx, 4.0, -tankYOffset - 1.6, 3.0, 3.2, 1.0);
            renderCtx.fill();
            drawRoundRectPath(renderCtx, 4.0, tankYOffset - 1.6, 3.0, 3.2, 1.0);
            renderCtx.fill();
            // 罐身分割线（每瓶一条）
            renderCtx.strokeStyle = 'rgba(32,40,46,0.6)';
            renderCtx.lineWidth = 1.0;
            renderCtx.beginPath();
            // 左瓶环
            renderCtx.moveTo(-3.5, -tankYOffset - tankR);
            renderCtx.lineTo(-3.5, -tankYOffset + tankR);
            // 右瓶环
            renderCtx.moveTo(-3.5, tankYOffset - tankR);
            renderCtx.lineTo(-3.5, tankYOffset + tankR);
            renderCtx.stroke();
        } else {
            // 单瓶：原有视觉
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
        }
        renderCtx.restore();
    }

    renderCtx.restore();

    // ========== 气嘴脱落动画：右手伸出去抓 / 把气嘴塞回嘴 ==========
    // 计算动画进度 t（0~1）；以及当前帧气嘴与右手腕位置
    // 局部坐标：+x 为角色朝向、+y 为右侧
    const ra = motion.regulatorAnim;
    const regActive = !!(ra && ra.active && ra.duration > 0);
    const headY = headYawLead * cfg.headOffsetScale;
    const mouthX = 21.0;            // 嘴部（头球前沿）局部 x
    const mouthY = headY;           // 嘴部局部 y（跟着头一起微动）

    let handBlend = 0;              // 0=走原右手动画，1=完全接管为"抓气嘴"姿态
    let regX = mouthX;
    let regY = mouthY;
    let regAngleLocal = 0;          // 气嘴自身旋转角（咬嘴朝前为 0）
    let regVisible = false;         // 气嘴是否以"外露"状态绘制（在嘴里时不画）

    if (regActive) {
        const t = Math.min(1, Math.max(0, ra!.timer / ra!.duration));
        const strengthMul = 0.7 + 0.5 * ra!.strength; // 轻撞 0.7，重撞 1.2

        // 各阶段分段
        // A: 0.00 ~ 0.20  气嘴被撞飞；手还来不及反应
        // B: 0.20 ~ 0.55  手伸向气嘴
        // C: 0.55 ~ 0.90  手抓着气嘴往回送
        // D: 0.90 ~ 1.00  回到嘴边
        const AEnd = 0.20;
        const BEnd = 0.55;
        const CEnd = 0.90;

        // 气嘴被撞飞的"最远点"（朝右前下）：
        //   y 正方向（角色右侧）14 像素 + x 方向前伸 8
        //   加一点上下飘荡让它像漂在水里
        const flungX = mouthX + 8 * strengthMul;
        const flungY = mouthY + 15 * strengthMul;

        // 胸前软管锚点（气瓶阀门口，位于身前中线偏右）
        const hoseAnchorX = 2;
        const hoseAnchorY = 4;

        // 阶段 A：弹出（ease-out）
        if (t < AEnd) {
            const a = t / AEnd;
            const ea = 1 - (1 - a) * (1 - a); // easeOut
            regX = mouthX + (flungX - mouthX) * ea;
            regY = mouthY + (flungY - mouthY) * ea;
            handBlend = Math.min(0.3, a * 0.3); // 手才刚开始反应
            regVisible = a > 0.05;
            // 气嘴自旋一点
            regAngleLocal = ea * 0.6;
        } else if (t < BEnd) {
            // 阶段 B：气嘴在最远处轻漂；手伸过去
            const b = (t - AEnd) / (BEnd - AEnd);
            // 轻漂：围绕 flung 小范围浮动
            const drift = Math.sin(b * Math.PI * 2) * 0.8;
            regX = flungX + drift * 0.3;
            regY = flungY + drift;
            handBlend = 0.3 + 0.7 * smoothstepLocal(b); // 渐入完全接管
            regVisible = true;
            regAngleLocal = 0.6 + Math.sin(b * Math.PI * 2) * 0.25;
        } else if (t < CEnd) {
            // 阶段 C：手抓着气嘴往嘴边送（气嘴跟随手腕）
            const c2 = (t - BEnd) / (CEnd - BEnd);
            const ec = c2 * c2 * (3 - 2 * c2); // smoothstep
            // 气嘴位置由手腕驱动，这里占位成目标点，下面用 wrist 覆盖
            regX = flungX + (mouthX - flungX) * ec;
            regY = flungY + (mouthY - flungY) * ec;
            handBlend = 1;
            regVisible = true;
            // 收回时气嘴自旋归零
            regAngleLocal = 0.6 * (1 - ec);
        } else {
            // 阶段 D：回到嘴边，手撤回
            const d = (t - CEnd) / (1 - CEnd);
            regX = mouthX;
            regY = mouthY;
            handBlend = 1 - d; // 手缓缓归位
            // 最后 30% 气嘴已经含住，不外露
            regVisible = d < 0.7;
            regAngleLocal = 0;
        }
    }

    // ========== 双手抱拾取物动画（与 regulator 互斥；regulator 优先） ==========
    // 计算双手手腕目标点 + 物品在双手中央的位置（局部坐标）
    const ca = motion.carryItemAnim;
    const carryActiveRaw = !!(ca && ca.active && ca.duration > 0 && ca.itemKind);
    // 若 regulator 正在抢右手，carry 让位（避免双手姿态打架）
    const carryActive = carryActiveRaw && !regActive;

    let carryArmBlend = 0;       // 0=走原双手动画，1=完全接管为"双手抱物"姿态
    let carryItemX = 0;
    let carryItemY = 0;
    let carryItemAlpha = 0;      // 物品绘制透明度
    let carryItemSize = 14;      // 物品图标尺寸（局部坐标 px）
    let carryLeftWristX = 0, carryLeftWristY = 0;
    let carryRightWristX = 0, carryRightWristY = 0;

    if (carryActive) {
        const t = Math.min(1, Math.max(0, ca!.timer / ca!.duration));

        // 把世界起点换算到角色身体局部坐标（不计 driftX/driftY 与 rollSquash 微差）
        const dwx = ca!.fromX - x;
        const dwy = ca!.fromY - y;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const startLocalX =  cosA * dwx + sinA * dwy;
        const startLocalY = -sinA * dwx + cosA * dwy;

        // "抱住"目标位置：双手在身前合抱（胸前略偏外）
        // 双手中央：身体局部 (carryHomeX, 0)；双手腕 ±carryHandSpread 分布
        const carryHomeX = 17.5;     // 胸前外伸（接近头球前沿但稍内）
        const carryHandSpread = 5.5; // 两腕 y 间距 / 2

        // 阶段切分
        const AEnd = 0.25;  // 双手伸出 + 物品起飞预备
        const BEnd = 0.55;  // 物品从地面飞到双手中心
        const CEnd = 0.85;  // 双手抱回胸前
        // D: 0.85~1.0    手臂归位 + 物品淡出

        // 物品的"地面"局部位置（A 阶段保持在起点）
        const groundX = startLocalX;
        const groundY = startLocalY;
        // 抱住时的物品位置（双手中心）
        const heldX = carryHomeX;
        const heldY = 0;

        if (t < AEnd) {
            // A：双手伸向地面物品
            const a = t / AEnd;
            const ea = a * a * (3 - 2 * a); // smoothstep
            carryArmBlend = ea;
            carryItemX = groundX;
            carryItemY = groundY;
            carryItemAlpha = 1;
            // 双手腕目标 = 物品位置上下分开（让双手"抓住"物品两侧）
            carryLeftWristX = groundX;
            carryLeftWristY = groundY - carryHandSpread;
            carryRightWristX = groundX;
            carryRightWristY = groundY + carryHandSpread;
        } else if (t < BEnd) {
            // B：物品从地面飞到双手中心；双手位置随物品同步插值
            const b = (t - AEnd) / (BEnd - AEnd);
            const eb = b * b * (3 - 2 * b);
            carryArmBlend = 1;
            carryItemX = groundX + (heldX - groundX) * eb;
            carryItemY = groundY + (heldY - groundY) * eb;
            carryItemAlpha = 1;
            carryLeftWristX = carryItemX;
            carryLeftWristY = carryItemY - carryHandSpread;
            carryRightWristX = carryItemX;
            carryRightWristY = carryItemY + carryHandSpread;
        } else if (t < CEnd) {
            // C：稳定抱住（小幅呼吸抖动）
            const c2 = (t - BEnd) / (CEnd - BEnd);
            const breathe = Math.sin(c2 * Math.PI * 2) * 0.6;
            carryArmBlend = 1;
            carryItemX = heldX + breathe * 0.3;
            carryItemY = heldY;
            carryItemAlpha = 1;
            carryLeftWristX = carryItemX;
            carryLeftWristY = carryItemY - carryHandSpread;
            carryRightWristX = carryItemX;
            carryRightWristY = carryItemY + carryHandSpread;
        } else {
            // D：手臂归位 + 物品淡出（"收进背包"的视觉提示）
            const d = (t - CEnd) / (1 - CEnd);
            carryArmBlend = 1 - d;
            carryItemX = heldX;
            carryItemY = heldY;
            carryItemAlpha = 1 - d;
            carryLeftWristX = carryItemX;
            carryLeftWristY = carryItemY - carryHandSpread * (1 - d * 0.4);
            carryRightWristX = carryItemX;
            carryRightWristY = carryItemY + carryHandSpread * (1 - d * 0.4);
        }
    }

    // --- 绘制左手臂（regulator 不接管左手；carry 接管时插值到目标手腕） ---
    if (carryActive && carryArmBlend > 0.01) {
        const lShoulderX = 4.3, lShoulderY = -6.2;
        const lElbowX0 = lShoulderX + Math.cos(leftArmUpper) * ARM_UPPER_LEN;
        const lElbowY0 = lShoulderY + Math.sin(leftArmUpper) * ARM_UPPER_LEN;
        const lWristX0 = lElbowX0 + Math.cos(leftArmLower) * ARM_LOWER_LEN;
        const lWristY0 = lElbowY0 + Math.sin(leftArmLower) * ARM_LOWER_LEN;
        const blendedX = lWristX0 + (carryLeftWristX - lWristX0) * carryArmBlend;
        const blendedY = lWristY0 + (carryLeftWristY - lWristY0) * carryArmBlend;
        drawArmReach(renderCtx, lShoulderX, lShoulderY, blendedX, blendedY, c);
    } else {
        drawArm(renderCtx, 4.3, -6.2, leftArmUpper, leftArmLower, c);
    }

    // --- 绘制右手臂：regulator 优先；其次 carry；都没有则原姿态 ---
    let rightWristX = 0, rightWristY = 0; // 供气嘴阶段 C 吸附
    if (regActive && handBlend > 0.01) {
        // 原右手腕（通过原角度反推）：肩 (4.3, 6.2) → upper → lower
        const rShoulderX = 4.3, rShoulderY = 6.2;
        const rElbowX0 = rShoulderX + Math.cos(rightArmUpper) * ARM_UPPER_LEN;
        const rElbowY0 = rShoulderY + Math.sin(rightArmUpper) * ARM_UPPER_LEN;
        const rWristX0 = rElbowX0 + Math.cos(rightArmLower) * ARM_LOWER_LEN;
        const rWristY0 = rElbowY0 + Math.sin(rightArmLower) * ARM_LOWER_LEN;

        // 目标手腕：阶段 B 指向气嘴；阶段 C/D 紧贴气嘴位置（所以正好 = regX/regY）
        const targetWristX = regX;
        const targetWristY = regY;

        // 在原手腕与目标手腕之间按 handBlend 线性插值
        const blendedWristX = rWristX0 + (targetWristX - rWristX0) * handBlend;
        const blendedWristY = rWristY0 + (targetWristY - rWristY0) * handBlend;

        const res = drawArmReach(renderCtx, rShoulderX, rShoulderY, blendedWristX, blendedWristY, c);
        rightWristX = res.wristX;
        rightWristY = res.wristY;
    } else if (carryActive && carryArmBlend > 0.01) {
        const rShoulderX = 4.3, rShoulderY = 6.2;
        const rElbowX0 = rShoulderX + Math.cos(rightArmUpper) * ARM_UPPER_LEN;
        const rElbowY0 = rShoulderY + Math.sin(rightArmUpper) * ARM_UPPER_LEN;
        const rWristX0 = rElbowX0 + Math.cos(rightArmLower) * ARM_LOWER_LEN;
        const rWristY0 = rElbowY0 + Math.sin(rightArmLower) * ARM_LOWER_LEN;
        const blendedX = rWristX0 + (carryRightWristX - rWristX0) * carryArmBlend;
        const blendedY = rWristY0 + (carryRightWristY - rWristY0) * carryArmBlend;
        drawArmReach(renderCtx, rShoulderX, rShoulderY, blendedX, blendedY, c);
    } else {
        drawArm(renderCtx, 4.3, 6.2, rightArmUpper, rightArmLower, c);
    }

    // 阶段 C/D：把气嘴锚定到手腕位置，让气嘴看起来是被手捧着送回嘴的
    if (regActive && ra!.timer / ra!.duration >= 0.55 && ra!.timer / ra!.duration < 0.90) {
        regX = rightWristX;
        regY = rightWristY;
    }

    // 头部：加入蛇形传导偏移（头先转、身后跟）
    // headYawLead 是沿身体 y 轴的微小偏移，让头颈看起来像先扭动
    renderCtx.fillStyle = c.suit;
    renderCtx.beginPath();
    renderCtx.arc(15.8, headY, 6.5, 0, Math.PI * 2);
    renderCtx.fill();

    // --- 气嘴 + 软管（在头之后绘制，压在最上层） ---
    if (regActive && regVisible) {
        // 气嘴朝向：让咬嘴口指向嘴部（让视觉上"对着嘴"的阶段 C/D 很自然）
        // 计算从气嘴指向嘴的方向作为咬嘴朝向
        const dx = mouthX - regX;
        const dy = mouthY - regY;
        let faceAngle: number;
        if (Math.hypot(dx, dy) > 2) {
            faceAngle = Math.atan2(dy, dx);
        } else {
            // 太靠近嘴时直接指向 +x（朝前）
            faceAngle = 0;
        }
        // 加上自旋分量（阶段 A/B 的翻滚感）
        const drawAngle = faceAngle + regAngleLocal * 0.3;
        drawRegulatorAndHose(renderCtx, regX, regY, 2, 4, drawAngle, c);
    }

    // --- 双手抱拾取物：在最上层绘制（与气嘴并列优先级，但两者互斥不会同框） ---
    if (carryActive && carryItemAlpha > 0.01) {
        renderCtx.save();
        renderCtx.globalAlpha *= carryItemAlpha;
        // drawRelicIconAt 内部会再 translate + scale，传 cx/cy 即可
        // 物品在双手中略微"持握感"旋转：随 timer 做缓慢漂动
        renderCtx.translate(carryItemX, carryItemY);
        const tNorm = ca!.timer / ca!.duration;
        const wob = Math.sin(tNorm * Math.PI * 2) * 0.08;
        renderCtx.rotate(wob);
        drawRelicIconAt(renderCtx, ca!.itemKind as RelicKind, 0, 0, carryItemSize);
        renderCtx.restore();
    }

    renderCtx.restore();
}

// 局部 smoothstep（避免依赖上方工具的命名冲突）
function smoothstepLocal(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
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
