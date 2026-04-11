import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { drawDiverSilhouette } from './RenderDiver';

// 兼容微信小游戏的圆角矩形（手动绘制，避免roundRect兼容性问题）
function rrect(c, x, y, w, h, r) {
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

function wrapTextLines(text, maxWidth, renderCtx) {
    let words = text.split('');
    let line = '';
    let lines: string[] = [];
    for(let n = 0; n < words.length; n++) {
        let testLine = line + words[n];
        if(renderCtx.measureText(testLine).width > maxWidth && n > 0) {
            lines.push(line);
            line = words[n];
        } else {
            line = testLine;
        }
    }
    lines.push(line);
    return lines;
}

function drawChapterImage1(x, y, w, h, time) {
    ctx.save();
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 10);
    ctx.clip();

    // 背景：水下浅蓝渐变
    let bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, '#87CEEB');
    bg.addColorStop(0.4, '#4DD0E1');
    bg.addColorStop(1, '#1a3a5c');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    // 水面波纹
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for(let wx2 = x; wx2 < x + w; wx2 += 8) {
        ctx.lineTo(wx2, y + h * 0.22 + Math.sin((wx2 - x) / 20 + time * 2) * 3);
    }
    ctx.stroke();

    // 丁达尔光柱
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for(let i = 0; i < 3; i++) {
        let rx = x + w * (0.25 + i * 0.25) + Math.sin(time * 0.5 + i) * 8;
        let rg = ctx.createLinearGradient(rx, y, rx, y + h);
        rg.addColorStop(0, 'rgba(200,255,255,0.18)');
        rg.addColorStop(1, 'rgba(200,255,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(rx - 8, y);
        ctx.lineTo(rx + 8, y);
        ctx.lineTo(rx + 20, y + h);
        ctx.lineTo(rx - 20, y + h);
        ctx.fill();
    }
    ctx.restore();

    // 岩壁（左右两侧）
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.3);
    ctx.lineTo(x + w * 0.18, y + h * 0.3);
    ctx.lineTo(x + w * 0.22, y + h * 0.5);
    ctx.lineTo(x + w * 0.15, y + h);
    ctx.lineTo(x, y + h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w, y + h * 0.3);
    ctx.lineTo(x + w * 0.82, y + h * 0.3);
    ctx.lineTo(x + w * 0.78, y + h * 0.5);
    ctx.lineTo(x + w * 0.85, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.fill();

    // 缝隙（中间暗色裂缝）
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.42, y + h * 0.55);
    ctx.lineTo(x + w * 0.5, y + h * 0.5);
    ctx.lineTo(x + w * 0.58, y + h * 0.55);
    ctx.lineTo(x + w * 0.56, y + h);
    ctx.lineTo(x + w * 0.44, y + h);
    ctx.fill();

    // 潜水员（小熊，红色）
    let diverX = x + w * 0.38;
    let diverY = y + h * 0.62;
    ctx.save();
    ctx.translate(diverX, diverY);
    ctx.rotate(Math.PI * 0.1);
    ctx.fillStyle = '#d44';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fa0';
    ctx.beginPath(); ctx.arc(-7, -2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // NPC（潘子，蓝色）进入缝隙
    let npcX = x + w * 0.5;
    let npcY = y + h * 0.72 + Math.sin(time * 2) * 2;
    ctx.save();
    ctx.translate(npcX, npcY);
    ctx.rotate(Math.PI * 0.5);
    ctx.fillStyle = '#4af';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fa0';
    ctx.beginPath(); ctx.arc(-7, -2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 气泡从缝隙冒出
    for(let i = 0; i < 5; i++) {
        let bx = x + w * 0.48 + Math.sin(time * 3 + i * 1.2) * 5;
        let by = y + h * (0.55 - i * 0.06) + ((time * 30 + i * 20) % (h * 0.4));
        ctx.fillStyle = `rgba(200,240,255,${0.6 - i * 0.1})`;
        ctx.beginPath();
        ctx.arc(bx, by, 2 + i * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawChapterImage2(x, y, w, h, time) {
    ctx.save();
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 10);
    ctx.clip();

    // 背景：深水暗蓝
    let bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, '#0d1b2a');
    bg.addColorStop(1, '#050a10');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    // 巨石（中央大石块）
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.35);
    ctx.lineTo(x + w * 0.5, y + h * 0.2);
    ctx.lineTo(x + w * 0.8, y + h * 0.35);
    ctx.lineTo(x + w * 0.75, y + h * 0.65);
    ctx.lineTo(x + w * 0.25, y + h * 0.65);
    ctx.fill();
    // 石块高光
    ctx.strokeStyle = 'rgba(100,100,120,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.25, y + h * 0.38);
    ctx.lineTo(x + w * 0.5, y + h * 0.24);
    ctx.lineTo(x + w * 0.72, y + h * 0.38);
    ctx.stroke();
    // 裂缝
    ctx.strokeStyle = 'rgba(255,200,100,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.42, y + h * 0.28);
    ctx.lineTo(x + w * 0.48, y + h * 0.45);
    ctx.lineTo(x + w * 0.55, y + h * 0.55);
    ctx.stroke();

    // 手电筒光（玩家视角）
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    let flashX = x + w * 0.5;
    let flashY = y + h * 0.85;
    let flashGrad = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, h * 0.6);
    flashGrad.addColorStop(0, 'rgba(200,255,255,0.25)');
    flashGrad.addColorStop(0.4, 'rgba(100,200,255,0.1)');
    flashGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.moveTo(flashX - 15, flashY);
    ctx.lineTo(flashX - 80, flashY - h * 0.55);
    ctx.lineTo(flashX + 80, flashY - h * 0.55);
    ctx.lineTo(flashX + 15, flashY);
    ctx.fill();
    ctx.restore();

    // 泥沙粒子
    for(let i = 0; i < 12; i++) {
        let px2 = x + w * (0.2 + (i * 0.07 + Math.sin(time + i) * 0.05) % 0.7);
        let py2 = y + h * (0.3 + (i * 0.06 + time * 0.03 + i * 0.1) % 0.5);
        ctx.fillStyle = `rgba(120,100,80,${0.3 + Math.sin(time + i) * 0.1})`;
        ctx.beginPath();
        ctx.arc(px2, py2, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // 潜水员（玩家，底部）
    let diverX2 = x + w * 0.5;
    let diverY2 = y + h * 0.88;
    ctx.save();
    ctx.translate(diverX2, diverY2);
    ctx.rotate(-Math.PI * 0.5 + Math.sin(time) * 0.05);
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fa0';
    ctx.beginPath(); ctx.arc(-8, -2, 4, 0, Math.PI * 2); ctx.fill();
    // 气泡
    for(let i = 0; i < 3; i++) {
        let bx2 = 5 + i * 4 + Math.sin(time * 4 + i) * 2;
        let by2 = -8 - i * 6 - ((time * 20 + i * 15) % 30);
        ctx.fillStyle = `rgba(200,240,255,${0.7 - i * 0.2})`;
        ctx.beginPath();
        ctx.arc(bx2, by2, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.restore();
}

function drawChapterImage3(x, y, w, h, time) {
    ctx.save();
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 10);
    ctx.clip();

    // 背景：极深的黑暗
    let bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, '#050a10');
    bg.addColorStop(1, '#020508');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    // 手电筒闪烁效果（不规律）
    let flickerVal = Math.sin(time * 7.3) * Math.sin(time * 13.7) * Math.sin(time * 3.1);
    let flashOn = flickerVal > -0.3;
    let flashIntensity = flashOn ? (0.5 + Math.abs(flickerVal) * 0.5) : 0;

    if(flashIntensity > 0.05) {
        // 手电筒光锥
        let flashX = x + w * 0.5;
        let flashY = y + h * 0.85;
        let flashGrad = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, h * 0.7);
        flashGrad.addColorStop(0, `rgba(255,250,200,${0.3 * flashIntensity})`);
        flashGrad.addColorStop(0.4, `rgba(200,230,255,${0.15 * flashIntensity})`);
        flashGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.moveTo(flashX - 12, flashY);
        ctx.lineTo(flashX - 70, flashY - h * 0.6);
        ctx.lineTo(flashX + 70, flashY - h * 0.6);
        ctx.lineTo(flashX + 12, flashY);
        ctx.fill();
    }

    // 岩壁（两侧）
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w * 0.25, y);
    ctx.lineTo(x + w * 0.2, y + h);
    ctx.lineTo(x, y + h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w * 0.75, y);
    ctx.lineTo(x + w * 0.8, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.fill();

    // 潜水员（独自，底部）
    let diverX3 = x + w * 0.5;
    let diverY3 = y + h * 0.85;
    ctx.save();
    ctx.translate(diverX3, diverY3);
    ctx.rotate(-Math.PI * 0.5 + Math.sin(time * 0.8) * 0.05);
    ctx.fillStyle = '#2a3a4a';
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fa0';
    ctx.beginPath(); ctx.arc(-8, -2, 4, 0, Math.PI * 2); ctx.fill();
    // 手电筒（偶尔闪烁）
    if(flashOn) {
        ctx.fillStyle = `rgba(255,250,200,${0.8 * flashIntensity})`;
        ctx.beginPath(); ctx.arc(10, 0, 3, 0, Math.PI * 2); ctx.fill();
    }
    // 气泡
    for(let i = 0; i < 3; i++) {
        let bx3 = 5 + i * 4 + Math.sin(time * 4 + i) * 2;
        let by3 = -8 - i * 6 - ((time * 20 + i * 15) % 30);
        ctx.fillStyle = `rgba(200,240,255,${0.6 - i * 0.15})`;
        ctx.beginPath();
        ctx.arc(bx3, by3, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 问号（表示迷失）
    if(Math.sin(time * 2) > 0) {
        ctx.fillStyle = `rgba(255,200,100,${0.4 + Math.sin(time * 2) * 0.3})`;
        ctx.font = `bold ${Math.floor(h * 0.15)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + w * 0.5, y + h * 0.35);
    }

    ctx.restore();
}

function drawChapterImage4(x, y, w, h, time) {
    ctx.save();
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 10);
    ctx.clip();

    // 背景：极深的黑暗，带红色调
    let bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, '#080005');
    bg.addColorStop(1, '#020002');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    // 远处隐约的发光体（未知生物）
    let glowX = x + w * 0.35;
    let glowY = y + h * 0.3;
    let glowPulse = 0.5 + Math.sin(time * 1.8) * 0.3;
    let glowGrad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, h * 0.35);
    glowGrad.addColorStop(0, `rgba(255,50,50,${0.4 * glowPulse})`);
    glowGrad.addColorStop(0.4, `rgba(180,20,20,${0.15 * glowPulse})`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(x, y, w, h);

    // 未知生物轮廓（模糊的大型阴影）
    ctx.save();
    ctx.globalAlpha = 0.3 + Math.sin(time * 0.7) * 0.1;
    ctx.fillStyle = '#1a0000';
    ctx.beginPath();
    ctx.ellipse(glowX, glowY, w * 0.22, h * 0.18, Math.sin(time * 0.3) * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛（两个红点）
    let eyeSpacing = w * 0.06;
    ctx.fillStyle = `rgba(255,80,80,${0.8 * glowPulse})`;
    ctx.beginPath(); ctx.arc(glowX - eyeSpacing, glowY - h * 0.02, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(glowX + eyeSpacing, glowY - h * 0.02, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 岩壁（两侧）
    ctx.fillStyle = '#0d0d0d';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w * 0.2, y); ctx.lineTo(x + w * 0.15, y + h); ctx.lineTo(x, y + h); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w, y); ctx.lineTo(x + w * 0.8, y); ctx.lineTo(x + w * 0.85, y + h); ctx.lineTo(x + w, y + h); ctx.fill();

    // 潜水员（底部，手电筒时亮时暗）
    let flickerVal = Math.sin(time * 7.3) * Math.sin(time * 13.7);
    let flashOn = flickerVal > -0.2;
    let diverX4 = x + w * 0.72;
    let diverY4 = y + h * 0.82;
    ctx.save();
    ctx.translate(diverX4, diverY4);
    ctx.rotate(-Math.PI * 0.5 + Math.sin(time * 0.8) * 0.08);
    ctx.fillStyle = '#2a3a4a';
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fa0';
    ctx.beginPath(); ctx.arc(-8, -2, 4, 0, Math.PI * 2); ctx.fill();
    if(flashOn) {
        ctx.fillStyle = `rgba(255,250,200,${0.7 * Math.abs(flickerVal)})`;
        ctx.beginPath(); ctx.arc(10, 0, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 感叹号（表示惊吓）
    if(Math.sin(time * 3) > 0.3) {
        ctx.fillStyle = `rgba(255,100,100,${0.5 + Math.sin(time * 3) * 0.3})`;
        ctx.font = `bold ${Math.floor(h * 0.18)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', x + w * 0.72, y + h * 0.55);
    }

    ctx.restore();
}


export function drawMenu() {
    let time = Date.now() / 1000;

    if(state.menuScreen === 'chapter') {
        drawChapterSelect(time);
        return;
    }

    // ---- 主菜单 ----
    // 背景：深海渐变
    let grad = ctx.createLinearGradient(0, 0, 0, logicH);
    grad.addColorStop(0, '#001a33');
    grad.addColorStop(0.5, '#001122');
    grad.addColorStop(1, '#000811');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, logicW, logicH);

    // 动态气泡背景
    ctx.save();
    for(let i = 0; i < 18; i++) {
        let bx = logicW * ((i * 0.137 + time * 0.02 * (1 + i % 3 * 0.3)) % 1);
        let by = logicH - (time * (15 + i % 5 * 5) + i * 80) % (logicH + 60);
        let br = 3 + (i % 4) * 3;
        let ba = 0.08 + (i % 3) * 0.05;
        ctx.fillStyle = `rgba(100,220,255,${ba})`;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        // 气泡高光
        ctx.fillStyle = `rgba(255,255,255,${ba * 1.5})`;
        ctx.beginPath();
        ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 丁达尔光柱
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for(let i = 0; i < 4; i++) {
        let rx = logicW / 2 + Math.sin(time * 0.4 + i * 1.6) * 120;
        let rg = ctx.createLinearGradient(rx, 0, rx, logicH);
        rg.addColorStop(0, 'rgba(0,200,255,0.12)');
        rg.addColorStop(0.6, 'rgba(0,200,255,0.04)');
        rg.addColorStop(1, 'rgba(0,200,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(rx - 30, 0);
        ctx.lineTo(rx + 30, 0);
        ctx.lineTo(rx + 80, logicH);
        ctx.lineTo(rx - 80, logicH);
        ctx.fill();
    }
    ctx.restore();

    // 水面波纹（顶部）
    ctx.strokeStyle = 'rgba(100,220,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let wx2 = 0; wx2 < logicW; wx2 += 10) {
        ctx.lineTo(wx2, 18 + Math.sin(wx2 / 60 + time * 1.5) * 5);
    }
    ctx.stroke();

    // 标题
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 标题光晕
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    let titleGlow = ctx.createRadialGradient(logicW / 2, logicH * 0.28, 0, logicW / 2, logicH * 0.28, 120);
    titleGlow.addColorStop(0, 'rgba(0,200,255,0.2)');
    titleGlow.addColorStop(1, 'rgba(0,200,255,0)');
    ctx.fillStyle = titleGlow;
    ctx.fillRect(logicW / 2 - 120, logicH * 0.18, 240, 120);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,200,255,0.15)';
    ctx.font = 'bold 40px Arial';
    ctx.fillText("雅各布井", logicW / 2 + 2, logicH * 0.27 + 2);
    ctx.fillStyle = '#e0f8ff';
    ctx.font = 'bold 40px Arial';
    ctx.fillText("雅各布井", logicW / 2, logicH * 0.27);

    ctx.fillStyle = 'rgba(0,180,220,0.15)';
    ctx.font = 'bold 28px Arial';
    ctx.fillText("救援行动", logicW / 2 + 1, logicH * 0.37 + 1);
    ctx.fillStyle = '#a0d8ef';
    ctx.font = 'bold 28px Arial';
    ctx.fillText("救援行动", logicW / 2, logicH * 0.37);

    // 分割线
    ctx.strokeStyle = 'rgba(0,200,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(logicW / 2 - 80, logicH * 0.43);
    ctx.lineTo(logicW / 2 + 80, logicH * 0.43);
    ctx.stroke();

    const unlock = CONFIG.menuUnlock;

    // ---- 按钮1：开始游戏 ----
    let btnY = logicH * 0.50;
    let startLocked = !unlock.startGame;
    let btnPulse = startLocked ? 0.4 : (0.85 + Math.sin(time * 2.5) * 0.15);
    let btnW = 180, btnH = 50;
    let btnX = logicW / 2 - btnW / 2;
    let btnTop = btnY - btnH / 2;

    ctx.save();
    ctx.globalAlpha = btnPulse;
    let btnGrad = ctx.createLinearGradient(btnX, btnTop, btnX, btnTop + btnH);
    if (startLocked) {
        btnGrad.addColorStop(0, 'rgba(60,60,80,0.4)');
        btnGrad.addColorStop(1, 'rgba(30,30,50,0.4)');
    } else {
        btnGrad.addColorStop(0, 'rgba(0,180,220,0.35)');
        btnGrad.addColorStop(1, 'rgba(0,100,160,0.35)');
    }
    ctx.fillStyle = btnGrad;
    ctx.beginPath();
    rrect(ctx, btnX, btnTop, btnW, btnH, 25);
    ctx.fill();
    ctx.strokeStyle = startLocked ? `rgba(80,80,100,0.5)` : `rgba(0,220,255,${btnPulse * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, btnX, btnTop, btnW, btnH, 25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = startLocked ? 'rgba(100,100,120,0.6)' : `rgba(0,240,255,${btnPulse})`;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(startLocked ? "🔒  开始游戏" : "▶  开始游戏", logicW / 2, btnY);

    // ---- 按钮2：章节选择 ----
    let chBtnY = logicH * 0.62;
    let chBtnW = 180, chBtnH = 50;
    let chBtnX = logicW / 2 - chBtnW / 2;
    let chBtnTop = chBtnY - chBtnH / 2;
    let chLocked = !unlock.chapterSelect;

    ctx.save();
    ctx.globalAlpha = chLocked ? 0.3 : 0.75;
    let chGrad = ctx.createLinearGradient(chBtnX, chBtnTop, chBtnX, chBtnTop + chBtnH);
    chGrad.addColorStop(0, chLocked ? 'rgba(40,40,60,0.4)' : 'rgba(0,80,120,0.4)');
    chGrad.addColorStop(1, chLocked ? 'rgba(20,20,40,0.4)' : 'rgba(0,40,80,0.4)');
    ctx.fillStyle = chGrad;
    ctx.beginPath();
    rrect(ctx, chBtnX, chBtnTop, chBtnW, chBtnH, 25);
    ctx.fill();
    ctx.strokeStyle = chLocked ? 'rgba(60,60,80,0.4)' : 'rgba(0,180,220,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, chBtnX, chBtnTop, chBtnW, chBtnH, 25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = chLocked ? 'rgba(80,80,100,0.5)' : 'rgba(100,210,240,0.9)';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(chLocked ? "🔒  章节选择" : "📖  章节选择", logicW / 2, chBtnY);

    // ---- 按钮3：食人鱼竞技场（风格化，危险感）----
    let arenaBtnY = logicH * 0.74;
    let arenaBtnW = 200, arenaBtnH = 50;
    let arenaBtnX = logicW / 2 - arenaBtnW / 2;
    let arenaBtnTop = arenaBtnY - arenaBtnH / 2;
    let arenaLocked = !unlock.fishArena;
    let arenaPulse = arenaLocked ? 0.4 : (0.9 + Math.sin(time * 3.5) * 0.1);
    let arenaGlow = Math.abs(Math.sin(time * 2.0));

    if (!arenaLocked) {
        // 危险感光晕
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        let arenaHalo = ctx.createRadialGradient(logicW / 2, arenaBtnY, 0, logicW / 2, arenaBtnY, 120);
        arenaHalo.addColorStop(0, `rgba(255,60,0,${arenaGlow * 0.15})`);
        arenaHalo.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = arenaHalo;
        ctx.fillRect(logicW / 2 - 120, arenaBtnY - 60, 240, 120);
        ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = arenaPulse;
    let arenaGrad = ctx.createLinearGradient(arenaBtnX, arenaBtnTop, arenaBtnX, arenaBtnTop + arenaBtnH);
    if (arenaLocked) {
        arenaGrad.addColorStop(0, 'rgba(60,60,80,0.4)');
        arenaGrad.addColorStop(1, 'rgba(30,30,50,0.4)');
    } else {
        arenaGrad.addColorStop(0, 'rgba(180,30,0,0.6)');
        arenaGrad.addColorStop(0.5, 'rgba(220,60,0,0.5)');
        arenaGrad.addColorStop(1, 'rgba(120,10,0,0.6)');
    }
    ctx.fillStyle = arenaGrad;
    ctx.beginPath();
    rrect(ctx, arenaBtnX, arenaBtnTop, arenaBtnW, arenaBtnH, 25);
    ctx.fill();
    ctx.strokeStyle = arenaLocked ? 'rgba(80,80,100,0.5)' : `rgba(255,80,20,${arenaPulse * 0.9})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rrect(ctx, arenaBtnX, arenaBtnTop, arenaBtnW, arenaBtnH, 25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = arenaLocked ? 'rgba(100,100,120,0.6)' : `rgba(255,200,150,${arenaPulse})`;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(arenaLocked ? "🔒  食人鱼竞技场" : "🦈  食人鱼竞技场", logicW / 2, arenaBtnY);

    // ---- 按钮4：迷宫纯享版（探索感，绿色调）----
    let mazeBtnY = logicH * 0.86;
    let mazeBtnW = 200, mazeBtnH = 50;
    let mazeBtnX = logicW / 2 - mazeBtnW / 2;
    let mazeBtnTop = mazeBtnY - mazeBtnH / 2;
    let mazeLocked = !unlock.mazeMode;
    let mazePulse = mazeLocked ? 0.4 : (0.85 + Math.sin(time * 2.0 + 1.0) * 0.15);

    ctx.save();
    ctx.globalAlpha = mazePulse;
    let mazeGrad = ctx.createLinearGradient(mazeBtnX, mazeBtnTop, mazeBtnX, mazeBtnTop + mazeBtnH);
    if (mazeLocked) {
        mazeGrad.addColorStop(0, 'rgba(60,60,80,0.4)');
        mazeGrad.addColorStop(1, 'rgba(30,30,50,0.4)');
    } else {
        mazeGrad.addColorStop(0, 'rgba(0,120,80,0.55)');
        mazeGrad.addColorStop(0.5, 'rgba(0,160,100,0.45)');
        mazeGrad.addColorStop(1, 'rgba(0,80,50,0.55)');
    }
    ctx.fillStyle = mazeGrad;
    ctx.beginPath();
    rrect(ctx, mazeBtnX, mazeBtnTop, mazeBtnW, mazeBtnH, 25);
    ctx.fill();
    ctx.strokeStyle = mazeLocked ? 'rgba(80,80,100,0.5)' : `rgba(0,220,140,${mazePulse * 0.9})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, mazeBtnX, mazeBtnTop, mazeBtnW, mazeBtnH, 25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = mazeLocked ? 'rgba(100,100,120,0.6)' : `rgba(100,255,180,${mazePulse})`;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(mazeLocked ? "🔒  迷宫纯享版" : "🧵  迷宫纯享版", logicW / 2, mazeBtnY);

    // 版本号
    ctx.fillStyle = 'rgba(80,120,140,0.8)';
    ctx.font = '11px Arial';
    ctx.fillText("v1.2.0  By 熊子", logicW / 2, logicH - 22);
}


function drawChapterSelect(time) {
    // 背景：深海渐变 + 动态粒子
    let grad = ctx.createLinearGradient(0, 0, 0, logicH);
    grad.addColorStop(0, '#001a33');
    grad.addColorStop(1, '#000811');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, logicW, logicH);

    // 背景气泡
    ctx.save();
    for(let i = 0; i < 12; i++) {
        let bx = logicW * ((i * 0.19 + time * 0.015 * (1 + i % 3 * 0.4)) % 1);
        let by = logicH - (time * (12 + i % 4 * 6) + i * 90) % (logicH + 60);
        let br = 2 + (i % 3) * 2.5;
        ctx.fillStyle = `rgba(80,200,240,0.07)`;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 顶部标题栏
    ctx.fillStyle = 'rgba(0,30,60,0.7)';
    ctx.fillRect(0, 0, logicW, 52);
    ctx.strokeStyle = 'rgba(0,180,220,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 52);
    ctx.lineTo(logicW, 52);
    ctx.stroke();

    // 返回按钮
    ctx.fillStyle = 'rgba(0,180,220,0.8)';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText("← 返回", 18, 26);

    // 标题
    ctx.fillStyle = '#e0f8ff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText("章节选择", logicW / 2, 26);

    // 章节卡片布局（四章，可滚动）
    let cardW = logicW * 0.82;
    let cardH = logicH * 0.22;
    let cardX = (logicW - cardW) / 2;
    let gap = logicH * 0.025;
    let listTop = 58; // 可滚动区域顶部（标题栏下方）
    let listBottom = logicH; // 可滚动区域底部
    let scrollY = state.chapterScrollY || 0;

    // 计算总内容高度，用于限制滚动范围
    let totalContentH = 4 * cardH + 3 * gap + 20; // 20 = bottom padding
    let maxScroll = Math.max(0, totalContentH - (listBottom - listTop - 12));

    // 限制滚动范围
    if(scrollY < 0) { scrollY = 0; state.chapterScrollY = 0; }
    if(scrollY > maxScroll) { scrollY = maxScroll; state.chapterScrollY = maxScroll; }

    let card1Y = listTop + 12 - scrollY;
    let card2Y = card1Y + cardH + gap;
    let card3Y = card2Y + cardH + gap;
    let card4Y = card3Y + cardH + gap;

    // 裁剪到可滚动区域，防止卡片绘制到标题栏上
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, listTop, logicW, listBottom - listTop);
    ctx.clip();

    // ---- 卡片1：固执的熊子 ----
    drawChapterCard(
        cardX, card1Y, cardW, cardH,
        1, "固执的熊子",
        "第一章 · 初次下潜",
        "熊子独自钻进了那道危险的缝隙...",
        time,
        (x, y, w, h, t) => drawChapterImage1(x, y, w, h, t)
    );

    // ---- 卡片2：松动的巨石 ----
    drawChapterCard(
        cardX, card2Y, cardW, cardH,
        2, "松动的巨石",
        "第二章 · 深入救援",
        "带着潘子，再次潜入那片黑暗...",
        time,
        (x, y, w, h, t) => drawChapterImage2(x, y, w, h, t)
    );

    // ---- 卡片3：还要继续吗？ ----
    drawChapterCard(
        cardX, card3Y, cardW, cardH,
        3, "还要继续吗？",
        "第三章 · 孤身深入",
        "亮子独自再次下潜，手电筒却出了问题...",
        time,
        (x, y, w, h, t) => drawChapterImage3(x, y, w, h, t)
    );

    // ---- 卡片4：那是什么！ ----
    drawChapterCard(
        cardX, card4Y, cardW, cardH,
        4, "那是什么！",
        "第四章 · 未知的深渊",
        "黑暗中，有什么东西在靠近...",
        time,
        (x, y, w, h, t) => drawChapterImage4(x, y, w, h, t)
    );

    ctx.restore();

    // 右侧滚动条指示器
    if(maxScroll > 0) {
        let trackX = logicW - 6;
        let trackTop = listTop + 4;
        let trackH = listBottom - listTop - 8;
        let thumbH = Math.max(30, trackH * (trackH / (totalContentH)));
        let thumbY = trackTop + (scrollY / maxScroll) * (trackH - thumbH);
        ctx.save();
        ctx.fillStyle = 'rgba(0,180,220,0.18)';
        ctx.fillRect(trackX - 3, trackTop, 6, trackH);
        ctx.fillStyle = 'rgba(0,200,255,0.55)';
        ctx.fillRect(trackX - 3, thumbY, 6, thumbH);
        ctx.restore();
    }
}

function drawChapterCard(
    x, y, w, h,
    chapter, title, subtitle, desc,
    time,
    drawImg
) {
    // 卡片阴影
    ctx.save();
    ctx.shadowColor = 'rgba(0,150,220,0.25)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(0,20,45,0.85)';
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.restore();

    // 卡片边框（渐变）
    ctx.save();
    let borderGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    borderGrad.addColorStop(0, 'rgba(0,200,255,0.5)');
    borderGrad.addColorStop(0.5, 'rgba(0,120,180,0.3)');
    borderGrad.addColorStop(1, 'rgba(0,200,255,0.5)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 14);
    ctx.stroke();
    ctx.restore();

    // 左侧配图区域
    let imgW = w * 0.42;
    let imgH = h - 20;
    let imgX = x + 10;
    let imgY = y + 10;
    drawImg(imgX, imgY, imgW, imgH, time);

    // 右侧文字区域
    let textX = x + imgW + 22;
    let textY = y + 28;
    let textW = w - imgW - 32;

    // 章节编号标签
    ctx.save();
    let tagGrad = ctx.createLinearGradient(textX, textY - 14, textX + 60, textY - 14);
    tagGrad.addColorStop(0, 'rgba(0,180,220,0.7)');
    tagGrad.addColorStop(1, 'rgba(0,80,140,0.4)');
    ctx.fillStyle = tagGrad;
    ctx.beginPath();
    rrect(ctx, textX, textY - 16, 62, 20, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`第 ${chapter} 章`, textX + 8, textY - 6);
    ctx.restore();

    // 副标题
    ctx.fillStyle = 'rgba(100,200,240,0.7)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(subtitle, textX, textY + 10);

    // 主标题
    ctx.fillStyle = '#e8f8ff';
    ctx.font = `bold ${Math.min(22, textW / title.length * 1.8)}px Arial`;
    ctx.fillText(title, textX, textY + 28);

    // 描述文字
    ctx.fillStyle = 'rgba(160,210,230,0.75)';
    ctx.font = '12px Arial';
    let descLines = wrapTextLines(desc, textW, ctx);
    for(let i = 0; i < descLines.length; i++) {
        ctx.fillText(descLines[i], textX, textY + 60 + i * 18);
    }

    // 开始按钮（未解锁时置灰）
    let btnW2 = Math.min(120, textW - 10);
    let btnH2 = 34;
    let btnX2 = textX;
    let btnY2 = y + h - btnH2 - 14;
    const chapterLocked = !CONFIG.menuUnlock.chapterSelect;
    let btnPulse = chapterLocked ? 0.35 : (0.85 + Math.sin(Date.now() / 400 + chapter) * 0.15);

    ctx.save();
    ctx.globalAlpha = btnPulse;
    let btnGrad2 = ctx.createLinearGradient(btnX2, btnY2, btnX2, btnY2 + btnH2);
    if (chapterLocked) {
        btnGrad2.addColorStop(0, 'rgba(50,50,70,0.5)');
        btnGrad2.addColorStop(1, 'rgba(30,30,50,0.5)');
    } else {
        btnGrad2.addColorStop(0, 'rgba(0,180,220,0.5)');
        btnGrad2.addColorStop(1, 'rgba(0,80,140,0.5)');
    }
    ctx.fillStyle = btnGrad2;
    ctx.beginPath();
    rrect(ctx, btnX2, btnY2, btnW2, btnH2, 17);
    ctx.fill();
    ctx.strokeStyle = chapterLocked ? `rgba(70,70,90,0.5)` : `rgba(0,220,255,${btnPulse * 0.9})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    rrect(ctx, btnX2, btnY2, btnW2, btnH2, 17);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = chapterLocked ? 'rgba(80,80,100,0.5)' : `rgba(0,240,255,${btnPulse})`;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(chapterLocked ? "🔒  进入章节" : "▶  进入章节", btnX2 + 14, btnY2 + btnH2 / 2);

    // 未解锁时在卡片上叠加半透明遮罩
    if (chapterLocked) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        rrect(ctx, x, y, w, h, 14);
        ctx.fill();
        ctx.restore();
    }
}

