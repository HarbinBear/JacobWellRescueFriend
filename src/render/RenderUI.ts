import { CONFIG } from '../core/config';
import { state, player, target, touches } from '../core/state';
import { ctx, canvas, logicW, logicH } from './Canvas';
import { drawDiver, drawLungs, drawDiverSilhouette } from './RenderDiver';
import { createFishEnemy } from '../logic/FishEnemy';
import { triggerPlayerAttack } from '../logic/FishEnemy';
import { drawMenu } from './RenderMenu';
import { drawEnding } from './RenderEnding';
import { drawArenaHUD } from './RenderArenaUI';
import { drawMazeHUD } from './RenderMazeUI';

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
        if (CONFIG.manualDrive.enabled) {
            // 手动挡模式：不显示摇杆，显示搓屏提示
            if (touches.joystickId === null && !Object.keys(state.manualDrive.activeTouches || {}).length) {
                ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'center'; ctx.font = '14px Arial';
                ctx.fillText('搓屏幕移动（方向与推水相反）', logicW/2, logicH-50);
            }
        } else if(touches.joystickId !== null) {
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
