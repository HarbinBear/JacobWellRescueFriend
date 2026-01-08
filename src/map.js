import { CONFIG } from './config.js';
import { state, target } from './state.js';

// 有机地图生成
export function generateMap() {
    state.map = [];
    const { rows, cols, tileSize } = CONFIG;
    
    // 1. 初始化：随机填充 (元胞自动机初始状态)
    for(let r=0; r<rows; r++) {
        state.map[r] = [];
        for(let c=0; c<cols; c++) {
            // 边缘必须是墙，但顶部(r=0)除外，那是水面
            if(r === rows-1 || c === 0 || c === cols-1) {
                state.map[r][c] = 1;
            } else {
                // 随机填充，45%概率是墙
                state.map[r][c] = Math.random() < 0.45 ? 1 : 0;
            }
        }
    }

    // 2. 顶部水面区域 (确保顶部是空的)
    // 从 r=0 开始清理，确保水面没有墙
    for(let r=0; r<8; r++) {
        for(let c=1; c<cols-1; c++) {
            state.map[r][c] = 0;
        }
    }

    // 3. 元胞自动机平滑 (模拟自然洞穴)
    // 进行几次迭代，让墙壁聚集成块，空地连成片
    for(let i=0; i<5; i++) {
        let newMap = JSON.parse(JSON.stringify(state.map));
        for(let r=1; r<rows-1; r++) {
            for(let c=1; c<cols-1; c++) {
                let neighbors = getNeighborCount(r, c);
                if(neighbors > 4) newMap[r][c] = 1;
                else if(neighbors < 4) newMap[r][c] = 0;
            }
        }
        state.map = newMap;
    }

    // 4. 狭窄水道生成 (使用随机游走挖掘细长通道)
    // 在地图中随机找点，如果是墙，就挖一条细长的路
    for(let i=0; i<15; i++) {
        let miner = {
            x: Math.floor(Math.random() * (cols-4) + 2),
            y: Math.floor(Math.random() * (rows-10) + 8)
        };
        let len = Math.floor(Math.random() * 20 + 10);
        for(let step=0; step<len; step++) {
            if(miner.y > 0 && miner.y < rows-1 && miner.x > 0 && miner.x < cols-1) {
                state.map[miner.y][miner.x] = 0;
                // 偶尔把旁边也挖掉，形成不规则宽度
                if(Math.random() > 0.7) {
                    let adjX = miner.x + (Math.random()>0.5?1:-1);
                    let adjY = miner.y + (Math.random()>0.5?1:-1);
                    if(adjY > 0 && adjY < rows-1 && adjX > 0 && adjX < cols-1) {
                        state.map[adjY][adjX] = 0;
                    }
                }
            }
            // 随机移动
            miner.x += Math.floor(Math.random() * 3) - 1;
            miner.y += Math.floor(Math.random() * 3) - 1;
        }
    }

    // 5. 确保顶部水面不被封死 (再次清理顶部)
    for(let r=0; r<6; r++) {
        for(let c=1; c<cols-1; c++) {
            state.map[r][c] = 0;
        }
    }
    // 岸边不规则化
    for(let c=1; c<cols-1; c++) {
        if(Math.random() > 0.5) state.map[6][c] = 0;
        if(Math.random() > 0.7) state.map[7][c] = 0;
    }

    // 6. 生成墙壁渲染数据 (打破网格感)
    state.walls = [];
    for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
            if(state.map[r][c] === 1) {
                // 随机偏移，打破正方形网格
                let offsetX = (Math.random() - 0.5) * tileSize * 0.6;
                let offsetY = (Math.random() - 0.5) * tileSize * 0.6;
                // 随机大小，稍微大一点以覆盖缝隙
                let radius = tileSize * (0.6 + Math.random() * 0.4);
                
                let wall = {
                    x: c * tileSize + tileSize/2 + offsetX,
                    y: r * tileSize + tileSize/2 + offsetY,
                    r: radius
                };
                
                state.walls.push(wall);
                // 将详细信息存回 map，方便碰撞检测
                state.map[r][c] = wall;
                
                // 偶尔添加额外的填充石块
                if(Math.random() < 0.3) {
                    state.walls.push({
                        x: c * tileSize + tileSize/2 + (Math.random()-0.5)*tileSize,
                        y: r * tileSize + tileSize/2 + (Math.random()-0.5)*tileSize,
                        r: tileSize * (0.3 + Math.random() * 0.3)
                    });
                }
            }
        }
    }

    // 7. 生成浅水区生态 (水草和鱼)
    state.plants = [];
    state.fishes = [];
    
    // 水草：附着在浅水区(前10行)的墙壁上
    for(let w of state.walls) {
        if(w.y < 10 * tileSize) {
            // 每个墙壁尝试生成几株水草
            if(Math.random() < 0.4) {
                let angle = Math.random() * Math.PI * 2;
                let dist = w.r * 0.8;
                state.plants.push({
                    x: w.x + Math.cos(angle) * dist,
                    y: w.y + Math.sin(angle) * dist,
                    len: 10 + Math.random() * 15,
                    color: Math.random() > 0.5 ? '#2e8b57' : '#3cb371', // 海绿/春绿
                    offset: Math.random() * Math.PI * 2 // 摆动相位
                });
            }
        }
    }

    // 鱼群：在浅水区生成多个鱼群
    let schools = Math.floor(Math.random() * 4) + 5; // 5-8个鱼群
    for(let s=0; s<schools; s++) {
        // 鱼群中心
        let centerR = Math.floor(Math.random() * 8 + 1); // 1-9行
        let centerC = Math.floor(Math.random() * (cols-4) + 2);
        
        // 检查中心点是否是空地
        if(state.map[centerR] && state.map[centerR][centerC] === 0) {
            // 每个鱼群 5-12 条鱼
            let count = Math.floor(Math.random() * 8) + 5;
            // 随机颜色：珊瑚色、金色、天蓝色、热带紫
            let colors = ['#ff7f50', '#ffd700', '#00bfff', '#da70d6'];
            let schoolColor = colors[Math.floor(Math.random() * colors.length)];
            
            for(let i=0; i<count; i++) {
                state.fishes.push({
                    x: centerC * tileSize + tileSize/2 + (Math.random()-0.5)*tileSize*2,
                    y: centerR * tileSize + tileSize/2 + (Math.random()-0.5)*tileSize*2,
                    vx: (Math.random() - 0.5) * 1.0, 
                    vy: (Math.random() - 0.5) * 0.3,
                    size: 4 + Math.random() * 3, // 稍微大一点
                    color: schoolColor,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
    }

    // 放置目标 (确保在空地上)
    let valid = false;
    while(!valid) {
        let tr = Math.floor(rows * 0.6 + Math.random() * (rows * 0.3));
        let tc = Math.floor(cols * 0.2 + Math.random() * (cols * 0.6));
        if(state.map[tr][tc] === 0) {
            // 检查周围是否有空地，避免生成在死胡同里太难找
            let spaceCount = 0;
            for(let rr=-1; rr<=1; rr++)
                for(let cc=-1; cc<=1; cc++)
                    if(state.map[tr+rr][tc+cc] === 0) spaceCount++;
            
            if(spaceCount >= 5) {
                target.x = tc * tileSize + tileSize/2;
                target.y = tr * tileSize + tileSize/2;
                valid = true;
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
