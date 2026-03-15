import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { FishEnemy } from '../logic/FishEnemy';

// =============================================
// 绘制单条凶猛鱼（世界坐标系，已在摄像机变换内调用）
// =============================================
export function drawFishEnemy(ctx: CanvasRenderingContext2D, fish: FishEnemy) {
    ctx.save();
    ctx.translate(fish.x, fish.y);
    ctx.rotate(fish.angle);

    const cfg = CONFIG.fishEnemy;
    const t = fish.animTime;
    const state_ = fish.state;

    // --- 身体摆动幅度根据状态变化 ---
    let bodySwayAmp = 0.12;   // 身体左右摆动幅度
    let tailSwayAmp = 0.35;   // 尾巴摆动幅度
    let swaySpeed = 1.0;      // 摆动速度系数

    if (state_ === 'lunge' && fish.lungeCharge >= 1) {
        bodySwayAmp = 0.25;
        tailSwayAmp = 0.6;
        swaySpeed = 3.0;
    } else if (state_ === 'flee' || state_ === 'fear') {
        bodySwayAmp = 0.3;
        tailSwayAmp = 0.7;
        swaySpeed = 4.0;
    } else if (state_ === 'stalk') {
        bodySwayAmp = 0.06;
        tailSwayAmp = 0.18;
        swaySpeed = 0.6;
    } else if (state_ === 'bite' || state_ === 'devour') {
        bodySwayAmp = 0.4;
        tailSwayAmp = 0.8;
        swaySpeed = 5.0;
    } else if (state_ === 'detect') {
        bodySwayAmp = 0.02;
        tailSwayAmp = 0.05;
        swaySpeed = 0.3;
    }

    const bodySway = Math.sin(t * swaySpeed) * bodySwayAmp;
    const tailSway = Math.sin(t * swaySpeed + 0.5) * tailSwayAmp;

    // --- 颜色主题（深灰蓝+暗红腹部，凶残感）---
    const bodyColor1 = '#1a2535';   // 背部深色
    const bodyColor2 = '#2d3d52';   // 侧面中间色
    const bellyColor = '#3d1a1a';   // 腹部暗红
    const finColor   = '#0f1a28';   // 鳍颜色
    const teethColor = '#e8e0d0';   // 牙齿颜色
    const eyeWhite   = '#c8c0b0';   // 眼白（偏黄，凶残）
    const eyePupil   = '#000';      // 瞳孔

    const size = cfg.size; // 鱼体基础尺寸

    // =============================================
    // 1. 尾鳍（最后面，先画）
    // =============================================
    ctx.save();
    ctx.translate(-size * 1.1, 0);
    ctx.rotate(tailSway);

    // 上尾叶
    ctx.fillStyle = finColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.3, -size * 0.15, -size * 0.7, -size * 0.55, -size * 0.5, -size * 0.7);
    ctx.bezierCurveTo(-size * 0.3, -size * 0.8, size * 0.1, -size * 0.5, 0, 0);
    ctx.fill();

    // 下尾叶
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.3, size * 0.15, -size * 0.7, size * 0.55, -size * 0.5, size * 0.7);
    ctx.bezierCurveTo(-size * 0.3, size * 0.8, size * 0.1, size * 0.5, 0, 0);
    ctx.fill();

    ctx.restore();

    // =============================================
    // 2. 胸鳍（两侧）
    // =============================================
    const pectoralSway = Math.sin(t * swaySpeed * 0.8) * 0.2;
    for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(-size * 0.1, side * size * 0.28);
        ctx.rotate(side * (0.4 + pectoralSway));
        ctx.fillStyle = finColor;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(size * 0.1, side * size * 0.1, size * 0.4, side * size * 0.35, size * 0.3, side * size * 0.5);
        ctx.bezierCurveTo(size * 0.1, side * size * 0.55, -size * 0.15, side * size * 0.3, 0, 0);
        ctx.fill();
        ctx.restore();
    }

    // =============================================
    // 3. 主体（流线型，带身体摆动）
    // =============================================
    ctx.save();
    ctx.rotate(bodySway);

    // 腹部渐变（背部深，腹部暗红）
    const bodyGrad = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.4);
    bodyGrad.addColorStop(0, bodyColor1);
    bodyGrad.addColorStop(0.4, bodyColor2);
    bodyGrad.addColorStop(1, bellyColor);

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    // 头部到尾部的流线型身体
    ctx.moveTo(size * 1.1, 0);
    ctx.bezierCurveTo(size * 0.9, -size * 0.35, -size * 0.6, -size * 0.38, -size * 1.1, -size * 0.12);
    ctx.lineTo(-size * 1.1, size * 0.12);
    ctx.bezierCurveTo(-size * 0.6, size * 0.38, size * 0.9, size * 0.35, size * 1.1, 0);
    ctx.fill();

    // 侧线（鱼的感觉器官，增加细节）
    ctx.strokeStyle = 'rgba(80, 120, 160, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.8, -size * 0.05);
    ctx.bezierCurveTo(size * 0.2, -size * 0.12, -size * 0.4, -size * 0.15, -size * 0.9, -size * 0.08);
    ctx.stroke();

    // =============================================
    // 4. 背鳍（标志性的凶猛鲨鱼背鳍）
    // =============================================
    const dorsalSway = Math.sin(t * swaySpeed * 0.7) * 0.08;
    ctx.save();
    ctx.translate(size * 0.1, -size * 0.35);
    ctx.rotate(dorsalSway);
    ctx.fillStyle = finColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size * 0.15, -size * 0.55);  // 背鳍尖端（向后倾斜）
    ctx.bezierCurveTo(-size * 0.05, -size * 0.6, size * 0.3, -size * 0.45, size * 0.35, 0);
    ctx.fill();
    ctx.restore();

    // 小背鳍（尾部前方）
    ctx.save();
    ctx.translate(-size * 0.65, -size * 0.28);
    ctx.fillStyle = finColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size * 0.05, -size * 0.2);
    ctx.lineTo(size * 0.15, 0);
    ctx.fill();
    ctx.restore();

    ctx.restore(); // 恢复身体摆动

    // =============================================
    // 5. 头部细节（凶残的嘴、眼睛）
    // =============================================

    // 嘴巴张合动画
    let mouthOpen = 0;
    if (state_ === 'bite' || state_ === 'devour') {
        mouthOpen = 0.5 + Math.sin(t * swaySpeed * 3) * 0.5; // 快速开合
    } else if (state_ === 'lunge' && fish.lungeCharge >= 1) {
        mouthOpen = 0.8; // 扑击时大张嘴
    } else if (state_ === 'detect') {
        mouthOpen = 0.2; // 发现猎物时微张
    }

    // 下颌（可动）
    ctx.save();
    ctx.translate(size * 0.7, 0);
    ctx.rotate(mouthOpen * 0.4); // 下颌向下转动

    // 下颌骨
    ctx.fillStyle = bodyColor2;
    ctx.beginPath();
    ctx.moveTo(size * 0.4, 0);
    ctx.bezierCurveTo(size * 0.2, size * 0.1, -size * 0.1, size * 0.15, -size * 0.2, size * 0.08);
    ctx.lineTo(-size * 0.2, 0);
    ctx.bezierCurveTo(-size * 0.1, 0, size * 0.2, 0, size * 0.4, 0);
    ctx.fill();

    // 下排牙齿（锯齿状，多排）
    if (mouthOpen > 0.05) {
        drawTeeth(ctx, size, mouthOpen, false, teethColor);
    }
    ctx.restore();

    // 上颌牙齿
    if (mouthOpen > 0.05) {
        ctx.save();
        ctx.translate(size * 0.7, 0);
        drawTeeth(ctx, size, mouthOpen, true, teethColor);
        ctx.restore();
    }

    // 口腔内部（张嘴时显示暗红色内腔）
    if (mouthOpen > 0.1) {
        ctx.save();
        ctx.translate(size * 0.7, 0);
        ctx.fillStyle = `rgba(80, 10, 10, ${mouthOpen * 0.9})`;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.05 * mouthOpen, size * 0.35, size * 0.18 * mouthOpen, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // =============================================
    // 6. 眼睛（凶残的黄色虹膜+竖瞳）
    // =============================================
    ctx.save();
    ctx.translate(size * 0.65, -size * 0.12);

    // 眼白（偏黄）
    ctx.fillStyle = eyeWhite;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.16, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // 虹膜（黄色，凶残）
    ctx.fillStyle = '#c8a000';
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.12, size * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    // 竖瞳（椭圆形，像猫眼）
    ctx.fillStyle = eyePupil;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.04, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.04, -size * 0.04, size * 0.03, size * 0.02, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // =============================================
    // 7. 鳃裂（增加细节）
    // =============================================
    ctx.strokeStyle = 'rgba(15, 25, 40, 0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
        const gx = size * 0.3 - i * size * 0.12;
        ctx.beginPath();
        ctx.moveTo(gx, -size * 0.22);
        ctx.quadraticCurveTo(gx - size * 0.04, 0, gx, size * 0.22);
        ctx.stroke();
    }

    // =============================================
    // 8. 怕光状态特效（身体发白闪烁）
    // =============================================
    if (fish.state === 'fear') {
        const fearAlpha = 0.3 + Math.sin(fish.animTime * 8) * 0.3;
        ctx.fillStyle = `rgba(200, 220, 255, ${fearAlpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 1.2, size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// =============================================
// 绘制牙齿（上排或下排）
// =============================================
function drawTeeth(ctx: CanvasRenderingContext2D, size: number, mouthOpen: number, isUpper: boolean, color: string) {
    const sign = isUpper ? -1 : 1;
    const baseY = sign * size * 0.02;
    const toothCount = 6;
    const toothSpacing = size * 0.1;
    const toothH = size * 0.12 * mouthOpen;
    const toothW = size * 0.06;

    ctx.fillStyle = color;
    for (let i = 0; i < toothCount; i++) {
        const tx = -size * 0.28 + i * toothSpacing;
        ctx.beginPath();
        ctx.moveTo(tx - toothW / 2, baseY);
        ctx.lineTo(tx, baseY + sign * toothH);
        ctx.lineTo(tx + toothW / 2, baseY);
        ctx.fill();
    }

    // 第二排牙齿（更小，更凶残）
    ctx.fillStyle = `rgba(220, 210, 190, 0.7)`;
    for (let i = 0; i < toothCount - 1; i++) {
        const tx = -size * 0.23 + i * toothSpacing;
        ctx.beginPath();
        ctx.moveTo(tx - toothW * 0.4, baseY + sign * toothH * 0.3);
        ctx.lineTo(tx, baseY + sign * toothH * 0.8);
        ctx.lineTo(tx + toothW * 0.4, baseY + sign * toothH * 0.3);
        ctx.fill();
    }
}

// =============================================
// 绘制玩家被咬特效（屏幕空间，在 UI 层调用）
// =============================================
export function drawFishBiteEffect(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
    if (!state.fishBite || !state.fishBite.active) return;

    const bite = state.fishBite;
    const t = bite.timer;
    const phase = bite.phase;

    if (phase === 'bite') {
        // 撕咬阶段：血红色边缘晕染 + 屏幕撕裂感
        const intensity = Math.min(1, t / 30);

        // 血红边缘
        const edgeGrad = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.2,
            canvasW / 2, canvasH / 2, canvasH * 0.8
        );
        edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        edgeGrad.addColorStop(0.6, `rgba(120, 0, 0, ${intensity * 0.3})`);
        edgeGrad.addColorStop(1, `rgba(180, 0, 0, ${intensity * 0.7})`);
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // 撕裂线条（随机斜线，模拟撕咬感）
        if (t % 4 < 2) {
            ctx.save();
            ctx.strokeStyle = `rgba(200, 0, 0, ${intensity * 0.6})`;
            ctx.lineWidth = 2 + Math.random() * 3;
            for (let i = 0; i < 5; i++) {
                const sx = Math.random() * canvasW;
                const sy = Math.random() * canvasH;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + (Math.random() - 0.5) * 100, sy + (Math.random() - 0.5) * 100);
                ctx.stroke();
            }
            ctx.restore();
        }

        // 血迹飞溅（圆形血点）
        ctx.save();
        for (let i = 0; i < 8; i++) {
            const bx = canvasW * (0.2 + Math.sin(t * 0.3 + i * 1.2) * 0.3 + i * 0.08);
            const by = canvasH * (0.3 + Math.cos(t * 0.4 + i * 0.9) * 0.25);
            const br = 3 + Math.sin(t * 0.5 + i) * 2;
            ctx.fillStyle = `rgba(180, 0, 0, ${intensity * 0.5})`;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

    } else if (phase === 'dead') {
        // 死亡阶段：全屏血红渐变加深，然后黑屏
        const deathProgress = Math.min(1, t / CONFIG.fishEnemy.deathFadeDuration);

        // 血红叠加
        ctx.fillStyle = `rgba(100, 0, 0, ${deathProgress * 0.5})`;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // 视野模糊（用多层半透明黑色模拟）
        if (deathProgress > 0.5) {
            const blackAlpha = (deathProgress - 0.5) * 2;
            ctx.fillStyle = `rgba(0, 0, 0, ${blackAlpha * 0.8})`;
            ctx.fillRect(0, 0, canvasW, canvasH);
        }

        // 挣扎文字（死亡过程中短暂显示）
        if (deathProgress < 0.7) {
            const textAlpha = Math.sin(deathProgress * Math.PI) * 0.8;
            ctx.save();
            ctx.fillStyle = `rgba(255, 200, 200, ${textAlpha})`;
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('！！！', canvasW / 2, canvasH / 2);
            ctx.restore();
        }
    }
}

// =============================================
// 绘制所有凶猛鱼（在世界坐标系内调用）
// =============================================
export function drawAllFishEnemies(ctx: CanvasRenderingContext2D) {
    if (!state.fishEnemies || state.fishEnemies.length === 0) return;
    for (const fish of state.fishEnemies) {
        if (!fish.dead) {
            drawFishEnemy(ctx, fish);
        }
    }
}
