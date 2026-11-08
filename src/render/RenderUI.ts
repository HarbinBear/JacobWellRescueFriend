import { drawSemiAutoControls } from './RenderSemiAutoDrive';
import { CONFIG } from '../core/config';
import { state, player, touches } from '../core/state';
import { ctx, canvas, logicW, logicH } from './Canvas';
import { createFishEnemy } from '../logic/FishEnemy';
import { triggerPlayerAttack } from '../logic/FishEnemy';
import { drawMenu } from './RenderMenu';
import { drawProgressSelect } from './RenderProgressSelect';
import { drawArenaHUD } from './RenderArenaUI';
import { drawMazeHUD } from './RenderMazeUI';
import { drawHomeScene } from './RenderHomeScene';
import { getUILayout } from '../core/UILayout';
import { drawFlashlightIcon } from './RenderFlashlight';

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
    get x() { return getUILayout().flashlight.x; },
    get y() { return getUILayout().flashlight.y; },
    r: 22,
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

    if(state.screen === 'lose') {
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,logicW,logicH);
        ctx.fillStyle = '#f00'; ctx.font = '30px Arial'; ctx.textAlign = 'center';
        ctx.fillText('任务失败', logicW/2, logicH/2 - 20);
        ctx.fillStyle = '#fff'; ctx.font = '20px Arial';
        ctx.fillText(state.alertMsg, logicW/2, logicH/2 + 20);
        ctx.fillText('点击屏幕返回主菜单', logicW/2, logicH/2 + 60);
    } else if(state.screen === 'menu') {
        drawMenu();
    } else if(state.screen === 'progressSelect') {
        drawProgressSelect();
    } else if(state.screen === 'fishArena') {
        drawArenaHUD();
    } else if(state.screen === 'mazeRescue') {
        drawMazeHUD();
    } else if(state.screen === 'home_evening') {
        drawHomeScene();
    }
}


// ---- 章节配图绘制 ----

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
    const isMazePlay = state.screen === 'mazeRescue' && state.mazeRescue?.phase === 'play';
    const isPlayScreen = state.screen === 'play' || state.screen === 'fishArena' || isMazePlay;
    if (!isPlayScreen) return;

    // 竞技场准备阶段不显示摇杆提示（但攻击按钮仍显示）
    const isArenaPrep = state.screen === 'fishArena' && state.fishArena && state.fishArena.phase === 'prep';

    if (!isArenaPrep && CONFIG.driveMode === 'semiAuto') drawSemiAutoControls(ctx, logicW, logicH);
    // 主动动作按钮由 RenderInteraction 统一绘制，避免旧攻击按钮重复。
    // 绘制手电筒开关按钮
    if (!isMazePlay) drawFlashlightButton();
}

// =============================================
// 绘制手电筒开关按钮（攻击按钮左边）
// =============================================
function drawFlashlightButton() {
    const p = getUILayout().flashlight;
    drawFlashlightIcon(ctx, p.x, p.y, p.size, state.flashlightOn !== false);
}

// =============================================
// 绘制攻击按鈕（右下角常驻）
// =============================================
