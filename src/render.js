import { CONFIG } from './config.js';
import { state, player, target, particles, touches } from './state.js';

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
    ctx.fillStyle = '#222';
    // ctx.strokeStyle = '#333'; // 去除描边
    // ctx.lineWidth = 2;

    for(let w of state.walls) {
        // 简单的视口剔除
        if(w.x > viewL && w.x < viewR && w.y > viewT && w.y < viewB) {
            ctx.beginPath();
            // 稍微变形一点，不那么圆
            // 为了性能，还是画圆，但是通过重叠和无描边来减少球感
            // 也可以画两个略微偏移的圆来模拟不规则
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
            ctx.fillStyle = `rgba(120, 100, 80, ${p.alpha})`;
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

    // 绘制NPC
    if(state.npc && state.npc.active) {
        // 绘制NPC手电筒光束 (体积光)
        // 只有在深处才开灯
        if(state.npc.y > 600) {
            drawVolumetricLight(ctx, state.npc.x, state.npc.y, state.npc.angle);
        }

        // 使用 drawDiver 绘制 NPC
        const npcColors = {
            suit: '#333',
            body: '#d44', // 红色潜水服
            tank: '#bef',
            mask: '#fa0'
        };
        // NPC 简单使用时间作为动画驱动
        drawDiver(ctx, state.npc.x, state.npc.y, state.npc.angle, npcColors, Date.now()/150);
    }

    // 绘制玩家手电筒光束 (体积光)
    drawVolumetricLight(ctx, player.x, player.y, player.angle);

    // 绘制玩家
    drawDiver(ctx, player.x, player.y, player.angle, null, player.animTime);

    ctx.restore();

    // 2. 光照遮罩计算
    lightCtx.clearRect(0, 0, canvas.width, canvas.height); // 清除上一帧的遮罩，防止半透明叠加变黑
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.shadowBlur = 0; 
    
    // 深度因子：0(水面) -> 1(深渊)
    let depthFactor = Math.min(1, Math.max(0, player.y / (CONFIG.rows*CONFIG.tileSize)));
    
    // 基础环境光：随深度变暗
    let baseAmbient = Math.max(0.05, 0.9 * (1 - depthFactor * 0.9));
    
    // 水面额外光照：浅水区(y<500)非常亮，甚至过曝
    let surfaceLight = 0;
    if(player.y < 500) {
        // 线性插值：0m -> 1.0 (全亮), 500m -> 0
        surfaceLight = (500 - player.y) / 500 * 1.2; 
    }
    
    let currentAmbient = Math.min(1.0, baseAmbient + surfaceLight);
    
    // 遮罩颜色
    let maskAlpha = Math.max(0, 1 - currentAmbient);
    // 浅水区遮罩几乎透明，深水区黑
    
    lightCtx.fillStyle = `rgba(0, 0, 0, ${maskAlpha})`;
    // 如果在深水区，加一点蓝绿色调
    if(depthFactor > 0.2) {
        let blueTint = Math.max(0, (1 - depthFactor) * 30);
        lightCtx.fillStyle = `rgba(0, ${blueTint/2}, ${blueTint}, ${maskAlpha})`;
    }
    
    lightCtx.fillRect(0, 0, canvas.width, canvas.height);

    let siltVis = Math.max(0.1, 1 - (player.silt / 80)); 
    let rayDist = CONFIG.lightRange * siltVis;

    // 濒死视野效果：视野急剧缩小
    if(state.story.stage === 4 && state.story.flags.narrowVision) {
        // 基于氧气值的动态视野
        // O2: 80 -> 0
        // RayDist: 100 -> 20
        let factor = Math.max(0, player.o2 / 80);
        rayDist = 20 + factor * 80; 
        
        // 遮罩透明度
        let alpha = 0.95 + (1-factor) * 0.05; // 0.95 -> 1.0
        lightCtx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        lightCtx.fillRect(0, 0, canvas.width, canvas.height);
    } else if(state.story.flags.narrowVision) {
        rayDist = 30; // 只能看到极小范围
        lightCtx.fillStyle = 'rgba(0, 0, 0, 0.95)'; // 几乎全黑
        lightCtx.fillRect(0, 0, canvas.width, canvas.height);
    }

    let poly = getLightPolygon(player.x, player.y, player.angle, rayDist);

    lightCtx.save();
    lightCtx.translate(canvas.width/2 + shakeX, canvas.height/2 + shakeY);
    lightCtx.scale(zoom, zoom);
    lightCtx.translate(-player.x, -player.y);
    
    lightCtx.globalCompositeOperation = 'destination-out';
    
    // 玩家光照 (双光锥效果)
    drawFlashlight(lightCtx, player.x, player.y, player.angle, rayDist);

    // NPC光照 (如果NPC激活且在深处)
    if(state.npc && state.npc.active && state.npc.y > 600) {
        let npcRayDist = CONFIG.lightRange * 0.8; 
        drawFlashlight(lightCtx, state.npc.x, state.npc.y, state.npc.angle, npcRayDist);
        
        // NPC自身发光
        lightCtx.globalCompositeOperation = 'source-over'; // 确保发光叠加正确
        lightCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        lightCtx.beginPath();
        lightCtx.arc(state.npc.x, state.npc.y, 40, 0, Math.PI*2);
        lightCtx.fill();
        lightCtx.globalCompositeOperation = 'destination-out'; // 恢复遮罩擦除模式
    }

    let selfGlow = lightCtx.createRadialGradient(
        player.x, player.y, 0,
        player.x, player.y, 60 * siltVis
    );
    selfGlow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    selfGlow.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
    selfGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    lightCtx.fillStyle = selfGlow;
    lightCtx.beginPath();
    lightCtx.arc(player.x, player.y, 60 * siltVis, 0, Math.PI*2);
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

    // 红色遮罩 (濒死) - 渐变色
    if(state.story.redOverlay > 0) {
        // 透明度越高，颜色越暗红
        // 0.0 -> 鲜红 (255, 0, 0)
        // 1.0 -> 暗红 (61, 3, 3)
        let t = state.story.redOverlay;
        let r = Math.floor(255 * (1-t) + 61 * t);
        let g = Math.floor(0 * (1-t) + 3 * t);
        let b = Math.floor(0 * (1-t) + 3 * t);
        
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${state.story.redOverlay})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // 隧道深处模糊遮罩 (仅在第一次下潜且接近隧道时显示)
    if(state.story.stage === 1 && state.landmarks.tunnelEntry) {
        let entryY = state.landmarks.tunnelEntry.y;
        let screenEntryY = (entryY - player.y) * zoom + canvas.height/2 + shakeY;
        
        // 只要在屏幕范围内或上方
        if(screenEntryY < canvas.height + 500) {
            // 创建一个渐变遮罩，从入口处开始变黑
            // 调整渐变起点，使其更平滑
            let gradientStart = Math.max(-500, screenEntryY + 50); 
            
            let grad = ctx.createLinearGradient(0, gradientStart, 0, gradientStart + 400);
            grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.9)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
            
            ctx.fillStyle = grad;
            ctx.fillRect(0, gradientStart, canvas.width, canvas.height - gradientStart + 500);
        }
    }

    // 3. 绘制 UI
    drawUI();
    drawControls();
}

// 统一的手电筒绘制函数
function drawFlashlight(ctx, x, y, angle, rayDist) {
    ctx.shadowBlur = 30;
    ctx.shadowColor = "rgba(255, 255, 255, 1)";
    
    // 1. 主光束 (窄而远)
    let mainRayDist = rayDist;
    let mainPoly = getLightPolygon(x, y, angle, mainRayDist, CONFIG.fov); 
    
    let mainGradient = ctx.createRadialGradient(x, y, 0, x, y, mainRayDist);
    mainGradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');    
    mainGradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.9)');  
    mainGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      
    
    ctx.fillStyle = mainGradient;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for(let p of mainPoly) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();

    // 2. 泛光 (宽而近)
    let wideRayDist = rayDist * 0.6;
    let widePoly = getLightPolygon(x, y, angle, wideRayDist, 120); // 120度宽角
    
    let wideGradient = ctx.createRadialGradient(x, y, 0, x, y, wideRayDist);
    wideGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');    
    wideGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      
    
    ctx.fillStyle = wideGradient;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for(let p of widePoly) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
}

// 统一的潜水员绘制函数
function drawDiver(ctx, x, y, angle, colors = null, animTime = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // 默认颜色 (玩家)
    const defaultColors = {
        suit: '#333',
        body: '#dd0',
        tank: '#bef',
        mask: '#fa0'
    };
    const c = colors || defaultColors;

    // 脚蹼动画 (模拟上下/前后摆动)
    // 使用传入的 animTime，如果没有则回退到 Date.now()
    let time = animTime || Date.now() / 150;
    
    // 左脚蹼
    ctx.save();
    ctx.translate(-15, -4);
    // 模拟打水：缩放 X 轴 (投影长度变化) + 轻微位移
    // 始终摆动，只是幅度不同（由 animTime 的增长速度控制）
    let leftPhase = Math.sin(time);
    let leftScale = 0.7 + leftPhase * 0.3; 
    ctx.scale(leftScale, 1);
    
    ctx.fillStyle = c.suit;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(-12, -4); // 蹼尖
    ctx.lineTo(-12, 4);
    ctx.lineTo(0, 2);
    ctx.fill();
    ctx.restore();

    // 右脚蹼 (相位差 PI)
    ctx.save();
    ctx.translate(-15, 4);
    let rightPhase = Math.sin(time + Math.PI);
    let rightScale = 0.7 + rightPhase * 0.3;
    ctx.scale(rightScale, 1);
    
    ctx.fillStyle = c.suit;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(-12, -4); // 蹼尖
    ctx.lineTo(-12, 4);
    ctx.lineTo(0, 2);
    ctx.fill();
    ctx.restore();

    // 身体
    ctx.fillStyle = c.body;
    ctx.fillRect(-8, -4, 14, 8);

    // 气瓶
    ctx.fillStyle = c.tank;
    ctx.beginPath(); ctx.fillRect(6, -3, 3, 6);

    // 头盔
    ctx.fillStyle = '#222'; 
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill(); 
    
    // 面罩
    ctx.fillStyle = c.mask; 
    ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI*2); ctx.fill();

    ctx.restore();
}

// 绘制体积光 (可见光束)
function drawVolumetricLight(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    // 模拟丁达尔效应
    let grad = ctx.createLinearGradient(0, 0, 250, 0);
    grad.addColorStop(0, 'rgba(200, 255, 255, 0.15)'); 
    grad.addColorStop(1, 'rgba(200, 255, 255, 0)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(250, 50); // 稍微宽一点
    ctx.lineTo(250, -50);
    ctx.fill();
    ctx.restore();
}

function getLightPolygon(sx, sy, angle, maxDist, fovDeg = CONFIG.fov) {
    let points = [];
    let fovRad = fovDeg * Math.PI / 180;
    let startAngle = angle - fovRad/2;
    let rays = CONFIG.rayCount;
    let step = fovRad / rays;
    const { tileSize } = CONFIG;

    for(let i=0; i<=rays; i++) {
        let a = startAngle + i * step;
        let dx = Math.cos(a);
        let dy = Math.sin(a);
        
        let dist = maxDist;
        let stepLen = 5; 
        
        // 射线步进检测
        for(let d=0; d<maxDist; d+=stepLen) {
            let tx = sx + dx * d;
            let ty = sy + dy * d;
            let r = Math.floor(ty/tileSize);
            let c = Math.floor(tx/tileSize);
            
            // 粗略检测：网格有东西
            if(state.map[r] && state.map[r][c]) {
                // 精确检测：射线与圆相交
                let wall = state.map[r][c];
                // 简单的点在圆内检测 (比射线-圆相交方程快，但精度稍低，对于光照足够)
                // 如果当前步进点进入了墙壁半径内
                let distToWallCenter = Math.hypot(tx - wall.x, ty - wall.y);
                if(distToWallCenter < wall.r) {
                    // 稍微回退一点，避免光线穿入墙壁太深
                    dist = d - stepLen/2;
                    break;
                }
            }
        }
        points.push({x: sx + dx * dist, y: sy + dy * dist});
    }
    return points;
}

function isLineOfSight(x1, y1, x2, y2, maxDist) {
    let dist = Math.hypot(x2-x1, y2-y1);
    if(dist > maxDist) return false;
    let steps = dist / 20;
    const { tileSize } = CONFIG;
    for(let i=0; i<steps; i++) {
        let t = i/steps;
        let cx = x1 + (x2-x1)*t;
        let cy = y1 + (y2-y1)*t;
        let r = Math.floor(cy/tileSize);
        let c = Math.floor(cx/tileSize);
        
        if(state.map[r] && state.map[r][c]) {
             let wall = state.map[r][c];
             if(Math.hypot(cx - wall.x, cy - wall.y) < wall.r) return false;
        }
    }
    return true;
}

function drawUI() {
    // 仪表盘背景 (加高以容纳小地图)
    ctx.fillStyle = 'rgba(0, 10, 15, 0.8)';
    ctx.fillRect(10, 10, 160, 260); // 高度增加到 260
    ctx.strokeStyle = '#445';
    ctx.strokeRect(10, 10, 160, 260);

    ctx.fillStyle = '#0ff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('深度: ' + Math.floor(player.y / CONFIG.tileSize) + 'm', 20, 30);

    // 氧气条
    ctx.fillStyle = '#8cf';
    ctx.font = '12px Arial';
    ctx.fillText('O2', 20, 50);
    ctx.fillStyle = '#222';
    ctx.fillRect(50, 40, 100, 10);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(50, 40, Math.max(0, player.o2), 10);

    // 氮气条
    ctx.fillStyle = '#8cf';
    ctx.fillText('N2', 20, 70);
    ctx.fillStyle = '#222';
    ctx.fillRect(50, 60, 100, 10);
    ctx.fillStyle = '#f00';
    ctx.fillRect(50, 60, Math.min(100, player.n2), 10);

    // 小地图 (移到左上角，仪表盘下方)
    if(state.explored && state.explored.length > 0) {
        let mapSize = 140; // 稍微大一点
        let mapX = 20;
        let mapY = 80; // 紧接在氮气条下方 (原为100)
        
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
    if(state.screen !== 'play') {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = state.screen === 'win' ? '#0f0' : '#f00';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(state.screen === 'win' ? '任务完成!' : '任务失败', canvas.width/2, canvas.height/2 - 20);
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.fillText(state.alertMsg, canvas.width/2, canvas.height/2 + 20);
        ctx.fillText('点击屏幕重新开始', canvas.width/2, canvas.height/2 + 60);
    }
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
