import { CONFIG } from '../core/config';
import { state, player, target, touches } from '../core/state';
import { ctx, canvas } from './Canvas';
import { drawDiver, drawLungs, drawDiverSilhouette } from './RenderDiver';

// 兼容微信小游戏的圆角矩形（手动绘制，避免roundRect兼容性问题）
function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

export function drawUI(){
    ctx.fillStyle = 'rgba(0, 10, 15, 0.8)';
    ctx.fillRect(10, 10, 160, 200); 
    ctx.strokeStyle = '#445';
    ctx.strokeRect(10, 10, 160, 200);
    ctx.fillStyle = '#0ff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('潜水电脑', 20, 30);
    ctx.font = '12px Arial';
    ctx.fillText('深度: ' + Math.floor(player.y / CONFIG.tileSize) + 'm', 20, 50);

    if(!state.story.flags.tankDamaged) {
        ctx.fillStyle = '#8cf'; ctx.font = '12px Arial'; ctx.fillText('O2', 20, 70);
        ctx.fillStyle = '#222'; ctx.fillRect(50, 60, 100, 10);
        ctx.fillStyle = '#0f0'; ctx.fillRect(50, 60, Math.max(0, player.o2), 10);
    } else {
        ctx.fillStyle = '#f00'; ctx.font = 'bold 12px Arial'; ctx.fillText('氧气瓶已损毁', 20, 70);
        drawLungs(ctx, canvas.width/2, canvas.height/2 + 100, player.o2);
    }

    // 小地图 & 调试信息（仅调试模式）
    if(CONFIG.debug) {
        // 小地图
        if(state.explored && state.explored.length > 0) {
            let mapSize=140, mapX=20, mapY=60;
            ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(mapX,mapY,mapSize,mapSize);
            ctx.strokeStyle='#445'; ctx.strokeRect(mapX,mapY,mapSize,mapSize);
            let scaleX=mapSize/CONFIG.cols, scaleY=mapSize/CONFIG.rows;
            for(let r=0;r<CONFIG.rows;r++) {
                for(let c=0;c<CONFIG.cols;c++) {
                    if(state.explored[r]&&state.explored[r][c]) {
                        ctx.fillStyle = state.map[r][c] ? '#555' : 'rgba(50,100,150,0.5)';
                        ctx.fillRect(mapX+c*scaleX, mapY+r*scaleY, scaleX, scaleY);
                    }
                }
            }
            ctx.fillStyle='#0f0';
            ctx.beginPath(); ctx.arc(mapX+(player.x/CONFIG.tileSize)*scaleX, mapY+(player.y/CONFIG.tileSize)*scaleY, 2, 0, Math.PI*2); ctx.fill();
            let tr=Math.floor(target.y/CONFIG.tileSize), tc=Math.floor(target.x/CONFIG.tileSize);
            if(target.found||(state.explored[tr]&&state.explored[tr][tc])) {
                ctx.fillStyle='#f0f';
                ctx.beginPath(); ctx.arc(mapX+(target.x/CONFIG.tileSize)*scaleX, mapY+(target.y/CONFIG.tileSize)*scaleY, 2, 0, Math.PI*2); ctx.fill();
            }
        }

        // 实时位置信息
        let col = Math.floor(player.x / CONFIG.tileSize);
        let row = Math.floor(player.y / CONFIG.tileSize);
        let px = Math.floor(player.x);
        let py = Math.floor(player.y);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(canvas.width - 210, 80, 200, 52);
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvas.width - 210, 80, 200, 52);
        ctx.fillStyle = '#0ff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`tile: col=${col}, row=${row}`, canvas.width - 200, 90);
        ctx.fillText(`pixel: x=${px}, y=${py}`, canvas.width - 200, 110);
        ctx.restore();
    }

    // 剧情文字显示
    if(state.alertMsg) {
        ctx.fillStyle = state.alertColor;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        let maxWidth = canvas.width * 0.8;
        let words = state.alertMsg.split('');
        let line = '', lines: string[] = [];
        for(let n=0; n<words.length; n++) {
            let testLine = line + words[n];
            if (ctx.measureText(testLine).width > maxWidth && n > 0) {
                lines.push(line); line = words[n];
            } else { line = testLine; }
        }
        lines.push(line);
        let startY = canvas.height/3;
        for(let i=0; i<lines.length; i++) ctx.fillText(lines[i], canvas.width/2, startY + i*30);
    }

    if(state.screen === 'ending') {
        drawEnding();
    } else if(state.screen === 'lose') {
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = '#f00'; ctx.font = '30px Arial'; ctx.textAlign = 'center';
        ctx.fillText('任务失败', canvas.width/2, canvas.height/2 - 20);
        ctx.fillStyle = '#fff'; ctx.font = '20px Arial';
        ctx.fillText(state.alertMsg, canvas.width/2, canvas.height/2 + 20);
        ctx.fillText('点击屏幕返回主菜单', canvas.width/2, canvas.height/2 + 60);
    } else if(state.screen === 'menu') {
        drawMenu();
    }
}


// ---- 章节配图绘制 ----
function drawChapterImage1(x: number, y: number, w: number, h: number, time: number) {
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

function drawChapterImage2(x: number, y: number, w: number, h: number, time: number) {
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

export function drawMenu() {
    let time = Date.now() / 1000;

    if(state.menuScreen === 'chapter') {
        drawChapterSelect(time);
        return;
    }

    // ---- 主菜单 ----
    // 背景：深海渐变
    let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#001a33');
    grad.addColorStop(0.5, '#001122');
    grad.addColorStop(1, '#000811');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 动态气泡背景
    ctx.save();
    for(let i = 0; i < 18; i++) {
        let bx = canvas.width * ((i * 0.137 + time * 0.02 * (1 + i % 3 * 0.3)) % 1);
        let by = canvas.height - (time * (15 + i % 5 * 5) + i * 80) % (canvas.height + 60);
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
        let rx = canvas.width / 2 + Math.sin(time * 0.4 + i * 1.6) * 120;
        let rg = ctx.createLinearGradient(rx, 0, rx, canvas.height);
        rg.addColorStop(0, 'rgba(0,200,255,0.12)');
        rg.addColorStop(0.6, 'rgba(0,200,255,0.04)');
        rg.addColorStop(1, 'rgba(0,200,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(rx - 30, 0);
        ctx.lineTo(rx + 30, 0);
        ctx.lineTo(rx + 80, canvas.height);
        ctx.lineTo(rx - 80, canvas.height);
        ctx.fill();
    }
    ctx.restore();

    // 水面波纹（顶部）
    ctx.strokeStyle = 'rgba(100,220,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let wx2 = 0; wx2 < canvas.width; wx2 += 10) {
        ctx.lineTo(wx2, 18 + Math.sin(wx2 / 60 + time * 1.5) * 5);
    }
    ctx.stroke();

    // 标题
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 标题光晕
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    let titleGlow = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.28, 0, canvas.width / 2, canvas.height * 0.28, 120);
    titleGlow.addColorStop(0, 'rgba(0,200,255,0.2)');
    titleGlow.addColorStop(1, 'rgba(0,200,255,0)');
    ctx.fillStyle = titleGlow;
    ctx.fillRect(canvas.width / 2 - 120, canvas.height * 0.18, 240, 120);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,200,255,0.15)';
    ctx.font = 'bold 40px Arial';
    ctx.fillText("雅各布井", canvas.width / 2 + 2, canvas.height * 0.27 + 2);
    ctx.fillStyle = '#e0f8ff';
    ctx.font = 'bold 40px Arial';
    ctx.fillText("雅各布井", canvas.width / 2, canvas.height * 0.27);

    ctx.fillStyle = 'rgba(0,180,220,0.15)';
    ctx.font = 'bold 28px Arial';
    ctx.fillText("救援行动", canvas.width / 2 + 1, canvas.height * 0.37 + 1);
    ctx.fillStyle = '#a0d8ef';
    ctx.font = 'bold 28px Arial';
    ctx.fillText("救援行动", canvas.width / 2, canvas.height * 0.37);

    // 分割线
    ctx.strokeStyle = 'rgba(0,200,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 80, canvas.height * 0.43);
    ctx.lineTo(canvas.width / 2 + 80, canvas.height * 0.43);
    ctx.stroke();

    // 开始游戏按钮
    let btnY = canvas.height * 0.56;
    let btnPulse = 0.85 + Math.sin(time * 2.5) * 0.15;
    let btnW = 180, btnH = 50;
    let btnX = canvas.width / 2 - btnW / 2;
    let btnTop = btnY - btnH / 2;

    // 按钮背景
    ctx.save();
    ctx.globalAlpha = btnPulse;
    let btnGrad = ctx.createLinearGradient(btnX, btnTop, btnX, btnTop + btnH);
    btnGrad.addColorStop(0, 'rgba(0,180,220,0.35)');
    btnGrad.addColorStop(1, 'rgba(0,100,160,0.35)');
    ctx.fillStyle = btnGrad;
    ctx.beginPath();
    rrect(ctx, btnX, btnTop, btnW, btnH, 25);
    ctx.fill();
    ctx.strokeStyle = `rgba(0,220,255,${btnPulse * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, btnX, btnTop, btnW, btnH, 25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = `rgba(0,240,255,${btnPulse})`;
    ctx.font = 'bold 22px Arial';
    ctx.fillText("▶  开始游戏", canvas.width / 2, btnY);

    // 章节选择按钮
    let chBtnY = canvas.height * 0.7;
    let chBtnW = 160, chBtnH = 44;
    let chBtnX = canvas.width / 2 - chBtnW / 2;
    let chBtnTop = chBtnY - chBtnH / 2;

    ctx.save();
    ctx.globalAlpha = 0.75;
    let chGrad = ctx.createLinearGradient(chBtnX, chBtnTop, chBtnX, chBtnTop + chBtnH);
    chGrad.addColorStop(0, 'rgba(0,80,120,0.4)');
    chGrad.addColorStop(1, 'rgba(0,40,80,0.4)');
    ctx.fillStyle = chGrad;
    ctx.beginPath();
    rrect(ctx, chBtnX, chBtnTop, chBtnW, chBtnH, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,180,220,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, chBtnX, chBtnTop, chBtnW, chBtnH, 22);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(100,210,240,0.9)';
    ctx.font = '18px Arial';
    ctx.fillText("📖  章节选择", canvas.width / 2, chBtnY);

    // 版本号
    ctx.fillStyle = 'rgba(80,120,140,0.8)';
    ctx.font = '11px Arial';
    ctx.fillText("v1.2.0  By 熊子", canvas.width / 2, canvas.height - 22);
}

function drawChapterSelect(time: number) {
    // 背景：深海渐变 + 动态粒子
    let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#001a33');
    grad.addColorStop(1, '#000811');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 背景气泡
    ctx.save();
    for(let i = 0; i < 12; i++) {
        let bx = canvas.width * ((i * 0.19 + time * 0.015 * (1 + i % 3 * 0.4)) % 1);
        let by = canvas.height - (time * (12 + i % 4 * 6) + i * 90) % (canvas.height + 60);
        let br = 2 + (i % 3) * 2.5;
        ctx.fillStyle = `rgba(80,200,240,0.07)`;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 顶部标题栏
    ctx.fillStyle = 'rgba(0,30,60,0.7)';
    ctx.fillRect(0, 0, canvas.width, 52);
    ctx.strokeStyle = 'rgba(0,180,220,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 52);
    ctx.lineTo(canvas.width, 52);
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
    ctx.fillText("章节选择", canvas.width / 2, 26);

    // 章节卡片布局
    let cardW = canvas.width * 0.82;
    let cardH = canvas.height * 0.33;
    let cardX = (canvas.width - cardW) / 2;
    let gap = canvas.height * 0.04;
    let card1Y = 70;
    let card2Y = card1Y + cardH + gap;

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
}

function drawChapterCard(
    x: number, y: number, w: number, h: number,
    chapter: number, title: string, subtitle: string, desc: string,
    time: number,
    drawImg: (x: number, y: number, w: number, h: number, t: number) => void
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

    // 开始按钮
    let btnW2 = Math.min(120, textW - 10);
    let btnH2 = 34;
    let btnX2 = textX;
    let btnY2 = y + h - btnH2 - 14;
    let btnPulse = 0.85 + Math.sin(Date.now() / 400 + chapter) * 0.15;

    ctx.save();
    ctx.globalAlpha = btnPulse;
    let btnGrad2 = ctx.createLinearGradient(btnX2, btnY2, btnX2, btnY2 + btnH2);
    btnGrad2.addColorStop(0, 'rgba(0,180,220,0.5)');
    btnGrad2.addColorStop(1, 'rgba(0,80,140,0.5)');
    ctx.fillStyle = btnGrad2;
    ctx.beginPath();
    rrect(ctx, btnX2, btnY2, btnW2, btnH2, 17);
    ctx.fill();
    ctx.strokeStyle = `rgba(0,220,255,${btnPulse * 0.9})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    rrect(ctx, btnX2, btnY2, btnW2, btnH2, 17);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = `rgba(0,240,255,${btnPulse})`;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText("▶  进入章节", btnX2 + 14, btnY2 + btnH2 / 2);
}

function wrapTextLines(text: string, maxWidth: number, renderCtx: CanvasRenderingContext2D): string[] {
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

function drawEnding() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let timer = state.endingTimer || 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    function getAlpha(t: number, start: number, end: number): number {
        let local = t - start;
        let dur = end - start;
        if(local < 60) return local/60;
        if(local > dur-60) return (dur-local)/60;
        return 1;
    }

    if(timer < 240) {
        ctx.fillStyle = `rgba(255,255,255,${getAlpha(timer,0,240)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "小潘把一个密闭的洞穴气室\n误当成了出口，\n最终在搅动的泥沙中彻底迷失方向，\n丧生在了黑暗之中。", canvas.width/2, canvas.height/2, 30);
    } else if(timer < 480) {
        ctx.fillStyle = `rgba(255,255,255,${getAlpha(timer,240,480)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "为了不让更多的人\n丧生在恐怖的雅各布井，\n当地政府最终彻底封闭了雅各布井。", canvas.width/2, canvas.height/2, 30);
    } else if(timer < 720) {
        let alpha = getAlpha(timer, 480, 720);
        ctx.save(); ctx.globalAlpha = alpha;
        drawDiverSilhouette(ctx, canvas.width/2-60, canvas.height/2, '#555');
        drawDiverSilhouette(ctx, canvas.width/2+60, canvas.height/2+20, '#555', true);
        ctx.fillStyle = '#f00'; ctx.font = '16px Arial';
        ctx.fillText("(小熊)", canvas.width/2-60, canvas.height/2-50);
        ctx.fillText("(小潘)", canvas.width/2+60, canvas.height/2-40);
        ctx.fillStyle = '#333'; ctx.fillRect(canvas.width/2+80, canvas.height/2+30, 20, 10);
        ctx.restore();
    } else if(timer < 960) {
        ctx.fillStyle = `rgba(255,255,255,${getAlpha(timer,720,960)})`;
        ctx.font = '24px Arial'; ctx.fillText("感谢您的体验", canvas.width/2, canvas.height/2);
    } else if(timer < 1200) {
        ctx.fillStyle = `rgba(255,255,255,${getAlpha(timer,960,1200)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "当前版本持续优化中\n前往未知的深渊\n与带熊子潘子回家的故事\n未来有时间会完善。", canvas.width/2, canvas.height/2, 30);
    } else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = '20px Arial'; ctx.fillText("制作人员", canvas.width/2, canvas.height/2-40);
        ctx.font = '16px Arial'; ctx.fillText("小熊和他的小伙伴们", canvas.width/2, canvas.height/2);
        if(t > 120) {
            ctx.fillStyle = `rgba(255,255,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial'; ctx.fillText("点击屏幕重新开始", canvas.width/2, canvas.height-50);
        }
    }
}

function wrapText(renderCtx: CanvasRenderingContext2D, text: string, x: number, y: number, lineHeight: number) {
    let lines = text.split('\n');
    let startY = y - (lines.length-1)*lineHeight/2;
    for(let i=0; i<lines.length; i++) renderCtx.fillText(lines[i], x, startY + i*lineHeight);
}

export function drawControls() {
    if(state.screen !== 'play') return;
    if(touches.joystickId !== null) {
        ctx.beginPath(); ctx.arc(touches.start.x, touches.start.y, 40, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(touches.curr.x, touches.curr.y, 20, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(touches.start.x, touches.start.y); ctx.lineTo(touches.curr.x, touches.curr.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'center'; ctx.font = '14px Arial';
        ctx.fillText('按住屏幕任意位置移动', canvas.width/2, canvas.height-50);
    }
}
