import { CONFIG } from './config.js';
import { state, target } from './state.js';

// 线性剧情地图生成
export function generateMap() {
    state.map = [];
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
    
    // 入口水面
    for(let r=0; r<8; r++) {
        pathPoints.push([r, centerX, 6]);
    }
    
    // 第一段：蜿蜒向下 (直到潜水服)
    let currentR = 8;
    let currentC = centerX;
    for(let i=0; i<20; i++) {
        currentR += 1.5;
        currentC += (Math.random()-0.5)*3;
        if(currentC < 5) currentC = 5;
        if(currentC > cols-5) currentC = cols-5;
        // 宽度随机变化，模拟真实洞穴
        let width = 1 + Math.random() * 7; // 稍微变窄一点 (原 3+4)
        if (Math.random() < 0.3) width += 2; // 偶尔有大厅
        pathPoints.push([currentR, currentC, width]);
    }
    
    // 记录潜水服位置
    state.landmarks.suit = {
        x: currentC * tileSize,
        y: currentR * tileSize
    };
    
    // 第二段：继续向下 (直到狭窄通道入口)
    for(let i=0; i<15; i++) {
        currentR += 1.5;
        currentC += (Math.random()-0.5)*3;
        if(currentC < 5) currentC = 5;
        if(currentC > cols-5) currentC = cols-5;
        let width = 2.0 + Math.random() * 2; // 变窄 (原 2.5+3)
        pathPoints.push([currentR, currentC, width]);
    }
    
    // 记录狭窄通道入口
    state.landmarks.tunnelEntry = {
        x: currentC * tileSize,
        y: currentR * tileSize
    };
    
    // 记录隧道路径点供 NPC 导航
    state.landmarks.tunnelPath = [];

    // 第三段：狭窄通道 (直线向下，很窄)
    // 确保通道只有1格宽，看起来刚好能过
    let tunnelStartR = currentR;
    for(let i=0; i<40; i++) { // 加长隧道 (原15 -> 30)
        currentR += 0.8;
        // 稍微偏移一点点，保持狭窄
        pathPoints.push([currentR, currentC, 0.7]); // 极窄 (原0.9)
        
        // 每隔几个点记录一个导航点
        if(i % 5 === 0) {
            state.landmarks.tunnelPath.push({
                x: currentC * tileSize,
                y: currentR * tileSize
            });
        }
    }
    
    // 添加透明碰撞体，阻止玩家进入 (第一次下潜)
    // 放在入口深处 (隧道开始后 10 格左右)
    state.invisibleWalls.push({
        x: currentC * tileSize,
        y: (tunnelStartR + 8) * tileSize, // 入口下方8格，深入隧道
        r: tileSize * 1.2 // 堵住路
    });
    
    // 记录狭窄通道内部/终点
    state.landmarks.tunnelEnd = {
        x: currentC * tileSize,
        y: currentR * tileSize
    };
    // 确保终点也在路径中
    state.landmarks.tunnelPath.push(state.landmarks.tunnelEnd);

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
    
    // 水草
    for(let w of state.walls) {
        if(w.y < 15 * tileSize) { // 稍微深一点也有水草
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
    let schools = 3;
    for(let s=0; s<schools; s++) {
        let centerR = Math.floor(Math.random() * 10 + 2);
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
    
    // 移除原来的目标生成逻辑，因为现在是剧情驱动
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
