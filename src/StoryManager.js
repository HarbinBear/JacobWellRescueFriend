import { state, player, particles, input } from './state.js';
import { CONFIG } from './config.js';

// 粒子类定义 (需要在这里重新定义或者从 logic.js 导出，为了解耦，建议从 logic.js 导出 Particle 类，或者在这里简单实现气泡生成)
// 由于 logic.js 依赖 state.js，这里如果再依赖 logic.js 可能会循环引用。
// 最好是将 Particle 类移到单独的文件，或者在 logic.js 中把 addParticle 暴露出来。
// 暂时我们在 logic.js 中把 triggerSilt 导出使用了，对于气泡，我们可以在 logic.js 中增加一个 addBubble 函数，或者直接操作 particles 数组。
// 为了简单，我们直接操作 particles 数组，但需要 Particle 类。
// 让我们在 logic.js 中导出 Particle 类。
// 等等，logic.js 还没修改导出 Particle。
// 我们可以先写 StoryManager，假设 logic.js 会导出 addParticle。

export class StoryManager {
    constructor() {
        this.timer = 0;
        this.subTimer = 0;
        this.bubbleTimer = 0;
    }

    update() {
        const { suit, tunnelEntry, tunnelEnd } = state.landmarks;
        state.story.timer++;
        
        // 屏幕晃动衰减
        if(state.story.shake > 0) state.story.shake *= 0.9;
        if(state.story.shake < 0.5) state.story.shake = 0;

        // 阶段1: 第一次下潜
        if(state.story.stage === 1) {
            this.updateStage1(suit, tunnelEntry, tunnelEnd);
        }
        
        // 阶段2: 黑屏过渡
        else if(state.story.stage === 2) {
            this.updateStage2();
        }
        
        // 阶段3: 第二次下潜
        else if(state.story.stage === 3) {
            this.updateStage3(tunnelEntry, tunnelEnd);
        }
        
        // 阶段4: 濒死体验
        else if(state.story.stage === 4) {
            this.updateStage4();
        }

        // 阶段5: 获救
        else if(state.story.stage === 5) {
            this.updateStage5();
        }

        // 阶段6: 上浮结束
        else if(state.story.stage === 6) {
            // 模拟减压停留提示
            if(player.y < 400 && player.y > 200 && state.story.timer % 300 === 0) {
                 this.showText("提示：正在进行减压停留...\n保持深度。", "#0f0", 2000);
            }
            
            if(player.y < 60) {
                this.endGame(true, "ending");
            }
        }
    }

    updateStage1(suit, tunnelEntry, tunnelEnd) {
        // 开场闲聊与教学
        // if(state.story.timer === 120) this.showText("小熊：这里的水质很清澈，\n但要动作要慢，\n泥沙会阻挡视线。", "#00bfff", 4000);
        // if(state.story.timer === 360) this.showText("小熊：保持呼吸平稳，\n不要急促换气。", "#00bfff", 3000);

        // 事件1: 发现潜水服
        if(!state.story.flags.seenSuit) {
            let d = Math.hypot(player.x - suit.x, player.y - suit.y);
            if(d < 200) {
                state.story.flags.seenSuit = true;
                this.showText("内心：好像是废弃很久的潜水服，为什么会在这里？", "#ffd700", 4000); // 金色
                console.log("[Story] Found suit");
            }
        }
        
        // 事件2: 到达狭窄通道
        if(!state.story.flags.npcEntered) {
            let d = Math.hypot(player.x - tunnelEntry.x, player.y - tunnelEntry.y);
            if(d < 100) {
                state.story.flags.npcEntered = true;
                state.npc.state = 'enter_tunnel';
                state.npc.pathIndex = 0; // 重置路径索引
                this.showText("内心：太危险了！别进去！", "#ff4444", 3000); // 亮红
                state.story.timer = 0; 
                console.log("[Story] NPC entering tunnel");
            }
        }
        
        // 事件3: NPC进入并坍塌
        if(state.story.flags.npcEntered && !state.story.flags.collapsed) {
            // 计算 NPC 距离入口的距离，而不是距离终点
            let distFromEntry = Math.hypot(state.npc.x - tunnelEntry.x, state.npc.y - tunnelEntry.y);
            
            // 增加独白，表现紧张
            if(state.story.timer === 180) this.showText("内心：怎么不听劝...", "#ffd700", 3000);
            if(state.story.timer === 360) this.showText("内心：里面太窄了，你会卡住的...", "#ffd700", 3000);
            if(state.story.timer === 540) this.showText("内心：喂！听得到吗？快回来！", "#ff4444", 3000);

            // NPC 深入隧道后触发坍塌 (距离入口超过 400 像素，且时间足够)
            if(distFromEntry > 400 && state.story.timer > 300) {
                state.story.flags.collapsed = true;
                state.npc.active = false; 
                state.story.timer = 0; 
                
                console.log("[Story] Collapse triggered");

                // 坍塌特效 (在入口处)
                if(GameGlobal.triggerSilt) GameGlobal.triggerSilt(tunnelEntry.x, tunnelEntry.y, 50);
                state.story.shake = 5; // 轻微晃动
                
                // 封锁入口 (更深入一点)
                // 移除实体墙生成，防止封死玩家
                // 仅保留视觉上的坍塌感（如粒子、震动）
                // 如果需要阻挡，可以使用空气墙，但这里为了安全起见，暂时不生成任何阻挡物
                // 让玩家自己决定是否进去（虽然进去也没路了）
                
                /* 
                let r = Math.floor(tunnelEntry.y / CONFIG.tileSize) + 2;
                let c = Math.floor(tunnelEntry.x / CONFIG.tileSize);
                
                let newWall = {
                    x: c * CONFIG.tileSize + CONFIG.tileSize/2,
                    y: r * CONFIG.tileSize + CONFIG.tileSize/2,
                    r: CONFIG.tileSize * 0.8 
                };
                state.walls.push(newWall);
                if(state.map[r]) state.map[r][c] = newWall;
                */
            }
        }

        // 坍塌后的反应 (气泡演出)
        if(state.story.flags.collapsed) {
            // 气泡生成逻辑：一阵一阵
            this.bubbleTimer++;
            let bubblePhase = Math.sin(this.bubbleTimer * 0.05); // 周期性
            
            if(state.story.timer < 600) { // 持续10秒的气泡挣扎
                if(bubblePhase > 0.5 && Math.random() < 0.3) {
                    // 冒气泡 (从黑暗中冒出来，而不是最深处)
                    // 生成在入口下方 200-300 像素处，看起来像是从深处飘上来的
                    let bubbleX = tunnelEntry.x + (Math.random()-0.5)*20;
                    let bubbleY = tunnelEntry.y + 300 + (Math.random()-0.5)*50;
                    
                    if(GameGlobal.addBubble) GameGlobal.addBubble(bubbleX, bubbleY);
                    
                    // 挣扎时的轻微晃动
                    if(Math.random() < 0.1) state.story.shake = 2;
                }
            }

            if(state.story.timer === 60) this.showText("内心：那是...气泡？", "#ffd700", 3000);
            if(state.story.timer === 240) this.showText("内心：他的呼吸乱了！", "#ff4444", 3000);
            if(state.story.timer === 420) this.showText("坚持住！我来救你！", "#ff4444", 3000);
            if(state.story.timer === 600) this.showText("内心：...", "#fff", 4000);
            if(state.story.timer === 780) this.showText("内心：...没动静了？", "#fff", 4000);
            
            if(state.story.timer === 800) {
                this.showText("立刻回到岸上呼叫救援！", "#ff4444", 4000);
            }
            if(state.story.timer === 1100) {
                state.story.stage = 2;
                state.story.timer = 0;
                state.story.flags.blackScreen = true;
            }
        }
    }

    updateStage2() {
        if(state.story.timer === 60) this.showText("上岸后...", "#fff", 3000);
        if(state.story.timer === 240) {
            // 重置开始第二次下潜
            state.story.stage = 3;
            state.story.flags.blackScreen = false;
            
            player.x = CONFIG.tileSize * (CONFIG.cols / 2);
            player.y = 80;
            player.o2 = 100;
            player.n2 = 0;
            
            // 重置NPC为救援队友
            state.npc.active = true;
            state.npc.x = player.x - 30;
            state.npc.y = player.y;
            state.npc.state = 'follow';
            
            this.showText("找来同伴潘子，立刻一起下潜救熊子！", "rgba(13, 93, 8, 1)", 4000);
            console.log("[Story] Stage 3 started");
        }
    }

    updateStage3(tunnelEntry, tunnelEnd) {
        // 下潜过程中的心理活动
        if(state.story.timer === 120) this.showText("内心：一定要找到他...", "#ffd700", 2000);
        if(state.story.timer === 300) this.showText("内心：这里太安静了...", "#ffd700", 2000);

        let d = Math.hypot(player.x - tunnelEntry.x, player.y - tunnelEntry.y);
        if(d < 80 && !state.story.flags.approachedTunnel) {
            state.story.flags.approachedTunnel = true;
            state.npc.state = 'wait'; 
            this.showText("内心：我一定要把他救上来", "#ffd700", 3000); // 金色
        }
        
        // 玩家进入坍塌处 (放宽判定范围 60 -> 100)
        if(d < 100 && state.story.flags.collapsed) {
             // 移除之前生成的墙壁 (实体墙)
             let r = Math.floor(tunnelEntry.y / CONFIG.tileSize) + 2;
             let c = Math.floor(tunnelEntry.x / CONFIG.tileSize);
             if(state.map[r] && typeof state.map[r][c] === 'object') {
                 let wall = state.map[r][c];
                 let idx = state.walls.indexOf(wall);
                 if(idx > -1) state.walls.splice(idx, 1);
                 state.map[r][c] = 0; 
                 if(GameGlobal.triggerSilt) GameGlobal.triggerSilt(wall.x, wall.y, 10);
                 console.log("[Story] Tunnel cleared");
             }
             
             // 移除透明墙 (如果有)
             if(state.invisibleWalls.length > 0) {
                 state.invisibleWalls = [];
                 console.log("[Story] Invisible walls removed");
             }
        }
        
        let dEnd = Math.hypot(player.x - tunnelEnd.x, player.y - tunnelEnd.y);
        // 判定点改为深度判定：只要深入隧道一定距离就触发卡住
        // 隧道入口 y 坐标 + 300 像素 (约7-8格)
        if(player.y > tunnelEntry.y + 300) { 
            state.story.stage = 4;
            state.story.timer = 0;
            input.move = 0; 
            this.showText("糟了！被卡住了！", "#f00", 3000);
            
            // 立即隐藏 NPC，制造孤立无援感
            state.npc.active = false;
            state.npc.state = 'rescue'; // 状态设为救援，但暂时不显示
            
            // 立即开始视野收窄
            state.story.flags.narrowVision = true;
            
            state.story.shake = 5; // 轻微挣扎晃动
            console.log("[Story] Player stuck (Depth Trigger)");
        }
    }

    updateStage4() {
        player.o2 -= 0.15; 
        
        // 气泡生成逻辑：一阵一阵 (模拟呼吸器故障或剧烈喘息)
        this.bubbleTimer++;
        let bubblePhase = Math.sin(this.bubbleTimer * 0.1); 
        
        if(bubblePhase > 0.2 && Math.random() < 0.4) {
            // 在玩家周围生成大量气泡
            let bubbleX = player.x + (Math.random()-0.5)*30;
            let bubbleY = player.y + (Math.random()-0.5)*30;
            if(GameGlobal.addBubble) GameGlobal.addBubble(bubbleX, bubbleY);
        }

        // 挣扎晃动
        if(state.story.timer % 40 === 0) {
            state.story.shake = 8;
        }

        // 屏幕变红 (更早开始)
        if(player.o2 < 70) state.story.redOverlay = (70 - player.o2) / 70 * 1.0; // 允许完全不透明

        if(state.story.timer === 60) this.showText("我出不去了！！！", "#ff4444", 3000);
        if(state.story.timer === 180) this.showText("氧气...在泄漏...", "#ff4444", 3000);
        if(state.story.timer === 300) this.showText("谁来...救救我...", "#ff4444", 3000);
        
        // 视野收窄 (确保一直开启)
        if(!state.story.flags.narrowVision) {
            state.story.flags.narrowVision = true; 
        }

        // 增加一个完全不透明的停顿期
        if(player.o2 < 5) {
             // 确保红屏完全不透明
             state.story.redOverlay = 1.0;
             
             // 延迟一点点进入下一阶段，给玩家一个"死亡"的错觉，并利用这段时间移动NPC
             if(!state.story.flags.deathPause) {
                 state.story.flags.deathPause = 0;
             }
             state.story.flags.deathPause++;
             
             if(state.story.flags.deathPause > 60) { // 停顿约1秒
                 state.story.stage = 5;
                 state.story.timer = 0;
                 state.story.flags.deathPause = 0;
                 
                 // 惊喜时刻：NPC 瞬移出现
                 state.npc.active = true;
                 state.npc.x = player.x + 20; // 在右侧一点
                 state.npc.y = player.y + 10; // 稍微下方
                 state.npc.state = 'rescue'; 
                 
                 this.showText("有人抓住我的脚！", "#fff", 2000);
                 console.log("[Story] Rescued");
             }
        }
    }

    updateStage5() {
        if (state.story.redOverlay > 0) {
            state.story.redOverlay *= 0.95; // 红色消退
            if (state.story.redOverlay < 0.01) state.story.redOverlay = 0;
        }

        if(state.story.timer === 120) {
            this.showText("是队友！", "#00bfff", 2000); // 亮青色
            state.story.flags.narrowVision = false; 
            player.o2 = 50; 
        }
        if(state.story.timer === 240) {
            this.showText("我的氧气瓶坏了！队友把备用气嘴塞给了我！", "#f00", 4000);
            player.o2 = 100;
            
            // 触发氧气瓶损坏状态
            state.story.flags.tankDamaged = true;
            state.story.flags.rescued = true;
        }
        if(state.story.timer === 400) { // 稍微延后一点
            this.showText("靠近队友补充氧气！", "#00bfff", 3000);
            state.npc.state = 'follow'; // 这里的 follow 会被 logic.js 中的 rescued 逻辑接管
            state.story.stage = 6;
            state.story.redOverlay = 0; // 强制移除红屏
        }
    }

    showText(msg, color, duration = 3000) {
        state.alertMsg = msg;
        state.alertColor = color;
        clearTimeout(state.msgTimer);
        state.msgTimer = setTimeout(() => state.alertMsg = '', duration);
    }

    endGame(win, reason) {
        if (win) {
            state.screen = 'ending';
            state.endingTimer = 0;
        } else {
            state.screen = 'lose';
            state.alertMsg = reason;
            state.alertColor = "#f00";
        }
    }
}