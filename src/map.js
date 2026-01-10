import { CONFIG } from './config.js';
import { state, target } from './state.js';

// 线性剧情地图生成
export function generateMap() {
    state.map = [];
    state.zones = []; // 清空区域信息
    const { rows, cols, tileSize } = CONFIG;
    
    // 1. 初始化：全墙壁
    for(let r=0; r<rows; r++) {
        state.map[r] = [];
        for(let c=0; c<cols; c++) {
            state.map[r][c] = 1;
        }
    }

    // 2. 挖掘主通道 (使用路径点连接)
    // 路径点: [row, col, radius]
    let pathPoints = [];
    let centerX = Math.floor(cols/2); 
    // 增加间距，确保墙壁足够厚 (20格 * 40px = 800px > lightRange * 2)
    let rightX = centerX + 20; 
    
    // 辅助函数：添加路径点并进行边界检查
    function addPoint(r, c, w) {
        // 边界检查，保留至少 3 格墙壁
        if (c < 3) c = 3;
        if (c > cols - 4) c = cols - 4;
        pathPoints.push([r, c, w]);
        return c; // 返回修正后的 c
    }

    // --- Phase 0: 入口水面 (0-8) ---
    for(let r=0; r<8; r++) {
        addPoint(r, centerX, 6);
    }
    state.zones.push({name: 'entrance', yMin: 0, yMax: 8 * tileSize});

    // --- Phase 1: 第一洞室 (8-35) ---
    // 比较大，底部收窄
    let currentR = 8;
    let currentC = centerX;
    let phase1EndR = 35;
    
    while(currentR < phase1EndR) {
        currentR += 1.0;
        currentC += (Math.random()-0.5)*2;
        
        // 底部收窄过渡
        let width = 6 + Math.random() * 4; 
        if (currentR > 30) {
            width = 6 - (currentR - 30) * 0.8; // 逐渐变窄到 2 左右
            if (width < 2.5) width = 2.5;
            // 引导向右，为连接第二洞室做准备
            currentC += 0.5; // 加大引导力度
        }
        
        currentC = addPoint(currentR, currentC, width);
    }
    state.zones.push({name: 'chamber1', yMin: 8 * tileSize, yMax: 35 * tileSize});

    // --- Phase 2: 潜水服通道 (35-50) ---
    // 狭小，连接第一洞室和第二洞室(偏右)
    // 稍微加长一点以便平滑过渡大跨度
    let phase2EndR = 50; 
    // 记录潜水服位置
    state.landmarks.suit = {
        x: currentC * tileSize,
        y: (currentR + 5) * tileSize
    };
    
    while(currentR < phase2EndR) {
        currentR += 1.0;
        // 快速向右偏移，连接到 rightX
        let targetX = rightX;
        let diff = targetX - currentC;
        currentC += diff * 0.2; // 加快横向移动速度
        
        let width = 2.0; // 狭窄
        currentC = addPoint(currentR, currentC, width);
    }
    state.zones.push({name: 'suit_tunnel', yMin: 35 * tileSize, yMax: 50 * tileSize});

    // --- Phase 3: 第二洞室通道 (50-75) ---
    // 这是一个狭长的通道，位于右侧 (rightX)，与左侧的死路平行
    let phase3EndR = 75;
    while(currentR < phase3EndR) {
        currentR += 1.0;
        currentC += (Math.random()-0.5)*0.8; 
        
        // 强力保持在 rightX 附近
        let pull = (rightX - currentC) * 0.15;
        currentC += pull;

        // 宽度更窄
        let width = 2.0 + Math.random() * 1.2; 
        
        // 底部收窄，准备进入三岔路口
        if (currentR > 70) {
            width = 2.0; 
            // 开始向左引导，去往中心的三岔路口
            currentC -= 0.5;
        }
        
        currentC = addPoint(currentR, currentC, width);
    }
    state.zones.push({name: 'chamber2', yMin: 50 * tileSize, yMax: 75 * tileSize});

    // --- Phase 4: 三岔路口 (75) ---
    // 这里的逻辑是：
    // 下方是第三洞室 (centerX)
    // 右上方是第二洞室通道 (rightX)
    // 正上方是死路通道 (centerX)
    
    let junctionR = currentR;
    // 强制修正到中心，构建三岔口连接点
    let junctionC = centerX; 
    
    // 记录三岔路口地标
    state.landmarks.junction = {
        x: junctionC * tileSize,
        y: junctionR * tileSize
    };
    
    // 连接第二洞室通道底部到三岔路口中心
    // 刚才 Phase 3 结束时 currentC 应该在 rightX 和 centerX 之间
    // 这里补几步路确保连通
    let bridgeSteps = 12; // 更长的连接，因为横向跨度变大了
    for(let i=0; i<bridgeSteps; i++) {
        let t = (i+1)/bridgeSteps;
        let r = junctionR + i * 0.5; // 稍微向下一点点
        let c = currentC * (1-t) + junctionC * t;
        addPoint(r, c, 2.5);
    }
    junctionR += bridgeSteps * 0.5;
    currentR = junctionR;
    currentC = junctionC;

    state.zones.push({name: 'junction', yMin: (junctionR-5) * tileSize, yMax: (junctionR+5) * tileSize});

    // 分支 A: 死路通道 (正上方)
    // 位于 centerX，向上延伸，是一条狭长的死路，与右边的第二洞室通道平行
    let deadEndR = junctionR;
    let deadEndC = centerX; // 正上方
    
    // 向上挖掘
    for(let i=0; i<35; i++) { // 挖更长一点
        deadEndR -= 1.0; 
        deadEndC += (Math.random()-0.5)*0.6;
        
        // 保持在 centerX 附近
        let pull = (centerX - deadEndC) * 0.1;
        deadEndC += pull;

        // 宽度更窄，极具迷惑性
        let width = 2.2 + Math.random() * 1.0; 
        
        // 边界检查
        if (deadEndC < 3) deadEndC = 3;
        if (deadEndC > cols - 4) deadEndC = cols - 4;
        
        pathPoints.push([deadEndR, deadEndC, width]);
    }
    
    // 记录死路深处地标 (用于NPC导航)
    state.landmarks.deadEndDeep = {
        x: deadEndC * tileSize,
        y: deadEndR * tileSize
    };
    
    // 记录死路区域
    state.zones.push({
        name: 'dead_end', 
        yMin: (junctionR - 35) * tileSize, 
        yMax: junctionR * tileSize,
        xMin: (centerX - 5) * tileSize,
        xMax: (centerX + 5) * tileSize
    });

    // 分支 B: 主路 (向下) -> 第三洞室
    // --- Phase 5: 第三洞室 (75-105) ---
    // 位于 centerX
    let phase5EndR = 105;
    // currentR, currentC 已经在 junction 处准备好了
    
    while(currentR < phase5EndR) {
        currentR += 1.0;
        currentC += (Math.random()-0.5)*1.5;
        
        // 保持在 centerX 附近
        let pull = (centerX - currentC) * 0.05;
        currentC += pull;
        
        let width = 5 + Math.random() * 3;
        
        // 顶部稍微窄一点，与三岔路口连接
        if (currentR < junctionR + 5) {
            width = 3.5;
        }
        
        // 底部收窄进入剧情隧道
        if (currentR > 95) {
            width = 2.0;
        }

        currentC = addPoint(currentR, currentC, width);
    }
    state.zones.push({name: 'chamber3', yMin: junctionR * tileSize, yMax: 105 * tileSize});

    // --- Phase 6: 剧情隧道 (105-135) ---
    // 极窄，直线
    let phase6EndR = 135;
    state.landmarks.tunnelEntry = {
        x: currentC * tileSize,
        y: currentR * tileSize
    };
    state.landmarks.tunnelPath = [];
    
    let tunnelStartR = currentR;
    
    while(currentR < phase6EndR) {
        currentR += 0.8;
        // 几乎直线
        currentC += (Math.random()-0.5)*0.2;
        let width = 0.8; // 极窄
        currentC = addPoint(currentR, currentC, width);
        
        if(Math.floor(currentR) % 5 === 0) {
            state.landmarks.tunnelPath.push({
                x: currentC * tileSize,
                y: currentR * tileSize
            });
        }
    }
    
    state.landmarks.tunnelEnd = {
        x: currentC * tileSize,
        y: currentR * tileSize
    };
    state.landmarks.tunnelPath.push(state.landmarks.tunnelEnd);
    
    // 空气墙 (第一次下潜阻挡)
    state.invisibleWalls.push({
        x: currentC * tileSize,
        y: (tunnelStartR + 10) * tileSize,
        r: tileSize * 1.2
    });
    
    state.zones.push({name: 'story_tunnel', yMin: 105 * tileSize, yMax: 135 * tileSize});

    // --- Phase 7: 第四洞室 (135-150) ---
    // 大洞室占位
    let phase7EndR = 150;
    while(currentR < phase7EndR) {
        currentR += 1.0;
        currentC += (Math.random()-0.5)*2;
        let width = 8 + Math.random() * 4;
        currentC = addPoint(currentR, currentC, width);
    }
    state.zones.push({name: 'chamber4', yMin: 135 * tileSize, yMax: 150 * tileSize});


    // 挖掘逻辑
    for(let p of pathPoints) {
        let [pr, pc, radius] = p;
        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                let dist = Math.hypot(r-pr, c-pc);
                if(dist < radius) {
                    state.map[r][c] = 0;
                }
            }
        }
    }
    
    // 顶部水面清理
    for(let r=0; r<6; r++) {
        for(let c=1; c<cols-1; c++) {
            state.map[r][c] = 0;
        }
    }

    // 3. 生成墙壁渲染数据
    state.walls = [];
    for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
            if(state.map[r][c] === 1) {
                let offsetX = (Math.random() - 0.5) * tileSize * 0.6;
                let offsetY = (Math.random() - 0.5) * tileSize * 0.6;
                let radius = tileSize * (0.6 + Math.random() * 0.4);
                
                let wall = {
                    x: c * tileSize + tileSize/2 + offsetX,
                    y: r * tileSize + tileSize/2 + offsetY,
                    r: radius
                };
                
                state.walls.push(wall);
                state.map[r][c] = wall;
            }
        }
    }

    // 4. 生成浅水区生态
    state.plants = [];
    state.fishes = [];
    
    // 水草 (只在浅水区和第一洞室)
    for(let w of state.walls) {
        if(w.y < 30 * tileSize) { 
            if(Math.random() < 0.3) {
                let angle = Math.random() * Math.PI * 2;
                let dist = w.r * 0.8;
                state.plants.push({
                    x: w.x + Math.cos(angle) * dist,
                    y: w.y + Math.sin(angle) * dist,
                    len: 10 + Math.random() * 15,
                    color: Math.random() > 0.5 ? '#2e8b57' : '#3cb371',
                    offset: Math.random() * Math.PI * 2
                });
            }
        }
    }

    // 鱼群 (只在浅水区)
    let schools = 5;
    for(let s=0; s<schools; s++) {
        let centerR = Math.floor(Math.random() * 20 + 2);
        let centerC = Math.floor(cols/2 + (Math.random()-0.5)*10);
        
        if(state.map[centerR] && state.map[centerR][centerC] === 0) {
            let count = Math.floor(Math.random() * 5) + 3;
            let colors = ['#ff7f50', '#ffd700', '#00bfff'];
            let schoolColor = colors[Math.floor(Math.random() * colors.length)];
            
            for(let i=0; i<count; i++) {
                state.fishes.push({
                    x: centerC * tileSize + tileSize/2 + (Math.random()-0.5)*tileSize*2,
                    y: centerR * tileSize + tileSize/2 + (Math.random()-0.5)*tileSize*2,
                    vx: (Math.random() - 0.5) * 1.0, 
                    vy: (Math.random() - 0.5) * 0.3,
                    size: 4 + Math.random() * 3,
                    color: schoolColor,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
    }
}

function getNeighborCount(r, c) {
    let count = 0;
    for(let i=-1; i<=1; i++) {
        for(let j=-1; j<=1; j++) {
            if(i===0 && j===0) continue;
            let nr = r+i;
            let nc = c+j;
            // 边界外视为墙
            if(nr < 0 || nr >= state.map.length || nc < 0 || nc >= state.map[0].length) {
                count++;
            } else if(state.map[nr][nc] === 1) {
                count++;
            }
        }
    }
    return count;
}
