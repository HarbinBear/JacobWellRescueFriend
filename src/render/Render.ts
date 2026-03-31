import { CONFIG } from '../core/config';
import { state, player, target, particles, touches } from '../core/state';
import { canvas, ctx, dpr, logicW, logicH } from './Canvas';
import { computeSiltAttenuation, isLineOfSight, getLightPolygon } from './RenderLight';
import { initWebGLLight, isWebGLAvailable, uploadPolyData, uploadSiltData, uploadVPLData, renderLightMask, renderVolumetricLight, getGLCanvas } from './WebGLLight';
import { drawDiver } from './RenderDiver';
import { drawUI, drawControls, drawSlashEffect } from './RenderUI';
import { drawRopesWorld, drawRopeButton } from './RenderRope';
import { drawAllFishEnemies, drawFishBiteEffect } from './RenderFishEnemy';
import { drawMazeBackgroundDecorations, drawMazeWallShape, getMazeParticleColorByWorld, getMazeThemeColorByCell } from './RenderMazeScene';

// 向后兼容，重新导出 canvas 和 ctx
export { canvas, ctx };

// 资源缓存
const wallPatternCanvas = wx.createCanvas(); // 岩石纹理

// WebGL 光照标志
let _useWebGL = false;

// --- 预生成岩石纹理 ---
export function initTextures() {
    wallPatternCanvas.width = 100;
    wallPatternCanvas.height = 100;
    const pCtx = wallPatternCanvas.getContext('2d');
    pCtx.fillStyle = '#222'; 
    pCtx.fillRect(0,0,100,100);
    for(let i=0; i<300; i++) {
        pCtx.fillStyle = Math.random() > 0.5 ? '#555' : '#333';
        pCtx.beginPath();
        pCtx.arc(Math.random()*100, Math.random()*100, Math.random()*3, 0, Math.PI*2);
        pCtx.fill();
    }
    
    // 初始化 WebGL 光照
    _useWebGL = initWebGLLight();
    if (_useWebGL) {
        console.log('[光照] WebGL 路径已启用');
    } else {
        console.warn('[光照] WebGL 不可用，已启用 Canvas 2D fallback 光照');
    }
}

// 手动绘制圆角矩形路径（兼容微信小游戏，避免 roundRect 参数问题）
function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

function drawSplashes() {
    for(let p of state.splashes) {
        ctx.fillStyle = `rgba(200, 240, 255, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
    }
}

// --- 主渲染函数 ---
export function draw() {
    // 每帧开始时确保dpr缩放生效
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    let zoom = state.camera ? state.camera.zoom : 1;
    // 手电筒激活状态：受玩家手动开关控制，剧情特殊状态可覆盖
    let flashlightActive = state.flashlightOn !== false;
    
    // 屏幕震动
    let shakeX = 0, shakeY = 0;
    if(state.story.shake > 0) {
        shakeX = (Math.random() - 0.5) * state.story.shake;
        shakeY = (Math.random() - 0.5) * state.story.shake;
    }

    // 1. 绘制基础世界
    ctx.fillStyle = '#252a30'; 
    ctx.fillRect(0, 0, logicW, logicH);

    ctx.save();
    // 摄像机变换：居中缩放
    ctx.translate(logicW/2 + shakeX, logicH/2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-player.x, -player.y);

    // 绘制水面背景（明亮天空和浅水渐变）
    let skyGradient = ctx.createLinearGradient(0, -800, 0, 600);
    skyGradient.addColorStop(0, '#87CEEB');
    skyGradient.addColorStop(0.5, '#E0F7FA');
    skyGradient.addColorStop(0.6, '#4DD0E1');
    skyGradient.addColorStop(1, 'rgba(37, 42, 48, 0)');

    ctx.fillStyle = skyGradient;
    ctx.fillRect(-2000, -1000, 6000, 1600);

    // 绘制水面线（多层波浪）
    let time = Date.now() / 1000;
    
    // 后层波浪（较暗，较慢）
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-1000, 5);
    for(let x=-1000; x<3000; x+=40) {
        ctx.lineTo(x, 5 + Math.sin(x/150 + time*0.8)*8);
    }
    ctx.stroke();

    // 绘制水花（在前后波浪之间）
    drawSplashes();

    // 前层波浪（明亮，较快）
    ctx.strokeStyle = 'rgba(200, 240, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1000, 5); 
    for(let x=-1000; x<3000; x+=30) {
        ctx.lineTo(x, 5 + Math.sin(x/100 + time)*5);
    }
    ctx.stroke();

    // 绘制丁达尔光（仅在浅水区可见）
    if(player.y < 600) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for(let i=0; i<5; i++) {
            let rayX = (Math.floor(time * 20) + i * 200) % 2000 - 500;
            let rayAngle = Math.PI/2 + Math.sin(time * 0.5 + i) * 0.2;
            
            let grad = ctx.createLinearGradient(rayX, 0, rayX + Math.cos(rayAngle)*400, Math.sin(rayAngle)*400);
            grad.addColorStop(0, 'rgba(200, 255, 255, 0.15)');
            grad.addColorStop(1, 'rgba(200, 255, 255, 0)');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(rayX - 20, 0);
            ctx.lineTo(rayX + 20, 0);
            ctx.lineTo(rayX + Math.cos(rayAngle)*400 + 40, Math.sin(rayAngle)*400);
            ctx.lineTo(rayX + Math.cos(rayAngle)*400 - 40, Math.sin(rayAngle)*400);
            ctx.fill();
        }
        ctx.restore();
    }

    // 绘制墙壁（使用 state.walls 支持不规则布局）
    let viewHalfW = (logicW/2) / zoom + 100;
    let viewHalfH = (logicH/2) / zoom + 100;
    let viewL = player.x - viewHalfW;
    let viewR = player.x + viewHalfW;
    let viewT = player.y - viewHalfH;
    let viewB = player.y + viewHalfH;

    const { tileSize: ts } = CONFIG;

    // 迷宫模式：使用迷宫专属地图数据渲染
    const isMazeMode = state.screen === 'mazeRescue' && state.mazeRescue;

    // 迷宫岸上阶段、入水动效和结算阶段：跳过水下场景渲染，只渲染UI
    if (isMazeMode && (state.mazeRescue.phase === 'shore' || state.mazeRescue.phase === 'diving_in' || state.mazeRescue.phase === 'debrief' || state.mazeRescue.phase === 'rescued')) {
        ctx.restore();
        drawUI();
        return;
    }

    const renderMap = isMazeMode ? state.mazeRescue.mazeMap : state.map;
    const renderWalls = isMazeMode ? state.mazeRescue.mazeWalls : state.walls;
    const renderRows = isMazeMode ? state.mazeRescue.mazeRows : CONFIG.rows;
    const renderCols = isMazeMode ? state.mazeRescue.mazeCols : CONFIG.cols;
    const renderTs = isMazeMode ? state.mazeRescue.mazeTileSize : ts;

    let viewRowMin = Math.max(0, Math.floor(viewT / renderTs) - 1);
    let viewRowMax = Math.min(renderRows - 1, Math.floor(viewB / renderTs) + 1);
    let viewColMin = Math.max(0, Math.floor(viewL / renderTs) - 1);
    let viewColMax = Math.min(renderCols - 1, Math.floor(viewR / renderTs) + 1);

    if (isMazeMode && state.mazeRescue.sceneThemeMap) {
        drawMazeBackgroundDecorations(ctx, renderMap, viewRowMin, viewRowMax, viewColMin, viewColMax, renderTs);
    }

    // 绘制实心内部填充（无缝，无网格边框）
    for(let r = viewRowMin; r <= viewRowMax; r++) {
        if(!renderMap[r]) continue;
        for(let c = viewColMin; c <= viewColMax; c++) {
            if(renderMap[r][c] === 2) {
                ctx.fillStyle = isMazeMode ? getMazeThemeColorByCell(r, c, 'innerColor', '#1a1a1a') : '#1a1a1a';
                ctx.fillRect(c * renderTs - 0.5, r * renderTs - 0.5, renderTs + 1, renderTs + 1);
            }
        }
    }

    // 绘制边缘岩石（叠加在方块上，形成自然轮廓）
    for(let w of renderWalls) {
        if(w.x > viewL && w.x < viewR && w.y > viewT && w.y < viewB) {
            if (isMazeMode && state.mazeRescue.sceneThemeMap) {
                drawMazeWallShape(ctx, w, w.row, w.col);
            } else {
                ctx.fillStyle = '#222';
                ctx.beginPath();
                ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath();
                ctx.arc(w.x - w.r * 0.3, w.y - w.r * 0.3, w.r * 0.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // 迷宫模式：绘制出口标记
    if (isMazeMode) {
        const maze = state.mazeRescue;
        const exitX = maze.exitX;
        const exitY = maze.exitY;
        const exitPulse = 0.6 + Math.sin(time * 3) * 0.4;
        ctx.save();
        ctx.globalAlpha = exitPulse;
        ctx.strokeStyle = '#0f8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(exitX, exitY, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,255,150,0.15)';
        ctx.beginPath();
        ctx.arc(exitX, exitY, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 绘制海草
    if(state.plants) {
        for(let p of state.plants) {
            if(p.x > viewL && p.x < viewR && p.y > viewT && p.y < viewB) {
                let sway = Math.sin(time * 2 + p.offset) * 5;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.quadraticCurveTo(p.x + sway, p.y - p.len/2, p.x + sway*1.5, p.y - p.len);
                ctx.stroke();
            }
        }
    }

    // 绘制鱼
    if(state.fishes) {
        for(let f of state.fishes) {
            if(f.x > viewL && f.x < viewR && f.y > viewT && f.y < viewB) {
                ctx.save();
                ctx.translate(f.x, f.y);
                
                let angle = f.angle !== undefined ? f.angle : Math.atan2(f.vy, f.vx);
                ctx.rotate(angle);
                
                ctx.fillStyle = f.color;
                
                ctx.beginPath();
                ctx.moveTo(f.size, 0); 
                ctx.quadraticCurveTo(0, -f.size*0.6, -f.size, 0); 
                ctx.quadraticCurveTo(0, f.size*0.6, f.size, 0); 
                ctx.fill();

                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.beginPath();
                ctx.arc(f.size * 0.6, -f.size * 0.2, f.size * 0.25, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(f.size * 0.7, -f.size * 0.2, f.size * 0.12, 0, Math.PI*2);
                ctx.fill();
                
                ctx.fillStyle = f.color;
                ctx.save();
                
                let tailSway = Math.sin(time * 15 + f.phase) * 0.5;
                ctx.translate(-f.size, 0);
                ctx.rotate(tailSway);
                
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-f.size * 0.6, -f.size * 0.5);
                ctx.lineTo(-f.size * 0.6, f.size * 0.5);
                ctx.fill();
                
                ctx.restore();
                ctx.restore();
            }
        }
    }

    // 绘制环境文字
    if(state.texts) {
        ctx.textAlign = 'center';
        for(let t of state.texts) {
            ctx.fillStyle = t.color || '#888';
            ctx.font = t.font || '12px Consolas';
            ctx.fillText(t.text, t.x, t.y);
        }
    }

    // 绘制目标
    if(target.found || player.hasTarget) {
        ctx.fillStyle = '#0ff';
        ctx.beginPath(); ctx.arc(target.x, target.y, 8, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = '12px Consolas';
        ctx.textAlign = 'center';
        ctx.fillText(target.name, target.x, target.y - 15);

        if(player.hasTarget) {
            ctx.strokeStyle = '#666'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(target.x, target.y); ctx.stroke();
        }
    } else {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.beginPath(); ctx.arc(target.x, target.y, 6, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Consolas';
        ctx.textAlign = 'center';
        ctx.fillText(target.name, target.x, target.y - 12);
    }

    // 绘制粒子（泥沙在光照层之后单独绘制）
    for(let p of particles) {
        if(p.type === 'silt') {
            continue;
        } else if (p.type === 'blood') {
            ctx.fillStyle = `rgba(200, 0, 0, ${p.life * 0.8})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(1.0, 0.9); 
            
            ctx.fillStyle = `rgba(200, 255, 255, ${p.life * 0.5})`;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI*2); ctx.fill();
            
            ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.8})`;
            ctx.beginPath(); ctx.arc(-p.size*0.3, -p.size*0.3, p.size*0.2, 0, Math.PI*2); ctx.fill();
            
            ctx.restore();
        }
    }

    // 绘制废弃潜水服
    if(state.landmarks && state.landmarks.suit) {
        let s = state.landmarks.suit;
        if(s.x > viewL && s.x < viewR && s.y > viewT && s.y < viewB) {
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(Math.PI/4);
            
            ctx.fillStyle = '#555';
            ctx.fillRect(-10, -20, 20, 40);
            ctx.beginPath(); ctx.arc(0, -25, 8, 0, Math.PI*2); ctx.fill();
            
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(5, 0); ctx.lineTo(-2, 10); ctx.fill();
            
            ctx.restore();
        }
    }

    // --- 绘制绳索（世界空间，在角色之前）---
    drawRopesWorld();

    // --- 绘制凶猛鱼敌人（在角色之前）---
    drawAllFishEnemies(ctx);

    // --- 计算光照参数（体积光和遮罩共用）---
    let vRayDist = CONFIG.lightRange;
    
    if(state.story.stage === 4 && state.story.flags.narrowVision) {
        let factor = Math.max(0, player.o2 / 80);
        vRayDist = 20 + factor * 80; 
    } else if(state.story.flags.narrowVision) {
        vRayDist = 30; 
    }

    let playerFlashlightActive = (state.screen === 'fishArena' || state.screen === 'mazeRescue' ? true : player.y > 600) && flashlightActive;
    let npcActive = !!(state.npc && state.npc.active && state.npc.y > 600 && CONFIG.bShowNpcFlashLight);
    let npcX = state.npc ? state.npc.x : 0;
    let npcY = state.npc ? state.npc.y : 0;
    let npcAngle = state.npc ? state.npc.angle : 0;

    // --- 绘制角色 ---

    // 绘制 NPC
    if(state.npc && state.npc.active) {
        const npcColors = {
            suit: '#333',
            body: '#d44',
            tank: '#bef',
            mask: '#fa0'
        };
        drawDiver(ctx, state.npc.x, state.npc.y, state.npc.angle, npcColors, Date.now()/150);
    }

    // 绘制玩家
    let hasTank = !state.story.flags.tankDamaged;
    drawDiver(ctx, player.x, player.y, player.angle, null, player.animTime, hasTank);

    ctx.restore();

    // 2. 光照遮罩计算（WebGL）
    let depthFactor = 0;
    if (player.y < CONFIG.darknessStartDepth) {
        depthFactor = player.y / CONFIG.darknessStartDepth;
    } else {
        depthFactor = 1.0;
    }
    
    let baseAmbient = CONFIG.ambientLightSurface * (1 - depthFactor);
    if (baseAmbient < CONFIG.ambientLightDeep) baseAmbient = CONFIG.ambientLightDeep;
    let currentAmbient = baseAmbient;
    let maskAlpha = Math.max(0, 1 - currentAmbient);

    let rayDist = CONFIG.lightRange;

    // 第三关：手电筒损坏闪烁效果
    if(state.story.flags.flashlightBroken) {
        if(state.story.flags.flashlightFixedOff) {
            flashlightActive = false;
            playerFlashlightActive = false;
            rayDist = 0;
        } else {
            let t = Date.now() / 1000;
            let flicker = Math.sin(t * 1.3) * Math.sin(t * 1.7) * Math.sin(t * 2.1);
            flashlightActive = flicker > -0.3;
            playerFlashlightActive = (state.screen === 'fishArena' || state.screen === 'mazeRescue' ? true : player.y > 600) && flashlightActive;
            if(flashlightActive) {
                rayDist = CONFIG.lightRange * (0.5 + Math.abs(flicker) * 0.5);
            }
        }
    }

    if(state.story.stage === 4 && state.story.flags.narrowVision) {
        let factor = Math.max(0, player.o2 / 80);
        rayDist = 20 + factor * 80;
        maskAlpha = 0.95 + (1-factor) * 0.05;
    } else if(state.story.flags.narrowVision) {
        rayDist = 30;
        maskAlpha = 0.95;
    }

    if (_useWebGL && isWebGLAvailable()) {
        // WebGL 路径：CPU 端计算射线碰撞和泥沙，上传到 GPU，一个 draw call 完成所有光照
        let poly = playerFlashlightActive ? getLightPolygon(player.x, player.y, player.angle, rayDist, CONFIG.fov) : [];
        let siltData = null;
        let hasSilt = false;
        let siltSteps = 0;
        
        if (playerFlashlightActive && player.silt > 0) {
            siltData = computeSiltAttenuation(player.x, player.y, player.angle, rayDist, CONFIG.fov, particles);
            if (siltData) {
                hasSilt = true;
                siltSteps = siltData.steps;
            }
        }
        
        // 上传数据到 GPU 纹理
        uploadPolyData(poly, rayDist);
        uploadSiltData(siltData);
        let vplCount = uploadVPLData(poly, rayDist) || 0;
        
        // 渲染体积光（screen 模式叠加到主画布）
        renderVolumetricLight({
            playerX: player.x, playerY: player.y,
            zoom, shakeX, shakeY,
            angle: player.angle, maxDist: vRayDist,
            flashlightActive: playerFlashlightActive,
            npcX, npcY, npcAngle, npcDist: vRayDist * 0.5, npcActive,
            polyCount: poly.length, vplCount
        });
        
        // 将体积光合成到主画布（screen 模式）
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(getGLCanvas() as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height, 0, 0, logicW, logicH);
        ctx.restore();
        
        // 渲染光照遮罩
        renderLightMask({
            playerX: player.x, playerY: player.y,
            zoom, shakeX, shakeY,
            angle: player.angle, maxDist: rayDist,
            flashlightActive: playerFlashlightActive,
            maskAlpha,
            hasSilt, siltSteps,
            npcX, npcY, npcAngle, npcDist: rayDist * 0.9, npcActive,
            polyCount: poly.length, vplCount
        });
        
        // 将遮罩合成到主画布
        ctx.drawImage(getGLCanvas() as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height, 0, 0, logicW, logicH);
    } else {
        // WebGL 不可用的紧急 fallback（不应该走到这里）
        // 在控制台输出醒目警告
        if (!(state as any)._webglWarned) {
            console.error('!!! 严重警告：WebGL 光照初始化失败，光照系统无法正常工作 !!!');
            console.error('请检查设备 WebGL 支持情况和 shader 编译日志');
            (state as any)._webglWarned = true;
        }
        // 最低限度的黑暗遮罩，至少让深水区变黑
        ctx.fillStyle = `rgba(0, 2, 8, ${maskAlpha})`;
        ctx.fillRect(0, 0, logicW, logicH);
    }

    // 绘制灰色物体（氧气罐造型）
    // 鱼眼出现前：模糊隐约；鱼眼出现后：清晰可见
    if(state.story.stage === 7 && state.story.flags.flashlightBroken) {
        let gx = CONFIG.grayThingX;
        let gy = CONFIG.grayThingY;
        let distToGrayThing = Math.hypot(player.x - gx, player.y - gy);
        // 在配置距离内开始显示
        if(distToGrayThing < CONFIG.grayThingVisibleDist) {
            let visibility = Math.max(0, 1 - distToGrayThing / CONFIG.grayThingVisibleDist);
            // 鱼眼出现前：模糊（最高alpha 0.45）；鱼眼出现后：清晰（最高alpha 1.0）
            let maxAlpha = state.story.flags.fishEyeTriggered ? 1.0 : 0.45;
            ctx.save();
            ctx.translate(logicW/2 + shakeX, logicH/2 + shakeY);
            ctx.scale(zoom, zoom);
            ctx.translate(-player.x, -player.y);
            ctx.globalAlpha = visibility * maxAlpha;
            
            // 氧气罐造型：圆柱形罐体
            let tankW = 18, tankH = 44;
            // 罐体主体（圆角矩形）
            let tankGrad = ctx.createLinearGradient(gx - tankW, gy, gx + tankW, gy);
            tankGrad.addColorStop(0, 'rgba(80,85,90,0.9)');
            tankGrad.addColorStop(0.3, 'rgba(130,135,140,0.95)');
            tankGrad.addColorStop(0.5, 'rgba(160,165,170,1)');
            tankGrad.addColorStop(0.7, 'rgba(110,115,120,0.95)');
            tankGrad.addColorStop(1, 'rgba(70,75,80,0.9)');
            ctx.fillStyle = tankGrad;
            ctx.beginPath();
            roundRectPath(ctx, gx - tankW/2, gy - tankH/2, tankW, tankH, tankW/2);
            ctx.fill();
            // 罐頂阀门（小矩形）
            ctx.fillStyle = 'rgba(90,95,100,0.9)';
            ctx.beginPath();
            roundRectPath(ctx, gx - tankW/2 + 3, gy - tankH/2 - 7, tankW - 6, 8, 2);
            ctx.fill();
            // 阀门接口（小圆）
            ctx.fillStyle = 'rgba(60,65,70,0.95)';
            ctx.beginPath();
            ctx.arc(gx, gy - tankH/2 - 10, 4, 0, Math.PI * 2);
            ctx.fill();
            // 罐体反光高光
            ctx.fillStyle = 'rgba(200,210,220,0.25)';
            ctx.beginPath();
            ctx.ellipse(gx - tankW/4, gy - tankH/4, tankW/5, tankH/4, -0.3, 0, Math.PI * 2);
            ctx.fill();
            // 罐体底部圆弧
            ctx.strokeStyle = 'rgba(60,65,70,0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(gx, gy + tankH/2 - 4, tankW/2 - 2, 0, Math.PI);
            ctx.stroke();
            
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }
    // 绘制恐怖鱼眼闪现（手电筒突然亮起的瞬间，鱼眼在灰色物体位置）
    if(state.story.flags.fishEyeFlashTimer > 0) {
        let flashProgress = state.story.flags.fishEyeFlashTimer; // 直接是 1.0 -> 0 的进度值
        ctx.save();
        // 手电筒亮起的微弱白光闪
        ctx.fillStyle = `rgba(255,255,240,${flashProgress * 0.12})`;
        ctx.fillRect(0, 0, logicW, logicH);
        
        // 鱼眼在灰色物体（氧气罐）的屏幕坐标位置
        let screenX = logicW/2 + (CONFIG.grayThingX - player.x) * zoom + shakeX;
        let screenY = logicH/2 + (CONFIG.grayThingY - player.y) * zoom + shakeY;
        
        // 鱼眼大小（占据视野中央）
        let eyeR = logicH * 0.38;
        
        // 眼白（灰白色，带血丝）
        let eyeGrad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, eyeR);
        eyeGrad.addColorStop(0, `rgba(15,15,15,${flashProgress})`);
        eyeGrad.addColorStop(0.28, `rgba(15,15,15,${flashProgress})`);
        eyeGrad.addColorStop(0.3, `rgba(155,155,150,${flashProgress * 0.95})`);
        eyeGrad.addColorStop(0.6, `rgba(170,168,162,${flashProgress * 0.88})`);
        eyeGrad.addColorStop(0.82, `rgba(185,182,175,${flashProgress * 0.72})`);
        eyeGrad.addColorStop(1, `rgba(185,182,175,0)`);
        ctx.fillStyle = eyeGrad;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, eyeR, eyeR * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 虹膜（深灰色，带纹理感）
        let irisR = eyeR * 0.3;
        let irisGrad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, irisR);
        irisGrad.addColorStop(0, `rgba(8,8,8,${flashProgress})`);
        irisGrad.addColorStop(0.35, `rgba(8,8,8,${flashProgress})`);
        irisGrad.addColorStop(0.38, `rgba(55,52,48,${flashProgress * 0.9})`);
        irisGrad.addColorStop(0.7, `rgba(45,42,38,${flashProgress * 0.85})`);
        irisGrad.addColorStop(1, `rgba(35,32,28,${flashProgress * 0.6})`);
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, irisR, irisR, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 瞳孔（极度放大，几乎占满虹膜）
        let pupilR = irisR * 0.88;
        ctx.fillStyle = `rgba(0,0,0,${flashProgress})`;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, pupilR, pupilR * 1.05, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 眼睛高光（微弱，灰白色）
        ctx.fillStyle = `rgba(220,220,215,${flashProgress * 0.5})`;
        ctx.beginPath();
        ctx.ellipse(screenX - irisR * 0.3, screenY - irisR * 0.35, irisR * 0.18, irisR * 0.12, -0.5, 0, Math.PI * 2);
        ctx.fill();
        
        // 血丝（放射状红线，是唯一鲜艳的颜色）
        ctx.save();
        ctx.globalAlpha = flashProgress * 0.75;
        ctx.strokeStyle = 'rgba(160,25,25,0.85)';
        ctx.lineWidth = 1.2;
        for(let i = 0; i < 22; i++) {
            let angle = (i / 22) * Math.PI * 2;
            let startR = eyeR * 0.32;
            // 血丝长短不一，更真实
            let endR = eyeR * (0.62 + (i % 3 === 0 ? 0.18 : 0.08));
            ctx.beginPath();
            // 血丝稍微弯曲
            let midAngle = angle + 0.08;
            let midR = (startR + endR) / 2;
            ctx.moveTo(screenX + Math.cos(angle) * startR, screenY + Math.sin(angle) * startR * 0.72);
            ctx.quadraticCurveTo(
                screenX + Math.cos(midAngle) * midR,
                screenY + Math.sin(midAngle) * midR * 0.72,
                screenX + Math.cos(angle) * endR,
                screenY + Math.sin(angle) * endR * 0.72
            );
            ctx.stroke();
        }
        ctx.restore();
        
        // 眼筜（上下遮挡，让眼睛更像真实的眼睛）
        ctx.fillStyle = `rgba(5,5,8,${flashProgress})`;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY - eyeR * 0.72 * 0.85, eyeR * 1.1, eyeR * 0.35, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + eyeR * 0.72 * 0.85, eyeR * 1.1, eyeR * 0.35, 0, 0, Math.PI);
        ctx.fill();
        
        ctx.restore();
    }
    // 绘制放弃救援按钮（矩形，沿矩形边框转圈动效）
    if(state.story.flags.abandonBtnVisible && state.story.stage === 7) {
        let btnW = 200, btnH = 64;
        let btnX = logicW / 2 - btnW / 2;
        let btnY = logicH * 0.28 - btnH / 2;
        let btnCx = btnX + btnW / 2;
        let btnCy = btnY + btnH / 2;
        let r = 10; // 圆角半径
        let holdProgress = state.story.flags.abandonBtnHolding
            ? Math.min(1, (Date.now() - state.story.flags.abandonBtnHoldStartTime) / (CONFIG.abandonBtnHoldDuration * 1000))
            : 0;
        
        ctx.save();
        
        // 外层脉冲光晕（未按下时）
        if(holdProgress === 0) {
            let glowAlpha = 0.12 + Math.sin(Date.now()/300)*0.08;
            ctx.fillStyle = `rgba(180,30,30,${glowAlpha})`;
            ctx.beginPath();
            roundRectPath(ctx, btnX - 8, btnY - 8, btnW + 16, btnH + 16, r + 6);
            ctx.fill();
        }
        
        // 按钮背景矩形
        ctx.fillStyle = 'rgba(80,0,0,0.85)';
        ctx.beginPath();
        roundRectPath(ctx, btnX, btnY, btnW, btnH, r);
        ctx.fill();
        
        // 按钮边框（静态底色）
        ctx.strokeStyle = 'rgba(120,30,30,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        roundRectPath(ctx, btnX, btnY, btnW, btnH, r);
        ctx.stroke();
        
        // 长按进度：沿矩形边框顺时针转圈
        if(holdProgress > 0) {
            // 矩形周长
            let perimeter = 2 * (btnW + btnH);
            let progressLen = holdProgress * perimeter;
            
            // 从顶边中点开始，顺时针：上→右→下→左
            ctx.strokeStyle = 'rgba(220,50,50,0.95)';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            
            // 起点：顶边中点
            let startX = btnCx;
            let startY = btnY;
            ctx.moveTo(startX, startY);
            
            let remaining = progressLen;
            
            // 上边右半段：从中点到右上角
            let seg = btnW / 2;
            if(remaining <= 0) { /* skip */ }
            else if(remaining < seg) {
                ctx.lineTo(startX + remaining, btnY);
                remaining = 0;
            } else {
                ctx.lineTo(btnX + btnW, btnY);
                remaining -= seg;
            }
            
            // 右边：从右上角到右下角
            seg = btnH;
            if(remaining > 0) {
                if(remaining < seg) {
                    ctx.lineTo(btnX + btnW, btnY + remaining);
                    remaining = 0;
                } else {
                    ctx.lineTo(btnX + btnW, btnY + btnH);
                    remaining -= seg;
                }
            }
            
            // 下边：从右下角到左下角
            seg = btnW;
            if(remaining > 0) {
                if(remaining < seg) {
                    ctx.lineTo(btnX + btnW - remaining, btnY + btnH);
                    remaining = 0;
                } else {
                    ctx.lineTo(btnX, btnY + btnH);
                    remaining -= seg;
                }
            }
            
            // 左边：从左下角到左上角
            seg = btnH;
            if(remaining > 0) {
                if(remaining < seg) {
                    ctx.lineTo(btnX, btnY + btnH - remaining);
                    remaining = 0;
                } else {
                    ctx.lineTo(btnX, btnY);
                    remaining -= seg;
                }
            }
            
            // 上边左半段：从左上角回到中点
            seg = btnW / 2;
            if(remaining > 0) {
                let draw = Math.min(remaining, seg);
                ctx.lineTo(btnX + draw, btnY);
            }
            
            ctx.stroke();
        }
        
        // 按钮文字
        ctx.fillStyle = '#ff8888';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('长按放弃救援', btnCx, btnCy - 9);
        ctx.fillStyle = 'rgba(200,150,150,0.8)';
        ctx.font = '11px Arial';
        ctx.fillText('（熊子，对不起了）', btnCx, btnCy + 12);
        
        ctx.restore();
    }

    // 绘制泥沙粒子（在光照层之上，使泥沙遮盖光照）
    ctx.save();
    ctx.translate(logicW/2 + shakeX, logicH/2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-player.x, -player.y);
    for(let p of particles) {
        if(p.type !== 'silt') continue;
        let siltAlpha = p.alpha * Math.max(0, p.life);
        if (siltAlpha < 0.005) continue;
        // 迷宫模式：泥沙颜色跟随区域主题
        if (isMazeMode && state.mazeRescue.sceneThemeMap) {
            const particleColor = getMazeParticleColorByWorld(p.x, p.y, renderTs, renderRows, renderCols, siltAlpha);
            if (particleColor) {
                ctx.fillStyle = particleColor;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
                continue;
            }
        }
        ctx.fillStyle = `rgba(120, 100, 80, ${siltAlpha})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // 黑屏过渡
    if(state.story.flags.blackScreen) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, logicW, logicH);
    }

    // 红色叠加（濒死状态）
    if(state.story.redOverlay > 0.001) {
        let t = state.story.redOverlay;
        let r = Math.floor(255 * (1-t) + 61 * t);
        let g = Math.floor(0 * (1-t) + 3 * t);
        let b = Math.floor(0 * (1-t) + 3 * t);
        let alpha = Number(state.story.redOverlay.toFixed(3));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fillRect(0, 0, logicW, logicH);
    }

    // 3. 绘制 UI
    drawUI();
    drawControls();
    drawRopeButton();

    // 绘制刀光特效（在 UI 之上，屏幕空间）
    if (state.playerAttack && state.playerAttack.active) {
        const zoom = state.camera ? state.camera.zoom : 1;
        const playerScreenX = logicW / 2 + shakeX;
        const playerScreenY = logicH / 2 + shakeY;
        const totalSlashDur = CONFIG.attack.slashSwingDuration + CONFIG.attack.slashLingerDuration;
        if (state.playerAttack.timer <= totalSlashDur) {
            drawSlashEffect(
                ctx,
                logicW,
                logicH,
                playerScreenX,
                playerScreenY,
                state.playerAttack.angle,
                state.playerAttack.timer
            );
        }
    }

    // 绘制凶猛鱼被咬特效（在 UI 之上，屏幕空间）
    drawFishBiteEffect(ctx, logicW, logicH);

    // 4. 过渡动画
    if(state.transition && state.transition.active) {
        ctx.save();
        
        let t = state.transition.alpha;
        
        let bgR = 0, bgG = 17, bgB = 51;
        if (state.transition.mode === 'in') {
            bgR = 0; bgG = 60; bgB = 100;
        }
        
        ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${t})`;
        ctx.fillRect(0, 0, logicW, logicH);
        
        if (state.transition.bubbles) {
            for(let b of state.transition.bubbles) {
                let alpha = t * 0.6;
                if(alpha > 1) alpha = 1;
                
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.size, 0, Math.PI*2);
                ctx.fill();
                
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 1.5})`;
                ctx.beginPath();
                ctx.arc(b.x - b.size*0.3, b.y - b.size*0.3, b.size*0.2, 0, Math.PI*2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
}