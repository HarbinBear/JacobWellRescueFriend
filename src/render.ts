import { CONFIG } from './config';
import { state, player, target, particles, touches } from './state';
import { pathLength, samplePolyline, polylineNormal } from './logic';

// 创建画布 
export const canvas = wx.createCanvas();
export const ctx = canvas.getContext('2d');

// 设置画布尺寸
canvas.width = CONFIG.screenWidth;
canvas.height = CONFIG.screenHeight;

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
    // 噪点
    for(let i=0; i<300; i++) {
        pCtx.fillStyle = Math.random() > 0.5 ? '#555' : '#333';
        pCtx.beginPath();
        pCtx.arc(Math.random()*100, Math.random()*100, Math.random()*3, 0, Math.PI*2);
        pCtx.fill();
    }
}

// --- 渲染主函数 ---
export function draw() {
    let zoom = state.camera ? state.camera.zoom : 1;
    
    // 屏幕晃动
    let shakeX = 0, shakeY = 0;
    if(state.story.shake > 0) {
        shakeX = (Math.random() - 0.5) * state.story.shake;
        shakeY = (Math.random() - 0.5) * state.story.shake;
    }

    // 1. 绘制底层世界
    ctx.fillStyle = '#252a30'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // 摄像机变换：中心缩放
    ctx.translate(canvas.width/2 + shakeX, canvas.height/2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-player.x, -player.y);

    // 绘制水面背景 (明亮的天空和浅水渐变)
    // 从 y=-800 (天空) 到 y=600 (深水过渡)
    let skyGradient = ctx.createLinearGradient(0, -800, 0, 600);
    skyGradient.addColorStop(0, '#87CEEB'); // 天空蓝
    skyGradient.addColorStop(0.5, '#E0F7FA'); // 水面亮白 (y=0附近)
    skyGradient.addColorStop(0.6, '#4DD0E1'); // 浅水青
    skyGradient.addColorStop(1, 'rgba(37, 42, 48, 0)'); // 透明，露出底色

    ctx.fillStyle = skyGradient;
    ctx.fillRect(-2000, -1000, 6000, 1600);

    // 绘制水面线 (多层波浪)
    let time = Date.now() / 1000;
    
    // 后层波浪 (较暗，较慢)
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-1000, 5);
    for(let x=-1000; x<3000; x+=40) {
        ctx.lineTo(x, 5 + Math.sin(x/150 + time*0.8)*8);
    }
    ctx.stroke();

    // 绘制水花 (在后层波浪之后，前层波浪之前，或者都在之后)
    drawSplashes();

    // 前层波浪 (亮色，较快)
    ctx.strokeStyle = 'rgba(200, 240, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1000, 5); 
    for(let x=-1000; x<3000; x+=30) {
        ctx.lineTo(x, 5 + Math.sin(x/100 + time)*5);
    }
    ctx.stroke();

    // 绘制阳光束 (God Rays) - 仅在浅水区可见
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

    // 绘制墙壁 (使用 state.walls 代替网格遍历，以支持不规则排列)
    // 筛选视野内的墙壁
    let viewHalfW = (canvas.width/2) / zoom + 100;
    let viewHalfH = (canvas.height/2) / zoom + 100;
    let viewL = player.x - viewHalfW;
    let viewR = player.x + viewHalfW;
    let viewT = player.y - viewHalfH;
    let viewB = player.y + viewHalfH;

    const { tileSize: ts } = CONFIG;

    // 计算视口对应的网格范围
    let viewRowMin = Math.max(0, Math.floor(viewT / ts) - 1);
    let viewRowMax = Math.min(CONFIG.rows - 1, Math.floor(viewB / ts) + 1);
    let viewColMin = Math.max(0, Math.floor(viewL / ts) - 1);
    let viewColMax = Math.min(CONFIG.cols - 1, Math.floor(viewR / ts) + 1);

    // 绘制内部实体填充（无缝纯色，不显示格子边界）
    // 用稍大于 tileSize 的矩形消除格子接缝
    ctx.fillStyle = '#1a1a1a';
    for(let r = viewRowMin; r <= viewRowMax; r++) {
        if(!state.map[r]) continue;
        for(let c = viewColMin; c <= viewColMax; c++) {
            if(state.map[r][c] === 2) {
                // 用 +1 像素的尺寸消除相邻格子之间的接缝
                ctx.fillRect(c * ts - 0.5, r * ts - 0.5, ts + 1, ts + 1);
            }
        }
    }

    // 再绘制边缘岩石圆形（覆盖在方块之上，形成自然轮廓）
    ctx.fillStyle = '#222';
    for(let w of state.walls) {
        // 简单的视口剔除
        if(w.x > viewL && w.x < viewR && w.y > viewT && w.y < viewB) {
            ctx.beginPath();
            ctx.arc(w.x, w.y, w.r, 0, Math.PI*2);
            ctx.fill();
            
            // 绘制内部纹理/阴影细节
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(w.x - w.r*0.3, w.y - w.r*0.3, w.r*0.6, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#222'; // 恢复主色
        }
    }

    // 绘制水草
    if(state.plants) {
        for(let p of state.plants) {
            // 视口剔除
            if(p.x > viewL && p.x < viewR && p.y > viewT && p.y < viewB) {
                let sway = Math.sin(time * 2 + p.offset) * 5;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                // 二次贝塞尔曲线模拟弯曲
                ctx.quadraticCurveTo(p.x + sway, p.y - p.len/2, p.x + sway*1.5, p.y - p.len);
                ctx.stroke();
            }
        }
    }

    // 绘制鱼群
    if(state.fishes) {
        for(let f of state.fishes) {
            if(f.x > viewL && f.x < viewR && f.y > viewT && f.y < viewB) {
                ctx.save();
                ctx.translate(f.x, f.y);
                
                // 使用平滑角度，如果未定义则回退到速度方向
                let angle = f.angle !== undefined ? f.angle : Math.atan2(f.vy, f.vx);
                ctx.rotate(angle);
                
                ctx.fillStyle = f.color;
                
                // 鱼身 (流线型)
                ctx.beginPath();
                // 鱼头在右 (0,0) -> (size, 0)
                ctx.moveTo(f.size, 0); 
                // 上半身曲线
                ctx.quadraticCurveTo(0, -f.size*0.6, -f.size, 0); 
                // 下半身曲线
                ctx.quadraticCurveTo(0, f.size*0.6, f.size, 0); 
                ctx.fill();

                // 眼睛 (画在鱼头上，相对于鱼中心)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.beginPath();
                ctx.arc(f.size * 0.6, -f.size * 0.2, f.size * 0.25, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(f.size * 0.7, -f.size * 0.2, f.size * 0.12, 0, Math.PI*2);
                ctx.fill();
                
                // 尾巴 (摆动)
                ctx.fillStyle = f.color; // 恢复鱼的颜色
                ctx.save(); // 保存鱼中心状态
                
                let tailSway = Math.sin(time * 15 + f.phase) * 0.5; // 角度摆动
                // 移动到尾部连接点
                ctx.translate(-f.size, 0);
                ctx.rotate(tailSway);
                
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-f.size * 0.6, -f.size * 0.5);
                ctx.lineTo(-f.size * 0.6, f.size * 0.5);
                ctx.fill();
                
                ctx.restore(); // 恢复到鱼中心状态
                
                ctx.restore(); // 恢复到世界坐标系
            }
        }
    }

    // 绘制环境文本
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

    // 绘制粒子（泥沙单独在光照层之后绘制，以盖住光照）
    for(let p of particles) {
        if(p.type === 'silt') {
            continue; // 泥沙在光照层合并后单独绘制
        } else if (p.type === 'blood') {
            ctx.fillStyle = `rgba(200, 0, 0, ${p.life * 0.8})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        } else {
            // 气泡渲染优化
            ctx.save();
            ctx.translate(p.x, p.y);
            // 稍微变形
            ctx.scale(1.0, 0.9); 
            
            ctx.fillStyle = `rgba(200, 255, 255, ${p.life * 0.5})`;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI*2); ctx.fill();
            
            // 高光
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
            ctx.rotate(Math.PI/4); // 倾斜放置
            
            // 简单的潜水服形状
            ctx.fillStyle = '#555'; // 灰色废旧
            ctx.fillRect(-10, -20, 20, 40); // 躯干
            ctx.beginPath(); ctx.arc(0, -25, 8, 0, Math.PI*2); ctx.fill(); // 头盔
            
            // 破损感
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(5, 0); ctx.lineTo(-2, 10); ctx.fill();
            
            ctx.restore();
        }
    }

    // --- Draw ropes (world space, before characters) ---
    drawRopesWorld();

    // --- 绘制体积光 (Volumetric Lights) ---
    // 提前计算光照距离 (局部变量，避免与后续冲突)
    let vRayDist = CONFIG.lightRange;
    
    // 濒死视野调整
    if(state.story.stage === 4 && state.story.flags.narrowVision) {
        let factor = Math.max(0, player.o2 / 80);
        vRayDist = 20 + factor * 80; 
    } else if(state.story.flags.narrowVision) {
        vRayDist = 30; 
    }

    // 统一处理玩家和NPC的体积光
    const lightSources = [
        { 
            x: player.x, 
            y: player.y, 
            angle: player.angle, 
            active: player.y > 600, 
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

    // 绘制NPC
    if(state.npc && state.npc.active) {
        const npcColors = {
            suit: '#333',
            body: '#d44', // 红色潜水服
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
    
    // 深度因子：0(水面) -> 1(深渊)
    let depthFactor = 0;
    if (player.y < CONFIG.darknessStartDepth) {
        depthFactor = player.y / CONFIG.darknessStartDepth;
    } else {
        depthFactor = 1.0;
    }
    
    // 基础环境光
    let baseAmbient = CONFIG.ambientLightSurface * (1 - depthFactor);
    if (baseAmbient < CONFIG.ambientLightDeep) baseAmbient = CONFIG.ambientLightDeep;
    let currentAmbient = baseAmbient;
    
    // 遮罩颜色（深处偏深蓝-黑色，浅处偏蓝色调）
    let maskAlpha = Math.max(0, 1 - currentAmbient);

    // 遮罩底层颜色：浅处带蓝色调，深处纯黑
    if(depthFactor < 0.3) {
        let blueTint = Math.max(0, (1 - depthFactor * 3) * 25);
        let g = Math.floor(blueTint / 3);
        let b = Math.floor(blueTint);
        lightCtx.fillStyle = `rgba(0, ${g}, ${b}, ${maskAlpha})`;
    } else {
        // 深处：极暗的深蓝色而非纯黑，更有水下氛围
        lightCtx.fillStyle = `rgba(2, 4, 10, ${maskAlpha})`;
    }
    
    lightCtx.fillRect(0, 0, canvas.width, canvas.height);

    let rayDist = CONFIG.lightRange;

    // 濒死视野效果
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
    
    // 定义需要绘制光照的角色列表
    const maskSources = [
        { 
            x: player.x, 
            y: player.y, 
            angle: player.angle, 
            active: player.y > 600, 
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
            // 计算该光源方向上的泥沙衰减（只有玩家光源考虑泥沙，NPC暂不考虑）
            let siltData = null;
            if (src.x === player.x && src.y === player.y && player.silt > 0) {
                siltData = computeSiltAttenuation(src.x, src.y, src.angle, src.dist, CONFIG.fov);
            }

            // 1. 手电筒光椎擦除（传入泥沙衰减数据）
            drawFlashlight(lightCtx, src.x, src.y, src.angle, src.dist, 'mask', siltData);
            
            // 2. 自身发光 (擦除遮罩) - 使用配置参数
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

            // 3. 周围环境感知光（360度的微弱光环，模拟人眼在水中的周边视觉）
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

    // 漫反射模拟：在玩家前方一定距离画一个极淡的擦除圆
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

    // 微信小游戏的 Canvas 运行时兼容 drawImage，但类型声明与 HTMLCanvasElement 不同，需断言
    ctx.drawImage(lightLayer as unknown as CanvasImageSource, 0, 0);

    // 绘制泥沙粒子（在光照层之上，使泥沙盖住光照）
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

    // 红色遮罩 (濒死)
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

    // 4. 转场动画
    if(state.transition && state.transition.active) {
        ctx.save();
        
        let t = state.transition.alpha;
        
        let bgR = 0, bgG = 17, bgB = 51; // 深海蓝
        if (state.transition.mode === 'in') {
            bgR = 0; bgG = 60; bgB = 100; // 稍亮的蓝
        }
        
        ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${t})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // --- 气泡动画 ---
        if (state.transition.bubbles) {
            for(let b of state.transition.bubbles) {
                let alpha = t * 0.6;
                if(alpha > 1) alpha = 1;
                
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.size, 0, Math.PI*2);
                ctx.fill();
                
                // 高光
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 1.5})`;
                ctx.beginPath();
                ctx.arc(b.x - b.size*0.3, b.y - b.size*0.3, b.size*0.2, 0, Math.PI*2);
                ctx.fill();
            }
        }
        
        ctx.restore();
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

// 统一的手电筒绘制函数
// siltData: 可选的泥沙衰减数据（computeSiltAttenuation返回的结构），null=无泥沙
function drawFlashlight(renderCtx: CanvasRenderingContext2D, x: number, y: number, angle: number, rayDist: number, mode: string = 'mask', siltData: any = null) {
    renderCtx.save();

    let poly = getLightPolygon(x, y, angle, rayDist, CONFIG.fov);

    if (mode === 'mask') {
        if (siltData) {
            let { perStep, rays, steps, stride, stepDist } = siltData;

            let calcBrightness = (dr: number) => {
                if (dr < 0.5) return 1.0;
                if (dr < 0.85) return 1.0 - (dr - 0.5) / 0.35 * 0.4;
                return 0.6 * (1 - (dr - 0.85) / 0.15);
            };

            for (let i = 0; i < poly.length - 1; i++) {
                let p0 = poly[i];
                let p1 = poly[i + 1];
                let dx0 = p0.x - x, dy0 = p0.y - y;
                let len0 = Math.hypot(dx0, dy0) || 1;
                let dx1 = p1.x - x, dy1 = p1.y - y;
                let len1 = Math.hypot(dx1, dy1) || 1;
                let maxLen = Math.max(len0, len1);

                for (let s = 0; s < steps; s++) {
                    let nearDist = s * stepDist;
                    let farDist = Math.min((s + 1) * stepDist, maxLen);
                    if (nearDist >= maxLen) break;

                    let nearTrans0 = perStep[i * stride + s];
                    let nearTrans1 = perStep[Math.min(i + 1, rays) * stride + s];
                    let nearTransAvg = (nearTrans0 + nearTrans1) / 2;
                    let farS = Math.min(s + 1, steps);
                    let farTrans0 = perStep[i * stride + farS];
                    let farTrans1 = perStep[Math.min(i + 1, rays) * stride + farS];
                    let farTransAvg = (farTrans0 + farTrans1) / 2;

                    if (nearTransAvg < 0.01 && farTransAvg < 0.01) continue;

                    let nearRatio0 = Math.min(nearDist / len0, 1);
                    let farRatio0 = Math.min(farDist / len0, 1);
                    let nearRatio1 = Math.min(nearDist / len1, 1);
                    let farRatio1 = Math.min(farDist / len1, 1);

                    let nx0 = x + dx0 * nearRatio0, ny0 = y + dy0 * nearRatio0;
                    let fx0 = x + dx0 * farRatio0,  fy0 = y + dy0 * farRatio0;
                    let nx1 = x + dx1 * nearRatio1, ny1 = y + dy1 * nearRatio1;
                    let fx1 = x + dx1 * farRatio1,  fy1 = y + dy1 * farRatio1;

                    let nearAlpha = calcBrightness(nearDist / rayDist) * nearTransAvg;
                    let farAlpha  = calcBrightness(farDist  / rayDist) * farTransAvg;
                    if (nearAlpha < 0.005 && farAlpha < 0.005) continue;

                    let grad = renderCtx.createLinearGradient(
                        (nx0+nx1)/2, (ny0+ny1)/2, (fx0+fx1)/2, (fy0+fy1)/2
                    );
                    grad.addColorStop(0, `rgba(255,255,255,${nearAlpha})`);
                    grad.addColorStop(1, `rgba(255,255,255,${farAlpha})`);
                    renderCtx.fillStyle = grad;
                    renderCtx.beginPath();
                    renderCtx.moveTo(nx0, ny0);
                    renderCtx.lineTo(fx0, fy0);
                    renderCtx.lineTo(fx1, fy1);
                    renderCtx.lineTo(nx1, ny1);
                    renderCtx.closePath();
                    renderCtx.fill();
                }
            }

            // 羽化层
            let featherDist = CONFIG.lightEdgeFeather || 25;
            for (let i = 0; i < poly.length - 1; i++) {
                let finalTrans = (perStep[i * stride + steps] + perStep[Math.min(i+1,rays) * stride + steps]) / 2;
                if (finalTrans < 0.05) continue;
                let p0 = poly[i], p1 = poly[i+1];
                let dx0 = p0.x-x, dy0 = p0.y-y, len0 = Math.hypot(dx0,dy0)||1;
                let dx1 = p1.x-x, dy1 = p1.y-y, len1 = Math.hypot(dx1,dy1)||1;
                renderCtx.fillStyle = `rgba(255,255,255,${finalTrans*0.3})`;
                renderCtx.beginPath();
                renderCtx.moveTo(p0.x, p0.y);
                renderCtx.lineTo(p0.x+(dx0/len0)*featherDist, p0.y+(dy0/len0)*featherDist);
                renderCtx.lineTo(p1.x+(dx1/len1)*featherDist, p1.y+(dy1/len1)*featherDist);
                renderCtx.lineTo(p1.x, p1.y);
                renderCtx.closePath();
                renderCtx.fill();
            }
        } else {
            // 无泥沙：简单径向渐变
            let mainGradient = renderCtx.createRadialGradient(x, y, 0, x, y, rayDist);
            mainGradient.addColorStop(0,    'rgba(255,255,255,1.0)');
            mainGradient.addColorStop(0.5,  'rgba(255,255,255,0.95)');
            mainGradient.addColorStop(0.85, 'rgba(255,255,255,0.6)');
            mainGradient.addColorStop(1,    'rgba(255,255,255,0)');
            renderCtx.fillStyle = mainGradient;
            renderCtx.beginPath();
            renderCtx.moveTo(x, y);
            for (let p of poly) renderCtx.lineTo(p.x, p.y);
            renderCtx.closePath();
            renderCtx.fill();

            // 边缘羽化
            let featherDist = CONFIG.lightEdgeFeather || 25;
            let featherPoly = poly.map((p: any) => {
                let dx = p.x-x, dy = p.y-y, len = Math.hypot(dx,dy)||1;
                return { x: p.x+(dx/len)*featherDist, y: p.y+(dy/len)*featherDist };
            });
            let featherGrad = renderCtx.createRadialGradient(x, y, 0, x, y, rayDist+featherDist);
            featherGrad.addColorStop(0,   'rgba(255,255,255,0.4)');
            featherGrad.addColorStop(0.7, 'rgba(255,255,255,0.2)');
            featherGrad.addColorStop(1,   'rgba(255,255,255,0)');
            renderCtx.fillStyle = featherGrad;
            renderCtx.beginPath();
            renderCtx.moveTo(x, y);
            for (let p of featherPoly) renderCtx.lineTo(p.x, p.y);
            renderCtx.closePath();
            renderCtx.fill();
        }
    } else if (mode === 'volumetric') {
        renderCtx.globalCompositeOperation = 'screen';
        let grad = renderCtx.createRadialGradient(x, y, 0, x, y, rayDist);
        grad.addColorStop(0, CONFIG.flashlightColor);
        grad.addColorStop(1, 'rgba(255,250,200,0)');
        renderCtx.fillStyle = grad;
        renderCtx.beginPath();
        renderCtx.moveTo(x, y);
        for(let p of poly) renderCtx.lineTo(p.x, p.y);
        renderCtx.closePath();
        renderCtx.fill();

        let centerPoly = getLightPolygon(x, y, angle, rayDist, CONFIG.flashlightCenterFov);
        let centerGrad = renderCtx.createRadialGradient(x, y, 0, x, y, rayDist);
        centerGrad.addColorStop(0, CONFIG.flashlightCenterColor);
        centerGrad.addColorStop(1, 'rgba(255,255,220,0)');
        renderCtx.fillStyle = centerGrad;
        renderCtx.beginPath();
        renderCtx.moveTo(x, y);
        for(let p of centerPoly) renderCtx.lineTo(p.x, p.y);
        renderCtx.closePath();
        renderCtx.fill();
    }
    renderCtx.restore();
}

// 统一的潜水员绘制函数
function drawDiver(renderCtx: CanvasRenderingContext2D, x: number, y: number, angle: number, colors: any = null, animTime: number = 0, hasTank: boolean = true) {
    renderCtx.save();
    
    // 模拟水流荡漾
    let swayX = Math.sin(Date.now() / 1000) * 2;
    let swayY = Math.cos(Date.now() / 1300) * 2;
    renderCtx.translate(x + swayX, y + swayY);
    renderCtx.rotate(angle);

    const defaultColors = { suit: '#333', body: '#dd0', tank: '#bef', mask: '#fa0' };
    const c = colors || defaultColors;

    let time = animTime || Date.now() / 150;
    
    // 左脚蹼
    renderCtx.save();
    renderCtx.translate(-15, -4);
    let leftScale = 0.7 + Math.sin(time) * 0.3;
    renderCtx.scale(leftScale, 1);
    renderCtx.fillStyle = c.suit;
    renderCtx.beginPath();
    renderCtx.moveTo(0, -2); renderCtx.lineTo(-12, -4); renderCtx.lineTo(-12, 4); renderCtx.lineTo(0, 2);
    renderCtx.fill();
    renderCtx.restore();

    // 右脚蹼
    renderCtx.save();
    renderCtx.translate(-15, 4);
    let rightScale = 0.7 + Math.sin(time + Math.PI) * 0.3;
    renderCtx.scale(rightScale, 1);
    renderCtx.fillStyle = c.suit;
    renderCtx.beginPath();
    renderCtx.moveTo(0, -2); renderCtx.lineTo(-12, -4); renderCtx.lineTo(-12, 4); renderCtx.lineTo(0, 2);
    renderCtx.fill();
    renderCtx.restore();

    // 身体
    renderCtx.fillStyle = c.body;
    renderCtx.fillRect(-8, -5, 16, 10);

    // 气瓶
    if(hasTank) {
        renderCtx.fillStyle = '#111'; 
        renderCtx.fillRect(-3, -7, 6, 14);
        renderCtx.fillStyle = '#FFD700'; 
        renderCtx.strokeStyle = '#000';
        renderCtx.lineWidth = 1;
        renderCtx.beginPath(); 
        if ((renderCtx as any).roundRect) {
            (renderCtx as any).roundRect(3, -7, 9, 14, [3]);
        } else {
            renderCtx.rect(3, -7, 9, 14);
        }
        renderCtx.fill();
        renderCtx.stroke();
        renderCtx.fillStyle = '#888';
        renderCtx.fillRect(5, -9, 4, 2);
    }

    // 头部
    renderCtx.fillStyle = '#dcb';
    renderCtx.beginPath(); renderCtx.arc(0, 0, 7, 0, Math.PI*2); renderCtx.fill();
    renderCtx.fillStyle = '#222';
    renderCtx.beginPath(); 
    renderCtx.arc(0, 0, 7.5, Math.PI/2, -Math.PI/2, true);
    renderCtx.fill();

    // 面罩
    renderCtx.fillStyle = c.mask; 
    renderCtx.strokeStyle = '#111';
    renderCtx.lineWidth = 1;
    renderCtx.beginPath(); 
    renderCtx.ellipse(4, 0, 3, 5, 0, 0, Math.PI*2);
    renderCtx.fill();
    renderCtx.stroke();
    
    // 面罩反光
    renderCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    renderCtx.beginPath();
    renderCtx.ellipse(5, -2, 1, 2, 0.5, 0, Math.PI*2);
    renderCtx.fill();

    renderCtx.restore();
}

function drawLungs(x: number, y: number, o2: number) {
    ctx.save();
    ctx.translate(x, y);
    
    let breath = Math.sin(Date.now() / 800) * 0.05;
    ctx.scale(1 + breath, 1 + breath);
    
    const w = 40, h = 60, gap = 6;
    
    // 气管
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(-3, -h/2 - 10); ctx.lineTo(3, -h/2 - 10);
    ctx.lineTo(3, -h/2 - 20); ctx.lineTo(-3, -h/2 - 20);
    ctx.fill();
    
    drawLungLobe(ctx, -w/2 - gap/2, 0, w, h, o2, true);
    drawLungLobe(ctx, w/2 + gap/2, 0, w, h, o2, false);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(Math.floor(o2) + '%', 0, 5);
    
    if(o2 < 30) {
        let alpha = 0.5 + Math.sin(Date.now()/100) * 0.5;
        ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
        ctx.font = 'bold 14px Arial';
        ctx.fillText("WARNING", 0, h/2 + 20);
    }
    
    ctx.restore();
}

function drawLungLobe(renderCtx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o2: number, isLeft: boolean) {
    renderCtx.save();
    renderCtx.translate(x, y);
    
    renderCtx.beginPath();
    if (isLeft) {
        renderCtx.moveTo(w/2, -h/2); 
        renderCtx.bezierCurveTo(w/2, -h/2, -w/2, -h/2 + 15, -w/2, 0); 
        renderCtx.bezierCurveTo(-w/2, h/2 - 5, 0, h/2, w/2, h/2); 
        renderCtx.lineTo(w/2, -h/2); 
    } else {
        renderCtx.moveTo(-w/2, -h/2); 
        renderCtx.bezierCurveTo(-w/2, -h/2, w/2, -h/2 + 15, w/2, 0); 
        renderCtx.bezierCurveTo(w/2, h/2 - 5, 0, h/2, -w/2, h/2); 
        renderCtx.lineTo(-w/2, -h/2); 
    }
    renderCtx.closePath();
    
    renderCtx.fillStyle = 'rgba(20, 0, 0, 0.9)';
    renderCtx.fill();
    renderCtx.strokeStyle = '#311';
    renderCtx.lineWidth = 2;
    renderCtx.stroke();
    renderCtx.clip();
    
    let fillHeight = h * (o2 / 100);
    let fillY = h/2 - fillHeight;
    
    let lungColor = 'rgba(237, 106, 106, 1)';
    if (o2 < 30) {
        let flash = Math.floor(Date.now() / 200) % 2 === 0;
        lungColor = flash ? 'rgba(237, 106, 106, 1)' : 'rgba(98, 54, 54, 1)';
    }
    
    renderCtx.fillStyle = lungColor;
    renderCtx.fillRect(-w, fillY, w*2, fillHeight);
    
    renderCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    renderCtx.lineWidth = 1;
    renderCtx.beginPath();
    if(isLeft) {
        renderCtx.moveTo(w/4, -h/4); renderCtx.quadraticCurveTo(0, 0, -w/4, h/4);
        renderCtx.moveTo(w/4, -h/4); renderCtx.quadraticCurveTo(w/4, 0, 0, h/3);
    } else {
        renderCtx.moveTo(-w/4, -h/4); renderCtx.quadraticCurveTo(0, 0, w/4, h/4);
        renderCtx.moveTo(-w/4, -h/4); renderCtx.quadraticCurveTo(-w/4, 0, 0, h/3);
    }
    renderCtx.stroke();
    
    renderCtx.restore();
}

// 射线与圆的精确相交检测
function rayCircleIntersect(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, cr: number): number {
    let fx = ox-cx, fy = oy-cy;
    let a = dx*dx + dy*dy;
    let b = 2*(fx*dx + fy*dy);
    let c = fx*fx + fy*fy - cr*cr;
    let discriminant = b*b - 4*a*c;
    if (discriminant < 0) return Infinity;
    let t1 = (-b - Math.sqrt(discriminant)) / (2*a);
    return t1 > 0 ? t1 : Infinity;
}

// 射线与轴对齐方格的相交检测
function rayBoxIntersect(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, halfSize: number): number {
    let minX = cx-halfSize, maxX = cx+halfSize, minY = cy-halfSize, maxY = cy+halfSize;
    let tmin = -Infinity, tmax = Infinity;
    if (Math.abs(dx) > 1e-8) {
        let t1=(minX-ox)/dx, t2=(maxX-ox)/dx;
        if(t1>t2){let tmp=t1;t1=t2;t2=tmp;}
        tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2);
    } else { if(ox<minX||ox>maxX) return Infinity; }
    if (Math.abs(dy) > 1e-8) {
        let t1=(minY-oy)/dy, t2=(maxY-oy)/dy;
        if(t1>t2){let tmp=t1;t1=t2;t2=tmp;}
        tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2);
    } else { if(oy<minY||oy>maxY) return Infinity; }
    if(tmin>tmax||tmax<0) return Infinity;
    return tmin > 0 ? tmin : Infinity;
}

// ============ 蓝噪声纹理（仅生成一次） ============
let _blueNoiseTex: Float32Array | null = null;
const BLUE_NOISE_SIZE = 64;

function getBlueNoise(): Float32Array {
    if (_blueNoiseTex) return _blueNoiseTex;
    let size = BLUE_NOISE_SIZE;
    let tex = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let v = 52.9829189 * (0.06711056 * x + 0.00583715 * y);
            tex[y * size + x] = v - Math.floor(v);
        }
    }
    _blueNoiseTex = tex;
    return tex;
}

let _blueNoiseFrame = 0;

function sampleBlueNoise(u: number, v: number): number {
    let tex = getBlueNoise();
    let size = BLUE_NOISE_SIZE;
    let offset = _blueNoiseFrame * 7;
    let ix = ((Math.floor(u) % size) + size + offset) % size;
    let iy = ((Math.floor(v) % size) + size) % size;
    return tex[iy * size + ix];
}

// ============ 泥沙逐射线逐距离段衰减计算 ============
function computeSiltAttenuation(sx: number, sy: number, angle: number, maxDist: number, fovDeg: number): any {
    _blueNoiseFrame++;
    let fovRad = fovDeg * Math.PI / 180;
    let startAngle = angle - fovRad / 2;
    let rays = CONFIG.rayCount;
    let rayStep = fovRad / rays;
    let steps = CONFIG.siltSampleSteps || 12;
    let stepDist = maxDist / steps;
    let absorptionCoeff = CONFIG.siltAbsorptionCoeff || 3.0;
    let influenceRadius = CONFIG.siltInfluenceRadius || 30;
    let maxRangeSq = (maxDist + influenceRadius) * (maxDist + influenceRadius);
    let minOccludeDistSq = (influenceRadius * 2) * (influenceRadius * 2);
    let lightDirX = Math.cos(angle), lightDirY = Math.sin(angle);
    let cosHalfFov = Math.cos(fovRad / 2 + 0.15);
    let siltList: any[] = [];
    for (let p of particles) {
        if (p.type !== 'silt') continue;
        let conc = p.alpha * p.life;
        if (conc <= 0.005) continue;
        let dx = p.x-sx, dy = p.y-sy;
        let distSq = dx*dx + dy*dy;
        if (distSq > maxRangeSq || distSq < minOccludeDistSq) continue;
        let dist = Math.sqrt(distSq);
        if ((dx*lightDirX + dy*lightDirY) / dist < cosHalfFov) continue;
        siltList.push(p);
    }
    if (siltList.length === 0) return null;

    let stride = steps + 1;
    let opticalDepth = new Float32Array((rays + 1) * stride);
    let rayDirs = new Float32Array((rays + 1) * 2);
    let rayStartOffset = new Float32Array(rays + 1);
    for (let i = 0; i <= rays; i++) {
        let bn = sampleBlueNoise(i, 0);
        let a = startAngle + i*rayStep + (bn-0.5)*rayStep*0.4;
        rayDirs[i*2]=Math.cos(a); rayDirs[i*2+1]=Math.sin(a);
        rayStartOffset[i] = (sampleBlueNoise(i, 32) - 0.5) * stepDist * 0.5;
    }
    for (let p of siltList) {
        let relX=p.x-sx, relY=p.y-sy;
        let concentration = p.alpha * p.life;
        let effectiveRadius = p.size*0.5 + influenceRadius*0.3;
        let pDist = Math.sqrt(relX*relX + relY*relY);
        if (pDist < 1) continue;
        let angularExtent = Math.atan2(effectiveRadius, pDist);
        let midAngle = startAngle + fovRad/2;
        let da = p.x===sx&&p.y===sy ? 0 : Math.atan2(relY,relX) - midAngle;
        da = da - Math.round(da/(2*Math.PI))*2*Math.PI;
        let wrappedAngle = midAngle + da;
        let iMin = Math.max(0, Math.floor((wrappedAngle-angularExtent-startAngle)/rayStep)-1);
        let iMax = Math.min(rays, Math.ceil((wrappedAngle+angularExtent-startAngle)/rayStep)+1);
        for (let i = iMin; i <= iMax; i++) {
            let cosA=rayDirs[i*2], sinA=rayDirs[i*2+1];
            let projT = relX*cosA + relY*sinA;
            if (projT<0||projT>maxDist) continue;
            let perpX=relX-projT*cosA, perpY=relY-projT*sinA;
            let perpDistSq = perpX*perpX + perpY*perpY;
            if (perpDistSq >= effectiveRadius*effectiveRadius) continue;
            let lateralFalloff = 1.0 - perpDistSq/(effectiveRadius*effectiveRadius);
            let contribution = concentration * lateralFalloff * (p.size/15.0) * absorptionCoeff;
            let stepIdx = Math.max(1, Math.min(steps, Math.floor((projT-rayStartOffset[i])/stepDist)));
            opticalDepth[i*stride + stepIdx] += contribution;
        }
    }
    let perStep = new Float32Array((rays + 1) * stride);
    for (let i = 0; i <= rays; i++) {
        let base = i*stride;
        let tau = 0;
        perStep[base] = 1.0;
        for (let s = 1; s <= steps; s++) {
            tau += opticalDepth[base+s];
            perStep[base+s] = Math.max(0, 1.0-tau);
        }
    }
    return { perStep, rays, steps, stride, stepDist };
}

function getLightPolygon(sx: number, sy: number, angle: number, maxDist: number, fovDeg: number = CONFIG.fov): any[] {
    let points: any[] = [];
    let fovRad = fovDeg * Math.PI / 180;
    let startAngle = angle - fovRad/2;
    let rays = CONFIG.rayCount;
    let step = fovRad / rays;
    const { tileSize } = CONFIG;
    const halfTile = tileSize / 2;
    let rMin = Math.max(0, Math.floor((sy-maxDist)/tileSize)-1);
    let rMax = Math.min(CONFIG.rows-1, Math.floor((sy+maxDist)/tileSize)+1);
    let cMin = Math.max(0, Math.floor((sx-maxDist)/tileSize)-1);
    let cMax = Math.min(CONFIG.cols-1, Math.floor((sx+maxDist)/tileSize)+1);
    let obstacles: any[] = [];
    for (let r=rMin; r<=rMax; r++) {
        if (!state.map[r]) continue;
        for (let c=cMin; c<=cMax; c++) {
            let cell = state.map[r][c];
            if (!cell) continue;
            if (typeof cell === 'object') {
                let dx=cell.x-sx, dy=cell.y-sy;
                if (dx*dx+dy*dy < (maxDist+cell.r)*(maxDist+cell.r))
                    obstacles.push({ type:'circle', x:cell.x, y:cell.y, r:cell.r });
            } else if (cell === 2) {
                let cx=c*tileSize+halfTile, cy=r*tileSize+halfTile;
                let dx=cx-sx, dy=cy-sy;
                if (dx*dx+dy*dy < (maxDist+tileSize)*(maxDist+tileSize))
                    obstacles.push({ type:'box', x:cx, y:cy, half:halfTile });
            }
        }
    }
    for (let i=0; i<=rays; i++) {
        let a = startAngle + i*step + (sampleBlueNoise(i,0)-0.5)*step*0.4;
        let dx=Math.cos(a), dy=Math.sin(a);
        let closestDist = maxDist;
        for (let obs of obstacles) {
            let hitDist = obs.type==='circle'
                ? rayCircleIntersect(sx,sy,dx,dy,obs.x,obs.y,obs.r)
                : rayBoxIntersect(sx,sy,dx,dy,obs.x,obs.y,obs.half);
            if (hitDist < closestDist) closestDist = hitDist;
        }
        points.push({ x:sx+dx*closestDist, y:sy+dy*closestDist, dist:closestDist });
    }
    return points;
}

function isLineOfSight(x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {
    let dist = Math.hypot(x2-x1, y2-y1);
    if(dist > maxDist) return false;
    const { tileSize } = CONFIG;
    let dx=x2-x1, dy=y2-y1;
    let steps = Math.ceil(dist / (tileSize*0.35));
    for(let i=0; i<=steps; i++) {
        let t=i/steps, cx=x1+dx*t, cy=y1+dy*t;
        let r=Math.floor(cy/tileSize), c=Math.floor(cx/tileSize);
        if(state.map[r] && state.map[r][c]) {
            let cell = state.map[r][c];
            if(cell===2) return false;
            if(typeof cell==='object' && Math.hypot(cx-cell.x,cy-cell.y)<cell.r) return false;
        }
    }
    return true;
}

function drawUI() {
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
        drawLungs(canvas.width/2, canvas.height/2 + 100, player.o2);
    }

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

    // 剧情文本显示
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

function drawMenu() {
    let time = Date.now() / 1000;
    let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#001133'); grad.addColorStop(1, '#000011');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for(let i=0; i<3; i++) {
        let x = canvas.width/2 + Math.sin(time*0.5+i*2)*100;
        let angle = Math.PI/2 + Math.sin(time*0.3+i)*0.1;
        let rayGrad = ctx.createLinearGradient(x, 0, x, canvas.height);
        rayGrad.addColorStop(0, 'rgba(0,255,255,0.1)'); rayGrad.addColorStop(1, 'rgba(0,255,255,0)');
        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(x-50, 0); ctx.lineTo(x+50, 0);
        ctx.lineTo(x+Math.cos(angle)*200, canvas.height); ctx.lineTo(x-Math.cos(angle)*200, canvas.height);
        ctx.fill();
    }
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 36px Arial'; ctx.fillText("雅各布井", canvas.width/2, canvas.height/3);
    ctx.font = 'bold 28px Arial'; ctx.fillText("救援行动", canvas.width/2, canvas.height/3 + 40);
    let btnY = canvas.height * 0.6;
    let btnAlpha = 0.8 + Math.sin(time*3)*0.2;
    ctx.fillStyle = `rgba(0,255,255,${btnAlpha})`; ctx.font = 'bold 24px Arial'; ctx.fillText("开始游戏", canvas.width/2, btnY);
    ctx.strokeStyle = `rgba(0,255,255,${btnAlpha*0.5})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(canvas.width/2-60, btnY+10); ctx.lineTo(canvas.width/2+60, btnY+10); ctx.stroke();
    ctx.fillStyle = '#666'; ctx.font = '12px Arial'; ctx.fillText("v1.2.0 By 熊子", canvas.width/2, canvas.height-30);
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
        drawDiverSilhouette(canvas.width/2-60, canvas.height/2, '#555');
        drawDiverSilhouette(canvas.width/2+60, canvas.height/2+20, '#555', true);
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

function drawDiverSilhouette(x: number, y: number, color: string, isDead: boolean = false) {
    ctx.save(); ctx.translate(x, y);
    if(isDead) ctx.rotate(Math.PI/2);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, -20, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(-10, -10, 20, 30); ctx.fillRect(-12, -10, 4, 20); ctx.fillRect(8, -10, 4, 20);
    ctx.fillRect(-8, 20, 6, 20); ctx.fillRect(2, 20, 6, 20);
    ctx.restore();
}

function drawControls() {
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

// ============================================================
// 绳索渲染系统
// ============================================================

function generateSlackRopePoints(basePath: any[], slackFactor: number, animTime: number): any[] {
    if(!basePath || basePath.length < 2) return basePath || [];
    const totalLen = pathLength(basePath);
    if(totalLen < 1) return basePath;
    const segLen = CONFIG.ropeSegmentLength;
    const steps = Math.max(2, Math.ceil(totalLen / segLen));
    const dt = totalLen / steps;
    const time = animTime || 0;
    const points: any[] = [];
    for(let i=0; i<=steps; i++) {
        const t = i * dt;
        const fraction = totalLen > 0 ? t/totalLen : 0;
        const pos = samplePolyline(basePath, t);
        const norm = polylineNormal(basePath, t);
        const sagEnvelope = Math.sin(fraction * Math.PI);
        const sag = sagEnvelope * CONFIG.ropeSlackAmplitude * slackFactor;
        const gravity = sagEnvelope * CONFIG.ropeSlackGravity * slackFactor;
        const wave = Math.sin(fraction*Math.PI*2*CONFIG.ropeWaveFrequency + time*CONFIG.ropeWaveSpeed) * CONFIG.ropeWaveAmplitude * slackFactor * sagEnvelope;
        const drift = Math.sin(fraction*Math.PI*1.3 + time*CONFIG.ropeDriftSpeed + 0.5) * CONFIG.ropeDriftAmplitude * slackFactor * sagEnvelope;
        points.push({ x: pos.x + norm.x*(sag+wave+drift), y: pos.y + norm.y*(sag+wave+drift) + gravity });
    }
    return points;
}

function strokeRopeLine(points: any[], color: string, width: number) {
    if(!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    if(points.length === 2) {
        ctx.lineTo(points[1].x, points[1].y);
    } else {
        for(let i=1; i<points.length-1; i++) {
            let midX=(points[i].x+points[i+1].x)/2, midY=(points[i].y+points[i+1].y)/2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
    }
    ctx.stroke(); ctx.restore();
}

function drawNail(x: number, y: number, wallX: number, wallY: number) {
    ctx.save();
    let angle = Math.atan2(y-wallY, x-wallX);
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = CONFIG.ropeNailColor; ctx.fillRect(-2, -1.5, CONFIG.ropeNailRadius*2, 3);
    ctx.beginPath(); ctx.arc(0, 0, CONFIG.ropeNailRadius*0.6, 0, Math.PI*2);
    ctx.fillStyle = '#aaa'; ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
}

function drawKnot(x: number, y: number) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, CONFIG.ropeKnotRadius, 0, Math.PI*2);
    ctx.fillStyle = CONFIG.ropeKnotColor; ctx.fill();
    ctx.strokeStyle = 'rgba(180,170,120,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(150,140,100,0.6)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x-2,y-1); ctx.lineTo(x+2,y+1); ctx.moveTo(x-2,y+1); ctx.lineTo(x+2,y-1); ctx.stroke();
    ctx.restore();
}

function drawReelIndicator(x: number, y: number, angle: number) {
    ctx.save(); ctx.translate(x, y);
    let reelX = -Math.cos(angle)*12, reelY = -Math.sin(angle)*12;
    ctx.beginPath(); ctx.arc(reelX, reelY, CONFIG.ropeReelRadius, 0, Math.PI*2);
    ctx.fillStyle = CONFIG.ropeReelColor; ctx.fill();
    ctx.strokeStyle = 'rgba(160,150,110,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    let t = Date.now()/500;
    ctx.strokeStyle = 'rgba(230,220,170,0.5)'; ctx.lineWidth = 0.8;
    for(let i=0; i<3; i++) {
        let a = t + i*Math.PI*2/3;
        ctx.beginPath(); ctx.moveTo(reelX, reelY);
        ctx.lineTo(reelX+Math.cos(a)*CONFIG.ropeReelRadius*0.8, reelY+Math.sin(a)*CONFIG.ropeReelRadius*0.8); ctx.stroke();
    }
    ctx.restore();
}

function drawRopesWorld() {
    if(!state.rope) return;
    const time = Date.now()/1000;
    for(let rope of state.rope.ropes) {
        if(!rope.path || rope.path.length < 2) continue;
        let visualPts = generateSlackRopePoints(rope.path, rope.slackFactor||0, time);
        strokeRopeLine(visualPts, CONFIG.ropeTightColor, CONFIG.ropeTightWidth);
        if(rope.start && rope.startWall) { drawNail(rope.start.x, rope.start.y, rope.startWall.x, rope.startWall.y); drawKnot(rope.start.x, rope.start.y); }
        if(rope.end && rope.endWall) { drawNail(rope.end.x, rope.end.y, rope.endWall.x, rope.endWall.y); drawKnot(rope.end.x, rope.end.y); }
    }
    if(state.rope.active && state.rope.current && state.rope.current.start) {
        let cur = state.rope.current;
        if(!cur.path || cur.path.length < 2) return;
        let visualPts = generateSlackRopePoints(cur.path, cur.slackFactor!==undefined?cur.slackFactor:1, cur.time||time);
        strokeRopeLine(visualPts, CONFIG.ropeColor, CONFIG.ropeWidth);
        if(cur.start && cur.startWall) { drawNail(cur.start.x, cur.start.y, cur.startWall.x, cur.startWall.y); drawKnot(cur.start.x, cur.start.y); }
    }
    if(state.rope.active && player.y > 0) drawReelIndicator(player.x, player.y, player.angle);
}

function drawRopeButton() {
    if(state.screen !== 'play') return;
    if(!state.rope || !state.rope.ui || !state.rope.ui.visible) return;
    const btnX = CONFIG.screenWidth * CONFIG.ropeButtonXRatio;
    const btnY = CONFIG.screenHeight * CONFIG.ropeButtonYRatio;
    const radius = CONFIG.ropeButtonRadius;
    const progress = state.rope.ui.progress || 0;
    const isEnd = state.rope.ui.type === 'end';
    const time = Date.now()/1000;
    ctx.save();
    if(progress === 0) {
        let glowAlpha = 0.15 + Math.sin(time*3)*0.1;
        ctx.beginPath(); ctx.arc(btnX, btnY, radius+8, 0, Math.PI*2);
        ctx.fillStyle = `rgba(230,220,170,${glowAlpha})`; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(btnX, btnY, radius, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(20,30,40,0.85)'; ctx.fill();
    ctx.strokeStyle = isEnd ? 'rgba(255,180,80,0.7)' : 'rgba(200,220,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    if(progress > 0) {
        ctx.strokeStyle = isEnd ? 'rgba(255,200,100,0.95)' : 'rgba(230,220,170,0.95)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(btnX, btnY, radius-5, -Math.PI/2, -Math.PI/2+progress*Math.PI*2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    if(isEnd) {
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(btnX, btnY-3, 5, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(btnX, btnY+2); ctx.lineTo(btnX, btnY+10); ctx.stroke();
    } else {
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(btnX, btnY, 7, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(btnX, btnY, 3, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '10px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(isEnd ? '结束布线' : '开始布线', btnX, btnY+radius+6);
    ctx.restore();
}