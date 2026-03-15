import { CONFIG } from '../core/config';
import { state, player, target, touches } from '../core/state';
import { ctx, canvas } from './Canvas';
import { drawDiver, drawLungs, drawDiverSilhouette } from './RenderDiver';
import { createFishEnemy } from '../logic/FishEnemy';

// 调试按钮：生成凶猛鱼（右上角，与其他调试信息分开放）
export const DEBUG_FISH_BTN = {
    get x() { return CONFIG.screenWidth - this.w - 10; },
    y: 10,
    w: 110,
    h: 36,
};
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

        // 凶猛鱼调试按钮（右上角，独立于坐标信息框）
        drawDebugFishButton();
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

function drawChapterSelect(time) {
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

    // 章节卡片布局（四章，可滚动）
    let cardW = canvas.width * 0.82;
    let cardH = canvas.height * 0.22;
    let cardX = (canvas.width - cardW) / 2;
    let gap = canvas.height * 0.025;
    let listTop = 58; // 可滚动区域顶部（标题栏下方）
    let listBottom = canvas.height; // 可滚动区域底部
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
    ctx.rect(0, listTop, canvas.width, listBottom - listTop);
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
        let trackX = canvas.width - 6;
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

function endingGetAlpha(t, start, end) {
    let local = t - start;
    let dur = end - start;
    if(local < 60) return local/60;
    if(local > dur-60) return (dur-local)/60;
    return 1;
}

function drawEnding() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let timer = state.endingTimer || 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // 第三关：熊子死亡结局
    if(state.story.flags.bearDied) {
        drawBearDiedEnding(timer);
        return;
    }

    // 第二关结局：第二三关衔接分页剧情
    if(state.story.flags.stage2Ending) {
        drawStage2to3Ending(timer);
        return;
    }

    // 旧结局（保留兜底）
    if(timer < 240) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,0,240)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "小潘把一个密闭的洞穴气室\n误当成了出口，\n最终在搅动的泥沙中彻底迷失方向，\n丧生在了黑暗之中。", canvas.width/2, canvas.height/2, 30);
    } else if(timer < 480) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,240,480)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "为了不让更多的人\n丧生在恐怖的雅各布井，\n当地政府最终彻底封闭了雅各布井。", canvas.width/2, canvas.height/2, 30);
    } else if(timer < 720) {
        let alpha = endingGetAlpha(timer, 480, 720);
        ctx.save(); ctx.globalAlpha = alpha;
        drawDiverSilhouette(ctx, canvas.width/2-60, canvas.height/2, '#555');
        drawDiverSilhouette(ctx, canvas.width/2+60, canvas.height/2+20, '#555', true);
        ctx.fillStyle = '#f00'; ctx.font = '16px Arial';
        ctx.fillText("(小熊)", canvas.width/2-60, canvas.height/2-50);
        ctx.fillText("(小潘)", canvas.width/2+60, canvas.height/2-40);
        ctx.fillStyle = '#333'; ctx.fillRect(canvas.width/2+80, canvas.height/2+30, 20, 10);
        ctx.restore();
    } else if(timer < 960) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,720,960)})`;
        ctx.font = '24px Arial'; ctx.fillText("感谢您的体验", canvas.width/2, canvas.height/2);
    } else if(timer < 1200) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,960,1200)})`;
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

// 第二关结局：第二三关衔接分页剧情
function drawStage2to3Ending(timer) {
    // 第1页 (0-300): 小潘在慌乱中迷失方向
    if(timer < 300) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,0,300)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "小潘在慌乱中迷失方向，\n错把一条向上的死路\n当成是上岸的路。", canvas.width/2, canvas.height/2, 32);
    }
    // 第2页 (300-600): 好在小潘及时醒悟
    else if(timer < 600) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,300,600)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "好在小潘及时醒悟过来，\n跟着亮子逃脱了\n迷宫般的洞穴。", canvas.width/2, canvas.height/2, 32);
    }
    // 第3页 (600-900): 亮子劫后余生，但来不及高兴
    else if(timer < 900) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,600,900)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "亮子刚刚劫后余生，\n但来不及高兴，\n因为距离熊子消失在那大裂缝中，\n已经过去了半小时。", canvas.width/2, canvas.height/2, 32);
    }
    // 第4页 (900-1200): 入水动画 + 亮子再次出发
    else if(timer < 1200) {
        let alpha = endingGetAlpha(timer, 900, 1200);
        let t = timer - 900;
        ctx.save();
        ctx.globalAlpha = alpha;

        // 水面背景
        let waterGrad = ctx.createLinearGradient(0, canvas.height*0.4, 0, canvas.height);
        waterGrad.addColorStop(0, '#001a33');
        waterGrad.addColorStop(1, '#000811');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(0, canvas.height*0.4, canvas.width, canvas.height*0.6);

        // 水面波纹
        ctx.strokeStyle = 'rgba(100,220,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(let wx = 0; wx < canvas.width; wx += 8) {
            ctx.lineTo(wx, canvas.height*0.4 + Math.sin(wx/40 + t*0.05)*4);
        }
        ctx.stroke();

        // 入水动画：潜水员从上方落入水中
        let diverY = canvas.height*0.3 + Math.min(t * 0.8, canvas.height*0.25);
        let splashAlpha = Math.max(0, 1 - t/60);
        if(t > 30) {
            // 水花
            ctx.fillStyle = `rgba(150,220,255,${splashAlpha})`;
            for(let i = 0; i < 8; i++) {
                let angle = (i / 8) * Math.PI * 2;
                let r = 20 + (t-30) * 0.5;
                ctx.beginPath();
                ctx.arc(canvas.width/2 + Math.cos(angle)*r, canvas.height*0.4 + Math.sin(angle)*r*0.3, 3, 0, Math.PI*2);
                ctx.fill();
            }
        }
        drawDiverSilhouette(ctx, canvas.width/2, diverY, '#4af');
        ctx.restore();

        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = 'bold 20px Arial';
        ctx.fillText("亮子不敢再多想，", canvas.width/2, canvas.height*0.15);
        ctx.font = '18px Arial';
        ctx.fillText("简单调整后，再次出发！", canvas.width/2, canvas.height*0.22);
    }
    // 第5页 (1200+): 点击进入第三关
    else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = 'bold 22px Arial';
        ctx.fillText("第三章", canvas.width/2, canvas.height/2 - 30);
        ctx.font = '18px Arial';
        ctx.fillText("黑暗中的独行", canvas.width/2, canvas.height/2 + 10);
        if(t > 90) {
            ctx.fillStyle = `rgba(0,220,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial';
            ctx.fillText("点击屏幕继续", canvas.width/2, canvas.height - 50);
        }
    }
}

// 第三关：熊子死亡结局
function drawBearDiedEnding(timer) {
    // 第1页 (0-300): 黑暗中的独白
    if(timer < 300) {
        ctx.fillStyle = `rgba(180,180,180,${endingGetAlpha(timer,0,300)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "亮子最终没能找到熊子。", canvas.width/2, canvas.height/2, 32);
    }
    // 第2页 (300-600): 熊子的结局
    else if(timer < 600) {
        ctx.fillStyle = `rgba(200,200,200,${endingGetAlpha(timer,300,600)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "熊子独自困在那道大裂缝中，\n氧气耗尽，\n永远留在了雅各布井的黑暗里。", canvas.width/2, canvas.height/2, 32);
    }
    // 第3页 (600-900): 剪影
    else if(timer < 900) {
        let alpha = endingGetAlpha(timer, 600, 900);
        ctx.save();
        ctx.globalAlpha = alpha;
        // 黑暗背景中的孤独剪影
        let darkGrad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, 200);
        darkGrad.addColorStop(0, 'rgba(20,30,40,1)');
        darkGrad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = darkGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // 熊子剪影（静止，朝下）
        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.rotate(Math.PI/2);
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(-10, -3, 6, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#f44';
        ctx.font = '14px Arial';
        ctx.fillText("（熊子）", canvas.width/2, canvas.height/2 - 60);
        ctx.restore();
    }
    // 第4页 (900-1200): 结语
    else if(timer < 1200) {
        ctx.fillStyle = `rgba(200,200,200,${endingGetAlpha(timer,900,1200)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "为了不让更多的人\n丧生在恐怖的雅各布井，\n当地政府最终彻底封闭了雅各布井。", canvas.width/2, canvas.height/2, 32);
    }
    // 第5页 (1200+): 返回主菜单
    else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(180,180,180,${alpha})`;
        ctx.font = '20px Arial';
        ctx.fillText("感谢您的体验", canvas.width/2, canvas.height/2 - 20);
        if(t > 90) {
            ctx.fillStyle = `rgba(255,255,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial';
            ctx.fillText("点击屏幕返回主菜单", canvas.width/2, canvas.height - 50);
        }
    }
}

function wrapText(renderCtx, text, x, y, lineHeight) {
    let lines = text.split('\n');
    let startY = y - (lines.length-1)*lineHeight/2;
    for(let i=0; i<lines.length; i++) renderCtx.fillText(lines[i], x, startY + i*lineHeight);
}

// =============================================
// 绘制凶猛鱼调试按钮（右上角，仅调试模式下显示）
// =============================================
function drawDebugFishButton() {
    if (state.screen !== 'play') return;

    const btnW = DEBUG_FISH_BTN.w;
    const btnH = DEBUG_FISH_BTN.h;
    const btnX = DEBUG_FISH_BTN.x;
    const btnY = DEBUG_FISH_BTN.y;

    const fishCount = state.fishEnemies ? state.fishEnemies.length : 0;
    const pulse = 0.85 + Math.sin(Date.now() / 400) * 0.15;

    ctx.save();

    // 按钮背景
    ctx.globalAlpha = pulse;
    ctx.fillStyle = 'rgba(120, 20, 20, 0.85)';
    ctx.beginPath();
    rrect(ctx, btnX, btnY, btnW, btnH, 8);
    ctx.fill();

    // 按钮边框
    ctx.strokeStyle = `rgba(220, 60, 60, ${pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, btnX, btnY, btnW, btnH, 8);
    ctx.stroke();

    ctx.globalAlpha = 1;

    // 按钮文字
    ctx.fillStyle = '#ff9999';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🦈 生成凶猛鱼`, btnX + btnW / 2, btnY + btnH / 2 - 5);

    // 当前数量提示
    ctx.fillStyle = 'rgba(255, 180, 180, 0.8)';
    ctx.font = '10px Arial';
    ctx.fillText(`当前: ${fishCount} 条`, btnX + btnW / 2, btnY + btnH / 2 + 9);

    ctx.restore();
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
