// 迷宫救援叙事包装层：警情通报 / 案件结案（成功 / 搜寻终止）/ 放弃救援按钮 / resolved_idle 新任务按钮
// 从原 RenderMazeUI.ts 抽出。调用方：
//   - drawCaseBriefing / drawCaseResolved / drawCaseAbandoned / drawAbandonBtn / drawResolvedIdleNewCaseBtn 由 RenderMazeUI.drawMazeHUD 调用
//   - get*Rect 按钮矩形由 input.ts hit-test 调用（通过 RenderMazeUI.ts re-export）

import { ctx } from '../Canvas';

// 兼容微信小游戏的圆角矩形（本文件内部私有工具）
function rrect(c: any, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
}

// =============================================
// 救援概念包装：3 个全屏叙事页（警情通报 / 成功结案 / 搜寻终止）
// 以及岸上"放弃救援"按钮
// =============================================

// 工具函数：把数字左侧补零至指定宽度（兼容低版本 TS target，不依赖 padStart）
function padL2(n: number): string {
    return n < 10 ? '0' + n : '' + n;
}

// 工具函数：从 seed 派生稳定的"伪 GPS 坐标"叙事字符串
function seedToPseudoCoord(seed: number): string {
    const s = (seed >>> 0);
    const lat = (s % 20000) / 1000;
    const lon = 95 + ((s >> 8) % 10000) / 1000;
    const latD = Math.floor(lat);
    const latM = Math.floor((lat - latD) * 60);
    const latS = Math.floor(((lat - latD) * 60 - latM) * 60);
    const lonD = Math.floor(lon);
    const lonM = Math.floor((lon - lonD) * 60);
    const lonS = Math.floor(((lon - lonD) * 60 - lonM) * 60);
    return `N ${latD}°${padL2(latM)}'${padL2(latS)}\"  E ${lonD}°${padL2(lonM)}'${padL2(lonS)}\"`;
}

// 工具函数：从 seed 派生"接警时间"（HH:MM，稳定再生）
function seedToAlertTime(seed: number): string {
    const s = (seed >>> 0);
    const h = (s % 18) + 4;
    const m = (s >> 5) % 60;
    return `${padL2(h)}:${padL2(m)}`;
}

// 辅助：盖章 punch 动效
function stampPunchAnim(t: number): {scale: number, alphaIn: number} {
    if (t <= 0) return { scale: 1.7, alphaIn: 0 };
    if (t < 0.5) {
        const k = t / 0.5;
        const ease = 1 - (1 - k) * (1 - k) * (1 - k);
        const scale = 1.7 - ease * 0.7;
        const alphaIn = Math.min(1, t / 0.3);
        return { scale, alphaIn };
    }
    if (t < 0.7) {
        const k = (t - 0.5) / 0.2;
        const scale = 1.0 - Math.sin(k * Math.PI) * 0.06;
        return { scale, alphaIn: 1 };
    }
    return { scale: 1.0, alphaIn: 1 };
}

// 辅助：count-up 整数动画
function animCountUp(targetVal: number, startSec: number, dur: number, tSec: number): number {
    if (tSec <= startSec) return 0;
    const k = Math.min(1, (tSec - startSec) / dur);
    const ease = 1 - (1 - k) * (1 - k);
    return Math.floor(targetVal * ease);
}

// 辅助：智能盖章绘制（自适应字号避免盖章超出屏幕）
function drawSmartStamp(
    text: string,
    textColor: string,
    strokeColor: string,
    scale: number,
    rot: number,
    safeWidth: number,
) {
    const tryFonts = [20, 18, 16, 14];
    let picked = tryFonts[0];
    let textW = 0;
    for (let i = 0; i < tryFonts.length; i++) {
        ctx.font = 'bold ' + tryFonts[i] + 'px Arial';
        textW = ctx.measureText(text).width;
        const rectW = textW + 48;
        const ar = Math.abs(rot);
        const outerW = Math.abs(Math.cos(ar)) * rectW + Math.abs(Math.sin(ar)) * 48;
        const needed = outerW * scale;
        if (needed <= safeWidth) {
            picked = tryFonts[i];
            break;
        }
    }
    ctx.font = 'bold ' + picked + 'px Arial';
    textW = ctx.measureText(text).width;
    const rectW = textW + 48;
    const rectH = 44;

    ctx.scale(scale, scale);
    ctx.rotate(rot);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    rrect(ctx, -rectW / 2, -rectH / 2, rectW, rectH, 10);
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = 'bold ' + picked + 'px Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, 0);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
}

// 辅助：计算圆角矩形描边总周长（用于 setLineDash 按比例截取）
function buildRoundedRectPerimeter(x: number, y: number, w: number, h: number, r: number): {totalLen: number} {
    const rr = Math.min(r, w / 2, h / 2);
    const straightH = 2 * (w - 2 * rr);
    const straightV = 2 * (h - 2 * rr);
    const arcLen = 2 * Math.PI * rr;
    return { totalLen: straightH + straightV + arcLen };
}

// ---------------------------------------------
// A. 警情通报页（岸上首次进入新地图时覆盖层）
// ---------------------------------------------
export function drawCaseBriefing(maze: any, cw: number, ch: number, time: number) {
    const seed = (maze && typeof maze.seed === 'number') ? (maze.seed >>> 0) : 0;
    const enterMs = (maze && maze.briefingEnterTime) ? maze.briefingEnterTime : Date.now();
    const t = Math.max(0, (Date.now() - enterMs) / 1000);
    const bgAlpha = Math.min(1, t / 0.35);
    const barSlideT = Math.min(1, t / 0.5);
    const barEase = 1 - (1 - barSlideT) * (1 - barSlideT) * (1 - barSlideT);
    const SAFE_TOP = 58;
    const PAD_X = 28;
    const contentR = cw - PAD_X;

    ctx.globalAlpha = bgAlpha;
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, 'rgba(8,18,12,0.97)');
    bg.addColorStop(1, 'rgba(4,10,8,0.99)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = bgAlpha * 0.06;
    ctx.fillStyle = '#6ef0a0';
    for (let y = 0; y < ch; y += 3) {
        ctx.fillRect(0, y, cw, 1);
    }
    const sweepCycle = 2.4;
    const sweepY = ((t % sweepCycle) / sweepCycle) * ch;
    const sweepGrad = ctx.createLinearGradient(0, sweepY - 80, 0, sweepY + 8);
    sweepGrad.addColorStop(0, 'rgba(110,240,160,0)');
    sweepGrad.addColorStop(0.7, 'rgba(110,240,160,0.10)');
    sweepGrad.addColorStop(1, 'rgba(180,255,200,0.28)');
    ctx.globalAlpha = bgAlpha;
    ctx.fillStyle = sweepGrad;
    ctx.fillRect(0, sweepY - 80, cw, 88);
    ctx.globalAlpha = bgAlpha;

    const barTargetY = SAFE_TOP + 40;
    const barY = barTargetY - (1 - barEase) * 60;
    const blink = 0.65 + Math.abs(Math.sin(t * 3)) * 0.35;
    ctx.fillStyle = `rgba(180,50,36,${(0.28 + blink * 0.12) * barEase})`;
    ctx.fillRect(0, barY - 22, cw, 44);
    ctx.strokeStyle = `rgba(255,130,100,${0.45 * barEase})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, barY - 22); ctx.lineTo(cw, barY - 22);
    ctx.moveTo(0, barY + 22); ctx.lineTo(cw, barY + 22);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,210,190,${blink * barEase})`;
    ctx.font = 'bold 16px Consolas, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠  EMERGENCY  ALERT  ⚠', cw / 2, barY);
    ctx.textBaseline = 'alphabetic';

    ctx.globalAlpha = bgAlpha * barEase;
    ctx.fillStyle = 'rgba(180,230,200,0.8)';
    ctx.font = '11px Consolas, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CAVE RESCUE DISPATCH CENTER / 紧急救援调度中心', cw / 2, barY + 34);

    const lines: {label: string, value: string, value2?: string, color?: string}[] = [
        { label: '案件编号', value: maze.caseNumber || 'JWR-000000', color: 'rgba(180,240,200,0.95)' },
        { label: '接警时间', value: seedToAlertTime(seed), color: 'rgba(200,220,200,0.9)' },
        { label: '事发地点', value: '雅各布井支洞', value2: seedToPseudoCoord(seed), color: 'rgba(200,220,200,0.9)' },
        { label: '情  况', value: '1 名潜水员失联，氧气存量未知', color: 'rgba(255,220,180,0.95)' },
        { label: '任  务', value: '深入洞穴，找到被困者并带回水面', color: 'rgba(255,255,220,0.95)' },
    ];
    const typeCharSec = 0.03;
    const lineDelay = 0.18;
    const typeStart = 0.7;

    const infoStartY = SAFE_TOP + 116;
    const labelX = PAD_X + 8;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = bgAlpha;
    let infoY = infoStartY;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const lineAppearAt = typeStart + i * lineDelay;
        const lineTime = Math.max(0, t - lineAppearAt);
        const alphaEnter = Math.min(1, lineTime / 0.25);
        const hasTwoLines = !!ln.value2;
        const lineAdvance = hasTwoLines ? 56 : 34;
        if (alphaEnter <= 0) { infoY += lineAdvance; continue; }
        ctx.globalAlpha = bgAlpha * alphaEnter;

        ctx.fillStyle = 'rgba(140,200,160,0.72)';
        ctx.font = '12px Consolas, Menlo, monospace';
        ctx.fillText(ln.label, labelX, infoY);

        const valueX = labelX + 70;
        const chars = Math.max(0, Math.floor(lineTime / typeCharSec));
        ctx.fillStyle = ln.color || '#cfe';
        ctx.font = 'bold 14px Consolas, Menlo, monospace';

        if (hasTwoLines) {
            // 第一行：主地点（如"雅各布井支洞"）
            const line1 = ln.value;
            const line2 = ln.value2 || '';
            const chars1 = Math.min(line1.length, chars);
            const visLine1 = line1.slice(0, chars1);
            ctx.fillText(visLine1, valueX, infoY);
            if (chars1 < line1.length && Math.floor(t * 3) % 2 === 0) {
                const cursorX = valueX + ctx.measureText(visLine1).width + 2;
                ctx.fillStyle = 'rgba(200,255,210,0.75)';
                ctx.fillRect(cursorX, infoY - 7, 6, 13);
            }
            // 第二行：坐标，与第一行使用相同的 valueX 对齐
            if (chars > line1.length) {
                const chars2 = Math.min(line2.length, chars - line1.length);
                const visLine2 = line2.slice(0, chars2);
                ctx.fillStyle = ln.color || '#cfe';
                ctx.font = '12px Consolas, Menlo, monospace';
                ctx.fillText(visLine2, valueX, infoY + 22);
                if (chars2 < line2.length && Math.floor(t * 3) % 2 === 0) {
                    const cursorX = valueX + ctx.measureText(visLine2).width + 2;
                    ctx.fillStyle = 'rgba(200,255,210,0.75)';
                    ctx.fillRect(cursorX, infoY + 22 - 7, 6, 13);
                }
            }
            infoY += lineAdvance;
        } else {
            const visText = ln.value.slice(0, Math.min(ln.value.length, chars));
            const availW = contentR - valueX;
            const fullW = ctx.measureText(ln.value).width;
            if (fullW <= availW) {
                ctx.fillText(visText, valueX, infoY);
                if (chars < ln.value.length && Math.floor(t * 3) % 2 === 0) {
                    const cursorX = valueX + ctx.measureText(visText).width + 2;
                    ctx.fillStyle = 'rgba(200,255,210,0.75)';
                    ctx.fillRect(cursorX, infoY - 7, 6, 13);
                }
                infoY += 34;
            } else {
                infoY += 18;
                ctx.fillStyle = ln.color || '#cfe';
                ctx.font = 'bold 13px Consolas, Menlo, monospace';
                ctx.fillText(visText, labelX, infoY);
                if (chars < ln.value.length && Math.floor(t * 3) % 2 === 0) {
                    const cursorX = labelX + ctx.measureText(visText).width + 2;
                    ctx.fillStyle = 'rgba(200,255,210,0.75)';
                    ctx.fillRect(cursorX, infoY - 7, 6, 13);
                }
                infoY += 22;
            }
        }
    }
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = bgAlpha;

    // 叙事段起始时间：考虑到事发地点的两行打字时间（value + value2），适度延后
    const narrStartAt = typeStart + 5 * lineDelay + 0.4;
    const narrT = Math.max(0, t - narrStartAt);
    const narrLines = [
        '你是本地洞穴救援队的一员。',
        '对讲机里的声音很急，却尽量保持克制。',
        '你收起咖啡杯，走向已经架好的气瓶和面镜。',
    ];
    ctx.textAlign = 'center';
    ctx.font = 'italic 12px Georgia, serif';
    const narrY = Math.min(infoY + 36, ch * 0.62);
    for (let i = 0; i < narrLines.length; i++) {
        const a = Math.min(1, (narrT - i * 0.35) / 0.5);
        if (a <= 0) continue;
        ctx.globalAlpha = bgAlpha * a * 0.78;
        ctx.fillStyle = 'rgba(200,230,210,1)';
        ctx.fillText(narrLines[i], cw / 2, narrY + i * 20);
    }
    ctx.globalAlpha = bgAlpha;

    const statusStartAt = narrStartAt + 3 * 0.35 + 0.6;
    const statusT = Math.max(0, t - statusStartAt);
    if (statusT > 0) {
        const statusAlpha = Math.min(1, statusT / 0.5);
        ctx.globalAlpha = bgAlpha * statusAlpha * 0.55;
        const statusY = narrY + 3 * 20 + 32;
        const lineW = Math.min(cw * 0.32, 160);
        const blinkDot = Math.floor(t * 2) % 4;
        const dots = '.'.repeat(blinkDot) + ' '.repeat(3 - blinkDot);
        ctx.strokeStyle = 'rgba(150,220,180,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cw / 2 - lineW - 50, statusY);
        ctx.lineTo(cw / 2 - 50, statusY);
        ctx.moveTo(cw / 2 + 50, statusY);
        ctx.lineTo(cw / 2 + lineW + 50, statusY);
        ctx.stroke();
        ctx.fillStyle = 'rgba(180,230,200,0.85)';
        ctx.font = '11px Consolas, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('等待指令' + dots, cw / 2, statusY + 3);
    }
    ctx.globalAlpha = bgAlpha;

    const btnAppearAt = narrStartAt + 1.4;
    const btnT = Math.max(0, t - btnAppearAt);
    const btnAlpha = Math.min(1, btnT / 0.35);
    if (btnAlpha > 0) {
        const btnW = Math.min(260, cw * 0.74);
        const btnH = 46;
        const btnX = (cw - btnW) / 2;
        const btnY = ch - 56;
        const pulse = 0.85 + Math.sin(t * 2) * 0.1;
        ctx.globalAlpha = bgAlpha * btnAlpha;
        const haloGrad = ctx.createRadialGradient(cw / 2, btnY + btnH / 2, 10, cw / 2, btnY + btnH / 2, btnW * 0.7);
        haloGrad.addColorStop(0, `rgba(80,200,140,${0.18 * pulse})`);
        haloGrad.addColorStop(1, 'rgba(80,200,140,0)');
        ctx.fillStyle = haloGrad;
        ctx.fillRect(btnX - 40, btnY - 30, btnW + 80, btnH + 60);
        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
        btnGrad.addColorStop(0, `rgba(30,90,60,${pulse})`);
        btnGrad.addColorStop(1, `rgba(50,140,90,${pulse})`);
        ctx.fillStyle = btnGrad;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, 23);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,255,210,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, 23);
        ctx.stroke();
        const sweepT = (t % 3) / 3;
        if (sweepT < 1) {
            ctx.save();
            ctx.beginPath();
            rrect(ctx, btnX, btnY, btnW, btnH, 23);
            ctx.clip();
            const sweepX = btnX - 40 + (btnW + 80) * sweepT;
            const shineGrad = ctx.createLinearGradient(sweepX - 28, 0, sweepX + 28, 0);
            shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
            shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
            shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = shineGrad;
            ctx.fillRect(sweepX - 28, btnY, 56, btnH);
            ctx.restore();
        }
        ctx.fillStyle = 'rgba(220,255,230,0.98)';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('接受任务，前往现场', cw / 2, btnY + btnH / 2);
        ctx.textBaseline = 'alphabetic';
    }

    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
}

// ---------------------------------------------
// B. 救援成功结案页（救援数据结算 rescued 之后显示）
// ---------------------------------------------
export function drawCaseResolved(maze: any, cw: number, ch: number, time: number) {
    const timer = (maze as any).caseResultTimer || 0;
    const showAlpha = Math.min(1, timer / 30);
    const enterMs = (maze && maze.resolvedEnterTime) ? maze.resolvedEnterTime : Date.now();
    const t = Math.max(0, (Date.now() - enterMs) / 1000);
    const SAFE_TOP = 58;
    const PAD_X = 28;

    ctx.globalAlpha = showAlpha;
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, 'rgba(52,42,28,0.97)');
    bg.addColorStop(0.5, 'rgba(80,60,36,0.97)');
    bg.addColorStop(1, 'rgba(30,24,14,0.99)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    const haloBreath = 1 + Math.sin(t * 0.9) * 0.06;
    const haloR = Math.min(cw, ch) * 0.7 * haloBreath;
    const haloG = ctx.createRadialGradient(cw * 0.78, ch * 0.1, 10, cw * 0.78, ch * 0.1, haloR);
    haloG.addColorStop(0, 'rgba(255,220,160,0.35)');
    haloG.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = haloG;
    ctx.fillRect(0, 0, cw, ch);

    ctx.globalAlpha = showAlpha;
    for (let i = 0; i < 28; i++) {
        const px = (Math.sin(i * 2.17 + t * 0.15) * 0.5 + 0.5) * cw;
        const py = ((i * 37 + t * 18) % ch);
        const sz = 1 + (i % 3) * 0.7;
        const a = 0.08 + (i % 4) * 0.04;
        ctx.fillStyle = `rgba(255,230,180,${a})`;
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = showAlpha;
    ctx.textAlign = 'center';
    const stampY = SAFE_TOP + 44;
    const stamp = stampPunchAnim(t);
    ctx.save();
    ctx.translate(cw / 2, stampY);
    ctx.globalAlpha = showAlpha * stamp.alphaIn;
    drawSmartStamp(
        '案件结案 · 成功营救',
        'rgba(150,240,190,0.95)',
        'rgba(120,220,170,0.9)',
        stamp.scale,
        -0.04,
        cw - PAD_X * 2 - 8,
    );
    ctx.restore();

    const subAlpha = Math.min(1, Math.max(0, (t - 0.55) / 0.35));
    ctx.globalAlpha = showAlpha * subAlpha;
    ctx.fillStyle = 'rgba(240,220,180,0.78)';
    ctx.font = '13px Consolas, Menlo, monospace';
    ctx.fillText(maze.caseNumber || 'JWR-------', cw / 2, stampY + 44);

    const reportY = ch * 0.33;
    const diveCount = maze.diveCount || 0;
    const totalRope = maze.totalRopePlaced || 0;
    const maxDepthM = Math.floor((maze.maxDepthReached || 0) / (maze.mazeTileSize || 1));

    const reportAlpha = Math.min(1, Math.max(0, (t - 0.8) / 0.35));
    ctx.globalAlpha = showAlpha * reportAlpha;
    ctx.fillStyle = 'rgba(240,230,200,0.85)';
    ctx.font = 'bold 13px Arial';
    ctx.fillText('— 行动报告 —', cw / 2, reportY);

    const statItemsR = [
        { label: '出勤次数', rawVal: diveCount, unit: ' 次', staticText: '' },
        { label: '最大深度', rawVal: maxDepthM, unit: ' m', staticText: '' },
        { label: '铺设绳索', rawVal: totalRope, unit: ' 段', staticText: '' },
        { label: '结案状态', rawVal: 0, unit: '', staticText: '已移交医疗组' },
    ];
    const leftB = PAD_X, rightB = cw - PAD_X;
    const sw = (rightB - leftB) / statItemsR.length;
    for (let i = 0; i < statItemsR.length; i++) {
        const sx = leftB + sw * i + sw / 2;
        const colStart = 1.0 + i * 0.15;
        const colAlpha = Math.min(1, Math.max(0, (t - colStart) / 0.3));
        if (colAlpha <= 0) continue;
        ctx.globalAlpha = showAlpha * colAlpha;
        ctx.fillStyle = 'rgba(255,230,180,0.95)';
        ctx.font = 'bold 16px Arial';
        const it = statItemsR[i];
        let valText: string;
        if (it.staticText) {
            valText = it.staticText;
        } else {
            const v = animCountUp(it.rawVal, colStart, 0.8, t);
            valText = v + it.unit;
        }
        ctx.fillText(valText, sx, reportY + 38);
        ctx.fillStyle = 'rgba(200,180,140,0.6)';
        ctx.font = '10px Arial';
        ctx.fillText(it.label, sx, reportY + 56);
    }
    ctx.globalAlpha = showAlpha;

    const narrYR = ch * 0.60;
    ctx.textAlign = 'center';
    ctx.font = 'italic 13px Georgia, serif';
    const narrLinesR = [
        '被困者已被送上担架，医疗组正在检查体征。',
        '队长拍了拍你的肩："干得漂亮。"',
        '你坐在井边，氧气瓶从水里被拉上来，阳光正好。',
    ];
    for (let i = 0; i < narrLinesR.length; i++) {
        const a = Math.min(1, Math.max(0, (t - 2.0 - i * 0.5) / 0.6));
        if (a <= 0) continue;
        ctx.globalAlpha = showAlpha * a * 0.88;
        ctx.fillStyle = 'rgba(240,220,180,1)';
        ctx.fillText(narrLinesR[i], cw / 2, narrYR + i * 22);
    }
    ctx.globalAlpha = showAlpha;

    const btnReadyR = t > 3.8 && timer >= 60;
    if (btnReadyR) {
        const btnAlpha = Math.min(1, (t - 3.8) / 0.4);
        ctx.globalAlpha = showAlpha * btnAlpha;
        const btnH = 46;
        const btnY = ch - 56;
        const gap = 12;
        const totalW = Math.min(cw - PAD_X * 2, 420);
        const halfW = (totalW - gap) / 2;
        const leftX = (cw - totalW) / 2;
        const rightX = leftX + halfW + gap;

        ctx.fillStyle = 'rgba(70,55,38,0.9)';
        ctx.beginPath();
        rrect(ctx, leftX, btnY, halfW, btnH, 23);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,180,140,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rrect(ctx, leftX, btnY, halfW, btnH, 23);
        ctx.stroke();
        ctx.fillStyle = 'rgba(230,215,180,0.95)';
        ctx.font = 'bold 14px Arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText('留在此处', leftX + halfW / 2, btnY + btnH / 2);
        ctx.textBaseline = 'alphabetic';

        const mainGrad = ctx.createLinearGradient(rightX, btnY, rightX + halfW, btnY);
        mainGrad.addColorStop(0, 'rgba(50,130,90,0.95)');
        mainGrad.addColorStop(1, 'rgba(80,170,120,0.95)');
        ctx.fillStyle = mainGrad;
        ctx.beginPath();
        rrect(ctx, rightX, btnY, halfW, btnH, 23);
        ctx.fill();
        const sweepT = (t % 3) / 3;
        if (sweepT < 1) {
            ctx.save();
            ctx.beginPath();
            rrect(ctx, rightX, btnY, halfW, btnH, 23);
            ctx.clip();
            const sweepX = rightX - 20 + (halfW + 40) * sweepT;
            const shineGrad = ctx.createLinearGradient(sweepX - 20, 0, sweepX + 20, 0);
            shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
            shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
            shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = shineGrad;
            ctx.fillRect(sweepX - 20, btnY, 40, btnH);
            ctx.restore();
        }
        ctx.fillStyle = 'rgba(230,255,240,0.98)';
        ctx.font = 'bold 14px Arial';
        ctx.textBaseline = 'middle';
        ctx.fillText('接受新的任务 ▶', rightX + halfW / 2, btnY + btnH / 2);
        ctx.textBaseline = 'alphabetic';
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
}

// ---------------------------------------------
// C. 搜寻终止结案页（岸上长按"放弃救援"完成后显示）
// ---------------------------------------------
export function drawCaseAbandoned(maze: any, cw: number, ch: number, time: number) {
    const timer = (maze as any).caseResultTimer || 0;
    const showAlpha = Math.min(1, timer / 30);
    const enterMs = (maze && maze.abandonedEnterTime) ? maze.abandonedEnterTime : Date.now();
    const t = Math.max(0, (Date.now() - enterMs) / 1000);
    const SAFE_TOP = 58;
    const PAD_X = 28;

    ctx.globalAlpha = showAlpha;
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, 'rgba(42,54,70,0.98)');
    bg.addColorStop(0.45, 'rgba(26,34,48,0.98)');
    bg.addColorStop(1, 'rgba(14,18,26,0.99)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    const coldHaloBreath = 1 + Math.sin(t * 0.7) * 0.05;
    const coldHaloR = Math.min(cw, ch) * 0.75 * coldHaloBreath;
    const coldHaloG = ctx.createRadialGradient(cw * 0.22, ch * 0.08, 8, cw * 0.22, ch * 0.08, coldHaloR);
    coldHaloG.addColorStop(0, 'rgba(120,160,210,0.22)');
    coldHaloG.addColorStop(0.5, 'rgba(80,110,160,0.08)');
    coldHaloG.addColorStop(1, 'rgba(60,80,120,0)');
    ctx.fillStyle = coldHaloG;
    ctx.fillRect(0, 0, cw, ch);

    ctx.globalAlpha = showAlpha * 0.05;
    for (let i = 0; i < 60; i++) {
        const nx = ((i * 53 + (t * 17 | 0)) % cw);
        const ny = ((i * 97 + (t * 29 | 0)) % ch);
        ctx.fillStyle = '#c8d0e0';
        ctx.fillRect(nx, ny, 1, 1);
    }
    ctx.globalAlpha = showAlpha;

    for (let i = 0; i < 6; i++) {
        const cycle = 6 + i * 0.7;
        const phase = (t + i * 2.1) % cycle;
        const k = phase / cycle;
        const bx = (Math.sin(i * 1.9) * 0.35 + 0.5) * cw + Math.sin(t * 0.4 + i) * 12;
        const by = ch * 0.9 - k * ch * 0.55;
        const bSize = 2 + k * 3;
        const bA = (1 - k) * 0.15;
        ctx.globalAlpha = showAlpha * bA;
        ctx.strokeStyle = 'rgba(180,195,215,1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, bSize, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = showAlpha;

    ctx.textAlign = 'center';
    const stampYA = SAFE_TOP + 44;
    const stampA = stampPunchAnim(t);
    ctx.save();
    ctx.translate(cw / 2, stampYA);
    ctx.globalAlpha = showAlpha * stampA.alphaIn;
    drawSmartStamp(
        '案件结案 · 搜寻终止',
        'rgba(250,140,120,0.95)',
        'rgba(230,90,70,0.9)',
        stampA.scale,
        0.035,
        cw - PAD_X * 2 - 8,
    );
    ctx.restore();

    const subAlphaA = Math.min(1, Math.max(0, (t - 0.55) / 0.35));
    ctx.globalAlpha = showAlpha * subAlphaA;
    ctx.fillStyle = 'rgba(170,180,195,0.72)';
    ctx.font = '13px Consolas, Menlo, monospace';
    ctx.fillText(maze.caseNumber || 'JWR-------', cw / 2, stampYA + 44);

    const reportYA = ch * 0.33;
    const diveCountA = maze.diveCount || 0;
    const totalRopeA = maze.totalRopePlaced || 0;
    const maxDepthMA = Math.floor((maze.maxDepthReached || 0) / (maze.mazeTileSize || 1));
    let exploredCount = 0;
    let openCount = 0;
    try {
        for (let r = 0; r < maze.mazeRows; r++) {
            for (let c = 0; c < maze.mazeCols; c++) {
                if (maze.mazeMap[r][c] === 0) {
                    openCount++;
                    if (maze.mazeExplored[r] && maze.mazeExplored[r][c]) exploredCount++;
                }
            }
        }
    } catch (e) { /* 忽略 */ }
    const coveragePct = openCount > 0 ? Math.round(exploredCount / openCount * 100) : 0;

    const reportAlphaA = Math.min(1, Math.max(0, (t - 0.8) / 0.35));
    ctx.globalAlpha = showAlpha * reportAlphaA;
    ctx.fillStyle = 'rgba(200,210,225,0.82)';
    ctx.font = 'bold 13px Arial';
    ctx.fillText('— 行动记录 —', cw / 2, reportYA);

    const statItemsA = [
        { label: '出勤次数', rawVal: diveCountA, unit: ' 次' },
        { label: '最大深度', rawVal: maxDepthMA, unit: ' m' },
        { label: '覆盖率', rawVal: coveragePct, unit: '%' },
        { label: '铺设绳索', rawVal: totalRopeA, unit: ' 段' },
    ];
    const leftBA = PAD_X, rightBA = cw - PAD_X;
    const swA = (rightBA - leftBA) / statItemsA.length;
    for (let i = 0; i < statItemsA.length; i++) {
        const sx = leftBA + swA * i + swA / 2;
        const colStart = 1.0 + i * 0.15;
        const colAlpha = Math.min(1, Math.max(0, (t - colStart) / 0.3));
        if (colAlpha <= 0) continue;
        ctx.globalAlpha = showAlpha * colAlpha;
        ctx.fillStyle = 'rgba(200,210,225,0.95)';
        ctx.font = 'bold 16px Arial';
        const v = animCountUp(statItemsA[i].rawVal, colStart, 0.8, t);
        ctx.fillText(v + statItemsA[i].unit, sx, reportYA + 38);
        ctx.fillStyle = 'rgba(140,150,170,0.6)';
        ctx.font = '10px Arial';
        ctx.fillText(statItemsA[i].label, sx, reportYA + 56);
    }
    ctx.globalAlpha = showAlpha;

    const narrYA = ch * 0.60;
    ctx.textAlign = 'center';
    ctx.font = 'italic 13px Georgia, serif';
    const narrLinesA = [
        '你摘下面镜。',
        '调度员在无线电里说："搜寻终止，新的报警来了。"',
        '你没有回答，看着黑色水面沉默了很久。',
        '水面浮着几个气泡，很快也没了。',
    ];
    for (let i = 0; i < narrLinesA.length; i++) {
        const a = Math.min(1, Math.max(0, (t - 2.0 - i * 0.55) / 0.6));
        if (a <= 0) continue;
        ctx.globalAlpha = showAlpha * a * 0.82;
        ctx.fillStyle = 'rgba(200,210,225,1)';
        ctx.fillText(narrLinesA[i], cw / 2, narrYA + i * 22);
    }
    ctx.globalAlpha = showAlpha;

    const btnReadyA = t > 4.0 && timer >= 60;
    if (btnReadyA) {
        const btnAlpha = Math.min(1, (t - 4.0) / 0.4);
        ctx.globalAlpha = showAlpha * btnAlpha;
        const btnW = Math.min(280, cw * 0.74);
        const btnH = 46;
        const btnX = (cw - btnW) / 2;
        const btnY = ch - 56;
        const grad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
        grad.addColorStop(0, 'rgba(60,80,120,0.9)');
        grad.addColorStop(1, 'rgba(90,110,160,0.9)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, 23);
        ctx.fill();
        const sweepT = (t % 3.2) / 3.2;
        if (sweepT < 1) {
            ctx.save();
            ctx.beginPath();
            rrect(ctx, btnX, btnY, btnW, btnH, 23);
            ctx.clip();
            const sweepX = btnX - 28 + (btnW + 56) * sweepT;
            const shineGrad = ctx.createLinearGradient(sweepX - 22, 0, sweepX + 22, 0);
            shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
            shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
            shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = shineGrad;
            ctx.fillRect(sweepX - 22, btnY, 44, btnH);
            ctx.restore();
        }
        ctx.fillStyle = 'rgba(220,230,250,0.98)';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('接受新的任务 ▶', cw / 2, btnY + btnH / 2);
        ctx.textBaseline = 'alphabetic';
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
}

// ---------------------------------------------
// D. 岸上"放弃救援"按钮
// ---------------------------------------------
export function getAbandonBtnRect(cw: number, ch: number): {x: number, y: number, w: number, h: number} {
    const w = 124;
    const h = 36;
    const x = cw - w - 14;
    const y = Math.max(112, Math.min(ch - 480, ch * 0.22));
    return { x, y, w, h };
}

export function drawAbandonBtn(cw: number, ch: number, time: number, holdProgress: number) {
    const r = getAbandonBtnRect(cw, ch);

    ctx.globalAlpha = 0.92;
    const bgGrad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    bgGrad.addColorStop(0, 'rgba(28,30,34,0.88)');
    bgGrad.addColorStop(1, 'rgba(16,18,22,0.92)');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    rrect(ctx, r.x, r.y, r.w, r.h, 18);
    ctx.fill();

    ctx.save();
    if ((ctx as any).setLineDash) (ctx as any).setLineDash([3, 2]);
    ctx.strokeStyle = holdProgress > 0 ? 'rgba(230,120,100,0.55)' : 'rgba(200,205,215,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 17.5);
    ctx.stroke();
    if ((ctx as any).setLineDash) (ctx as any).setLineDash([]);
    ctx.restore();

    if (holdProgress > 0) {
        ctx.save();
        const r2 = 18;
        const p = buildRoundedRectPerimeter(r.x, r.y, r.w, r.h, r2);
        const totalLen = p.totalLen;
        if ((ctx as any).setLineDash) {
            (ctx as any).setLineDash([totalLen * holdProgress, totalLen]);
        }
        ctx.strokeStyle = 'rgba(230,90,70,0.95)';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        rrect(ctx, r.x, r.y, r.w, r.h, r2);
        ctx.stroke();
        if ((ctx as any).setLineDash) (ctx as any).setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.restore();
    }

    const iconCx = r.x + 18;
    const iconCy = r.y + r.h / 2;
    const iconCol = holdProgress > 0 ? 'rgba(255,180,160,0.95)' : 'rgba(200,210,220,0.85)';
    ctx.strokeStyle = iconCol;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    rrect(ctx, iconCx - 7, iconCy - 8, 14, 18, 2);
    ctx.stroke();
    ctx.fillStyle = iconCol;
    ctx.globalAlpha = 0.92 * 0.7;
    ctx.fillRect(iconCx - 5, iconCy - 6, 10, 5);
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(iconCx, iconCy + 3, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(iconCx + 5, iconCy - 8);
    ctx.lineTo(iconCx + 9, iconCy - 13);
    ctx.stroke();
    const blink = 0.5 + Math.abs(Math.sin(time * 2.2)) * 0.5;
    ctx.fillStyle = holdProgress > 0
        ? `rgba(255,140,110,${blink})`
        : `rgba(180,230,255,${blink * 0.7})`;
    ctx.beginPath();
    ctx.arc(iconCx + 9, iconCy - 13, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = holdProgress > 0 ? 'rgba(255,215,200,0.98)' : 'rgba(220,228,238,0.88)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const labelMain = holdProgress > 0 ? '持续按住 …' : '结束搜寻';
    ctx.fillText(labelMain, iconCx + 16, iconCy);

    if (holdProgress <= 0) {
        ctx.fillStyle = 'rgba(200,210,220,0.55)';
        ctx.font = '10px Arial';
        ctx.fillText('⇥', r.x + r.w - 14, iconCy);
    }

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
}

// ---------------------------------------------
// E. resolved_idle 状态下的"接受新任务"按钮
// ---------------------------------------------
export function getResolvedIdleNewCaseBtnRect(cw: number, ch: number): {x: number, y: number, w: number, h: number} {
    const w = 128;
    const h = 34;
    const x = cw - w - 12;
    const y = 52;
    return { x, y, w, h };
}

export function drawResolvedIdleNewCaseBtn(cw: number, ch: number, time: number) {
    const r = getResolvedIdleNewCaseBtnRect(cw, ch);
    const pulse = 0.8 + Math.sin(time * 2) * 0.15;
    ctx.globalAlpha = pulse;
    const grad = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y);
    grad.addColorStop(0, 'rgba(50,130,90,0.9)');
    grad.addColorStop(1, 'rgba(80,170,120,0.9)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    rrect(ctx, r.x, r.y, r.w, r.h, 17);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,255,210,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, r.x, r.y, r.w, r.h, 17);
    ctx.stroke();
    ctx.fillStyle = 'rgba(230,255,240,0.98)';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('接受新的任务 ▶', r.x + r.w / 2, r.y + r.h / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
}

// ---------------------------------------------
// F. 警情通报页"接受任务"按钮矩形（供 input.ts hit-test）
// ---------------------------------------------
export function getBriefingAcceptBtnRect(cw: number, ch: number): {x: number, y: number, w: number, h: number} {
    const w = Math.min(260, cw * 0.7);
    const h = 46;
    return { x: (cw - w) / 2, y: ch - 56, w, h };
}

// ---------------------------------------------
// G. resolved 结案页双按钮矩形 / abandoned 结案页单按钮矩形
// ---------------------------------------------
export function getResolvedBtnRects(cw: number, ch: number): {stayX: number, newX: number, y: number, w: number, h: number} {
    const h = 46;
    const y = ch - 56;
    const gap = 12;
    const totalW = Math.min(cw - 32, 420);
    const halfW = (totalW - gap) / 2;
    const leftX = (cw - totalW) / 2;
    const rightX = leftX + halfW + gap;
    return { stayX: leftX, newX: rightX, y, w: halfW, h };
}

export function getAbandonedAcceptBtnRect(cw: number, ch: number): {x: number, y: number, w: number, h: number} {
    const w = Math.min(280, cw * 0.7);
    const h = 46;
    return { x: (cw - w) / 2, y: ch - 56, w, h };
}
