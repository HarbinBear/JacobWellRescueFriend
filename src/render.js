import { CONFIG } from './config.js';
import { state, player, target, particles, touches } from './state.js';
import { pathLength, samplePolyline, polylineNormal } from './logic.js';

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

    // 使用纹理或噪点填充墙壁，去除描边以减少球体感
    const { tileSize: ts } = CONFIG;
    // ctx.strokeStyle = '#333'; // 去除描边
    // ctx.lineWidth = 2;

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

    // 绘制粒子
    for(let p of particles) {
        if(p.type === 'silt') {
            // 泥沙可见度 = 基础alpha × life，life连续衰减到0，粒子渐渐变淡消失
            let siltAlpha = p.alpha * Math.max(0, p.life);
            if (siltAlpha < 0.005) continue;
            ctx.fillStyle = `rgba(120, 100, 80, ${siltAlpha})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
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
    let vSiltVis = Math.max(0.1, 1 - (player.silt / 80)); 
    // let vRayDist = CONFIG.lightRange * vSiltVis;
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
            dist: vRayDist * 0.9 
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

    // 泥沙遮挡改为逐射线衰减（在drawFlashlight中通过computeSiltAttenuation实现），
    // 不再全局缩短光照距离
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
            // 这使得即使手电不照的方向也能看到近距离的东西
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

    ctx.drawImage(lightLayer, 0, 0);

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
    
    // 隧道深处模糊遮罩 - 已移除
    // if(state.story.stage === 1 && state.landmarks.tunnelEntry) {
    //     let entryY = state.landmarks.tunnelEntry.y;
    //     let screenEntryY = (entryY - player.y) * zoom + canvas.height/2 + shakeY;
    //     if(screenEntryY < canvas.height + 500) {
    //         let gradientStart = Math.max(-500, screenEntryY + 50); 
    //         let grad = ctx.createLinearGradient(0, gradientStart, 0, gradientStart + 400);
    //         grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    //         grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.9)');
    //         grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
    //         ctx.fillStyle = grad;
    //         ctx.fillRect(0, gradientStart, canvas.width, canvas.height - gradientStart + 500);
    //     }
    // }

    // 3. 绘制 UI
    drawUI();
    drawControls();
    drawRopeButton();

    // 4. 转场动画
    if(state.transition && state.transition.active) {
        ctx.save();
        
        let t = state.transition.alpha;
        
        // --- 背景颜色 ---
        // mode='out' (入水): 深蓝 -> 更深
        // mode='in' (稳定): 深蓝 -> 浅蓝 (通过 alpha 降低露出游戏背景)
        // 为了增强"变浅蓝"的感觉，我们在 in 模式下使用稍亮的蓝色底
        let bgR = 0, bgG = 17, bgB = 51; // 深海蓝
        if (state.transition.mode === 'in') {
            bgR = 0; bgG = 60; bgB = 100; // 稍亮的蓝
        }
        
        ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${t})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // --- 气泡动画 ---
        // 使用 logic.js 中更新的持久化气泡状态
        if (state.transition.bubbles) {
            for(let b of state.transition.bubbles) {
                // 透明度随转场进度变化
                // 稍微随机一点透明度
                let alpha = t * 0.6;
                if(alpha > 1) alpha = 1;
                
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.size, 0, Math.PI*2);
                ctx.fill();
                
                // 高光
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 1.5})`; // 更亮
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
function drawFlashlight(ctx, x, y, angle, rayDist, mode = 'mask', siltData = null) {
    ctx.save();

    // 计算光照多边形（射线碰撞岩石，不因泥沙截短——泥沙只影响亮度，不截短射线）
    let poly = getLightPolygon(x, y, angle, rayDist, CONFIG.fov);

    if (mode === 'mask') {
        // 光照遮罩模式：擦除黑暗

        if (siltData) {
            // ===== 有泥沙时：逐扇区、逐距离段绘制，实现"泥沙前亮、泥沙后暗"效果 =====
            let { perStep, rays, steps, stride, stepDist } = siltData;

            // 基础亮度计算（径向衰减：近处全亮，远处渐暗）
            /** @param {number} dr - 距离比（0~1） */
            let calcBrightness = (dr) => {
                if (dr < 0.5) return 1.0;
                if (dr < 0.85) return 1.0 - (dr - 0.5) / 0.35 * 0.4;
                return 0.6 * (1 - (dr - 0.85) / 0.15);
            };

            for (let i = 0; i < poly.length - 1; i++) {
                let p0 = poly[i];
                let p1 = poly[i + 1];

                // 射线方向（从光源到多边形端点）
                let dx0 = p0.x - x, dy0 = p0.y - y;
                let len0 = Math.hypot(dx0, dy0) || 1;
                let dx1 = p1.x - x, dy1 = p1.y - y;
                let len1 = Math.hypot(dx1, dy1) || 1;

                // 该扇区内射线碰到岩石的最大距离
                let maxLen = Math.max(len0, len1);

                // 逐距离段绘制：将这个扇区沿径向分成 steps 段
                for (let s = 0; s < steps; s++) {
                    let nearDist = s * stepDist;
                    let farDist = Math.min((s + 1) * stepDist, maxLen);
                    if (nearDist >= maxLen) break;

                    // 近端和远端的透射率（取两条相邻射线的平均）
                    let nearTrans0 = perStep[i * stride + s];
                    let nearTrans1 = perStep[Math.min(i + 1, rays) * stride + s];
                    let nearTransAvg = (nearTrans0 + nearTrans1) / 2;

                    let farS = Math.min(s + 1, steps);
                    let farTrans0 = perStep[i * stride + farS];
                    let farTrans1 = perStep[Math.min(i + 1, rays) * stride + farS];
                    let farTransAvg = (farTrans0 + farTrans1) / 2;

                    // 近端和远端都太暗就跳过
                    if (nearTransAvg < 0.01 && farTransAvg < 0.01) continue;

                    // 内外弧的4个顶点（近端弧 + 远端弧 组成梯形）
                    let nearRatio0 = Math.min(nearDist / len0, 1);
                    let farRatio0 = Math.min(farDist / len0, 1);
                    let nearRatio1 = Math.min(nearDist / len1, 1);
                    let farRatio1 = Math.min(farDist / len1, 1);

                    let nx0 = x + dx0 * nearRatio0;
                    let ny0 = y + dy0 * nearRatio0;
                    let fx0 = x + dx0 * farRatio0;
                    let fy0 = y + dy0 * farRatio0;
                    let nx1 = x + dx1 * nearRatio1;
                    let ny1 = y + dy1 * nearRatio1;
                    let fx1 = x + dx1 * farRatio1;
                    let fy1 = y + dy1 * farRatio1;

                    // 近端和远端的基础亮度（径向衰减）
                    let nearDistRatio = nearDist / rayDist;
                    let farDistRatio = farDist / rayDist;

                    let nearAlpha = calcBrightness(nearDistRatio) * nearTransAvg;
                    let farAlpha = calcBrightness(farDistRatio) * farTransAvg;

                    // 两端都太暗就跳过
                    if (nearAlpha < 0.005 && farAlpha < 0.005) continue;

                    // 用线性渐变从近端alpha过渡到远端alpha，消除段间阶梯感
                    // 渐变方向：从梯形近端中点 → 远端中点
                    let nearMidX = (nx0 + nx1) / 2;
                    let nearMidY = (ny0 + ny1) / 2;
                    let farMidX = (fx0 + fx1) / 2;
                    let farMidY = (fy0 + fy1) / 2;

                    let grad = ctx.createLinearGradient(nearMidX, nearMidY, farMidX, farMidY);
                    grad.addColorStop(0, `rgba(255, 255, 255, ${nearAlpha})`);
                    grad.addColorStop(1, `rgba(255, 255, 255, ${farAlpha})`);

                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.moveTo(nx0, ny0);
                    ctx.lineTo(fx0, fy0);
                    ctx.lineTo(fx1, fy1);
                    ctx.lineTo(nx1, ny1);
                    ctx.closePath();
                    ctx.fill();
                }
            }

            // 羽化层：只对最终（最远段）透射率仍有值的方向绘制
            let featherDist = CONFIG.lightEdgeFeather || 25;
            for (let i = 0; i < poly.length - 1; i++) {
                // 最远段的透射率
                let finalTrans0 = perStep[i * stride + steps];
                let finalTrans1 = perStep[Math.min(i + 1, rays) * stride + steps];
                let finalTrans = (finalTrans0 + finalTrans1) / 2;
                if (finalTrans < 0.05) continue;

                let p0 = poly[i];
                let p1 = poly[i + 1];
                let dx0 = p0.x - x, dy0 = p0.y - y;
                let len0 = Math.hypot(dx0, dy0) || 1;
                let dx1 = p1.x - x, dy1 = p1.y - y;
                let len1 = Math.hypot(dx1, dy1) || 1;

                let fp0x = p0.x + (dx0 / len0) * featherDist;
                let fp0y = p0.y + (dy0 / len0) * featherDist;
                let fp1x = p1.x + (dx1 / len1) * featherDist;
                let fp1y = p1.y + (dy1 / len1) * featherDist;

                let featherAlpha = finalTrans * 0.3;

                ctx.fillStyle = `rgba(255, 255, 255, ${featherAlpha})`;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(fp0x, fp0y);
                ctx.lineTo(fp1x, fp1y);
                ctx.lineTo(p1.x, p1.y);
                ctx.closePath();
                ctx.fill();
            }
        } else {
            // ===== 无泥沙时，保持原来的简单绘制方式（性能更好） =====
            // 第 1 层：主光照区域
            let mainGradient = ctx.createRadialGradient(x, y, 0, x, y, rayDist);
            mainGradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
            mainGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
            mainGradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.6)');
            mainGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.fillStyle = mainGradient;
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let p of poly) ctx.lineTo(p.x, p.y);
            ctx.closePath();
            ctx.fill();

            // 第 2 层：边缘羽化
            let featherDist = CONFIG.lightEdgeFeather || 25;
            let featherPoly = poly.map(p => {
                let dx = p.x - x;
                let dy = p.y - y;
                let len = Math.hypot(dx, dy) || 1;
                return {
                    x: p.x + (dx / len) * featherDist,
                    y: p.y + (dy / len) * featherDist
                };
            });

            let featherGrad = ctx.createRadialGradient(x, y, 0, x, y, rayDist + featherDist);
            featherGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            featherGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
            featherGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.fillStyle = featherGrad;
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let p of featherPoly) ctx.lineTo(p.x, p.y);
            ctx.closePath();
            ctx.fill();
        }

    } else if (mode === 'volumetric') {
        // 体积光也使用多边形裁剪，防止穿墙
        ctx.globalCompositeOperation = 'screen';
        
        // 1. 大范围泛光 (淡黄色)
        let grad = ctx.createRadialGradient(x, y, 0, x, y, rayDist);
        grad.addColorStop(0, CONFIG.flashlightColor); 
        grad.addColorStop(1, 'rgba(255, 250, 200, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for(let p of poly) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
        
        // 2. 中心高亮光束 (更窄，更亮)
        let centerPoly = getLightPolygon(x, y, angle, rayDist, CONFIG.flashlightCenterFov);
        let centerGrad = ctx.createRadialGradient(x, y, 0, x, y, rayDist);
        centerGrad.addColorStop(0, CONFIG.flashlightCenterColor); 
        centerGrad.addColorStop(1, 'rgba(255, 255, 220, 0)');
        
        ctx.fillStyle = centerGrad;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for(let p of centerPoly) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

// 统一的潜水员绘制函数
function drawDiver(ctx, x, y, angle, colors = null, animTime = 0, hasTank = true) {
    ctx.save();
    
    // 模拟水流荡漾
    let swayX = Math.sin(Date.now() / 1000) * 2;
    let swayY = Math.cos(Date.now() / 1300) * 2;
    ctx.translate(x + swayX, y + swayY);
    
    ctx.rotate(angle);

    const defaultColors = {
        suit: '#333',
        body: '#dd0',
        tank: '#bef',
        mask: '#fa0'
    };
    const c = colors || defaultColors;

    // 脚蹼动画
    let time = animTime || Date.now() / 150;
    
    // 左脚蹼
    ctx.save();
    ctx.translate(-15, -4);
    let leftPhase = Math.sin(time);
    let leftScale = 0.7 + leftPhase * 0.3; 
    ctx.scale(leftScale, 1);
    ctx.fillStyle = c.suit;
    ctx.beginPath();
    ctx.moveTo(0, -2); ctx.lineTo(-12, -4); ctx.lineTo(-12, 4); ctx.lineTo(0, 2);
    ctx.fill();
    ctx.restore();

    // 右脚蹼
    ctx.save();
    ctx.translate(-15, 4);
    let rightPhase = Math.sin(time + Math.PI);
    let rightScale = 0.7 + rightPhase * 0.3;
    ctx.scale(rightScale, 1);
    ctx.fillStyle = c.suit;
    ctx.beginPath();
    ctx.moveTo(0, -2); ctx.lineTo(-12, -4); ctx.lineTo(-12, 4); ctx.lineTo(0, 2);
    ctx.fill();
    ctx.restore();

    // 身体
    ctx.fillStyle = c.body;
    ctx.fillRect(-8, -5, 16, 10); // 稍微加宽

    // 气瓶
    if(hasTank) {
        ctx.fillStyle = '#111'; 
        ctx.fillRect(-3, -7, 6, 14);
        
        ctx.fillStyle = '#FFD700'; 
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        
        ctx.beginPath(); 
        if (ctx.roundRect) {
            ctx.roundRect(3, -7, 9, 14, [3]);
        } else {
            ctx.rect(3, -7, 9, 14);
        }
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#888';
        ctx.fillRect(5, -9, 4, 2);
    }

    // 头部 (画大一点，明显一点)
    ctx.fillStyle = '#dcb'; // 肉色皮肤
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI*2); ctx.fill();
    
    // 头套/潜水帽
    ctx.fillStyle = '#222';
    ctx.beginPath(); 
    ctx.arc(0, 0, 7.5, Math.PI/2, -Math.PI/2, true); // 后脑勺
    ctx.fill();

    // 面罩
    ctx.fillStyle = c.mask; 
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath(); 
    // 椭圆面罩
    ctx.ellipse(4, 0, 3, 5, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
    
    // 面罩反光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(5, -2, 1, 2, 0.5, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
}

function drawLungs(x, y, o2) {
    ctx.save();
    ctx.translate(x, y);
    
    // 呼吸动效
    let breath = Math.sin(Date.now() / 800) * 0.05;
    ctx.scale(1 + breath, 1 + breath);
    
    const w = 40; 
    const h = 60;
    const gap = 6;
    
    // 气管
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(-3, -h/2 - 10);
    ctx.lineTo(3, -h/2 - 10);
    ctx.lineTo(3, -h/2 - 20);
    ctx.lineTo(-3, -h/2 - 20);
    ctx.fill();
    
    // 绘制左肺
    drawLungLobe(ctx, -w/2 - gap/2, 0, w, h, o2, true);
    // 绘制右肺
    drawLungLobe(ctx, w/2 + gap/2, 0, w, h, o2, false);
    
    // 百分比文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    // ctx.shadowBlur = 4;
    ctx.fillText(Math.floor(o2) + '%', 0, 5);
    
    // 警告闪烁
    if(o2 < 30) {
        let alpha = 0.5 + Math.sin(Date.now()/100) * 0.5;
        ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
        ctx.font = 'bold 14px Arial';
        ctx.fillText("WARNING", 0, h/2 + 20);
    }
    
    ctx.restore();
}

function drawLungLobe(ctx, x, y, w, h, o2, isLeft) {
    ctx.save();
    ctx.translate(x, y);
    
    // 拟真肺叶形状
    ctx.beginPath();
    if (isLeft) {
        ctx.moveTo(w/2, -h/2); 
        ctx.bezierCurveTo(w/2, -h/2, -w/2, -h/2 + 15, -w/2, 0); 
        ctx.bezierCurveTo(-w/2, h/2 - 5, 0, h/2, w/2, h/2); 
        ctx.lineTo(w/2, -h/2); 
    } else {
        ctx.moveTo(-w/2, -h/2); 
        ctx.bezierCurveTo(-w/2, -h/2, w/2, -h/2 + 15, w/2, 0); 
        ctx.bezierCurveTo(w/2, h/2 - 5, 0, h/2, -w/2, h/2); 
        ctx.lineTo(-w/2, -h/2); 
    }
    ctx.closePath();
    
    // 背景 (空肺 - 黑色/极暗红)
    ctx.fillStyle = 'rgba(20, 0, 0, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#311';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 裁剪区域
    ctx.clip();
    
    // 填充 (氧气 - 红色)
    // 整个肺作为进度条：一半氧气 = 一半高度填充
    let fillHeight = h * (o2 / 100);
    let fillY = h/2 - fillHeight;
    
    // 颜色：充足时鲜红，不足时暗红闪烁
    let lungColor = '#e00'; // 鲜红
    if (o2 < 30) {
        // 低氧闪烁
        let flash = Math.floor(Date.now() / 200) % 2 === 0;
        lungColor = flash ? '#f00' : '#800';
    }
    
    ctx.fillStyle = lungColor;
    ctx.fillRect(-w, fillY, w*2, fillHeight);
    
    // 肺纹理 (覆盖在填充之上，增加质感)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if(isLeft) {
        ctx.moveTo(w/4, -h/4); ctx.quadraticCurveTo(0, 0, -w/4, h/4);
        ctx.moveTo(w/4, -h/4); ctx.quadraticCurveTo(w/4, 0, 0, h/3);
    } else {
        ctx.moveTo(-w/4, -h/4); ctx.quadraticCurveTo(0, 0, w/4, h/4);
        ctx.moveTo(-w/4, -h/4); ctx.quadraticCurveTo(-w/4, 0, 0, h/3);
    }
    ctx.stroke();
    
    ctx.restore();
}

// 射线与圆的精确相交检测
// 返回射线从 (ox,oy) 方向 (dx,dy) 与圆心 (cx,cy) 半径 cr 的最近交点距离
// 如果不相交返回 Infinity
function rayCircleIntersect(ox, oy, dx, dy, cx, cy, cr) {
    let fx = ox - cx;
    let fy = oy - cy;
    let a = dx * dx + dy * dy; // 应该是 1 如果方向已归一化
    let b = 2 * (fx * dx + fy * dy);
    let c = fx * fx + fy * fy - cr * cr;
    let discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return Infinity;
    let sqrtD = Math.sqrt(discriminant);
    let t1 = (-b - sqrtD) / (2 * a);
    let t2 = (-b + sqrtD) / (2 * a);
    // 取最近的正解
    // t1 是最近交点：如果 t1 > 0 表示射线从圆外射入，正常遮挡
    // 如果 t1 <= 0 说明起点在圆内或圆后方，跳过此圆不算遮挡
    if (t1 > 0) return t1;
    return Infinity;
}

// 射线与轴对齐方格的相交检测
// 方格中心 (cx,cy)，半尺寸 halfSize
// 返回最近交点距离，不相交返回 Infinity
function rayBoxIntersect(ox, oy, dx, dy, cx, cy, halfSize) {
    let minX = cx - halfSize, maxX = cx + halfSize;
    let minY = cy - halfSize, maxY = cy + halfSize;
    let tmin = -Infinity, tmax = Infinity;

    if (Math.abs(dx) > 1e-8) {
        let t1 = (minX - ox) / dx;
        let t2 = (maxX - ox) / dx;
        if (t1 > t2) { let tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
    } else {
        if (ox < minX || ox > maxX) return Infinity;
    }
    if (Math.abs(dy) > 1e-8) {
        let t1 = (minY - oy) / dy;
        let t2 = (maxY - oy) / dy;
        if (t1 > t2) { let tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
    } else {
        if (oy < minY || oy > maxY) return Infinity;
    }
    if (tmin > tmax || tmax < 0) return Infinity;
    // 只在射线从外部射入时（tmin > 0）才遮挡；起点在方块内则跳过
    return tmin > 0 ? tmin : Infinity;
}

// ============ 泥沙空间哈希网格 ============
// ============ 蓝噪声纹理（仅生成一次） ============
// 64x64 蓝噪声纹理，值域 [0, 1)，使用 Interleaved Gradient Noise 公式生成
let _blueNoiseTex = null;
const BLUE_NOISE_SIZE = 64;

function getBlueNoise() {
    if (_blueNoiseTex) return _blueNoiseTex;
    let size = BLUE_NOISE_SIZE;
    let tex = new Float32Array(size * size);
    // IGN(x,y) = fract(52.9829189 * fract(0.06711056*x + 0.00583715*y))
    // 该公式来自 Jorge Jimenez SIGGRAPH 2014，频谱特征接近蓝噪声
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let v = 52.9829189 * (0.06711056 * x + 0.00583715 * y);
            tex[y * size + x] = v - Math.floor(v);
        }
    }
    _blueNoiseTex = tex;
    return tex;
}

// 帧计数器，用于蓝噪声时间维度偏移
let _blueNoiseFrame = 0;

/**
 * 从蓝噪声纹理采样，每帧自动偏移实现时间抗锯齿。
 * @param {number} u - 纹理坐标 u（自动取模）
 * @param {number} v - 纹理坐标 v（自动取模）
 * @returns {number} [0, 1) 范围的蓝噪声值
 */
function sampleBlueNoise(u, v) {
    let tex = getBlueNoise();
    let size = BLUE_NOISE_SIZE;
    // 每帧偏移一个质数，避免固定噪声模式
    let offset = _blueNoiseFrame * 7;
    let ix = ((Math.floor(u) % size) + size + offset) % size;
    let iy = ((Math.floor(v) % size) + size) % size;
    return tex[iy * size + ix];
}

// ============ 泥沙逐射线逐距离段衰减计算 ============
// 返回二维结构：{ perStep: Float32Array[(rays+1) * (steps+1)], rays, steps, ... }
// perStep[i * stride + s] = 射线i在第s步处的累积透射率 (0~1)
// drawFlashlight 逐段绘制不同亮度，段内做线性插值以实现平滑过渡
function computeSiltAttenuation(sx, sy, angle, maxDist, fovDeg) {
    _blueNoiseFrame++;
    let fovRad = fovDeg * Math.PI / 180;
    let startAngle = angle - fovRad / 2;
    let rays = CONFIG.rayCount;
    let rayStep = fovRad / rays;

    let steps = CONFIG.siltSampleSteps || 12;
    let stepDist = maxDist / steps;
    let absorptionCoeff = CONFIG.siltAbsorptionCoeff || 3.0;
    let influenceRadius = CONFIG.siltInfluenceRadius || 30;

    // --- 第1步：收集光照范围内的所有泥沙粒子 ---
    let maxRange = maxDist + influenceRadius;
    let maxRangeSq = maxRange * maxRange;
    /** @type {Array<{x:number, y:number, alpha:number, life:number, size:number}>} */
    let siltList = [];
    for (let p of particles) {
        if (p.type !== 'silt') continue;
        let conc = p.alpha * p.life;
        if (conc <= 0.005) continue;
        let dx = p.x - sx;
        let dy = p.y - sy;
        if (dx * dx + dy * dy > maxRangeSq) continue;
        siltList.push(p);
    }

    if (siltList.length === 0) {
        return null; // 没有泥沙粒子，跳过
    }

    // --- 第2步：为每条射线的每个距离步累积光学深度 ---
    let stride = steps + 1;
    let opticalDepth = new Float32Array((rays + 1) * stride);

    // 预计算射线方向（带蓝噪声角度抖动和起点径向偏移）
    // 注意：这里的蓝噪声坐标必须与 getLightPolygon 中一致（都用 (i, 0)），
    // 否则扇区和衰减数据的射线方向不匹配
    let rayDirs = new Float32Array((rays + 1) * 2);
    /** @type {Float32Array} 每条射线的起点径向偏移量（像素） */
    let rayStartOffset = new Float32Array(rays + 1);
    for (let i = 0; i <= rays; i++) {
        // 蓝噪声角度抖动，坐标 (i, 0)，与 getLightPolygon 保持一致
        let bn = sampleBlueNoise(i, 0);
        let a = startAngle + i * rayStep;
        a += (bn - 0.5) * rayStep * 0.4; // ±20% rayStep 抖动
        rayDirs[i * 2] = Math.cos(a);
        rayDirs[i * 2 + 1] = Math.sin(a);

        // 蓝噪声起点径向偏移，坐标 (i, 32)
        let bn2 = sampleBlueNoise(i, 32);
        rayStartOffset[i] = (bn2 - 0.5) * stepDist * 0.5; // ±25% stepDist 径向抖动
    }

    // --- 第3步：将每个泥沙粒子的贡献分配到对应的射线和距离步上 ---
    for (let p of siltList) {
        let relX = p.x - sx;
        let relY = p.y - sy;

        // 粒子浓度 = alpha × life（连续衰减到0）
        let concentration = p.alpha * p.life;

        // 有效遮挡半径：粒子越大遮挡面积越大
        let effectiveRadius = p.size * 0.5 + influenceRadius * 0.3;

        // 计算该粒子可能影响的射线范围
        let pAngle = Math.atan2(relY, relX);
        let pDist = Math.sqrt(relX * relX + relY * relY);
        if (pDist < 1) continue;
        // 粒子从光源看过去的张角
        let angularExtent = Math.atan2(effectiveRadius, pDist);

        // 处理 ±π 边界：将粒子角度归一化到射线角度范围
        let midAngle = startAngle + fovRad / 2;
        let da = pAngle - midAngle;
        da = da - Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
        let wrappedAngle = midAngle + da;

        // 转换为射线索引范围
        let minAngle = wrappedAngle - angularExtent;
        let maxAngle = wrappedAngle + angularExtent;
        let iMin = Math.floor((minAngle - startAngle) / rayStep) - 1;
        let iMax = Math.ceil((maxAngle - startAngle) / rayStep) + 1;
        iMin = Math.max(0, iMin);
        iMax = Math.min(rays, iMax);

        // 将粒子投影到每条受影响的射线上
        for (let i = iMin; i <= iMax; i++) {
            let cosA = rayDirs[i * 2];
            let sinA = rayDirs[i * 2 + 1];

            // 粒子在射线上的投影距离
            let projT = relX * cosA + relY * sinA;
            if (projT < 0) continue; // 在光源后方
            if (projT > maxDist) continue; // 超出光照范围

            // 到射线的垂直距离
            let perpX = relX - projT * cosA;
            let perpY = relY - projT * sinA;
            let perpDistSq = perpX * perpX + perpY * perpY;
            let effectiveRadiusSq = effectiveRadius * effectiveRadius;
            if (perpDistSq >= effectiveRadiusSq) continue;

            // 横向衰减：平滑二次曲线
            let perpDist = Math.sqrt(perpDistSq);
            let lateralFalloff = 1.0 - (perpDist / effectiveRadius) * (perpDist / effectiveRadius);

            // 该粒子的光学深度贡献
            // 浓度(0~0.5) × 横向衰减(0~1) × 尺寸因子
            let sizeFactor = p.size / 15.0; // 15px 为参考尺寸
            let contribution = concentration * lateralFalloff * sizeFactor * absorptionCoeff;

            // 确定该粒子落入哪个距离步
            // 应用蓝噪声起点径向偏移
            let adjustedProjT = projT - rayStartOffset[i];
            let stepIdx = Math.floor(adjustedProjT / stepDist);
            if (stepIdx < 1) stepIdx = 1;
            if (stepIdx > steps) stepIdx = steps;

            // 累加到对应的距离步（后续通过前缀和传播到更远的步）
            let base = i * stride;
            opticalDepth[base + stepIdx] += contribution;
        }
    }

    // --- 第4步：前缀和累积 + 线性透射率硬截断 ---
    // 线性衰减公式：透射率 = max(0, 1 - τ)
    // 当 τ ≥ 1 时光完全被遮挡（归零），不像 exp(-τ) 永远趋近0
    let perStep = new Float32Array((rays + 1) * stride);
    for (let i = 0; i <= rays; i++) {
        let base = i * stride;
        let cumulativeTau = 0;
        perStep[base] = 1.0; // 距离0处透射率=1
        for (let s = 1; s <= steps; s++) {
            cumulativeTau += opticalDepth[base + s];
            // 线性截断：τ≥1 时透射率直接归零
            let t = 1.0 - cumulativeTau;
            if (t < 0) t = 0;
            perStep[base + s] = t;
        }
    }

    return { perStep, rays, steps, stride, stepDist };
}

function getLightPolygon(sx, sy, angle, maxDist, fovDeg = CONFIG.fov) {
    let points = [];
    let fovRad = fovDeg * Math.PI / 180;
    let startAngle = angle - fovRad / 2;
    let rays = CONFIG.rayCount;
    let step = fovRad / rays;
    const { tileSize } = CONFIG;
    const halfTile = tileSize / 2;

    // 计算需要检测的网格范围（以光源为中心，maxDist 为半径）
    let rMin = Math.max(0, Math.floor((sy - maxDist) / tileSize) - 1);
    let rMax = Math.min(CONFIG.rows - 1, Math.floor((sy + maxDist) / tileSize) + 1);
    let cMin = Math.max(0, Math.floor((sx - maxDist) / tileSize) - 1);
    let cMax = Math.min(CONFIG.cols - 1, Math.floor((sx + maxDist) / tileSize) + 1);

    // 预收集光源范围内的所有障碍物（边缘圆形 + 内部方块）
    let obstacles = [];
    for (let r = rMin; r <= rMax; r++) {
        if (!state.map[r]) continue;
        for (let c = cMin; c <= cMax; c++) {
            let cell = state.map[r][c];
            if (!cell) continue;
            if (typeof cell === 'object') {
                // 边缘岩石（圆形）
                let dx = cell.x - sx;
                let dy = cell.y - sy;
                if (dx * dx + dy * dy < (maxDist + cell.r) * (maxDist + cell.r)) {
                    obstacles.push({ type: 'circle', x: cell.x, y: cell.y, r: cell.r });
                }
            } else if (cell === 2) {
                // 内部实体（方块）
                let cx = c * tileSize + halfTile;
                let cy = r * tileSize + halfTile;
                let dx = cx - sx;
                let dy = cy - sy;
                if (dx * dx + dy * dy < (maxDist + tileSize) * (maxDist + tileSize)) {
                    obstacles.push({ type: 'box', x: cx, y: cy, half: halfTile });
                }
            }
        }
    }

    for (let i = 0; i <= rays; i++) {
        let a = startAngle + i * step;
        // 蓝噪声角度抖动（坐标 (i, 0)，必须与 computeSiltAttenuation 保持一致）
        let bn = sampleBlueNoise(i, 0);
        a += (bn - 0.5) * step * 0.4;
        let dx = Math.cos(a);
        let dy = Math.sin(a);

        let closestDist = maxDist;

        // 对每条射线检测所有障碍物
        for (let obs of obstacles) {
            let hitDist;
            if (obs.type === 'circle') {
                hitDist = rayCircleIntersect(sx, sy, dx, dy, obs.x, obs.y, obs.r);
            } else {
                hitDist = rayBoxIntersect(sx, sy, dx, dy, obs.x, obs.y, obs.half);
            }
            if (hitDist < closestDist) {
                closestDist = hitDist;
            }
        }

        points.push({ x: sx + dx * closestDist, y: sy + dy * closestDist, dist: closestDist });
    }
    return points;
}

function isLineOfSight(x1, y1, x2, y2, maxDist) {
    let dist = Math.hypot(x2-x1, y2-y1);
    if(dist > maxDist) return false;
    const { tileSize } = CONFIG;
    let dx = x2 - x1;
    let dy = y2 - y1;
    // 步进检测间距更小确保不漏过
    let stepLen = tileSize * 0.35;
    let steps = Math.ceil(dist / stepLen);
    for(let i=0; i<=steps; i++) {
        let t = i / steps;
        let cx = x1 + dx * t;
        let cy = y1 + dy * t;
        let r = Math.floor(cy / tileSize);
        let c = Math.floor(cx / tileSize);
        
        if(state.map[r] && state.map[r][c]) {
             let cell = state.map[r][c];
             if(cell === 2) return false;
             if(typeof cell === 'object') {
                 if(Math.hypot(cx - cell.x, cy - cell.y) < cell.r) return false;
             }
        }
    }
    return true;
}

function drawUI() {
    // 仪表盘背景 (加高以容纳小地图)
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

    // 氧气条 (仅在氧气瓶完好时显示)
    if(!state.story.flags.tankDamaged) {
        ctx.fillStyle = '#8cf';
        ctx.font = '12px Arial';
        ctx.fillText('O2', 20, 70);
        ctx.fillStyle = '#222';
        ctx.fillRect(50, 60, 100, 10);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(50, 60, Math.max(0, player.o2), 10);
    } else {
        // 氧气瓶损坏提示
        ctx.fillStyle = '#f00';
        ctx.font = 'bold 12px Arial';
        ctx.fillText('氧气瓶已损毁', 20, 70);
        
        // 在屏幕中间绘制肺部图标
        drawLungs(canvas.width/2, canvas.height/2 + 100, player.o2);
    }

    // 氮气条 (隐藏)
    // ctx.fillStyle = '#8cf';
    // ctx.fillText('N2', 20, 70);
    // ctx.fillStyle = '#222';
    // ctx.fillRect(50, 60, 100, 10);
    // ctx.fillStyle = '#f00';
    // ctx.fillRect(50, 60, Math.min(100, player.n2), 10);

    // 小地图 (移到左上角，仪表盘下方)
    if(state.explored && state.explored.length > 0) {
        let mapSize = 140; // 稍微大一点
        let mapX = 20;
        let mapY = 60; // 紧接在氧气条下方 (原为80，因为隐藏了氮气条所以上移)
        
        // 背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(mapX, mapY, mapSize, mapSize);
        ctx.strokeStyle = '#445';
        ctx.strokeRect(mapX, mapY, mapSize, mapSize);
        
        // 计算缩放
        let scaleX = mapSize / CONFIG.cols;
        let scaleY = mapSize / CONFIG.rows;
        
        // 绘制已探索区域
        for(let r=0; r<CONFIG.rows; r++) {
            for(let c=0; c<CONFIG.cols; c++) {
                if(state.explored[r] && state.explored[r][c]) {
                    let mx = mapX + c * scaleX;
                    let my = mapY + r * scaleY;
                    
                    if(state.map[r][c]) {
                        // 墙壁
                        ctx.fillStyle = '#555';
                        ctx.fillRect(mx, my, scaleX, scaleY);
                    } else {
                        // 水道 (稍微亮一点的蓝色)
                        ctx.fillStyle = 'rgba(50, 100, 150, 0.5)';
                        ctx.fillRect(mx, my, scaleX, scaleY);
                    }
                }
            }
        }
        
        // 玩家位置
        let px = mapX + (player.x / CONFIG.tileSize) * scaleX;
        let py = mapY + (player.y / CONFIG.tileSize) * scaleY;
        ctx.fillStyle = '#0f0';
        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI*2); ctx.fill();
        
        // 目标位置 (如果已探索或已找到)
        if(target.found || (state.explored[Math.floor(target.y/CONFIG.tileSize)] && state.explored[Math.floor(target.y/CONFIG.tileSize)][Math.floor(target.x/CONFIG.tileSize)])) {
             let tx = mapX + (target.x / CONFIG.tileSize) * scaleX;
             let ty = mapY + (target.y / CONFIG.tileSize) * scaleY;
             ctx.fillStyle = '#f0f';
             ctx.beginPath(); ctx.arc(tx, ty, 2, 0, Math.PI*2); ctx.fill();
        }
    }

    // 剧情文本显示 (支持多行)
    if(state.alertMsg) {
        ctx.fillStyle = state.alertColor;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        
        // 简单的自动换行逻辑
        let maxWidth = canvas.width * 0.8;
        let words = state.alertMsg.split('');
        let line = '';
        let lines = [];
        
        for(let n = 0; n < words.length; n++) {
            let testLine = line + words[n];
            let metrics = ctx.measureText(testLine);
            let testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                lines.push(line);
                line = words[n];
            } else {
                line = testLine;
            }
        }
        lines.push(line);
        
        let startY = canvas.height/3;
        for(let i=0; i<lines.length; i++) {
            ctx.fillText(lines[i], canvas.width/2, startY + i*30);
        }
    }

    // 游戏结束画面
    if(state.screen === 'ending') {
        drawEnding();
    } else if(state.screen === 'lose') {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f00';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('任务失败', canvas.width/2, canvas.height/2 - 20);
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.fillText(state.alertMsg, canvas.width/2, canvas.height/2 + 20);
        ctx.fillText('点击屏幕返回主菜单', canvas.width/2, canvas.height/2 + 60);
    } else if(state.screen === 'menu') {
        drawMenu();
    }
}

function drawMenu() {
    // 动态背景
    let time = Date.now() / 1000;
    
    // 深海渐变
    let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#001133');
    grad.addColorStop(1, '#000011');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 装饰性光束
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for(let i=0; i<3; i++) {
        let x = canvas.width/2 + Math.sin(time * 0.5 + i*2) * 100;
        let angle = Math.PI/2 + Math.sin(time * 0.3 + i) * 0.1;
        
        let rayGrad = ctx.createLinearGradient(x, 0, x, canvas.height);
        rayGrad.addColorStop(0, 'rgba(0, 255, 255, 0.1)');
        rayGrad.addColorStop(1, 'rgba(0, 255, 255, 0)');
        
        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(x - 50, 0);
        ctx.lineTo(x + 50, 0);
        ctx.lineTo(x + Math.cos(angle)*200, canvas.height);
        ctx.lineTo(x - Math.cos(angle)*200, canvas.height);
        ctx.fill();
    }
    ctx.restore();

    // 标题
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 255, 255, 0.5)';
    // ctx.shadowBlur = 20;
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px Arial';
    ctx.fillText("雅各布井", canvas.width/2, canvas.height/3);
    ctx.font = 'bold 28px Arial';
    ctx.fillText("救援行动", canvas.width/2, canvas.height/3 + 40);
    
    // ctx.shadowBlur = 0;

    // 开始按钮
    let btnY = canvas.height * 0.6;
    let btnAlpha = 0.8 + Math.sin(time * 3) * 0.2;
    
    ctx.fillStyle = `rgba(0, 255, 255, ${btnAlpha})`;
    ctx.font = 'bold 24px Arial';
    ctx.fillText("开始游戏", canvas.width/2, btnY);
    
    // 装饰线
    ctx.strokeStyle = `rgba(0, 255, 255, ${btnAlpha * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width/2 - 60, btnY + 10);
    ctx.lineTo(canvas.width/2 + 60, btnY + 10);
    ctx.stroke();
    
    // 版本信息
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.fillText("v1.2.0 By 熊子", canvas.width/2, canvas.height - 30);
}

function drawEnding() {
    // 全屏黑
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    let timer = state.endingTimer || 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 阶段 1: 0-4s (0-240帧)
    if(timer < 240) {
        let alpha = 1;
        if(timer < 60) alpha = timer / 60; // 淡入
        if(timer > 180) alpha = (240 - timer) / 60; // 淡出
        
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "小潘把一个密闭的洞穴气室\n误当成了出口，\n最终在搅动的泥沙中彻底迷失方向，\n丧生在了黑暗之中。", canvas.width/2, canvas.height/2, 30);
    }
    // 阶段 2: 4-8s (240-480帧)
    else if(timer < 480) {
        let t = timer - 240;
        let alpha = 1;
        if(t < 60) alpha = t / 60;
        if(t > 180) alpha = (240 - t) / 60;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "为了不让更多的人\n丧生在恐怖的雅各布井，\n当地政府最终彻底封闭了雅各布井。", canvas.width/2, canvas.height/2, 30);
    }
    // 阶段 3: 8-12s (480-720帧) - 画面
    else if(timer < 720) {
        let t = timer - 480;
        let alpha = 1;
        if(t < 60) alpha = t / 60;
        if(t > 180) alpha = (240 - t) / 60;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // 绘制示意图
        // 两个潜水员轮廓
        drawDiverSilhouette(canvas.width/2 - 60, canvas.height/2, '#555'); // 小熊
        drawDiverSilhouette(canvas.width/2 + 60, canvas.height/2 + 20, '#555', true); // 小潘 (倒下)
        
        // 名字
        ctx.fillStyle = '#f00';
        ctx.font = '16px Arial';
        ctx.fillText("(小熊)", canvas.width/2 - 60, canvas.height/2 - 50);
        ctx.fillText("(小潘)", canvas.width/2 + 60, canvas.height/2 - 40);
        
        // 散落气瓶
        ctx.fillStyle = '#333';
        ctx.fillRect(canvas.width/2 + 80, canvas.height/2 + 30, 20, 10);
        
        ctx.restore();
    }
    // 阶段 4: 12-16s (720-960帧)
    else if(timer < 960) {
        let t = timer - 720;
        let alpha = 1;
        if(t < 60) alpha = t / 60;
        if(t > 180) alpha = (240 - t) / 60;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = '24px Arial';
        ctx.fillText("感谢您的体验", canvas.width/2, canvas.height/2);
    }
    // 阶段 5: 16-20s (960-1200帧) - 新增内容
    else if(timer < 1200) {
        let t = timer - 960;
        let alpha = 1;
        if(t < 60) alpha = t / 60;
        if(t > 180) alpha = (240 - t) / 60;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "当前版本持续优化中\n前往未知的深渊\n与带熊子潘子回家的故事\n未来有时间会完善。", canvas.width/2, canvas.height/2, 30);
    }
    // 阶段 6: 20s+ (1200+) - 制作人员
    else {
        let t = timer - 1200;
        let alpha = Math.min(1, t / 60);
        
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = '20px Arial';
        ctx.fillText("制作人员", canvas.width/2, canvas.height/2 - 40);
        ctx.font = '16px Arial';
        ctx.fillText("小熊和他的小伙伴们", canvas.width/2, canvas.height/2);
        // ctx.fillText("特别鸣谢：亮子", canvas.width/2, canvas.height/2 + 30);
        
        // 点击重启提示
        if(t > 120) {
             ctx.fillStyle = `rgba(255, 255, 255, ${Math.abs(Math.sin(t/30))})`;
             ctx.font = '14px Arial';
             ctx.fillText("点击屏幕重新开始", canvas.width/2, canvas.height - 50);
        }
    }
}

function wrapText(ctx, text, x, y, lineHeight) {
    let lines = text.split('\n');
    let startY = y - (lines.length - 1) * lineHeight / 2;
    for(let i=0; i<lines.length; i++) {
        ctx.fillText(lines[i], x, startY + i * lineHeight);
    }
}

function drawDiverSilhouette(x, y, color, isDead = false) {
    ctx.save();
    ctx.translate(x, y);
    if(isDead) ctx.rotate(Math.PI/2);
    
    ctx.fillStyle = color;
    // 简易轮廓
    ctx.beginPath(); ctx.arc(0, -20, 10, 0, Math.PI*2); ctx.fill(); // 头
    ctx.fillRect(-10, -10, 20, 30); // 身
    ctx.fillRect(-12, -10, 4, 20); // 左臂
    ctx.fillRect(8, -10, 4, 20); // 右臂
    ctx.fillRect(-8, 20, 6, 20); // 左腿
    ctx.fillRect(2, 20, 6, 20); // 右腿
    
    ctx.restore();
}

function drawControls() {
    if(state.screen !== 'play') return;

    // 摇杆绘制
    if(touches.joystickId !== null) {
        // 摇杆底座
        ctx.beginPath();
        ctx.arc(touches.start.x, touches.start.y, 40, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 摇杆头
        ctx.beginPath();
        ctx.arc(touches.curr.x, touches.curr.y, 20, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fill();

        // 方向指示线
        ctx.beginPath();
        ctx.moveTo(touches.start.x, touches.start.y);
        ctx.lineTo(touches.curr.x, touches.curr.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        // 屏幕下方提示
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.textAlign = 'center';
        ctx.font = '14px Arial';
        ctx.fillText('按住屏幕任意位置移动', canvas.width / 2, canvas.height - 50);
    }
}


// ============================================================
// 绳索渲染系统
// ============================================================

// 生成松弛绳子的视觉点，模拟水中自然飘荡
// basePath: 基础路径点 slackFactor: 1=完全松弛 0=拉直 animTime: 动画时间
function generateSlackRopePoints(basePath, slackFactor, animTime) {
    if(!basePath || basePath.length < 2) return basePath || [];
    const totalLen = pathLength(basePath);
    if(totalLen < 1) return basePath;

    const segLen = CONFIG.ropeSegmentLength;
    const steps = Math.max(2, Math.ceil(totalLen / segLen));
    const dt = totalLen / steps;
    const time = animTime || 0;

    const points = [];
    for(let i = 0; i <= steps; i++) {
        const t = i * dt;
        const fraction = totalLen > 0 ? t / totalLen : 0; // 0-1
        const pos = samplePolyline(basePath, t);
        const norm = polylineNormal(basePath, t);

        // 悬链线下垂：中间最松，两端固定
        const sagEnvelope = Math.sin(fraction * Math.PI); // 两端为0，中间为1
        const sag = sagEnvelope * CONFIG.ropeSlackAmplitude * slackFactor;

        // 水中重力下坠
        const gravity = sagEnvelope * CONFIG.ropeSlackGravity * slackFactor;

        // 水中波浪动画（垂直于路径方向）
        const wave = Math.sin(fraction * Math.PI * 2 * CONFIG.ropeWaveFrequency + time * CONFIG.ropeWaveSpeed)
                     * CONFIG.ropeWaveAmplitude * slackFactor * sagEnvelope;

        // 水流缓慢漂动
        const drift = Math.sin(fraction * Math.PI * 1.3 + time * CONFIG.ropeDriftSpeed + 0.5)
                      * CONFIG.ropeDriftAmplitude * slackFactor * sagEnvelope;

        points.push({
            x: pos.x + norm.x * (sag + wave + drift),
            y: pos.y + norm.y * (sag + wave + drift) + gravity
        });
    }
    return points;
}

// 通过贝塞尔曲线平滑绘制绳子线条
function strokeRopeLine(points, color, width) {
    if(!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if(points.length === 2) {
        ctx.lineTo(points[1].x, points[1].y);
    } else {
        // 使用二次贝塞尔曲线中点平滑连接
        for(let i = 1; i < points.length - 1; i++) {
            let midX = (points[i].x + points[i+1].x) / 2;
            let midY = (points[i].y + points[i+1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        // 最后一段
        let last = points[points.length - 1];
        ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
    ctx.restore();
}

// 在岩石锚点处绘制钉子
function drawNail(x, y, wallX, wallY) {
    ctx.save();
    // 钉子方向：从岩石中心到锚点
    let angle = Math.atan2(y - wallY, x - wallX);
    ctx.translate(x, y);
    ctx.rotate(angle);

    // 钉子杆
    ctx.fillStyle = CONFIG.ropeNailColor;
    ctx.fillRect(-2, -1.5, CONFIG.ropeNailRadius * 2, 3);
    // 钉子头
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.ropeNailRadius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#aaa';
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}

// 在锚点处绘制绳结
function drawKnot(x, y) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, CONFIG.ropeKnotRadius, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.ropeKnotColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 170, 120, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 绳结纹理细节
    ctx.strokeStyle = 'rgba(150, 140, 100, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 1);
    ctx.lineTo(x + 2, y + 1);
    ctx.moveTo(x - 2, y + 1);
    ctx.lineTo(x + 2, y - 1);
    ctx.stroke();
    ctx.restore();
}

// 铺线模式下在玩家身上绘制线轮指示器
function drawReelIndicator(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    // 在潜水员背后画一个小圆表示线轮
    let reelX = -Math.cos(angle) * 12;
    let reelY = -Math.sin(angle) * 12;
    ctx.beginPath();
    ctx.arc(reelX, reelY, CONFIG.ropeReelRadius, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.ropeReelColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 150, 110, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 线轴旋转纹理线条
    let t = Date.now() / 500;
    ctx.strokeStyle = 'rgba(230, 220, 170, 0.5)';
    ctx.lineWidth = 0.8;
    for(let i = 0; i < 3; i++) {
        let a = t + i * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.moveTo(reelX, reelY);
        ctx.lineTo(reelX + Math.cos(a) * CONFIG.ropeReelRadius * 0.8,
                   reelY + Math.sin(a) * CONFIG.ropeReelRadius * 0.8);
        ctx.stroke();
    }
    ctx.restore();
}

// 在世界坐标系中绘制所有绳索
function drawRopesWorld() {
    if(!state.rope) return;
    const time = Date.now() / 1000;

    // 绘制已完成（拉紧）的绳索
    for(let rope of state.rope.ropes) {
        if(!rope.path || rope.path.length < 2) continue;

        // 拉紧的绳索：slackFactor=0，沿避障路径直线
        let visualPts = generateSlackRopePoints(rope.path, rope.slackFactor || 0, time);
        strokeRopeLine(visualPts, CONFIG.ropeTightColor, CONFIG.ropeTightWidth);

        // 起点绘制钉子+绳结
        if(rope.start && rope.startWall) {
            drawNail(rope.start.x, rope.start.y, rope.startWall.x, rope.startWall.y);
            drawKnot(rope.start.x, rope.start.y);
        }
        // 终点绘制钉子+绳结
        if(rope.end && rope.endWall) {
            drawNail(rope.end.x, rope.end.y, rope.endWall.x, rope.endWall.y);
            drawKnot(rope.end.x, rope.end.y);
        }
    }

    // 绘制当前正在铺设的绳索
    if(state.rope.active && state.rope.current && state.rope.current.start) {
        let cur = state.rope.current;
        let basePath = cur.path;
        if(!basePath || basePath.length < 2) return;

        let sf = cur.slackFactor !== undefined ? cur.slackFactor : 1;
        let animTime = cur.time || time;

        let visualPts = generateSlackRopePoints(basePath, sf, animTime);
        strokeRopeLine(visualPts, CONFIG.ropeColor, CONFIG.ropeWidth);

        // 起点锚点绘制钉子+绳结
        if(cur.start && cur.startWall) {
            drawNail(cur.start.x, cur.start.y, cur.startWall.x, cur.startWall.y);
            drawKnot(cur.start.x, cur.start.y);
        }
    }

    // 铺线中在玩家身上绘制线轮
    if(state.rope.active && player.y > 0) {
        drawReelIndicator(player.x, player.y, player.angle);
    }
}

// 铺线操作按钮（屏幕坐标系UI）
function drawRopeButton() {
    if(state.screen !== 'play') return;
    if(!state.rope || !state.rope.ui || !state.rope.ui.visible) return;

    const btnX = CONFIG.screenWidth * CONFIG.ropeButtonXRatio;
    const btnY = CONFIG.screenHeight * CONFIG.ropeButtonYRatio;
    const radius = CONFIG.ropeButtonRadius;
    const progress = state.rope.ui.progress || 0;
    const isEnd = state.rope.ui.type === 'end';
    const time = Date.now() / 1000;

    ctx.save();

    // 空闲时脉冲光效（吸引注意力）
    if(progress === 0) {
        let glowAlpha = 0.15 + Math.sin(time * 3) * 0.1;
        ctx.beginPath();
        ctx.arc(btnX, btnY, radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(230, 220, 170, ${glowAlpha})`;
        ctx.fill();
    }

    // 按钮背景
    ctx.beginPath();
    ctx.arc(btnX, btnY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 30, 40, 0.85)';
    ctx.fill();

    // 边框环
    ctx.strokeStyle = isEnd ? 'rgba(255, 180, 80, 0.7)' : 'rgba(200, 220, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 进度弧（从顶部顺时针绘制）
    if(progress > 0) {
        ctx.strokeStyle = isEnd ? 'rgba(255, 200, 100, 0.95)' : 'rgba(230, 220, 170, 0.95)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(btnX, btnY, radius - 5, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.stroke();
    }

    // 图标：开始用线轴图标，结束用绳结图标
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    if(isEnd) {
        // 绳结图标
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(btnX, btnY - 3, 5, 0, Math.PI * 2);
        ctx.stroke();
        // 向下的短线
        ctx.beginPath();
        ctx.moveTo(btnX, btnY + 2);
        ctx.lineTo(btnX, btnY + 10);
        ctx.stroke();
    } else {
        // 线轴图标
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(btnX, btnY, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(btnX, btnY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // 按钮下方标签文字
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(isEnd ? '结束布线' : '开始布线', btnX, btnY + radius + 6);

    ctx.restore();
}

