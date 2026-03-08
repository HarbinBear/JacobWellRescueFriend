import { CONFIG } from '../core/config';
import { state, player, target, particles, touches } from '../core/state';
import { canvas, ctx } from './Canvas';
import { drawFlashlight, computeSiltAttenuation, isLineOfSight } from './RenderLight';
import { drawDiver } from './RenderDiver';
import { drawUI, drawControls } from './RenderUI';
import { drawRopesWorld, drawRopeButton } from './RenderRope';

// 向后兼容，重新导出 canvas 和 ctx
export { canvas, ctx };

// 资源缓存
const wallPatternCanvas = wx.createCanvas(); // 岩石纹理
const lightLayer = wx.createCanvas(); // 光照遮罩层
lightLayer.width = canvas.width;
lightLayer.height = canvas.height;
const lightCtx = lightLayer.getContext('2d');

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
    let zoom = state.camera ? state.camera.zoom : 1;
    
    // 屏幕震动
    let shakeX = 0, shakeY = 0;
    if(state.story.shake > 0) {
        shakeX = (Math.random() - 0.5) * state.story.shake;
        shakeY = (Math.random() - 0.5) * state.story.shake;
    }

    // 1. 绘制基础世界
    ctx.fillStyle = '#252a30'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // 摄像机变换：居中缩放
    ctx.translate(canvas.width/2 + shakeX, canvas.height/2 + shakeY);
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
    let viewHalfW = (canvas.width/2) / zoom + 100;
    let viewHalfH = (canvas.height/2) / zoom + 100;
    let viewL = player.x - viewHalfW;
    let viewR = player.x + viewHalfW;
    let viewT = player.y - viewHalfH;
    let viewB = player.y + viewHalfH;

    const { tileSize: ts } = CONFIG;

    let viewRowMin = Math.max(0, Math.floor(viewT / ts) - 1);
    let viewRowMax = Math.min(CONFIG.rows - 1, Math.floor(viewB / ts) + 1);
    let viewColMin = Math.max(0, Math.floor(viewL / ts) - 1);
    let viewColMax = Math.min(CONFIG.cols - 1, Math.floor(viewR / ts) + 1);

    // 绘制实心内部填充（无缝，无网格边框）
    ctx.fillStyle = '#1a1a1a';
    for(let r = viewRowMin; r <= viewRowMax; r++) {
        if(!state.map[r]) continue;
        for(let c = viewColMin; c <= viewColMax; c++) {
            if(state.map[r][c] === 2) {
                ctx.fillRect(c * ts - 0.5, r * ts - 0.5, ts + 1, ts + 1);
            }
        }
    }

    // 绘制边缘岩石圆（叠加在方块上，形成自然轮廓）
    ctx.fillStyle = '#222';
    for(let w of state.walls) {
        if(w.x > viewL && w.x < viewR && w.y > viewT && w.y < viewB) {
            ctx.beginPath();
            ctx.arc(w.x, w.y, w.r, 0, Math.PI*2);
            ctx.fill();
            
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(w.x - w.r*0.3, w.y - w.r*0.3, w.r*0.6, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#222';
        }
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

    // --- 绘制体积光 ---
    let vRayDist = CONFIG.lightRange;
    
    if(state.story.stage === 4 && state.story.flags.narrowVision) {
        let factor = Math.max(0, player.o2 / 80);
        vRayDist = 20 + factor * 80; 
    } else if(state.story.flags.narrowVision) {
        vRayDist = 30; 
    }

    const lightSources = [
        { 
            x: player.x, 
            y: player.y, 
            angle: player.angle, 
            active: player.y > 600 && flashlightActive, 
            dist: vRayDist 
        },
        { 
            x: state.npc ? state.npc.x : 0, 
            y: state.npc ? state.npc.y : 0, 
            angle: state.npc ? state.npc.angle : 0, 
            active: state.npc && state.npc.active && state.npc.y > 600 && CONFIG.bShowNpcFlashLight, 
            dist: vRayDist * 0.5 
        }
    ];

    for(let src of lightSources) {
        if(src && src.active) {
            drawFlashlight(ctx, src.x, src.y, src.angle, src.dist, 'volumetric');
        }
    }

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

    // 2. 光照遮罩计算
    lightCtx.clearRect(0, 0, canvas.width, canvas.height); 
    lightCtx.globalCompositeOperation = 'source-over';
    
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

    if(depthFactor < 0.3) {
        let blueTint = Math.max(0, (1 - depthFactor * 3) * 25);
        let g = Math.floor(blueTint / 3);
        let b = Math.floor(blueTint);
        lightCtx.fillStyle = `rgba(0, ${g}, ${b}, ${maskAlpha})`;
    } else {
        lightCtx.fillStyle = `rgba(2, 4, 10, ${maskAlpha})`;
    }
    
    lightCtx.fillRect(0, 0, canvas.width, canvas.height);

    let rayDist = CONFIG.lightRange;

    // 第三关：手电筒损坏闪烁效果
    let flashlightActive = true;
    if(state.story.flags.flashlightBroken) {
        let t = Date.now() / 1000;
        // 不规律闪烁：用多个不同频率的正弦叠加
        let flicker = Math.sin(t * 7.3) * Math.sin(t * 13.7) * Math.sin(t * 3.1);
        flashlightActive = flicker > -0.3; // 大部分时间亮着，偏暗时关闭
        if(flashlightActive) {
            // 亮度也不稳定
            rayDist = CONFIG.lightRange * (0.5 + Math.abs(flicker) * 0.5);
        }
    }

    if(state.story.stage === 4 && state.story.flags.narrowVision) {
        let factor = Math.max(0, player.o2 / 80);
        rayDist = 20 + factor * 80; 
        let alpha = 0.95 + (1-factor) * 0.05; 
        lightCtx.fillStyle = `rgba(2, 4, 10, ${alpha})`;
        lightCtx.fillRect(0, 0, canvas.width, canvas.height);
    } else if(state.story.flags.narrowVision) {
        rayDist = 30; 
        lightCtx.fillStyle = 'rgba(2, 4, 10, 0.95)'; 
        lightCtx.fillRect(0, 0, canvas.width, canvas.height);
    }

    lightCtx.save();
    lightCtx.translate(canvas.width/2 + shakeX, canvas.height/2 + shakeY);
    lightCtx.scale(zoom, zoom);
    lightCtx.translate(-player.x, -player.y);
    
    lightCtx.globalCompositeOperation = 'destination-out';
    
    const maskSources = [
        { 
            x: player.x, 
            y: player.y, 
            angle: player.angle, 
            active: player.y > 600 && flashlightActive, 
            dist: rayDist 
        },
        {   
            x: state.npc ? state.npc.x : 0, 
            y: state.npc ? state.npc.y : 0, 
            angle: state.npc ? state.npc.angle : 0, 
            active: state.npc && state.npc.active && state.npc.y > 600 && CONFIG.bShowNpcFlashLight, 
            dist: rayDist * 0.9 
        }
    ];

    for(let src of maskSources) {
        if(src.active) {
            let siltData = null;
            if (src.x === player.x && src.y === player.y && player.silt > 0) {
                siltData = computeSiltAttenuation(src.x, src.y, src.angle, src.dist, CONFIG.fov, particles);
            }

            drawFlashlight(lightCtx, src.x, src.y, src.angle, src.dist, 'mask', siltData);
            
            let glowRadius = CONFIG.selfGlowRadius;
            let intensity = CONFIG.selfGlowIntensity;
            
            let glowGrad = lightCtx.createRadialGradient(src.x, src.y, 0, src.x, src.y, glowRadius);
            glowGrad.addColorStop(0, `rgba(255, 255, 255, ${intensity})`); 
            glowGrad.addColorStop(0.5, `rgba(255, 255, 255, ${intensity * 0.5})`); 
            glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');   
            
            lightCtx.fillStyle = glowGrad;
            lightCtx.beginPath();
            lightCtx.arc(src.x, src.y, glowRadius, 0, Math.PI*2);
            lightCtx.fill();

            let ambientPerception = CONFIG.ambientPerceptionRadius || 80;
            let ambientIntensity = CONFIG.ambientPerceptionIntensity || 0.35;
            let ambGrad = lightCtx.createRadialGradient(src.x, src.y, 0, src.x, src.y, ambientPerception);
            ambGrad.addColorStop(0, `rgba(255, 255, 255, ${ambientIntensity})`);
            ambGrad.addColorStop(0.6, `rgba(255, 255, 255, ${ambientIntensity * 0.4})`);
            ambGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            lightCtx.fillStyle = ambGrad;
            lightCtx.beginPath();
            lightCtx.arc(src.x, src.y, ambientPerception, 0, Math.PI*2);
            lightCtx.fill();
        }
    }

    // 漫散射模拟
    let scatterDist = rayDist * 0.6;
    let scatterX = player.x + Math.cos(player.angle) * scatterDist;
    let scatterY = player.y + Math.sin(player.angle) * scatterDist;
    
    let scatterGlow = lightCtx.createRadialGradient(
        scatterX, scatterY, 0,
        scatterX, scatterY, rayDist * 0.8
    );
    scatterGlow.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    scatterGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    lightCtx.fillStyle = scatterGlow;
    lightCtx.beginPath();
    lightCtx.arc(scatterX, scatterY, rayDist * 0.8, 0, Math.PI*2);
    lightCtx.fill();

    if(target.found || isLineOfSight(player.x, player.y, target.x, target.y, rayDist)) {
        lightCtx.beginPath();
        lightCtx.arc(target.x, target.y, 25, 0, Math.PI*2);
        lightCtx.fill();
    }

    lightCtx.restore(); 

    ctx.drawImage(lightLayer, 0, 0);

    // 绘制泥沙粒子（在光照层之上，使泥沙遮盖光照）
    ctx.save();
    ctx.translate(canvas.width/2 + shakeX, canvas.height/2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-player.x, -player.y);
    for(let p of particles) {
        if(p.type !== 'silt') continue;
        let siltAlpha = p.alpha * Math.max(0, p.life);
        if (siltAlpha < 0.005) continue;
        ctx.fillStyle = `rgba(120, 100, 80, ${siltAlpha})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // 黑屏过渡
    if(state.story.flags.blackScreen) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 红色叠加（濒死状态）
    if(state.story.redOverlay > 0.001) {
        let t = state.story.redOverlay;
        let r = Math.floor(255 * (1-t) + 61 * t);
        let g = Math.floor(0 * (1-t) + 3 * t);
        let b = Math.floor(0 * (1-t) + 3 * t);
        let alpha = Number(state.story.redOverlay.toFixed(3));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 3. 绘制 UI
    drawUI();
    drawControls();
    drawRopeButton();

    // 4. 过渡动画
    if(state.transition && state.transition.active) {
        ctx.save();
        
        let t = state.transition.alpha;
        
        let bgR = 0, bgG = 17, bgB = 51;
        if (state.transition.mode === 'in') {
            bgR = 0; bgG = 60; bgB = 100;
        }
        
        ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${t})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
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