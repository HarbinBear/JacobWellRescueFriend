import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { FishEnemy } from '../logic/FishEnemy';
import { getRopeContact } from '../logic/Rope';
import { drawRopeContactWorld } from './RenderRope';
import { isLineOfSight } from '../world/Visibility';
import { getBCDLayout } from './RenderBCD';
import { drawHunterShark, drawSilverFish } from './RenderFishSpecies';

// =============================================
// 绘制单条凶猛鱼（世界坐标系，已在摄像机变换内调用）
// =============================================
export function drawFishEnemy(ctx: CanvasRenderingContext2D, fish: FishEnemy, contact = getRopeContact(fish)) {
    const caught = contact?.kind === 'snag';
    const effort = caught ? .54 + contact.pull * .46 : 0;
    const strain = caught ? Math.sin(contact.phase * .6) * effort : 0;
    ctx.save();
    ctx.translate(fish.x, fish.y);
    ctx.rotate(fish.angle + strain * .31);
    if (caught) ctx.scale(1 - Math.abs(strain) * .11, 1 + Math.abs(strain) * .16);

    const cfg = CONFIG.fishEnemy;
    const t = fish.animTime;
    const state_ = fish.state;
    if (fish.kind === 'curious') {
        drawCuriousFish(ctx, cfg.size, t, state_ === 'inspect', strain);
        ctx.restore();
        return;
    }
    if (fish.kind === 'provoked' || fish.kind === 'shoal') {
        (fish.kind === 'provoked' ? drawHunterShark : drawSilverFish)(ctx, fish, strain);
        ctx.restore();
        return;
    }
    if (fish.kind === 'rammer') {
        drawRammerFish(ctx, fish, strain);
        ctx.restore();
        return;
    }

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

    const bodySway = caught ? strain * .27 : Math.sin(t * swaySpeed) * bodySwayAmp;
    const tailSway = caught ? Math.sin(contact.phase * .83 + .6) * effort : Math.sin(t * swaySpeed + 0.5) * tailSwayAmp;

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

    // 冲刺起手动画：眼睛发光（蓄力阶段）
    if (state_ === 'lunge' && fish.lungeCharge < 1) {
        const glowProgress = fish.lungeCharge; // 0 -> 1
        const glowAlpha = glowProgress * 0.9;
        const glowRadius = size * (0.2 + glowProgress * 0.35);
        // 眼睛外圈发光（黄色光晕）
        const eyeGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
        eyeGlow.addColorStop(0, `rgba(255, 220, 0, ${glowAlpha})`);
        eyeGlow.addColorStop(0.5, `rgba(255, 160, 0, ${glowAlpha * 0.6})`);
        eyeGlow.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = eyeGlow;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        // 眼睛变亮（黄白色）
        ctx.fillStyle = `rgba(255, 240, 100, ${glowProgress * 0.8})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.12, size * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
    }

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

/** Cave eel: bone plate at the nose, a long taper, and a single ribbed ribbon fin. */
function drawRammerFish(ctx: CanvasRenderingContext2D, fish: FishEnemy, strain: number, dying = false) {
    const charging = !dying && fish.state === 'lunge' && fish.lungeCharge < 1;
    const surging = !dying && fish.state === 'lunge' && !charging;
    const coil = charging ? Math.sin(Math.min(1, fish.lungeCharge / .77) * Math.PI) : 0;
    const stroke = fish.animTime * (surging ? 3 : 1.48);
    const flex = (dying ? .08 : .23 + Math.abs(strain) * .54) * (surging ? 1.18 : 1);
    const curlSign = Math.sin(fish.circleAngle) < 0 ? -1 : 1;
    const neck = Math.sin(stroke + .7) * flex * .12;
    const mid = Math.sin(stroke - .45) * flex * .68 + coil * curlSign * .43;
    const tail = Math.sin(stroke - 1.6) * flex * 1.4 + coil * curlSign * 1.20;
    const tip = Math.sin(stroke - 2.1) * flex * 1.78 + coil * curlSign * 1.37;
    ctx.save();
    const size = CONFIG.fishEnemy.size;
    ctx.scale(size * (1 - coil * .11), size);

    // Long membranes are continuous with the eel, with ribs following the same bend.
    ctx.fillStyle = surging ? '#92bcb6' : '#5b9691';
    ctx.strokeStyle = '#294c4c';
    ctx.lineWidth = .045;
    ctx.beginPath();
    ctx.moveTo(.25, -.30);
    ctx.quadraticCurveTo(-.06, -.72 - coil * .14, -.62, mid - .54);
    ctx.bezierCurveTo(-1.08, mid - .68, -1.74, tail - .36, -2.25, tip - .04);
    ctx.quadraticCurveTo(-1.46, tail + .06, -.43, mid - .13);
    ctx.quadraticCurveTo(-.06, neck - .17, .25, -.30);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#4d817c';
    ctx.beginPath();
    ctx.moveTo(.14, .29);
    ctx.quadraticCurveTo(-.53, mid + .40, -1.17, mid + .46);
    ctx.quadraticCurveTo(-1.75, tail + .32, -2.25, tip - .04);
    ctx.quadraticCurveTo(-1.48, tail + .09, -.42, mid + .12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(215,218,222,.52)';
    ctx.lineWidth = .033;
    ctx.beginPath();
    ctx.moveTo(-.24, mid - .17); ctx.quadraticCurveTo(-.29, mid - .36, -.39, mid - .55);
    ctx.moveTo(-.54, mid - .14); ctx.quadraticCurveTo(-.65, mid - .34, -.77, mid - .55);
    ctx.moveTo(-.84, mid - .09); ctx.quadraticCurveTo(-.93, mid - .31, -1.11, mid - .49);
    ctx.moveTo(-1.14, mid - .03); ctx.quadraticCurveTo(-1.27, (mid + tail) / 2 - .24, -1.45, (mid + tail) / 2 - .39);
    ctx.stroke();

    const skin = ctx.createLinearGradient(0, -.38, 0, .44);
    skin.addColorStop(0, '#2a4d50');
    skin.addColorStop(.53, '#64958c');
    skin.addColorStop(1, dying ? '#c0b9ad' : '#aac3a9');
    ctx.fillStyle = skin;
    ctx.strokeStyle = '#294546';
    ctx.lineWidth = .042;
    ctx.beginPath();
    ctx.moveTo(1.02, .06);
    ctx.quadraticCurveTo(.82, -.31, .49, -.36);
    ctx.bezierCurveTo(.02, neck - .38, -.34, mid - .25, -.76, mid - .15);
    ctx.bezierCurveTo(-1.24, (mid + tail) / 2 - .10, -1.82, tail - .08, -2.25, tip - .04);
    ctx.bezierCurveTo(-1.77, tail + .09, -1.19, (mid + tail) / 2 + .16, -.74, mid + .19);
    ctx.quadraticCurveTo(-.14, neck + .30, .53, .32);
    ctx.quadraticCurveTo(.83, .26, 1.02, .06);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#70a69a';
    ctx.beginPath();
    ctx.moveTo(.17, .14);
    ctx.quadraticCurveTo(-.02, .24, -.18, .56 + neck * 2);
    ctx.quadraticCurveTo(-.30, .38, -.44, .19);
    ctx.quadraticCurveTo(-.12, .14, .17, .14);
    ctx.fill();

    // The plate takes light before the dark ribbon is fully visible.
    ctx.fillStyle = '#d1c9a9';
    ctx.beginPath();
    ctx.moveTo(1.02, .06);
    ctx.quadraticCurveTo(.84, -.30, .50, -.31);
    ctx.lineTo(.27, -.13);
    ctx.lineTo(.34, .13);
    ctx.lineTo(.59, .27);
    ctx.quadraticCurveTo(.91, .22, 1.02, .06);
    ctx.fill();

    ctx.strokeStyle = '#496e67';
    ctx.lineWidth = .044;
    ctx.beginPath();
    ctx.moveTo(.24, -.19); ctx.quadraticCurveTo(.13, -.01, .26, .20);
    ctx.moveTo(.12, -.18); ctx.quadraticCurveTo(.02, -.01, .13, .19);
    ctx.stroke();
    ctx.fillStyle = charging ? '#fff4c4' : '#ddc49e';
    if (charging) {
        ctx.shadowColor = '#ffb277';
        ctx.shadowBlur = 7 + fish.lungeCharge * 10;
    }
    ctx.beginPath();
    ctx.ellipse(.70, -.116, .085, .052, -.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#303141';
    ctx.beginPath(); ctx.ellipse(.735, -.12, .022, .044, .16, 0, Math.PI * 2); ctx.fill();

    const jaw = .014;
    ctx.fillStyle = '#302b3d';
    ctx.beginPath();
    ctx.moveTo(.59, .083);
    ctx.quadraticCurveTo(.81, .106, 1.015, .06);
    ctx.quadraticCurveTo(.91, .09 + jaw, .59, .083);
    ctx.fill();
    ctx.restore();
}

function drawCuriousFish(ctx: CanvasRenderingContext2D, size: number, time: number, inspecting: boolean, strain: number) {
    const tail = Math.sin(time * .8) * (inspecting ? .08 : .3) + strain * .72;
    ctx.save();
    ctx.translate(-size * .64, 0);
    ctx.rotate(tail);
    ctx.fillStyle = '#59918b';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * .65, -size * .57, -size * .77, -size * .39, -size * .64, 0);
    ctx.bezierCurveTo(-size * .77, size * .39, -size * .65, size * .57, 0, 0);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#83aba0';
    ctx.beginPath(); ctx.ellipse(0, 0, size * .78, size * .49, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#bbcf9e';
    ctx.beginPath(); ctx.ellipse(size * .12, size * .14, size * .55, size * .28, -.11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#659b93';
    ctx.beginPath(); ctx.ellipse(-size * .21, size * .17, size * .23, size * .1, -.45 + tail, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e7eacb';
    ctx.beginPath(); ctx.arc(size * .42, -size * .14, size * .16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#223f3e';
    ctx.beginPath(); ctx.arc(size * .47, -size * .14, size * .085, 0, Math.PI * 2); ctx.fill();
}

// =============================================
// 绘制所有凶猛鱼（在世界坐标系内调用）
// =============================================
export function drawAllFishEnemies(ctx: CanvasRenderingContext2D,
    left = -Infinity, right = Infinity, top = -Infinity, bottom = Infinity) {
    if (!state.fishEnemies || state.fishEnemies.length === 0) return;
    for (const fish of state.fishEnemies) {
        if (fish.x < left || fish.x > right || fish.y < top || fish.y > bottom) continue;
        if (fish.state === 'dying') {
            // 死亡动画：翻肚皮淡出
            drawDyingFish(ctx, fish);
        } else if (!fish.dead) {
            const contact = getRopeContact(fish);
            drawFishEnemy(ctx, fish, contact);
            drawRopeContactWorld(ctx, fish, contact, CONFIG.fishEnemy.size * (fish.kind === 'shoal' ? .18 : fish.kind === 'provoked' ? .64 : .43));
            // 绘制状态变化提示图标（问号/感叹号）
            if (contact?.kind !== 'snag' && fish.alertTimer > 0 && fish.alertIcon) {
                drawFishAlertIcon(ctx, fish);
            }
        }
    }
}

interface FishEdgeHint {
    fish: FishEnemy;
    x: number;
    y: number;
    angle: number;
    radius: number;
    alpha: number;
}

/** Follow nearby fish just beyond the viewport, using border distance rather
 * than distance to its centre so the tall phone viewport behaves consistently. */
export function getFishEdgeHints(width: number, height: number, cameraX: number, cameraY: number, zoom: number): FishEdgeHint[] {
    const range = 240;
    const candidates = state.fishEnemies.filter(fish => !fish.dead && fish.state !== 'dying').map(fish => {
        const sx = width / 2 + (fish.x - cameraX) * zoom;
        const sy = height / 2 + (fish.y - cameraY) * zoom;
        const outside = Math.hypot(Math.max(0, -sx, sx - width), Math.max(0, -sy, sy - height)) / zoom;
        return { fish, sx, sy, outside };
    }).filter(({ sx, sy, outside }) => outside > 8 / zoom && outside < range &&
        (sx < -8 || sx > width + 8 || sy < -8 || sy > height + 8));
    candidates.sort((a, b) => a.outside - b.outside);
    const hints: FishEdgeHint[] = [];
    const schools = new Set<number>();
    const safeTop = Math.max(28, CONFIG.uiSafeTop || 0);
    const safeBottom = Math.max(28, (CONFIG.uiSafeBottom || 0) + 24);
    const bcd = getBCDLayout();
    const blocks = [
        { left: 0, right: 67, top: Math.max(62, CONFIG.uiSafeTop || 0) - 22, bottom: Math.max(62, CONFIG.uiSafeTop || 0) + 275 },
        { left: bcd.cx - 35, right: width, top: bcd.inflateY - 32, bottom: bcd.deflateY + 32 },
    ];
    for (const { fish, sx, sy, outside } of candidates) {
        if (fish.schoolId && schools.has(fish.schoolId)) continue;
        if (!isLineOfSight(player.x, player.y, fish.x, fish.y, Math.hypot(fish.x - player.x, fish.y - player.y) + 1)) continue;
        const near = 1 - outside / range;
        const radius = 8 + near * 7;
        const left = radius + 7, right = width - radius - 7;
        const top = safeTop + radius, bottom = height - safeBottom - radius;
        const dx = sx - width / 2, dy = sy - height / 2;
        const t = Math.min((width / 2 - left) / (Math.abs(dx) || .001),
            (height / 2 - (dy < 0 ? top : height - bottom)) / (Math.abs(dy) || .001));
        const aimX = width / 2 + dx * t, aimY = height / 2 + dy * t;
        const positions = [{ x: aimX, y: aimY }];
        for (let y = top; y <= bottom; y += 24) positions.push({ x: left, y }, { x: right, y });
        for (let x = left; x <= right; x += 24) positions.push({ x, y: top }, { x, y: bottom });
        let best: { x: number; y: number } | null = null, score = Infinity;
        for (const p of positions) {
            if (blocks.some(b => p.x + radius > b.left && p.x - radius < b.right && p.y + radius > b.top && p.y - radius < b.bottom) ||
                hints.some(h => Math.hypot(p.x - h.x, p.y - h.y) < radius + h.radius + 8)) continue;
            const distance = Math.hypot(p.x - aimX, p.y - aimY);
            if (distance < score) { score = distance; best = p; }
        }
        if (!best || score > 145) continue;
        if (fish.schoolId) schools.add(fish.schoolId);
        hints.push({ fish, ...best, angle: Math.atan2(sy - best.y, sx - best.x), radius, alpha: .42 + near * .54 });
        if (hints.length >= 6) break;
    }
    return hints;
}

function drawFishEdgeIcon(c: CanvasRenderingContext2D, fish: FishEnemy, radius: number) {
    const size = radius * .70;
    c.save(); c.scale(size, size);
    c.lineWidth = .10;
    if (fish.kind === 'curious') {
        c.fillStyle = '#9bc8b3';
        c.beginPath(); c.ellipse(.12, 0, .73, .53, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(-.51, 0); c.lineTo(-1, -.4); c.quadraticCurveTo(-1.14, 0, -1, .4); c.closePath(); c.fill();
        c.fillStyle = '#f0e8c1'; c.beginPath(); c.arc(.40, -.17, .22, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#24423b'; c.beginPath(); c.arc(.47, -.17, .10, 0, Math.PI * 2); c.fill();
    } else if (fish.kind === 'rammer') {
        c.strokeStyle = '#9fc9b8'; c.lineWidth = .40; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-1.13, .29); c.bezierCurveTo(-.43, .62, -.65, -.46, -.12, -.23); c.quadraticCurveTo(.26, -.04, .68, -.09); c.stroke();
        c.fillStyle = '#d5cac0';
        c.beginPath(); c.moveTo(.95, -.08); c.lineTo(.42, -.40); c.lineTo(.20, -.15); c.lineTo(.40, .20); c.closePath(); c.fill();
        c.fillStyle = '#4d4157'; c.beginPath(); c.arc(.62, -.18, .075, 0, Math.PI * 2); c.fill();
    } else if (fish.kind === 'provoked') {
        c.fillStyle = '#a9bdc4';
        c.beginPath(); c.moveTo(1.05, 0); c.quadraticCurveTo(.40, -.47, -.59, -.17);
        c.lineTo(-1.01, -.62); c.lineTo(-.85, 0); c.lineTo(-1.01, .57); c.lineTo(-.59, .17);
        c.quadraticCurveTo(.42, .49, 1.05, 0); c.fill();
        c.beginPath(); c.moveTo(-.39, -.24); c.lineTo(-.30, -.86); c.lineTo(.13, -.31); c.fill();
        c.beginPath(); c.moveTo(-.03, .20); c.lineTo(-.32, .70); c.lineTo(.29, .23); c.fill();
        c.fillStyle = '#2d3944'; c.beginPath(); c.arc(.69, -.10, .075, 0, Math.PI * 2); c.fill();
    } else if (fish.kind === 'shoal') {
        c.fillStyle = '#b9dbe0';
        for (const [x, y] of [[.35, -.43], [-.18, .04], [.40, .48]]) {
            c.beginPath(); c.ellipse(x, y, .46, .16, 0, 0, Math.PI * 2); c.fill();
            c.beginPath(); c.moveTo(x - .32, y); c.lineTo(x - .68, y - .22); c.lineTo(x - .68, y + .22); c.fill();
        }
    } else {
        c.fillStyle = '#b2bac7';
        c.beginPath(); c.moveTo(.93, -.02); c.quadraticCurveTo(.17, -.65, -.61, -.26); c.lineTo(-1.01, -.46);
        c.lineTo(-.86, 0); c.lineTo(-1.01, .46); c.lineTo(-.61, .28); c.quadraticCurveTo(.20, .62, .93, -.02); c.fill();
        c.beginPath(); c.moveTo(-.36, -.31); c.lineTo(-.08, -.78); c.lineTo(.27, -.40); c.closePath(); c.fill();
        c.fillStyle = '#33313b'; c.beginPath(); c.arc(.49, -.12, .09, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#efe0c6'; c.lineWidth = .09; c.beginPath(); c.moveTo(.61, .11); c.lineTo(.41, .24); c.lineTo(.29, .12); c.stroke();
    }
    c.restore();
}

export function drawFishThreatDirection(ctx: CanvasRenderingContext2D,
    width: number, height: number, cameraX: number, cameraY: number, zoom: number) {
    if (state.screen !== 'mazeRescue' || state.mazeRescue?.phase !== 'play' ||
        state.fishBite?.active || state.wheel.open) return;
    for (const hint of getFishEdgeHints(width, height, cameraX, cameraY, zoom)) {
        const { fish, x, y, radius, alpha, angle } = hint;
        const color = fish.kind === 'curious' ? '#a6cdbb' : fish.kind === 'rammer' ? '#c5d8b5' : fish.kind === 'provoked' ? '#dda29b' : fish.kind === 'shoal' ? '#b9dbe0' : '#c7cbd2';
        ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0c1b23'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.stroke();
        drawFishEdgeIcon(ctx, fish, radius);
        ctx.save(); ctx.rotate(angle);
        ctx.beginPath(); ctx.moveTo(radius + 5, 0); ctx.lineTo(radius + 1, -3.2); ctx.lineTo(radius + 1, 3.2); ctx.closePath();
        ctx.fillStyle = color; ctx.fill(); ctx.restore();
        if (fish.state === 'lunge' && getRopeContact(fish)?.kind !== 'snag') {
            ctx.beginPath(); ctx.arc(0, 0, radius + 2.5, -.25, Math.PI + .25);
            ctx.lineWidth = 1.4; ctx.strokeStyle = '#f5ac85'; ctx.stroke();
        }
        ctx.restore();
    }
}

// =============================================
// 绘制状态变化提示图标（问号/感叹号，显示在鱼头顶）
// =============================================
function drawFishAlertIcon(ctx: CanvasRenderingContext2D, fish: FishEnemy) {
    const cfg = CONFIG.fishEnemy;
    const size = cfg.size;
    // 图标透明度：前10帧淡入，后10帧淡出
    const maxTimer = 45;
    let alpha = 1;
    if (fish.alertTimer > maxTimer - 10) {
        alpha = (maxTimer - fish.alertTimer) / 10;
    } else if (fish.alertTimer < 10) {
        alpha = fish.alertTimer / 10;
    }
    alpha = Math.max(0, Math.min(1, alpha));

    // 图标位置：鱼头顶上方
    const iconX = fish.x;
    const iconY = fish.y - size * 1.8;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 气泡背景
    const bubbleR = size * 0.7;
    ctx.beginPath();
    ctx.arc(iconX, iconY, bubbleR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
    ctx.strokeStyle = fish.alertIconColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 气泡小尾巴（指向鱼）
    ctx.beginPath();
    ctx.moveTo(iconX - 4, iconY + bubbleR - 2);
    ctx.lineTo(iconX, iconY + bubbleR + 6);
    ctx.lineTo(iconX + 4, iconY + bubbleR - 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();

    // 图标文字
    ctx.fillStyle = fish.alertIconColor;
    ctx.font = `bold ${Math.round(size * 0.9)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fish.alertIcon, iconX, iconY);

    ctx.restore();
}

// =============================================
// 绘制死亡动画：翻肚皮 + 淡出
// =============================================
function drawDyingFish(ctx: CanvasRenderingContext2D, fish: FishEnemy) {
    ctx.save();
    ctx.globalAlpha = fish.dyingAlpha;
    ctx.translate(fish.x, fish.y);
    // 翻肚皮：绕 X 轴旋转（用 scaleY 模拟透视翻转）
    const rollProgress = fish.dyingRoll / Math.PI; // 0 -> 1
    const scaleY = Math.cos(fish.dyingRoll);       // 1 -> -1°
    ctx.rotate(fish.angle);
    ctx.scale(1, scaleY);
    // 翻转后腹部朝上（白色腹部）
    const size = CONFIG.fishEnemy.size;
    if (fish.kind === 'provoked' || fish.kind === 'shoal') {
        (fish.kind === 'provoked' ? drawHunterShark : drawSilverFish)(ctx, fish, 0);
        ctx.restore();
        return;
    }
    if (fish.kind === 'rammer') {
        drawRammerFish(ctx, fish, 0, true);
        ctx.restore();
        return;
    }
    if (fish.kind === 'curious') {
        drawCuriousFish(ctx, size, fish.animTime, true, 0);
        ctx.restore();
        return;
    }

    // 简化绘制：死亡状态下身体不摆动
    // 腹部（白色，翻转后显示）
    const bellyAlpha = rollProgress;
    const bodyGrad = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.4);
    bodyGrad.addColorStop(0, `rgba(26, 37, 53, ${fish.dyingAlpha})`);
    bodyGrad.addColorStop(0.4, `rgba(45, 61, 82, ${fish.dyingAlpha})`);
    bodyGrad.addColorStop(1, `rgba(220, 210, 200, ${bellyAlpha * fish.dyingAlpha})`);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(size * 1.1, 0);
    ctx.bezierCurveTo(size * 0.9, -size * 0.35, -size * 0.6, -size * 0.38, -size * 1.1, -size * 0.12);
    ctx.lineTo(-size * 1.1, size * 0.12);
    ctx.bezierCurveTo(-size * 0.6, size * 0.38, size * 0.9, size * 0.35, size * 1.1, 0);
    ctx.fill();

    // 尾鳓
    ctx.save();
    ctx.translate(-size * 1.1, 0);
    ctx.fillStyle = `rgba(15, 26, 40, ${fish.dyingAlpha})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.3, -size * 0.15, -size * 0.7, -size * 0.55, -size * 0.5, -size * 0.7);
    ctx.bezierCurveTo(-size * 0.3, -size * 0.8, size * 0.1, -size * 0.5, 0, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.3, size * 0.15, -size * 0.7, size * 0.55, -size * 0.5, size * 0.7);
    ctx.bezierCurveTo(-size * 0.3, size * 0.8, size * 0.1, size * 0.5, 0, 0);
    ctx.fill();
    ctx.restore();

    ctx.restore();
}
