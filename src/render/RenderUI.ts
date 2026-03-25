import { CONFIG } from '../core/config';
import { state, player, target, touches } from '../core/state';
import { ctx, canvas, logicW, logicH } from './Canvas';
import { drawDiver, drawLungs, drawDiverSilhouette } from './RenderDiver';
import { createFishEnemy } from '../logic/FishEnemy';
import { triggerPlayerAttack } from '../logic/FishEnemy';

// 调试按鈕：生成凶猛鱼（右上角，与其他调试信息分开放）
export const DEBUG_FISH_BTN = {
    get x() { return CONFIG.screenWidth - this.w - 10; },
    y: 10,
    w: 110,
    h: 36,
};

// 攻击按鈕区域（右下角）
export const ATTACK_BTN = {
    get x() { return CONFIG.screenWidth * CONFIG.attack.btnXRatio; },
    get y() { return CONFIG.screenHeight * CONFIG.attack.btnYRatio; },
    get r() { return CONFIG.attack.btnRadius; },
};

// 手电筒开关按钮（屏幕顶部右侧）
export const FLASHLIGHT_BTN = {
    get x() { return CONFIG.screenWidth * 0.88; },
    get y() { return CONFIG.screenHeight * 0.17; },
    r: 28,
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
        drawLungs(ctx, logicW/2, logicH/2 + 100, player.o2);
    }

    // 小地图 & 调试信息（仅调试模式）
    if(CONFIG.debug) {
        const isMazeMode = state.screen === 'mazeRescue';
        // 小地图
        if(!isMazeMode && state.explored && state.explored.length > 0) {
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
        ctx.fillRect(logicW - 210, 80, 200, 52);
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(logicW - 210, 80, 200, 52);
        ctx.fillStyle = '#0ff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`tile: col=${col}, row=${row}`, logicW - 200, 90);
        ctx.fillText(`pixel: x=${px}, y=${py}`, logicW - 200, 110);
        ctx.restore();

        // 凶猛鱼调试按钮（右上角，独立于坐标信息框）
        drawDebugFishButton();
    }

    // 剧情文字显示
    if(state.alertMsg) {
        ctx.fillStyle = state.alertColor;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        let maxWidth = logicW * 0.8;
        let words = state.alertMsg.split('');
        let line = '', lines: string[] = [];
        for(let n=0; n<words.length; n++) {
            let testLine = line + words[n];
            if (ctx.measureText(testLine).width > maxWidth && n > 0) {
                lines.push(line); line = words[n];
            } else { line = testLine; }
        }
        lines.push(line);
        let startY = logicH/3;
        for(let i=0; i<lines.length; i++) ctx.fillText(lines[i], logicW/2, startY + i*30);
    }

    if(state.screen === 'ending') {
        drawEnding();
    } else if(state.screen === 'lose') {
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,logicW,logicH);
        ctx.fillStyle = '#f00'; ctx.font = '30px Arial'; ctx.textAlign = 'center';
        ctx.fillText('任务失败', logicW/2, logicH/2 - 20);
        ctx.fillStyle = '#fff'; ctx.font = '20px Arial';
        ctx.fillText(state.alertMsg, logicW/2, logicH/2 + 20);
        ctx.fillText('点击屏幕返回主菜单', logicW/2, logicH/2 + 60);
    } else if(state.screen === 'menu') {
        drawMenu();
    } else if(state.screen === 'fishArena') {
        drawArenaHUD();
    } else if(state.screen === 'mazeRescue') {
        drawMazeHUD();
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

    const isArenaMode = CONFIG.fishArenaMode;

    // 开始游戏按钮（arenaMode 时置灰）
    let btnY = logicH * 0.50;
    let btnPulse = isArenaMode ? 0.4 : (0.85 + Math.sin(time * 2.5) * 0.15);
    let btnW = 180, btnH = 50;
    let btnX = logicW / 2 - btnW / 2;
    let btnTop = btnY - btnH / 2;

    ctx.save();
    ctx.globalAlpha = btnPulse;
    let btnGrad = ctx.createLinearGradient(btnX, btnTop, btnX, btnTop + btnH);
    if (isArenaMode) {
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
    ctx.strokeStyle = isArenaMode ? `rgba(80,80,100,0.5)` : `rgba(0,220,255,${btnPulse * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, btnX, btnTop, btnW, btnH, 25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = isArenaMode ? 'rgba(100,100,120,0.6)' : `rgba(0,240,255,${btnPulse})`;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(isArenaMode ? "🔒  开始游戏" : "▶  开始游戏", logicW / 2, btnY);

    // 食人鱼纯享版按钮（风格化，危险感）
    let arenaBtnY = logicH * 0.62;
    let arenaBtnW = 200, arenaBtnH = 50;
    let arenaBtnX = logicW / 2 - arenaBtnW / 2;
    let arenaBtnTop = arenaBtnY - arenaBtnH / 2;
    let arenaPulse = 0.9 + Math.sin(time * 3.5) * 0.1;
    let arenaGlow = Math.abs(Math.sin(time * 2.0));

    // 危险感光晕
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    let arenaHalo = ctx.createRadialGradient(logicW / 2, arenaBtnY, 0, logicW / 2, arenaBtnY, 120);
    arenaHalo.addColorStop(0, `rgba(255,60,0,${arenaGlow * 0.15})`);
    arenaHalo.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = arenaHalo;
    ctx.fillRect(logicW / 2 - 120, arenaBtnY - 60, 240, 120);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = arenaPulse;
    let arenaGrad = ctx.createLinearGradient(arenaBtnX, arenaBtnTop, arenaBtnX, arenaBtnTop + arenaBtnH);
    arenaGrad.addColorStop(0, 'rgba(180,30,0,0.6)');
    arenaGrad.addColorStop(0.5, 'rgba(220,60,0,0.5)');
    arenaGrad.addColorStop(1, 'rgba(120,10,0,0.6)');
    ctx.fillStyle = arenaGrad;
    ctx.beginPath();
    rrect(ctx, arenaBtnX, arenaBtnTop, arenaBtnW, arenaBtnH, 25);
    ctx.fill();
    // 边框：血红色流光
    ctx.strokeStyle = `rgba(255,80,20,${arenaPulse * 0.9})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rrect(ctx, arenaBtnX, arenaBtnTop, arenaBtnW, arenaBtnH, 25);
    ctx.stroke();
    ctx.restore();

    // 按钮文字（带鱼牙图标感）
    ctx.fillStyle = `rgba(255,200,150,${arenaPulse})`;
    ctx.font = 'bold 18px Arial';
    ctx.fillText("🦈  食人鱼纯享版", logicW / 2, arenaBtnY);

    // 迷宫引导绳按钮（探索感，绿色调）
    let mazeBtnY = logicH * 0.74;
    let mazeBtnW = 200, mazeBtnH = 50;
    let mazeBtnX = logicW / 2 - mazeBtnW / 2;
    let mazeBtnTop = mazeBtnY - mazeBtnH / 2;
    let mazePulse = 0.85 + Math.sin(time * 2.0 + 1.0) * 0.15;

    ctx.save();
    ctx.globalAlpha = mazePulse;
    let mazeGrad = ctx.createLinearGradient(mazeBtnX, mazeBtnTop, mazeBtnX, mazeBtnTop + mazeBtnH);
    mazeGrad.addColorStop(0, 'rgba(0,120,80,0.55)');
    mazeGrad.addColorStop(0.5, 'rgba(0,160,100,0.45)');
    mazeGrad.addColorStop(1, 'rgba(0,80,50,0.55)');
    ctx.fillStyle = mazeGrad;
    ctx.beginPath();
    rrect(ctx, mazeBtnX, mazeBtnTop, mazeBtnW, mazeBtnH, 25);
    ctx.fill();
    ctx.strokeStyle = `rgba(0,220,140,${mazePulse * 0.9})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, mazeBtnX, mazeBtnTop, mazeBtnW, mazeBtnH, 25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = `rgba(100,255,180,${mazePulse})`;
    ctx.font = 'bold 18px Arial';
    ctx.fillText("🧵  迷宫引导绳", logicW / 2, mazeBtnY);

    // 章节选择按钮（arenaMode 时置灰）
    let chBtnY = logicH * 0.86;
    let chBtnW = 160, chBtnH = 44;
    let chBtnX = logicW / 2 - chBtnW / 2;
    let chBtnTop = chBtnY - chBtnH / 2;

    ctx.save();
    ctx.globalAlpha = isArenaMode ? 0.3 : 0.75;
    let chGrad = ctx.createLinearGradient(chBtnX, chBtnTop, chBtnX, chBtnTop + chBtnH);
    chGrad.addColorStop(0, isArenaMode ? 'rgba(40,40,60,0.4)' : 'rgba(0,80,120,0.4)');
    chGrad.addColorStop(1, isArenaMode ? 'rgba(20,20,40,0.4)' : 'rgba(0,40,80,0.4)');
    ctx.fillStyle = chGrad;
    ctx.beginPath();
    rrect(ctx, chBtnX, chBtnTop, chBtnW, chBtnH, 22);
    ctx.fill();
    ctx.strokeStyle = isArenaMode ? 'rgba(60,60,80,0.4)' : 'rgba(0,180,220,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, chBtnX, chBtnTop, chBtnW, chBtnH, 22);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = isArenaMode ? 'rgba(80,80,100,0.5)' : 'rgba(100,210,240,0.9)';
    ctx.font = '18px Arial';
    ctx.fillText(isArenaMode ? "🔒  章节选择" : "📖  章节选择", logicW / 2, chBtnY);

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

    // 开始按钮（fishArenaMode 时置灰）
    let btnW2 = Math.min(120, textW - 10);
    let btnH2 = 34;
    let btnX2 = textX;
    let btnY2 = y + h - btnH2 - 14;
    const isArenaMode2 = CONFIG.fishArenaMode;
    let btnPulse = isArenaMode2 ? 0.35 : (0.85 + Math.sin(Date.now() / 400 + chapter) * 0.15);

    ctx.save();
    ctx.globalAlpha = btnPulse;
    let btnGrad2 = ctx.createLinearGradient(btnX2, btnY2, btnX2, btnY2 + btnH2);
    if (isArenaMode2) {
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
    ctx.strokeStyle = isArenaMode2 ? `rgba(70,70,90,0.5)` : `rgba(0,220,255,${btnPulse * 0.9})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    rrect(ctx, btnX2, btnY2, btnW2, btnH2, 17);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = isArenaMode2 ? 'rgba(80,80,100,0.5)' : `rgba(0,240,255,${btnPulse})`;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(isArenaMode2 ? "🔒  进入章节" : "▶  进入章节", btnX2 + 14, btnY2 + btnH2 / 2);

    // fishArenaMode 时在卡片上叠加半透明遮罩
    if (isArenaMode2) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        rrect(ctx, x, y, w, h, 14);
        ctx.fill();
        ctx.restore();
    }
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
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, logicW, logicH);
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
        wrapText(ctx, "小潘把一个密闭的洞穴气室\n误当成了出口，\n最终在搅动的泥沙中彻底迷失方向，\n丧生在了黑暗之中。", logicW/2, logicH/2, 30);
    } else if(timer < 480) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,240,480)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "为了不让更多的人\n丧生在恐怖的雅各布井，\n当地政府最终彻底封闭了雅各布井。", logicW/2, logicH/2, 30);
    } else if(timer < 720) {
        let alpha = endingGetAlpha(timer, 480, 720);
        ctx.save(); ctx.globalAlpha = alpha;
        drawDiverSilhouette(ctx, logicW/2-60, logicH/2, '#555');
        drawDiverSilhouette(ctx, logicW/2+60, logicH/2+20, '#555', true);
        ctx.fillStyle = '#f00'; ctx.font = '16px Arial';
        ctx.fillText("(小熊)", logicW/2-60, logicH/2-50);
        ctx.fillText("(小潘)", logicW/2+60, logicH/2-40);
        ctx.fillStyle = '#333'; ctx.fillRect(logicW/2+80, logicH/2+30, 20, 10);
        ctx.restore();
    } else if(timer < 960) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,720,960)})`;
        ctx.font = '24px Arial'; ctx.fillText("感谢您的体验", logicW/2, logicH/2);
    } else if(timer < 1200) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,960,1200)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "当前版本持续优化中\n前往未知的深渊\n与带熊子潘子回家的故事\n未来有时间会完善。", logicW/2, logicH/2, 30);
    } else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = '20px Arial'; ctx.fillText("制作人员", logicW/2, logicH/2-40);
        ctx.font = '16px Arial'; ctx.fillText("小熊和他的小伙伴们", logicW/2, logicH/2);
        if(t > 120) {
            ctx.fillStyle = `rgba(255,255,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial'; ctx.fillText("点击屏幕重新开始", logicW/2, logicH-50);
        }
    }
}

// 第二关结局：第二三关衔接分页剧情
function drawStage2to3Ending(timer) {
    // 第1页 (0-300): 小潘在慌乱中迷失方向
    if(timer < 300) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,0,300)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "小潘在慌乱中迷失方向，\n错把一条向上的死路\n当成是上岸的路。", logicW/2, logicH/2, 32);
    }
    // 第2页 (300-600): 好在小潘及时醒悟
    else if(timer < 600) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,300,600)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "好在小潘及时醒悟过来，\n跟着亮子逃脱了\n迷宫般的洞穴。", logicW/2, logicH/2, 32);
    }
    // 第3页 (600-900): 亮子劫后余生，但来不及高兴
    else if(timer < 900) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,600,900)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "亮子刚刚劫后余生，\n但来不及高兴，\n因为距离熊子消失在那大裂缝中，\n已经过去了半小时。", logicW/2, logicH/2, 32);
    }
    // 第4页 (900-1200): 入水动画 + 亮子再次出发
    else if(timer < 1200) {
        let alpha = endingGetAlpha(timer, 900, 1200);
        let t = timer - 900;
        ctx.save();
        ctx.globalAlpha = alpha;

        // 水面背景
        let waterGrad = ctx.createLinearGradient(0, logicH*0.4, 0, logicH);
        waterGrad.addColorStop(0, '#001a33');
        waterGrad.addColorStop(1, '#000811');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(0, logicH*0.4, logicW, logicH*0.6);

        // 水面波纹
        ctx.strokeStyle = 'rgba(100,220,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(let wx = 0; wx < logicW; wx += 8) {
            ctx.lineTo(wx, logicH*0.4 + Math.sin(wx/40 + t*0.05)*4);
        }
        ctx.stroke();

        // 入水动画：潜水员从上方落入水中
        let diverY = logicH*0.3 + Math.min(t * 0.8, logicH*0.25);
        let splashAlpha = Math.max(0, 1 - t/60);
        if(t > 30) {
            // 水花
            ctx.fillStyle = `rgba(150,220,255,${splashAlpha})`;
            for(let i = 0; i < 8; i++) {
                let angle = (i / 8) * Math.PI * 2;
                let r = 20 + (t-30) * 0.5;
                ctx.beginPath();
                ctx.arc(logicW/2 + Math.cos(angle)*r, logicH*0.4 + Math.sin(angle)*r*0.3, 3, 0, Math.PI*2);
                ctx.fill();
            }
        }
        drawDiverSilhouette(ctx, logicW/2, diverY, '#4af');
        ctx.restore();

        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = 'bold 20px Arial';
        ctx.fillText("亮子不敢再多想，", logicW/2, logicH*0.15);
        ctx.font = '18px Arial';
        ctx.fillText("简单调整后，再次出发！", logicW/2, logicH*0.22);
    }
    // 第5页 (1200+): 点击进入第三关
    else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = 'bold 22px Arial';
        ctx.fillText("第三章", logicW/2, logicH/2 - 30);
        ctx.font = '18px Arial';
        ctx.fillText("黑暗中的独行", logicW/2, logicH/2 + 10);
        if(t > 90) {
            ctx.fillStyle = `rgba(0,220,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial';
            ctx.fillText("点击屏幕继续", logicW/2, logicH - 50);
        }
    }
}

// 第三关：熊子死亡结局
function drawBearDiedEnding(timer) {
    // 第1页 (0-300): 黑暗中的独白
    if(timer < 300) {
        ctx.fillStyle = `rgba(180,180,180,${endingGetAlpha(timer,0,300)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "亮子最终没能找到熊子。", logicW/2, logicH/2, 32);
    }
    // 第2页 (300-600): 熊子的结局
    else if(timer < 600) {
        ctx.fillStyle = `rgba(200,200,200,${endingGetAlpha(timer,300,600)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "熊子独自困在那道大裂缝中，\n氧气耗尽，\n永远留在了雅各布井的黑暗里。", logicW/2, logicH/2, 32);
    }
    // 第3页 (600-900): 剪影
    else if(timer < 900) {
        let alpha = endingGetAlpha(timer, 600, 900);
        ctx.save();
        ctx.globalAlpha = alpha;
        // 黑暗背景中的孤独剪影
        let darkGrad = ctx.createRadialGradient(logicW/2, logicH/2, 0, logicW/2, logicH/2, 200);
        darkGrad.addColorStop(0, 'rgba(20,30,40,1)');
        darkGrad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = darkGrad;
        ctx.fillRect(0, 0, logicW, logicH);
        // 熊子剪影（静止，朝下）
        ctx.save();
        ctx.translate(logicW/2, logicH/2);
        ctx.rotate(Math.PI/2);
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(-10, -3, 6, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#f44';
        ctx.font = '14px Arial';
        ctx.fillText("（熊子）", logicW/2, logicH/2 - 60);
        ctx.restore();
    }
    // 第4页 (900-1200): 结语
    else if(timer < 1200) {
        ctx.fillStyle = `rgba(200,200,200,${endingGetAlpha(timer,900,1200)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "为了不让更多的人\n丧生在恐怖的雅各布井，\n当地政府最终彻底封闭了雅各布井。", logicW/2, logicH/2, 32);
    }
    // 第5页 (1200+): 返回主菜单
    else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(180,180,180,${alpha})`;
        ctx.font = '20px Arial';
        ctx.fillText("感谢您的体验", logicW/2, logicH/2 - 20);
        if(t > 90) {
            ctx.fillStyle = `rgba(255,255,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial';
            ctx.fillText("点击屏幕返回主菜单", logicW/2, logicH - 50);
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
    // 主游戏和竞技场模式都需要显示控制器
    const isPlayScreen = state.screen === 'play' || state.screen === 'fishArena';
    if (!isPlayScreen) return;

    // 竞技场准备阶段不显示摇杆提示（但攻击按钮仍显示）
    const isArenaPrep = state.screen === 'fishArena' && state.fishArena && state.fishArena.phase === 'prep';

    if (!isArenaPrep) {
        if(touches.joystickId !== null) {
            ctx.beginPath(); ctx.arc(touches.start.x, touches.start.y, 40, 0, Math.PI*2);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(touches.curr.x, touches.curr.y, 20, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
            ctx.beginPath(); ctx.moveTo(touches.start.x, touches.start.y); ctx.lineTo(touches.curr.x, touches.curr.y);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'center'; ctx.font = '14px Arial';
            ctx.fillText('按住屏幕任意位置移动', logicW/2, logicH-50);
        }
    }
    // 绘制攻击按鈕
    drawAttackButton();
    // 绘制手电筒开关按钮
    drawFlashlightButton();
}

// =============================================
// 绘制手电筒开关按钮（攻击按钮左边）
// =============================================
function drawFlashlightButton() {
    const btn = FLASHLIGHT_BTN;
    const isOn = state.flashlightOn !== false;

    ctx.save();

    // 按钮背景
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
    ctx.fillStyle = isOn ? 'rgba(255, 240, 100, 0.2)' : 'rgba(20, 20, 30, 0.7)';
    ctx.fill();

    // 按钮边框
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
    ctx.strokeStyle = isOn ? 'rgba(255, 240, 100, 0.8)' : 'rgba(80, 80, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 手电筒图标（简单的手电筒形状）
    ctx.save();
    ctx.translate(btn.x, btn.y);
    const iconColor = isOn ? 'rgba(255, 240, 100, 0.95)' : 'rgba(100, 100, 120, 0.6)';
    ctx.fillStyle = iconColor;
    // 手电筒筒身
    ctx.beginPath();
    rrect(ctx, -5, -10, 10, 14, 2);
    ctx.fill();
    // 手电筒头部（梯形用两个三角形近似）
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(8, -10);
    ctx.lineTo(6, -16);
    ctx.lineTo(-6, -16);
    ctx.closePath();
    ctx.fill();
    // 开启时画光束
    if (isOn) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgba(255, 255, 180, 1)';
        ctx.beginPath();
        ctx.moveTo(-8, -16);
        ctx.lineTo(8, -16);
        ctx.lineTo(13, -26);
        ctx.lineTo(-13, -26);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 按钮文字
    ctx.fillStyle = isOn ? 'rgba(255, 240, 100, 0.9)' : 'rgba(100, 100, 120, 0.6)';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(isOn ? '灯:开' : '灯:关', btn.x, btn.y + btn.r + 14);

    ctx.restore();
}

// =============================================
// 绘制攻击按鈕（右下角常驻）
// =============================================
function drawAttackButton() {
    const atk = state.playerAttack;
    const btnX = ATTACK_BTN.x;
    const btnY = ATTACK_BTN.y;
    const r = ATTACK_BTN.r;

    // 冷却进度
    const cooldownRatio = atk ? Math.max(0, atk.cooldownTimer / CONFIG.attack.cooldown) : 0;
    const isReady = cooldownRatio === 0;
    const isAttacking = atk && atk.active;

    ctx.save();

    // 按鈕外圈光晕（准备好时脉冲）
    if (isReady) {
        const pulse = 0.3 + Math.sin(Date.now() / 300) * 0.15;
        ctx.beginPath();
        ctx.arc(btnX, btnY, r + 8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 50, ${pulse})`;
        ctx.fill();
    }

    // 按鈕背景
    ctx.beginPath();
    ctx.arc(btnX, btnY, r, 0, Math.PI * 2);
    if (isAttacking) {
        ctx.fillStyle = 'rgba(255, 180, 50, 0.9)';
    } else if (isReady) {
        ctx.fillStyle = 'rgba(60, 40, 10, 0.85)';
    } else {
        ctx.fillStyle = 'rgba(30, 20, 5, 0.7)';
    }
    ctx.fill();

    // 按鈕边框
    ctx.beginPath();
    ctx.arc(btnX, btnY, r, 0, Math.PI * 2);
    ctx.strokeStyle = isReady ? 'rgba(255, 200, 50, 0.9)' : 'rgba(120, 80, 20, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 冷却覆盖层（逆时针扫除）
    if (cooldownRatio > 0) {
        ctx.beginPath();
        ctx.moveTo(btnX, btnY);
        ctx.arc(btnX, btnY, r, -Math.PI / 2, -Math.PI / 2 + (1 - cooldownRatio) * Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fill();
    }

    // 按鈕图标：氧气瓶形状
    ctx.save();
    ctx.translate(btnX, btnY);
    // 瓶身
    ctx.fillStyle = isReady ? 'rgba(220, 200, 160, 0.95)' : 'rgba(120, 100, 70, 0.6)';
    ctx.beginPath();
    rrect(ctx, -7, -14, 14, 22, 3);
    ctx.fill();
    // 瓶口
    ctx.fillStyle = isReady ? 'rgba(180, 160, 120, 0.9)' : 'rgba(90, 70, 40, 0.6)';
    ctx.fillRect(-4, -18, 8, 5);
    // 冲击动画：攻击时小圆闪烁
    if (isAttacking) {
        const flashAlpha = 1 - (atk.timer / CONFIG.attack.slashDuration);
        ctx.fillStyle = `rgba(255, 240, 100, ${flashAlpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 按鈕文字
    ctx.fillStyle = isReady ? 'rgba(255, 220, 100, 0.9)' : 'rgba(150, 120, 60, 0.6)';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('攻击', btnX, btnY + r + 14);

    ctx.restore();
}

// =============================================
// 绘制刀光特效（屏幕空间，在 UI 层调用）
// 效果：弧形刀光从一侧快速扫到另一侧（有加速减速惯性感），
//       刀光在空中停留一会再消散，击中瞬间有冲击波+闪白
// =============================================
export function drawSlashEffect(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    playerScreenX: number,
    playerScreenY: number,
    attackAngle: number,
    attackTimer: number
) {
    const cfg = CONFIG.attack;
    const swingDur = cfg.slashSwingDuration;   // 挥动阶段帧数
    const lingerDur = cfg.slashLingerDuration; // 停留消散阶段帧数
    const totalDur = swingDur + lingerDur;

    if (attackTimer > totalDur) return;

    const halfAngle = (cfg.angle / 2) * (Math.PI / 180);
    const range = cfg.range;

    ctx.save();
    ctx.translate(playerScreenX, playerScreenY);

    if (attackTimer <= swingDur) {
        // ===== 挥动阶段：弧形刀光从起始角扫到终止角 =====
        // 用 easeOutCubic 模拟先快后慢的惯性感
        const t = attackTimer / swingDur;
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic：开始快，结尾减速

        // 刀光从 -halfAngle 扫到 +halfAngle（相对于攻击方向）
        const sweepStart = attackAngle - halfAngle;
        const sweepEnd   = attackAngle + halfAngle;
        const currentEnd = sweepStart + (sweepEnd - sweepStart) * eased;

        // --- 外层光晕扇形 ---
        const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, range * 1.15);
        outerGlow.addColorStop(0,   `rgba(255, 255, 220, ${0.55 * (1 - t * 0.3)})`);
        outerGlow.addColorStop(0.5, `rgba(255, 220, 80,  ${0.3  * (1 - t * 0.3)})`);
        outerGlow.addColorStop(1,   'rgba(255, 180, 0, 0)');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, range * 1.15, sweepStart, currentEnd);
        ctx.closePath();
        ctx.fill();

        // --- 主刀光扇形（白色锐利弧面）---
        const slashGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, range);
        slashGrad.addColorStop(0,    `rgba(255, 255, 255, ${0.95 * (1 - t * 0.2)})`);
        slashGrad.addColorStop(0.25, `rgba(255, 250, 200, ${0.8  * (1 - t * 0.2)})`);
        slashGrad.addColorStop(0.65, `rgba(255, 220, 80,  ${0.5  * (1 - t * 0.2)})`);
        slashGrad.addColorStop(1,    'rgba(255, 160, 0, 0)');
        ctx.fillStyle = slashGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, range, sweepStart, currentEnd);
        ctx.closePath();
        ctx.fill();

        // --- 刀锋前沿：多条弧线（表现刀刃锋利感和水压残留）---
        const arcCount = cfg.slashArcCount;
        for (let i = 0; i < arcCount; i++) {
            const layerT = i / arcCount;
            const layerR = range * (0.55 + layerT * 0.5);
            const arcAlpha = (1 - layerT) * 0.7 * (1 - t * 0.4);
            const arcWidth = (1 - layerT) * 4 + 1;
            ctx.save();
            ctx.strokeStyle = `rgba(255, 255, 200, ${arcAlpha})`;
            ctx.lineWidth = arcWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(0, 0, layerR, sweepStart, currentEnd);
            ctx.stroke();
            ctx.restore();
        }

        // --- 击中瞬间（前 30% 帧）：中心闪白 + 冲击波扩散圆环 ---
        if (t < 0.3) {
            const flashT = 1 - t / 0.3;
            // 中心闪白
            ctx.fillStyle = `rgba(255, 255, 255, ${flashT * 0.85})`;
            ctx.beginPath();
            ctx.arc(0, 0, 28, 0, Math.PI * 2);
            ctx.fill();
            // 冲击波扩散圆环
            const waveR = range * 0.4 * (1 - flashT) + 15;
            ctx.save();
            ctx.strokeStyle = `rgba(255, 240, 150, ${flashT * 0.9})`;
            ctx.lineWidth = 3 + flashT * 4;
            ctx.beginPath();
            ctx.arc(0, 0, waveR, sweepStart - 0.1, currentEnd + 0.1);
            ctx.stroke();
            ctx.restore();
        }

    } else {
        // ===== 停留消散阶段：刀光残留在终止位置，逐渐淡出 =====
        const lingerT = (attackTimer - swingDur) / lingerDur; // 0 -> 1
        const fadeAlpha = Math.pow(1 - lingerT, 2);           // 二次方淡出，尾部更柔和

        const sweepStart = attackAngle - halfAngle;
        const sweepEnd   = attackAngle + halfAngle;

        // 残留刀光扇形（逐渐变淡，模拟水压/剑气消散）
        const shrinkFactor = 1 - lingerT * 0.35;
        const residualRange = range * shrinkFactor;

        const residualGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, residualRange);
        residualGrad.addColorStop(0,   `rgba(255, 240, 180, ${fadeAlpha * 0.5})`);
        residualGrad.addColorStop(0.4, `rgba(255, 200, 80,  ${fadeAlpha * 0.3})`);
        residualGrad.addColorStop(1,   'rgba(255, 150, 0, 0)');
        ctx.fillStyle = residualGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, residualRange, sweepStart, sweepEnd);
        ctx.closePath();
        ctx.fill();

        // 残留弧线（刀光边缘的水压痕迹）
        const arcCount = cfg.slashArcCount;
        for (let i = 0; i < arcCount; i++) {
            const layerT = i / arcCount;
            const layerR = residualRange * (0.6 + layerT * 0.45);
            const arcAlpha = (1 - layerT) * fadeAlpha * 0.5;
            ctx.save();
            ctx.strokeStyle = `rgba(255, 230, 150, ${arcAlpha})`;
            ctx.lineWidth = (1 - layerT) * 2.5 + 0.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(0, 0, layerR, sweepStart, sweepEnd);
            ctx.stroke();
            ctx.restore();
        }
    }

    ctx.restore();
}

// =============================================
// 食人鱼纯享版：竞技场 HUD 渲染
// =============================================
function drawArenaHUD() {
    const arena = state.fishArena;
    if (!arena) return;

    const cw = logicW;
    const ch = logicH;
    const time = Date.now() / 1000;

    // --- 死亡结算页面 ---
    if (arena.phase === 'dead') {
        drawArenaDeathScreen(arena, cw, ch, time);
        return;
    }

    // --- 顶部信息栏 ---
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, cw, 56);
    ctx.strokeStyle = 'rgba(255,60,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 56);
    ctx.lineTo(cw, 56);
    ctx.stroke();
    ctx.restore();

    // 轮次（左侧）
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = 'rgba(255,150,80,0.7)';
    ctx.fillText('ROUND', 14, 20);
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#ff8040';
    ctx.fillText(`${arena.round}`, 14, 42);
    ctx.restore();

    // 存活鱼数（中间）
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fishCountText = arena.phase === 'prep' ? '?' : `${arena.fishAlive}`;
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = 'rgba(255,80,80,0.7)';
    ctx.fillText('🦈 存活', cw / 2, 18);
    ctx.font = `bold ${arena.fishAlive > 0 ? '28' : '24'}px Arial`;
    ctx.fillStyle = arena.fishAlive > 0 ? '#ff4040' : '#40ff80';
    ctx.fillText(fishCountText, cw / 2, 42);
    ctx.restore();

    // 累计击杀（右侧）
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = 'rgba(255,200,80,0.7)';
    ctx.fillText('KILLS', cw - 14, 20);
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#ffc840';
    ctx.fillText(`${arena.totalKills}`, cw - 14, 42);
    ctx.restore();

    // --- 准备阶段倒计时 ---
    if (arena.phase === 'prep') {
        const prepLeft = Math.ceil(arena.prepTimer);
        const prepAlpha = 0.7 + Math.sin(time * 4) * 0.3;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 56, cw, ch - 56);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 光晕
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const prepGlow = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, 100);
        prepGlow.addColorStop(0, `rgba(255,100,0,${prepAlpha * 0.3})`);
        prepGlow.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = prepGlow;
        ctx.fillRect(cw / 2 - 100, ch / 2 - 100, 200, 200);
        ctx.restore();

        ctx.font = 'bold 80px Arial';
        ctx.fillStyle = `rgba(255,80,20,${prepAlpha})`;
        ctx.fillText(`${prepLeft}`, cw / 2, ch / 2 - 20);

        ctx.font = 'bold 22px Arial';
        ctx.fillStyle = `rgba(255,200,150,${prepAlpha * 0.9})`;
        const roundText = arena.round === 1 ? '准备好了吗？' : `第 ${arena.round} 轮 — 做好准备！`;
        ctx.fillText(roundText, cw / 2, ch / 2 + 50);

        ctx.font = '16px Arial';
        ctx.fillStyle = `rgba(255,150,100,${prepAlpha * 0.8})`;
        const fishCountThisRound = arena.round === 1 ? 1 : (arena.round - 1) * 5;
        ctx.fillText(`本轮将出现 ${fishCountThisRound} 条食人鱼`, cw / 2, ch / 2 + 80);
        ctx.restore();
    }

    // --- 清图庆祝阶段 ---
    if (arena.phase === 'clear') {
        const clearProgress = arena.clearTimer / 150;
        const clearAlpha = clearProgress < 0.2 ? clearProgress / 0.2 :
                           clearProgress > 0.8 ? (1 - clearProgress) / 0.2 : 1;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (arena.achievementText) {
            const scale = 1 + Math.sin(clearProgress * Math.PI) * 0.15;
            ctx.save();
            ctx.translate(cw / 2, ch * 0.42);
            ctx.scale(scale, scale);

            // 文字光晕
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const achGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 150);
            achGlow.addColorStop(0, `rgba(255,200,0,${clearAlpha * 0.4})`);
            achGlow.addColorStop(1, 'rgba(255,200,0,0)');
            ctx.fillStyle = achGlow;
            ctx.fillRect(-150, -80, 300, 160);
            ctx.restore();

            // 阴影
            ctx.fillStyle = `rgba(0,0,0,${clearAlpha * 0.6})`;
            ctx.font = 'bold 42px Arial';
            ctx.fillText(arena.achievementText, 3, 3);
            // 主文字
            ctx.fillStyle = `rgba(255,220,60,${clearAlpha})`;
            ctx.fillText(arena.achievementText, 0, 0);
            ctx.restore();
        }

        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = `rgba(200,240,255,${clearAlpha * 0.9})`;
        ctx.fillText(`第 ${arena.round + 1} 轮即将开始...`, cw / 2, ch * 0.58);
        ctx.restore();
    }

    // --- 战斗中成就文字浮现 ---
    if (arena.achievementTimer > 0 && arena.phase === 'fight') {
        const achAlpha = Math.min(1, arena.achievementTimer / 30);
        const achY = ch * 0.35 - (1 - arena.achievementTimer / 120) * 30;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 36px Arial';
        ctx.fillStyle = `rgba(255,220,60,${achAlpha})`;
        ctx.fillText(arena.achievementText, cw / 2, achY);
        ctx.restore();
    }
}

// 竞技场死亡结算页面
function drawArenaDeathScreen(arena: any, cw: number, ch: number, time: number) {
    const deadProgress = Math.min(1, arena.deadTimer / 60);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${deadProgress * 0.92})`;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();

    if (arena.deadTimer < 30) return;

    const showAlpha = Math.min(1, (arena.deadTimer - 30) / 40);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 血红光晕
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const titleGlow = ctx.createRadialGradient(cw / 2, ch * 0.22, 0, cw / 2, ch * 0.22, 160);
    titleGlow.addColorStop(0, `rgba(255,0,0,${showAlpha * 0.3})`);
    titleGlow.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = titleGlow;
    ctx.fillRect(cw / 2 - 160, ch * 0.1, 320, 240);
    ctx.restore();

    // 死亡标题
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = `rgba(255,40,20,${showAlpha})`;
    ctx.fillText('YOU DIED', cw / 2, ch * 0.22);

    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = `rgba(255,150,100,${showAlpha * 0.9})`;
    ctx.fillText('被食人鱼撕碎了...', cw / 2, ch * 0.32);

    // 分割线
    ctx.save();
    ctx.strokeStyle = `rgba(255,60,0,${showAlpha * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cw * 0.2, ch * 0.38);
    ctx.lineTo(cw * 0.8, ch * 0.38);
    ctx.stroke();
    ctx.restore();

    // 统计数据
    const statY = ch * 0.46;
    const statGap = ch * 0.075;

    // 最高轮次
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = `rgba(180,180,200,${showAlpha * 0.7})`;
    ctx.fillText('最高轮次', cw / 2, statY);
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = `rgba(255,180,80,${showAlpha})`;
    ctx.fillText(`第 ${arena.round} 轮`, cw / 2, statY + statGap * 0.7);

    // 击杀总数
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = `rgba(180,180,200,${showAlpha * 0.7})`;
    ctx.fillText('击杀总数', cw / 2, statY + statGap * 1.6);
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = `rgba(255,80,80,${showAlpha})`;
    ctx.fillText(`${arena.totalKills} 条`, cw / 2, statY + statGap * 2.3);

    // 存活时间
    const minutes = Math.floor(arena.surviveTime / 60);
    const seconds = Math.floor(arena.surviveTime % 60);
    const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = `rgba(180,180,200,${showAlpha * 0.7})`;
    ctx.fillText('存活时间', cw / 2, statY + statGap * 3.2);
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = `rgba(100,220,255,${showAlpha})`;
    ctx.fillText(timeStr, cw / 2, statY + statGap * 3.9);

    // 评价语
    const rating = getArenaRating(arena.round, arena.totalKills);
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = `rgba(255,220,100,${showAlpha})`;
    ctx.fillText(rating, cw / 2, statY + statGap * 5.0);

    // 返回提示（2秒后出现）
    if (arena.deadTimer >= 120) {
        const tapAlpha = 0.5 + Math.sin(time * 2.5) * 0.5;
        ctx.font = '16px Arial';
        ctx.fillStyle = `rgba(150,180,200,${tapAlpha * showAlpha})`;
        ctx.fillText('点击屏幕返回主菜单', cw / 2, ch * 0.92);
    }

    ctx.restore();
}

// 根据轮次给出评价语
function getArenaRating(round: number, kills: number): string {
    if (round >= 10) return '🏆 深海传说！无人能敌！';
    if (round >= 7)  return '⚡ 不可思议！你是怪物！';
    if (round >= 5)  return '🔥 势不可挡！太强了！';
    if (round >= 3)  return '💪 不错！继续挑战！';
    if (round >= 2)  return '👍 还行，再来一局！';
    return '😅 被第一轮干掉了...加油！';
}

// =============================================
// 迷宫引导绳模式：HUD 绘制
// =============================================
function drawMazeHUD() {
    const maze = state.mazeRescue;
    if (!maze) return;

    const cw = logicW;
    const ch = logicH;
    const time = Date.now() / 1000;

    ctx.save();

    // === 岸上阶段 ===
    if (maze.phase === 'shore') {
        drawMazeShore(maze, cw, ch, time);
        ctx.restore();
        return;
    }

    // === 入水动效阶段 ===
    if (maze.phase === 'diving_in') {
        drawMazeDivingIn(maze, cw, ch, time);
        ctx.restore();
        return;
    }

    // === 结算界面（探路返回 / 救援成功） ===
    if (maze.phase === 'debrief' || maze.phase === 'rescued') {
        drawMazeDebrief(maze, cw, ch, time);
        ctx.restore();
        return;
    }

    // === 上浮动画阶段 ===
    if (maze.phase === 'surfacing') {
        const progress = Math.min(1, maze.resultTimer / 60);
        ctx.globalAlpha = progress * 0.6;
        ctx.fillStyle = 'rgba(200,230,255,1)';
        ctx.fillRect(0, 0, cw, ch);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#aef';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('上浮中...', cw / 2, ch / 2);
        ctx.restore();
        return;
    }

    // === 游戏中 HUD ===

    // 氧气条（顶部右侧）
    const o2BarW = 120;
    const o2BarH = 12;
    const o2BarX = cw - o2BarW - 16;
    const o2BarY = 16;
    const o2Ratio = Math.max(0, player.o2 / 100);

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    rrect(ctx, o2BarX - 2, o2BarY - 2, o2BarW + 4, o2BarH + 4, 6);
    ctx.fill();
    const o2Color = o2Ratio > 0.5 ? `rgba(80,200,255,0.9)` :
                    o2Ratio > 0.25 ? `rgba(255,200,80,0.9)` : `rgba(255,80,80,0.9)`;
    ctx.fillStyle = o2Color;
    ctx.beginPath();
    rrect(ctx, o2BarX, o2BarY, o2BarW * o2Ratio, o2BarH, 4);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#aef';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`O₂ ${Math.ceil(player.o2)}%`, o2BarX - 6, o2BarY + o2BarH - 1);

    // 深度显示
    const depth = Math.max(0, Math.floor(player.y / maze.mazeTileSize));
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(150,220,255,0.9)';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`深度 ${depth}m`, cw - 16, o2BarY + o2BarH + 18);

    // 下潜类型标签（左上角，小地图按钮右侧）
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = maze.diveType === 'rescue' ? 'rgba(255,100,50,0.9)' : 'rgba(100,200,255,0.9)';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
ctx.fillText(maze.diveType === 'rescue' ? '[救援]' : '[侦察]', 46, 24);

    // NPC 救援提示（靠近NPC时显示，发现后即可绑绳）
    if (!maze.npcRescued && state.npc.active) {
        const distToNpc = Math.hypot(player.x - state.npc.x, player.y - state.npc.y);
        if (distToNpc < CONFIG.maze.npcRescueRange) {
            ctx.globalAlpha = 0.9;
            ctx.textAlign = 'center';
            if (maze.npcRescueHolding) {
                const elapsed = (Date.now() - maze.npcRescueHoldStart) / 1000;
                const progress = Math.min(1, elapsed / CONFIG.maze.npcRescueHoldDuration);
                const zoom = state.camera ? state.camera.zoom : 1;
                const npcScreenX = cw / 2 + (state.npc.x - player.x) * zoom;
                const npcScreenY = ch / 2 + (state.npc.y - player.y) * zoom;
                ctx.strokeStyle = 'rgba(0,255,150,0.9)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(npcScreenX, npcScreenY - 40, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                ctx.stroke();
                ctx.fillStyle = 'rgba(0,255,150,0.9)';
                ctx.font = 'bold 13px Arial';
                ctx.fillText('绑绳中...', npcScreenX, npcScreenY - 70);
            } else {
                ctx.fillStyle = 'rgba(200,255,200,0.9)';
                ctx.font = '13px Arial';
                ctx.fillText('长按绑绳', cw / 2, ch * 0.85);
            }
        }
    }

    // 侦察下潜时靠近NPC的提示（未发现时）
    if (!maze.npcFound && state.npc.active) {
        const distToNpc = Math.hypot(player.x - state.npc.x, player.y - state.npc.y);
        if (distToNpc < CONFIG.maze.npcRescueRange * 2) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('发现被困者！记住位置！', cw / 2, ch * 0.85);
        }
    }

    // NPC 已跟随提示
    if (maze.npcRescued) {
        const distToExit = Math.hypot(player.x - maze.exitX, player.y - maze.exitY);
        if (distToExit < maze.mazeTileSize * 8) {
            const pulse = 0.7 + Math.sin(time * 4) * 0.3;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#0f8';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('↑ 出口就在上方！', cw / 2, ch * 0.15);
        }
    }

    // 探路撤离按钮（仅侦察下潜，左下角）
    if (maze.diveType === 'scout') {
        const retreatBtnX = cw * CONFIG.maze.retreatBtnXRatio;
        const retreatBtnY = ch * CONFIG.maze.retreatBtnYRatio;
        const retreatR = CONFIG.maze.retreatBtnRadius;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = 'rgba(0,60,80,0.7)';
        ctx.beginPath();
        ctx.arc(retreatBtnX, retreatBtnY, retreatR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,200,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(retreatBtnX, retreatBtnY, retreatR, 0, Math.PI * 2);
        ctx.stroke();
        if (maze.retreatHolding) {
            const elapsed = (Date.now() - maze.retreatHoldStart) / 1000;
            const progress = Math.min(1, elapsed / CONFIG.maze.retreatHoldDuration);
            ctx.strokeStyle = 'rgba(100,255,200,0.9)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(retreatBtnX, retreatBtnY, retreatR + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.stroke();
        }
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(150,220,255,0.95)';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('↑', retreatBtnX, retreatBtnY + 1);
        ctx.font = '9px Arial';
        ctx.fillText('撤离', retreatBtnX, retreatBtnY + 14);
    }

    // 小地图（左上角，可折叠）
    drawMazeMinimap(maze, cw, ch, time);

    ctx.restore();
}

// 迷宫小地图绘制
function drawMazeMinimap(maze: any, cw: number, ch: number, time: number) {
    const mapSize = CONFIG.maze.minimapSize;
    const mapX = CONFIG.maze.minimapX;
    const mapY = CONFIG.maze.minimapY;
    const toggleBtnSize = 28;

    // 折叠/展开按钮（左上角小图标）
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    rrect(ctx, mapX, mapY, toggleBtnSize, toggleBtnSize, 6);
    ctx.fill();
    ctx.fillStyle = maze.minimapExpanded ? '#0f8' : '#aef';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(maze.minimapExpanded ? '▼' : '▶', mapX + toggleBtnSize / 2, mapY + toggleBtnSize / 2 + 5);

    if (!maze.minimapExpanded) return;

    // 展开状态：绘制小地图
    const cols = maze.mazeCols;
    const rows = maze.mazeRows;
    const cellW = mapSize / cols;
    const cellH = mapSize / rows;

    ctx.globalAlpha = 0.85;
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    rrect(ctx, mapX, mapY + toggleBtnSize + 4, mapSize, mapSize, 4);
    ctx.fill();

    // 绘制已探索区域
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!maze.mazeExplored[r] || !maze.mazeExplored[r][c]) continue;
            const cell = maze.mazeMap[r][c];
            const px = mapX + c * cellW;
            const py = mapY + toggleBtnSize + 4 + r * cellH;
            if (cell === 0) {
                ctx.fillStyle = 'rgba(80,120,160,0.8)';
            } else {
                ctx.fillStyle = 'rgba(30,40,50,0.9)';
            }
            ctx.fillRect(px, py, Math.max(1, cellW), Math.max(1, cellH));
        }
    }

    // 出口标记
    const exitMapX = mapX + (maze.exitX / maze.mazeTileSize) * cellW;
    const exitMapY = mapY + toggleBtnSize + 4 + (maze.exitY / maze.mazeTileSize) * cellH;
    ctx.fillStyle = '#0f8';
    ctx.beginPath();
    ctx.arc(exitMapX, exitMapY, 3, 0, Math.PI * 2);
    ctx.fill();

    // NPC 标记
    if (state.npc.active) {
        const npcMapX = mapX + (state.npc.x / maze.mazeTileSize) * cellW;
        const npcMapY = mapY + toggleBtnSize + 4 + (state.npc.y / maze.mazeTileSize) * cellH;
        ctx.fillStyle = maze.npcRescued ? '#0f8' : '#ff0';
        ctx.beginPath();
        ctx.arc(npcMapX, npcMapY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // 玩家标记（闪烁）
    const playerMapX = mapX + (player.x / maze.mazeTileSize) * cellW;
    const playerMapY = mapY + toggleBtnSize + 4 + (player.y / maze.mazeTileSize) * cellH;
    const pulse = 0.6 + Math.sin(time * 5) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(playerMapX, playerMapY, 3, 0, Math.PI * 2);
    ctx.fill();

    // 绳索路径（已完成的绳索）
    if (state.rope && state.rope.ropes && state.rope.ropes.length > 0) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = 'rgba(255,200,100,0.8)';
        ctx.lineWidth = 1;
        for (const rope of state.rope.ropes) {
            if (!rope.path || rope.path.length < 2) continue;
            ctx.beginPath();
            const startPt = rope.path[0];
            ctx.moveTo(mapX + (startPt.x / maze.mazeTileSize) * cellW,
                       mapY + toggleBtnSize + 4 + (startPt.y / maze.mazeTileSize) * cellH);
            for (let i = 1; i < rope.path.length; i++) {
                const pt = rope.path[i];
                ctx.lineTo(mapX + (pt.x / maze.mazeTileSize) * cellW,
                           mapY + toggleBtnSize + 4 + (pt.y / maze.mazeTileSize) * cellH);
            }
            ctx.stroke();
        }
    }
}

// =============================================
// 岸上界面绘制
// =============================================
function drawMazeShore(maze: any, cw: number, ch: number, time: number) {
    // === 全屏地图查看页面 ===
    if (maze.shoreMapOpen) {
        drawMazeMapFullscreen(maze, cw, ch, time);
        return;
    }

    // === 背景：绿草地、阳光、树林 ===

    // 天空渐变
    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.4);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(0.5, '#B0E0FF');
    skyGrad.addColorStop(1, '#E8F5E9');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, ch * 0.4);

    // 太阳
    const sunX = cw * 0.8;
    const sunY = ch * 0.08;
    const sunPulse = 1 + Math.sin(time * 0.5) * 0.05;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#FFE082';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 60 * sunPulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#FFF9C4';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30 * sunPulse, 0, Math.PI * 2);
    ctx.fill();

    // 远处树林（多层圆形树冠，底部与草地衔接）
    const treeLine = ch * 0.38; // 树林底部与草地齐平
    ctx.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
        const tx = (i * cw / 12) - 10 + Math.sin(i * 1.5) * 8;
        const treeH = 40 + Math.sin(i * 3.7) * 12;
        const crownR = 18 + Math.sin(i * 2.1) * 6;
        // 树干
        ctx.fillStyle = `rgba(${70 + i * 3},${50 + i * 2},${30},0.5)`;
        ctx.fillRect(tx - 2, treeLine - treeH * 0.4, 4, treeH * 0.5);
        // 树冠（多层圆形，颜色深浅交替）
        const g1 = 80 + i * 6;
        const g2 = 110 + i * 5;
        ctx.fillStyle = `rgba(${30 + i * 3},${g1},${40 + i * 2},0.55)`;
        ctx.beginPath();
        ctx.arc(tx, treeLine - treeH * 0.5, crownR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${40 + i * 4},${g2},${50 + i * 3},0.45)`;
        ctx.beginPath();
        ctx.arc(tx - crownR * 0.3, treeLine - treeH * 0.55, crownR * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx + crownR * 0.35, treeLine - treeH * 0.48, crownR * 0.65, 0, Math.PI * 2);
        ctx.fill();
    }

    // 近处树林（更大更清晰，底部与草地齐平）
    ctx.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
        const tx = (i * cw / 6) - 15 + Math.sin(i * 2.1) * 5;
        const treeH = 65 + Math.sin(i * 4.2) * 15;
        const crownR = 22 + Math.sin(i * 3.3) * 8;
        const sway = Math.sin(time * 0.8 + i * 1.2) * 2;
        // 树干
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(tx - 3, treeLine - treeH * 0.35, 6, treeH * 0.45);
        // 主树冠
        ctx.fillStyle = `rgba(${35 + i * 6},${100 + i * 10},${40 + i * 4},0.85)`;
        ctx.beginPath();
        ctx.arc(tx + sway, treeLine - treeH * 0.5, crownR, 0, Math.PI * 2);
        ctx.fill();
        // 副树冠（左右偏移，增加层次）
        ctx.fillStyle = `rgba(${45 + i * 5},${120 + i * 8},${50 + i * 3},0.7)`;
        ctx.beginPath();
        ctx.arc(tx + sway - crownR * 0.5, treeLine - treeH * 0.45, crownR * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx + sway + crownR * 0.5, treeLine - treeH * 0.42, crownR * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = `rgba(${80 + i * 5},${160 + i * 6},${70 + i * 4},0.3)`;
        ctx.beginPath();
        ctx.arc(tx + sway - crownR * 0.2, treeLine - treeH * 0.58, crownR * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    // 草地
    const grassGrad = ctx.createLinearGradient(0, ch * 0.38, 0, ch);
    grassGrad.addColorStop(0, '#66BB6A');
    grassGrad.addColorStop(0.3, '#4CAF50');
    grassGrad.addColorStop(1, '#388E3C');
    ctx.globalAlpha = 1;
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, ch * 0.38, cw, ch * 0.62);

    // 草地纹理（小草丛，更密集更自然）
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 50; i++) {
        const gx = (i * cw / 45) + Math.sin(i * 3.1) * 12;
        const gy = ch * 0.39 + (i % 7) * ch * 0.06 + Math.sin(i * 2.7) * 6;
        const sway = Math.sin(time * 1.5 + i * 0.8) * 3;
        const grassH = 10 + Math.sin(i * 1.9) * 6;
        // 每丛2~3根草
        for (let j = -1; j <= 1; j++) {
            ctx.strokeStyle = `rgba(${80 + j * 10},${150 + i % 30},${60 + j * 5},0.6)`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(gx + j * 3, gy);
            ctx.quadraticCurveTo(gx + j * 3 + sway + j * 2, gy - grassH * 0.6, gx + sway * 1.5 + j * 4, gy - grassH);
            ctx.stroke();
        }
    }

    // 小花朵（散落在草地上）
    ctx.globalAlpha = 0.8;
    const flowerColors = ['#FF6B6B', '#FFD93D', '#FF8CC8', '#FFA07A', '#DDA0DD', '#87CEEB'];
    for (let i = 0; i < 18; i++) {
        const fx = cw * 0.05 + (i * cw / 16) + Math.sin(i * 4.3) * 15;
        const fy = ch * 0.41 + (i % 5) * ch * 0.07 + Math.sin(i * 3.1) * 8;
        const fSize = 3 + Math.sin(i * 2.7) * 1.5;
        const fColor = flowerColors[i % flowerColors.length];
        // 花瓣（4~5个小圆）
        ctx.fillStyle = fColor;
        for (let p = 0; p < 5; p++) {
            const pa = (p / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(fx + Math.cos(pa) * fSize, fy + Math.sin(pa) * fSize, fSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        // 花心
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(fx, fy, fSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    // 蝴蝶（2~3只，飘动）
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 3; i++) {
        const bx = cw * 0.2 + i * cw * 0.25 + Math.sin(time * 1.2 + i * 2.5) * 30;
        const by = ch * 0.32 + Math.sin(time * 0.8 + i * 1.8) * 20 + i * 15;
        const wingFlap = Math.sin(time * 8 + i * 3) * 0.5; // 翅膀扇动
        const bColor = i === 0 ? '#FF69B4' : i === 1 ? '#87CEEB' : '#FFD700';
        ctx.save();
        ctx.translate(bx, by);
        // 左翅
        ctx.fillStyle = bColor;
        ctx.beginPath();
        ctx.ellipse(-3, 0, 5, 3 + wingFlap * 2, -0.3 + wingFlap * 0.3, 0, Math.PI * 2);
        ctx.fill();
        // 右翅
        ctx.beginPath();
        ctx.ellipse(3, 0, 5, 3 + wingFlap * 2, 0.3 - wingFlap * 0.3, 0, Math.PI * 2);
        ctx.fill();
        // 身体
        ctx.fillStyle = '#333';
        ctx.fillRect(-0.5, -3, 1, 6);
        ctx.restore();
    }

    // 小鸟（远处天空飞过，V字形）
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
        const birdX = ((time * 20 + i * 80) % (cw + 100)) - 50;
        const birdY = ch * 0.12 + i * 18 + Math.sin(time * 2 + i * 1.5) * 8;
        const wingSpan = 6 + i * 1.5;
        const wingUp = Math.sin(time * 5 + i * 2) * 3;
        ctx.beginPath();
        ctx.moveTo(birdX - wingSpan, birdY - wingUp);
        ctx.quadraticCurveTo(birdX - wingSpan * 0.3, birdY + 2, birdX, birdY);
        ctx.quadraticCurveTo(birdX + wingSpan * 0.3, birdY + 2, birdX + wingSpan, birdY - wingUp);
        ctx.stroke();
    }

    // 水面入口（洞穴口）— 这是下潜按钮
    const poolX = cw * 0.5;
    const poolY = ch * 0.44;
    const poolW = 80;
    const poolH = 40;
    // 洞口光晕呼吸效果
    const poolPulse = 0.6 + Math.sin(time * 2) * 0.2;
    ctx.globalAlpha = poolPulse * 0.3;
    ctx.fillStyle = '#64B5F6';
    ctx.beginPath();
    ctx.ellipse(poolX, poolY, poolW + 12, poolH + 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // 洞口本体
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#1565C0';
    ctx.beginPath();
    ctx.ellipse(poolX, poolY, poolW, poolH, 0, 0, Math.PI * 2);
    ctx.fill();
    // 水面波纹
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#90CAF9';
    ctx.lineWidth = 1;
    for (let w = 0; w < 3; w++) {
        const waveR = 20 + w * 15 + Math.sin(time * 2 + w) * 5;
        ctx.beginPath();
        ctx.ellipse(poolX, poolY, waveR, waveR * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    // 洞口点击提示
    ctx.globalAlpha = 0.7 + Math.sin(time * 3) * 0.3;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 3;
    ctx.fillText('点击下潜 ▼', poolX, poolY + poolH + 20);
    ctx.shadowBlur = 0;

    // === 信息面板 ===
    ctx.globalAlpha = 1;

    // 标题
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText('岸上营地', cw / 2, ch * 0.06 + 20);
    ctx.shadowBlur = 0;

    // 返回按钮（左上角）
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    rrect(ctx, 8, 8, 64, 32, 16);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('← 返回', 40, 28);

    // 信息卡片背景（下半部分，不被地图遮挡）
    const cardX = cw * 0.06;
    const cardY = ch * 0.56;
    const cardW = cw * 0.88;
    const cardH = ch * 0.40;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76,175,80,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.stroke();

    // 信息内容
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    const infoX = cardX + 16;
    let infoY = cardY + 24;
    ctx.fillText('探索记录', infoX, infoY);

    // 认知地图图标按钮（卡片右上角）
    const mapIconX = cardX + cardW - 44;
    const mapIconY = cardY + 8;
    const mapIconSize = 36;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(76,175,80,0.15)';
    ctx.beginPath();
    rrect(ctx, mapIconX, mapIconY, mapIconSize, mapIconSize, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76,175,80,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, mapIconX, mapIconY, mapIconSize, mapIconSize, 8);
    ctx.stroke();
    ctx.fillStyle = '#4CAF50';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    // 用绘制方式画地图图标（避免emoji兼容问题）
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 1.5;
    // 折叠地图轮廓
    const mIcx = mapIconX + mapIconSize / 2;
    const mIcy = mapIconY + mapIconSize / 2;
    ctx.beginPath();
    ctx.moveTo(mIcx - 8, mIcy - 8);
    ctx.lineTo(mIcx - 2, mIcy - 5);
    ctx.lineTo(mIcx + 4, mIcy - 8);
    ctx.lineTo(mIcx + 8, mIcy - 5);
    ctx.lineTo(mIcx + 8, mIcy + 8);
    ctx.lineTo(mIcx + 2, mIcy + 5);
    ctx.lineTo(mIcx - 4, mIcy + 8);
    ctx.lineTo(mIcx - 8, mIcy + 5);
    ctx.closePath();
    ctx.stroke();
    // 地图上的路线标记
    ctx.beginPath();
    ctx.moveTo(mIcx - 4, mIcy - 2);
    ctx.lineTo(mIcx, mIcy + 2);
    ctx.lineTo(mIcx + 4, mIcy - 1);
    ctx.stroke();
    // 小圆点标记
    ctx.fillStyle = '#F44336';
    ctx.beginPath();
    ctx.arc(mIcx + 4, mIcy - 1, 2, 0, Math.PI * 2);
    ctx.fill();

    // 统计数据
    ctx.textAlign = 'left';
    ctx.font = '13px Arial';
    ctx.fillStyle = '#555';
    infoY += 28;
    ctx.fillText(`下潜次数：${maze.diveCount}`, infoX, infoY);
    ctx.fillText(`铺设绳索：${maze.totalRopePlaced} 段`, infoX + cardW * 0.5, infoY);
    infoY += 22;
    const maxDepthM = Math.floor(maze.maxDepthReached / maze.mazeTileSize);
    ctx.fillText(`最深到达：${maxDepthM}m`, infoX, infoY);
    ctx.fillText(`被困者：${maze.npcFound ? '[已发现]' : '[未发现]'}`, infoX + cardW * 0.5, infoY);

    // 上次下潜摘要
    if (maze.diveHistory.length > 0) {
        const lastDive = maze.diveHistory[maze.diveHistory.length - 1];
        infoY += 28;
        ctx.fillStyle = '#777';
        ctx.font = '12px Arial';
        const reasonText = lastDive.returnReason === 'retreat' ? '主动撤离' :
                          lastDive.returnReason === 'o2' ? '氧气不足' :
                          lastDive.returnReason === 'rescued' ? '救援成功' : '返回';
        ctx.fillText(`上次：${reasonText} | 深度${lastDive.maxDepth}m | 新探索${lastDive.newExploredCount}格`, infoX, infoY);
        infoY += 18;
        ctx.fillText(`      绳索+${lastDive.ropePlaced} | 用时${Math.floor(lastDive.duration / 60)}分${lastDive.duration % 60}秒`, infoX, infoY);
    }

    // 下潜提示（卡片底部）
    infoY = cardY + cardH - 20;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#888';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    if (maze.npcFound) {
        ctx.fillText('已发现被困者，下潜后可靠近长按绑绳救援', cw / 2, infoY);
    } else {
        ctx.fillText('点击水面入口开始下潜探索', cw / 2, infoY);
    }

    ctx.globalAlpha = 1;
}

// =============================================
// 全屏认知地图查看页面
// =============================================
function drawMazeMapFullscreen(maze: any, cw: number, ch: number, time: number) {
    // 背景
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(240,230,210,1)';
    ctx.fillRect(0, 0, cw, ch);

    // 标题
    ctx.fillStyle = '#5D4037';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('认知地图', cw / 2, 30);

    // 关闭提示
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#888';
    ctx.font = '12px Arial';
    ctx.fillText('点击任意位置关闭', cw / 2, ch - 16);

    // 地图区域
    const padding = 20;
    const mapAreaW = cw - padding * 2;
    const mapAreaH = ch - 70;
    const cols = maze.mazeCols;
    const rows = maze.mazeRows;
    // 保持比例
    const mapRatio = cols / rows;
    const areaRatio = mapAreaW / mapAreaH;
    let mapW: number, mapH: number;
    if (mapRatio > areaRatio) {
        mapW = mapAreaW;
        mapH = mapW / mapRatio;
    } else {
        mapH = mapAreaH;
        mapW = mapH * mapRatio;
    }
    const mapX = (cw - mapW) / 2;
    const mapY = 50;
    const cellW = mapW / cols;
    const cellH = mapH / rows;

    // 纸张底色
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(245,235,220,1)';
    ctx.beginPath();
    rrect(ctx, mapX - 4, mapY - 4, mapW + 8, mapH + 8, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(139,119,101,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, mapX - 4, mapY - 4, mapW + 8, mapH + 8, 6);
    ctx.stroke();

    // 未探索区域底色
    ctx.fillStyle = 'rgba(220,210,195,0.5)';
    ctx.fillRect(mapX, mapY, mapW, mapH);

    // 绘制已探索区域
    ctx.globalAlpha = 0.9;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!maze.mazeExplored[r] || !maze.mazeExplored[r][c]) continue;
            const cell = maze.mazeMap[r][c];
            const px = mapX + c * cellW;
            const py = mapY + r * cellH;
            if (cell === 0) {
                ctx.fillStyle = 'rgba(160,200,230,0.8)';
            } else {
                ctx.fillStyle = 'rgba(120,100,80,0.6)';
            }
            ctx.fillRect(px, py, Math.max(1, cellW + 0.5), Math.max(1, cellH + 0.5));
        }
    }

    // 绳索路径
    if (state.rope && state.rope.ropes && state.rope.ropes.length > 0) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = 'rgba(200,150,50,0.9)';
        ctx.lineWidth = 1.5;
        for (const rope of state.rope.ropes) {
            if (!rope.path || rope.path.length < 2) continue;
            ctx.beginPath();
            const startPt = rope.path[0];
            ctx.moveTo(mapX + (startPt.x / maze.mazeTileSize) * cellW,
                       mapY + (startPt.y / maze.mazeTileSize) * cellH);
            for (let i = 1; i < rope.path.length; i++) {
                const pt = rope.path[i];
                ctx.lineTo(mapX + (pt.x / maze.mazeTileSize) * cellW,
                           mapY + (pt.y / maze.mazeTileSize) * cellH);
            }
            ctx.stroke();
        }
    }

    // 出口标记
    const exitMapX = mapX + (maze.exitX / maze.mazeTileSize) * cellW;
    const exitMapY = mapY + (maze.exitY / maze.mazeTileSize) * cellH;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(exitMapX, exitMapY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2E7D32';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('出口', exitMapX, exitMapY - 8);

    // NPC 标记（已发现时显示）
    if (maze.npcFound) {
        const npcMapX = mapX + (maze.npcInitX / maze.mazeTileSize) * cellW;
        const npcMapY = mapY + (maze.npcInitY / maze.mazeTileSize) * cellH;
        const pulse = 0.6 + Math.sin(time * 3) * 0.4;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#FF5722';
        ctx.beginPath();
        ctx.arc(npcMapX, npcMapY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#BF360C';
        ctx.font = '10px Arial';
        ctx.fillText('被困者', npcMapX, npcMapY - 8);
    }

    // 图例
    ctx.globalAlpha = 0.7;
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    const legendX = mapX + 4;
    const legendY = mapY + mapH + 16;
    ctx.fillStyle = 'rgba(160,200,230,0.9)';
    ctx.fillRect(legendX, legendY - 6, 10, 10);
    ctx.fillStyle = '#555';
    ctx.fillText('水域', legendX + 14, legendY + 3);
    ctx.fillStyle = 'rgba(120,100,80,0.7)';
    ctx.fillRect(legendX + 60, legendY - 6, 10, 10);
    ctx.fillStyle = '#555';
    ctx.fillText('岩壁', legendX + 74, legendY + 3);
    ctx.strokeStyle = 'rgba(200,150,50,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legendX + 120, legendY);
    ctx.lineTo(legendX + 135, legendY);
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillText('绳索', legendX + 140, legendY + 3);
}

// =============================================
// 入水动效绘制
// =============================================
function drawMazeDivingIn(maze: any, cw: number, ch: number, time: number) {
    const timer = maze.divingInTimer;
    const totalFrames = 90;
    const progress = Math.min(1, timer / totalFrames);

    // 阶段1（0~0.4）：岸上场景，水面涟漪扩大
    // 阶段2（0.4~0.7）：蓝色水面从中心扩散覆盖全屏
    // 阶段3（0.7~1.0）：水下深蓝渐入，气泡上浮

    if (progress < 0.4) {
        // 阶段1：岸上场景 + 水面涟漪
        const p1 = progress / 0.4;

        // 绘制简化的岸上背景
        const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.4);
        skyGrad.addColorStop(0, '#87CEEB');
        skyGrad.addColorStop(1, '#E8F5E9');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, cw, ch * 0.4);
        const grassGrad = ctx.createLinearGradient(0, ch * 0.38, 0, ch);
        grassGrad.addColorStop(0, '#66BB6A');
        grassGrad.addColorStop(1, '#388E3C');
        ctx.fillStyle = grassGrad;
        ctx.fillRect(0, ch * 0.38, cw, ch * 0.62);

        // 洞口水面涟漪扩大
        const poolX = cw * 0.5;
        const poolY = ch * 0.48;
        const baseW = 80;
        const expandScale = 1 + p1 * 2;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#1565C0';
        ctx.beginPath();
        ctx.ellipse(poolX, poolY, baseW * expandScale, baseW * 0.5 * expandScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // 涟漪
        ctx.globalAlpha = 0.5 * (1 - p1);
        ctx.strokeStyle = '#90CAF9';
        ctx.lineWidth = 2;
        for (let w = 0; w < 5; w++) {
            const waveR = (30 + w * 20) * expandScale + Math.sin(time * 3 + w) * 5;
            ctx.beginPath();
            ctx.ellipse(poolX, poolY, waveR, waveR * 0.5, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 入水文字
        ctx.globalAlpha = p1;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText('入水...', poolX, poolY - 10);
        ctx.shadowBlur = 0;

    } else if (progress < 0.7) {
        // 阶段2：蓝色水面从中心扩散覆盖全屏
        const p2 = (progress - 0.4) / 0.3;
        const radius = Math.hypot(cw, ch) * p2;

        // 先画岸上残影
        ctx.globalAlpha = 1 - p2;
        const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.4);
        skyGrad.addColorStop(0, '#87CEEB');
        skyGrad.addColorStop(1, '#E8F5E9');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, cw, ch * 0.4);
        const grassGrad = ctx.createLinearGradient(0, ch * 0.38, 0, ch);
        grassGrad.addColorStop(0, '#66BB6A');
        grassGrad.addColorStop(1, '#388E3C');
        ctx.fillStyle = grassGrad;
        ctx.fillRect(0, ch * 0.38, cw, ch * 0.62);

        // 蓝色圆形扩散
        ctx.globalAlpha = 1;
        const waterGrad = ctx.createRadialGradient(cw / 2, ch * 0.48, 0, cw / 2, ch * 0.48, radius);
        waterGrad.addColorStop(0, 'rgba(10,40,80,0.95)');
        waterGrad.addColorStop(0.6, 'rgba(15,50,100,0.9)');
        waterGrad.addColorStop(1, 'rgba(5,20,50,0.85)');
        ctx.fillStyle = waterGrad;
        ctx.beginPath();
        ctx.arc(cw / 2, ch * 0.48, radius, 0, Math.PI * 2);
        ctx.fill();

    } else {
        // 阶段3：水下深蓝 + 气泡上浮
        const p3 = (progress - 0.7) / 0.3;

        // 深蓝背景
        ctx.globalAlpha = 1;
        const deepGrad = ctx.createLinearGradient(0, 0, 0, ch);
        deepGrad.addColorStop(0, 'rgba(5,20,50,1)');
        deepGrad.addColorStop(0.5, 'rgba(8,30,60,1)');
        deepGrad.addColorStop(1, 'rgba(3,15,35,1)');
        ctx.fillStyle = deepGrad;
        ctx.fillRect(0, 0, cw, ch);

        // 气泡上浮
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 12; i++) {
            const bx = cw * 0.3 + (i % 4) * cw * 0.12 + Math.sin(i * 2.3 + time * 2) * 15;
            const by = ch * (1 - p3 * 0.8) - i * ch * 0.06 + Math.sin(i * 1.7 + time * 3) * 10;
            const br = 2 + (i % 3) * 1.5;
            ctx.fillStyle = 'rgba(150,200,255,0.4)';
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
        }

        // 光柱从上方射入
        ctx.globalAlpha = 0.15 * (1 - p3);
        const lightGrad = ctx.createLinearGradient(cw / 2, 0, cw / 2, ch * 0.6);
        lightGrad.addColorStop(0, 'rgba(100,180,255,0.5)');
        lightGrad.addColorStop(1, 'rgba(100,180,255,0)');
        ctx.fillStyle = lightGrad;
        ctx.beginPath();
        ctx.moveTo(cw * 0.35, 0);
        ctx.lineTo(cw * 0.65, 0);
        ctx.lineTo(cw * 0.7, ch * 0.6);
        ctx.lineTo(cw * 0.3, ch * 0.6);
        ctx.closePath();
        ctx.fill();

        // 下潜深度文字
        const depthShow = Math.floor(p3 * 10);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = 'rgba(150,200,255,0.8)';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`下潜中... ${depthShow}m`, cw / 2, ch / 2);
    }
}

// =============================================
// 迷宫结算界面（探路返回 / 救援成功）
// =============================================
function drawMazeDebrief(maze: any, cw: number, ch: number, time: number) {
    const isRescueSuccess = maze.phase === 'rescued';
    const showAlpha = Math.min(1, maze.resultTimer / 30);

    ctx.globalAlpha = showAlpha * 0.9;
    ctx.fillStyle = isRescueSuccess ? 'rgba(0,30,20,0.92)' : 'rgba(10,20,40,0.92)';
    ctx.fillRect(0, 0, cw, ch);

    ctx.globalAlpha = showAlpha;
    ctx.textAlign = 'center';

    // 标题
    const titleY = ch * 0.08;
    if (isRescueSuccess) {
        ctx.fillStyle = '#0f8';
        ctx.font = 'bold 28px Arial';
        ctx.fillText('🎉 救援成功！', cw / 2, titleY);
    } else {
        const lastDive = maze.diveHistory.length > 0 ? maze.diveHistory[maze.diveHistory.length - 1] : null;
        const reason = lastDive ? lastDive.returnReason : 'retreat';
        ctx.fillStyle = reason === 'o2' ? '#f80' : '#aef';
        ctx.font = 'bold 24px Arial';
ctx.fillText(reason === 'o2' ? '氧气不足，紧急返回' : '安全返回岸上', cw / 2, titleY);
    }

    // 分割线
    ctx.strokeStyle = isRescueSuccess ? 'rgba(0,255,150,0.4)' : 'rgba(100,180,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cw * 0.15, titleY + 16);
    ctx.lineTo(cw * 0.85, titleY + 16);
    ctx.stroke();

    // 本次下潜成果
    const lastDive = maze.diveHistory.length > 0 ? maze.diveHistory[maze.diveHistory.length - 1] : null;
    if (lastDive) {
        const statsY = titleY + 40;
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = 'rgba(200,230,255,0.95)';
        ctx.fillText('📋 本次下潜成果', cw / 2, statsY);

        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(180,220,255,0.9)';
        let sy = statsY + 30;
        const minutes = Math.floor(lastDive.duration / 60);
        const seconds = lastDive.duration % 60;
        ctx.fillText(`用时：${minutes}分${seconds < 10 ? '0' + seconds : seconds}秒`, cw / 2, sy);
        sy += 24;
        ctx.fillText(`最深到达：${lastDive.maxDepth}m`, cw / 2, sy);
        sy += 24;
        ctx.fillText(`新探索区域：${lastDive.newExploredCount} 格`, cw / 2, sy);
        sy += 24;
        ctx.fillText(`新铺绳索：${lastDive.ropePlaced} 段`, cw / 2, sy);

        if (maze.npcFound) {
            sy += 30;
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('⭐ 已发现被困者位置！', cw / 2, sy);
        }
    }

    // 全览地图（带轨迹）
    const mapSize = Math.min(cw * 0.75, ch * 0.3);
    const mapX = (cw - mapSize) / 2;
    const mapY = ch * 0.42;
    const cols = maze.mazeCols;
    const rows = maze.mazeRows;
    const cellW = mapSize / cols;
    const mapH = mapSize * (rows / cols);

    ctx.globalAlpha = showAlpha * 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath();
    rrect(ctx, mapX, mapY, mapSize, mapH, 4);
    ctx.fill();

    // 绘制已探索地图
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!maze.mazeExplored[r] || !maze.mazeExplored[r][c]) continue;
            const cell = maze.mazeMap[r][c];
            const px = mapX + c * cellW;
            const py = mapY + r * (mapH / rows);
            if (cell === 0) {
                const isNew = maze.thisExploredBefore && maze.thisExploredBefore[r] && !maze.thisExploredBefore[r][c];
                ctx.fillStyle = isNew ? 'rgba(100,200,255,0.8)' : 'rgba(50,80,100,0.6)';
            } else {
                ctx.fillStyle = 'rgba(30,40,50,0.9)';
            }
            ctx.fillRect(px, py, Math.max(1, cellW), Math.max(1, mapH / rows));
        }
    }

    // 绘制轨迹
    if (maze.playerPath && maze.playerPath.length > 0) {
        const pathLen = maze.playerPath.length;
        const animDuration = 90;
        const animProgress = Math.min(1, Math.max(0, (maze.resultTimer - 30) / animDuration));
        const drawCount = Math.floor(pathLen * animProgress);
        ctx.strokeStyle = 'rgba(255,200,50,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < drawCount; i++) {
            const pt = maze.playerPath[i];
            const px = mapX + (pt.x / maze.mazeTileSize) * cellW;
            const py = mapY + (pt.y / maze.mazeTileSize) * (mapH / rows);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }

    // 绳索
    if (state.rope && state.rope.ropes && state.rope.ropes.length > 0) {
        ctx.globalAlpha = showAlpha * 0.6;
        ctx.strokeStyle = 'rgba(255,150,50,0.8)';
        ctx.lineWidth = 1;
        for (const rope of state.rope.ropes) {
            if (!rope.path || rope.path.length < 2) continue;
            ctx.beginPath();
            const startPt = rope.path[0];
            ctx.moveTo(mapX + (startPt.x / maze.mazeTileSize) * cellW,
                       mapY + (startPt.y / maze.mazeTileSize) * (mapH / rows));
            for (let i = 1; i < rope.path.length; i++) {
                const pt = rope.path[i];
                ctx.lineTo(mapX + (pt.x / maze.mazeTileSize) * cellW,
                           mapY + (pt.y / maze.mazeTileSize) * (mapH / rows));
            }
            ctx.stroke();
        }
    }

    // 按钮
    if (maze.resultTimer >= 60) {
        const btnAlpha = Math.min(1, (maze.resultTimer - 60) / 20);
        ctx.globalAlpha = showAlpha * btnAlpha;

        const btnY = ch * 0.85;
        const btnH = 52;

        if (isRescueSuccess) {
            const nextBtnX = cw * 0.25;
            const nextBtnW = cw * 0.50;
            ctx.fillStyle = 'rgba(0,80,60,0.8)';
            ctx.beginPath();
            rrect(ctx, nextBtnX, btnY - btnH / 2, nextBtnW, btnH, 26);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,200,120,0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            rrect(ctx, nextBtnX, btnY - btnH / 2, nextBtnW, btnH, 26);
            ctx.stroke();
            ctx.fillStyle = 'rgba(100,255,180,0.95)';
            ctx.font = 'bold 16px Arial';
            ctx.fillText('▶ 下一局', cw / 2, btnY + 5);
        } else {
            const shoreBtnX = cw * 0.25;
            const shoreBtnW = cw * 0.50;
            ctx.fillStyle = 'rgba(21,101,192,0.8)';
            ctx.beginPath();
            rrect(ctx, shoreBtnX, btnY - btnH / 2, shoreBtnW, btnH, 26);
            ctx.fill();
            ctx.strokeStyle = 'rgba(100,180,255,0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            rrect(ctx, shoreBtnX, btnY - btnH / 2, shoreBtnW, btnH, 26);
            ctx.stroke();
            ctx.fillStyle = 'rgba(200,230,255,0.95)';
            ctx.font = 'bold 16px Arial';
ctx.fillText('回到岸上', cw / 2, btnY + 5);
        }

        if (isRescueSuccess) {
            const tapAlpha = 0.5 + Math.sin(time * 2.5) * 0.5;
            ctx.globalAlpha = showAlpha * btnAlpha * tapAlpha;
            ctx.fillStyle = 'rgba(150,180,200,0.8)';
            ctx.font = '13px Arial';
            ctx.fillText('点击其他区域返回主菜单', cw / 2, ch * 0.96);
        }
    }
}
