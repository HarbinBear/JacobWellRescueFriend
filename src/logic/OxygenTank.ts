// 迷宫模式：氧气瓶系统
//
// 设计目标（一句话概括）：玩家在迷宫里能拾起氧气瓶、按住安装到自己身上，
// 收获明显的视觉与氧气反馈；氧气瓶全部贴在岩石表面，食人鱼聚落周围大概率刷新；
// 同一个 seed 内已消耗过的氧气瓶永久不再出现。
//
// 关键约束：
// - 氧气瓶的位置、总数、每瓶补给量全部由"主 seed 派生子 seed"确定性生成，
//   保证同一张迷宫地图读档 / 好友分享时视觉一致。
// - 刷新点全部落在岩石表面外缘（参考 FishEnemy.ts 的骷髅放置算法：沿"岩石中心→
//   目标朝向"的方向平移 w.r * 0.9），绝不会悬浮在通道里或嵌在岩石内部。
// - 已消耗的氧气瓶用 Set<number>（id 基于 seed + 序号）记录，随 mazeRescue 一起存档。
// - 跨下潜持久：同一张地图多次下潜共享同一份 oxygenTanks 与 consumedTankIds。

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { srand, setActiveSeededRandom, clearActiveSeededRandom } from '../core/SeededRandom';
import { checkMazeCollision } from './Collision';

// =============================================
// 数据结构
// =============================================

// 氧气瓶外观随机变体（"这瓶子是哪家哪年的"）
export interface TankVariant {
    bodyColor: number;       // 瓶体主色索引（0~3：老黄/暗红/军绿/褪色灰蓝）
    valveColor: number;      // 顶阀颜色索引（0~2：红/橙/黑）
    labelKind: number;       // 标签文字索引（0~3：O₂/AIR/32%/模糊）
    rustLevel: number;       // 锈蚀程度（0~2：新/旧/锈斑）
    tilt: number;            // 摆放倾倒角度（弧度，相对法线 ±30°）
    hasCrack: boolean;       // 是否有瓶身裂口（15% 概率）
    seed: number;            // 细节种子，供渲染里生成锈斑点、划痕等
}

// 伴生物件（前人留下的遗物：潜水镜、潜水衣碎片等）
export interface CompanionProp {
    kind: 'goggles' | 'suit' | 'clothStrip';  // 物件类型
    offsetX: number;                           // 相对瓶子的世界偏移 X
    offsetY: number;                           // 相对瓶子的世界偏移 Y
    angle: number;                             // 物件自身旋转（弧度）
    color: number;                             // 颜色索引（含义由 kind 决定）
    formVariant: number;                       // 形态变体索引（含义由 kind 决定）
    size: number;                              // 整体尺寸缩放（0.85~1.15）
    seed: number;                              // 细节种子
}

export interface OxygenTank {
    id: number;                // 稳定 ID（seed 派生）
    x: number;                 // 世界坐标
    y: number;
    wallX: number;             // 所属岩石中心（用于贴合与美观偏移）
    wallY: number;
    normalAngle: number;       // 岩石→瓶体法线角度（瓶体朝向按此旋转）
    amount: number;            // 补给量（0~100 的数值），由 seed 决定
    consumed: boolean;         // 是否已被消耗（运行时标志；存档走 consumedTankIds）
    // 交互运行态
    holdProgress: number;      // 按住进度（0~1）
    isBeingInstalled: boolean; // 是否正在被安装（与轮盘扇区状态联动）
    // 视觉装饰
    breathPhase: number;       // 呼吸发光相位，稍微错开瓶子之间节奏
    // 外观随机（同 seed 下确定性派生，不进存档）
    variant: TankVariant;
    // 伴生遗物（前人留下的镜子/潜水衣等，纯装饰，不参与交互与碰撞）
    companions: CompanionProp[];
}

// 飞行中的氧气瓶（视觉反馈，拾取瞬间创建）
export interface FlyingTank {
    x: number;
    y: number;
    vx: number;
    vy: number;
    targetX: number;           // 目标位置（玩家胸前，持续跟踪）
    targetY: number;
    life: number;              // 0~1，1=刚起飞
    amount: number;            // 安装成功后要补充的氧气量
    done: boolean;             // true=已到达玩家
}

// 拾取完成后的反馈（屏幕辉光 + 气泡爆发 + 氧气条上涨 + 跳字）
export interface OxygenFeedback {
    // 屏幕层
    screenGlowTimer: number;   // 0~1 递减，>0 期间全屏绿色辉光
    floatText: {               // 飘字 "+30%"
        text: string;
        x: number;
        y: number;
        timer: number;         // 0~1 递减
    } | null;
    o2RingPulse: number;       // 0~1 递减，氧气环放大脉冲
    o2DisplayAnim: number;     // UI 上显示的氧气值（用于渐增动画，追 player.o2）
    // 世界层
    bubbleBurst: {             // 玩家周围气泡爆发
        x: number;
        y: number;
        vx: number;
        vy: number;
        life: number;          // 1→0
        size: number;
    }[];
    flyingTanks: FlyingTank[];
}

// =============================================
// 配置快捷访问
// =============================================

function cfg() {
    return (CONFIG as any).oxygenTank || {};
}

// =============================================
// 为当前迷宫生成氧气瓶列表（由 MazeLogic 在派生 seed 激活后调用）
//
// 生成策略：
//   - 遍历聚集点，每个聚集点在其半径内岩石上撒 denCountMin~Max 个氧气瓶
//   - 剩余配额在全图散落 scatteredMin~Max 个（避开出生点附近 & 聚集点核心 & 彼此最小距离）
//   - 每个氧气瓶位置：在候选岩石表面法线方向外推 w.r * 0.9，并朝向聚集点/开阔方向
// =============================================
export function generateOxygenTanks(): OxygenTank[] {
    const maze = state.mazeRescue;
    if (!maze) return [];

    const c = cfg();
    const denCountMin: number = c.denCountMin ?? 2;
    const denCountMax: number = c.denCountMax ?? 4;
    const scatterMin: number = c.scatterCountMin ?? 3;
    const scatterMax: number = c.scatterCountMax ?? 6;
    const amountMin: number = c.amountMin ?? 25;
    const amountMax: number = c.amountMax ?? 35;
    const denSearchRatio: number = c.denSearchRadiusRatio ?? 0.85;
    const minDistBetween: number = c.minDistBetween ?? 300;
    const minDistToSpawn: number = c.minDistToSpawn ?? 600;

    const tanks: OxygenTank[] = [];
    let nextId = 1;

    // 出生点（顶部洞口内侧）
    const mazeCfg: any = CONFIG.maze;
    const wallThick = mazeCfg.wallThickness || 5;
    const spawnX = maze.exitX;
    const spawnY = (wallThick + 1) * maze.mazeTileSize + maze.mazeTileSize / 2;

    // === 先在食人鱼聚落附近生成（高概率 / 主要来源） ===
    const dens = maze.fishDens || [];
    for (const den of dens) {
        const count = denCountMin + Math.floor(srand() * (denCountMax - denCountMin + 1));
        // 找聚落范围内的候选岩石
        const searchR = den.radius * denSearchRatio;
        const candidates: any[] = [];
        for (const w of maze.mazeWalls) {
            if (!w) continue;
            const d = Math.hypot(w.x - den.x, w.y - den.y);
            if (d <= searchR && d > 60) candidates.push(w);
        }
        // 打乱
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(srand() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        // 取前 count 个，但要求彼此 / 已放置的氧气瓶 / 出生点之间有最小距离
        for (const w of candidates) {
            if (tanks.length >= dens.length * denCountMax + scatterMax) break;
            const placed = tryPlaceOnWall(w, den.x, den.y, tanks, minDistBetween, minDistToSpawn, spawnX, spawnY, amountMin, amountMax, nextId++);
            if (placed) {
                tanks.push(placed);
                // 每个聚落凑够 count 就换下一个
                const fromThisDen = tanks.filter(t => Math.hypot(t.x - den.x, t.y - den.y) <= den.radius).length;
                if (fromThisDen >= count) break;
            }
        }
    }

    // === 全图散落（低概率补给，不在聚落附近重复） ===
    const scatterCount = scatterMin + Math.floor(srand() * (scatterMax - scatterMin + 1));
    // 从 mazeWalls 里随机挑候选岩石，排除已在聚落区域的
    const openCandidates: any[] = [];
    for (const w of maze.mazeWalls) {
        if (!w) continue;
        // 排除紧贴出生点（不然进洞口立刻就能捡到）
        if (Math.hypot(w.x - spawnX, w.y - spawnY) < minDistToSpawn) continue;
        // 排除处在聚落核心区
        let inDenCore = false;
        for (const den of dens) {
            if (Math.hypot(w.x - den.x, w.y - den.y) < den.radius * 0.4) { inDenCore = true; break; }
        }
        if (inDenCore) continue;
        openCandidates.push(w);
    }
    for (let i = openCandidates.length - 1; i > 0; i--) {
        const j = Math.floor(srand() * (i + 1));
        [openCandidates[i], openCandidates[j]] = [openCandidates[j], openCandidates[i]];
    }
    let scatterPlaced = 0;
    for (const w of openCandidates) {
        if (scatterPlaced >= scatterCount) break;
        // 朝向参考：最近的聚集点方向（这样瓶子朝开阔面，好看 + 方便拾取）
        let refX = w.x, refY = w.y - 100; // 兜底朝上
        if (dens.length > 0) {
            let bestD = Infinity;
            for (const den of dens) {
                const d = Math.hypot(w.x - den.x, w.y - den.y);
                if (d < bestD) { bestD = d; refX = den.x; refY = den.y; }
            }
        }
        const placed = tryPlaceOnWall(w, refX, refY, tanks, minDistBetween, minDistToSpawn, spawnX, spawnY, amountMin, amountMax, nextId++);
        if (placed) {
            tanks.push(placed);
            scatterPlaced++;
        }
    }

    return tanks;
}

/** 尝试在指定岩石的"岩石与水域交界处"生成一个氧气瓶。
 *  做了三件事：
 *   1. 真正把候选点放到岩石半径之外（`w.r + safeMargin`），而不是 0.9r 那种还在岩石内部的位置
 *   2. 调用 `checkMazeCollision` 确认"玩家中心能站在那儿且不撞任何墙/装饰圆"
 *   3. 多角度扫描（主方向 + 两侧各 30/60/90/120/180°），任何一个方向能放下就算成功
 *  返回 null 表示该岩石所有方向都被周围墙体堵死，或者被出生点/距离规则拒绝。
 */
function tryPlaceOnWall(
    w: any,
    refX: number, refY: number,
    existing: OxygenTank[],
    minDistBetween: number,
    minDistToSpawn: number,
    spawnX: number, spawnY: number,
    amountMin: number, amountMax: number,
    id: number
): OxygenTank | null {
    const maze = state.mazeRescue;
    if (!maze) return null;

    // 主朝向：从岩石中心指向参考点（聚落中心 / 开阔方向）
    const baseAngle = Math.atan2(refY - w.y, refX - w.x);

    // 安全边距：玩家半径 + 额外缓冲，确保瓶子在水域里、玩家能游到拾取范围内
    const playerRadius = CONFIG.maze.playerRadius || 12;
    const safeMargin = playerRadius + 10;          // 瓶子中心离岩石表面多少像素
    const wallR = w.r || 30;
    // 核心修复：offsetR 从 `w.r + safeMargin` 起步，**一定在岩石外部**
    const offsetR = wallR + safeMargin;

    // 多角度扫描：主方向优先，不行再依次尝试两侧偏转
    // 之所以需要这么多角度：单个岩石"指向开阔方向"的那一侧可能正好挨着另一颗岩石，
    // 而完全相反的那一侧反而是空旷水域
    const angleOffsets = [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3,
                          Math.PI / 2, -Math.PI / 2, Math.PI * 2 / 3, -Math.PI * 2 / 3, Math.PI];

    for (const off of angleOffsets) {
        // 每个候选角度加一点固定抖动（基于 srand，保证确定性），避免过于规整
        const jitter = (srand() - 0.5) * 0.25;
        const angle = baseAngle + off + jitter;
        const tx = w.x + Math.cos(angle) * offsetR;
        const ty = w.y + Math.sin(angle) * offsetR;

        // 出生点距离
        if (Math.hypot(tx - spawnX, ty - spawnY) < minDistToSpawn) continue;
        // 彼此距离
        let tooClose = false;
        for (const t of existing) {
            if (Math.hypot(tx - t.x, ty - t.y) < minDistBetween) { tooClose = true; break; }
        }
        if (tooClose) continue;

        // 关键：确认"玩家中心放在这里不会撞任何墙"
        // checkMazeCollision 会同时检查基础 wall + extras 装饰圆
        if (checkMazeCollision(tx, ty, maze)) continue;

        // 进一步验证"玩家能从周围靠近这个点"：
        // 检查瓶子周围 4 个等距方向上，至少有一个方向在 1.5*playerRadius 距离内是水域
        // 这样能筛掉"瓶子虽在水里，但四面被墙夹成一个小口袋，玩家游不过去"
        let hasOpenSide = false;
        const probeDist = playerRadius * 1.5;
        for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            const px = tx + Math.cos(a) * probeDist;
            const py = ty + Math.sin(a) * probeDist;
            if (!checkMazeCollision(px, py, maze)) { hasOpenSide = true; break; }
        }
        if (!hasOpenSide) continue;

        const amount = amountMin + srand() * (amountMax - amountMin);

        // === 外观随机（确定性，同 seed 下完全一致） ===
        const variant: TankVariant = {
            bodyColor: Math.floor(srand() * 4),        // 0~3
            valveColor: Math.floor(srand() * 3),       // 0~2
            labelKind: Math.floor(srand() * 4),        // 0~3
            rustLevel: Math.floor(srand() * 3),        // 0~2
            tilt: (srand() - 0.5) * (Math.PI / 3),     // ±30°
            hasCrack: srand() < 0.15,                  // 15% 有裂口
            seed: Math.floor(srand() * 0x7fffffff),
        };

        // === 伴生遗物组合抽签（40/25/20/15） ===
        // 0: 单瓶     1: 瓶+镜    2: 瓶+衣碎片    3: 全套（镜+衣）
        const roll = srand();
        let companionSet = 0;
        if (roll < 0.40) companionSet = 0;
        else if (roll < 0.65) companionSet = 1;
        else if (roll < 0.85) companionSet = 2;
        else companionSet = 3;
        const companions: CompanionProp[] = [];
        // 伴生物件放在瓶子"贴岩石那一侧"附近，自然地散落在岩石表面
        // 瓶子的法线方向是"朝外"（朝水域），反方向是"贴岩石"
        const tangent = angle + Math.PI / 2;  // 沿岩石表面方向
        const addGoggles = (sideSign: number, dist: number) => {
            companions.push({
                kind: 'goggles',
                offsetX: Math.cos(tangent) * dist * sideSign + Math.cos(angle) * -3,
                offsetY: Math.sin(tangent) * dist * sideSign + Math.sin(angle) * -3,
                angle: srand() * Math.PI * 2,
                color: Math.floor(srand() * 3),
                formVariant: Math.floor(srand() * 3),   // 0=完好 1=裂纹 2=单边碎
                size: 0.85 + srand() * 0.3,
                seed: Math.floor(srand() * 0x7fffffff),
            });
        };
        const addSuit = (sideSign: number, dist: number) => {
            companions.push({
                kind: srand() < 0.45 ? 'clothStrip' : 'suit',
                offsetX: Math.cos(tangent) * dist * sideSign + Math.cos(angle) * -5,
                offsetY: Math.sin(tangent) * dist * sideSign + Math.sin(angle) * -5,
                angle: srand() * Math.PI * 2,
                color: Math.floor(srand() * 3),
                formVariant: Math.floor(srand() * 3),   // 0=完整上衣 1=腰片 2=撕碎布
                size: 0.85 + srand() * 0.3,
                seed: Math.floor(srand() * 0x7fffffff),
            });
        };
        if (companionSet === 1) {
            addGoggles(srand() < 0.5 ? 1 : -1, 16 + srand() * 8);
        } else if (companionSet === 2) {
            addSuit(srand() < 0.5 ? 1 : -1, 18 + srand() * 10);
        } else if (companionSet === 3) {
            addGoggles(1, 14 + srand() * 6);
            addSuit(-1, 18 + srand() * 8);
        }

        return {
            id,
            x: tx, y: ty,
            wallX: w.x, wallY: w.y,
            normalAngle: angle,               // 瓶体朝向用最终生效的角度，方向看起来更自然
            amount,
            consumed: false,
            holdProgress: 0,
            isBeingInstalled: false,
            breathPhase: srand() * Math.PI * 2,
            variant,
            companions,
        };
    }

    // 所有角度都放不下：这颗岩石不适合放氧气瓶
    return null;
}

// =============================================
// 应用已消耗 ID（读档时剔除）
// =============================================
export function applyConsumedTankIds(tanks: OxygenTank[], consumedIds: number[]): OxygenTank[] {
    if (!consumedIds || consumedIds.length === 0) return tanks;
    const set = new Set(consumedIds);
    return tanks.filter(t => !set.has(t.id));
}

// =============================================
// 视觉反馈运行态初始化
// =============================================
export function createOxygenFeedback(): OxygenFeedback {
    return {
        screenGlowTimer: 0,
        floatText: null,
        o2RingPulse: 0,
        o2DisplayAnim: 100,
        bubbleBurst: [],
        flyingTanks: [],
    };
}

// =============================================
// 找到玩家附近最近的可拾取氧气瓶（供轮盘上下文检测调用）
// =============================================
export function findNearbyOxygenTank(): OxygenTank | null {
    const maze = state.mazeRescue;
    if (!maze || !maze.oxygenTanks) return null;
    const c = cfg();
    const pickRange: number = c.pickRange ?? 90;
    let best: OxygenTank | null = null;
    let bestD = pickRange;
    for (const t of maze.oxygenTanks) {
        if (t.consumed) continue;
        const d = Math.hypot(player.x - t.x, player.y - t.y);
        if (d < bestD) { bestD = d; best = t; }
    }
    return best;
}

// =============================================
// 启动安装（轮盘扇区被选中 / 按住时调用）
// 返回 true 表示已启动
// =============================================
export function startInstallTank(id: number): boolean {
    const maze = state.mazeRescue;
    if (!maze || !maze.oxygenTanks) return false;
    for (const t of maze.oxygenTanks) {
        if (t.id === id && !t.consumed) {
            t.isBeingInstalled = true;
            // 进度不归零，支持继续按（如果松手再按时不会回到 0）
            return true;
        }
    }
    return false;
}

/** 停止安装（松手时调用） */
export function cancelInstallTank(id: number) {
    const maze = state.mazeRescue;
    if (!maze || !maze.oxygenTanks) return;
    for (const t of maze.oxygenTanks) {
        if (t.id === id) {
            t.isBeingInstalled = false;
            return;
        }
    }
}

// =============================================
// 每帧更新：进度条推进、视觉反馈演进
// =============================================
export function updateOxygenTanks() {
    const maze = state.mazeRescue;
    if (!maze) return;
    const tanks: OxygenTank[] = maze.oxygenTanks || [];
    const c = cfg();
    const installDuration: number = c.installDuration ?? 1.2; // 秒
    const breathSpeed: number = c.breathSpeed ?? 0.05;

    if (!maze.oxygenFeedback) maze.oxygenFeedback = createOxygenFeedback();
    const fb: OxygenFeedback = maze.oxygenFeedback;

    // === 更新每个氧气瓶 ===
    for (const t of tanks) {
        if (t.consumed) continue;
        // 呼吸发光相位
        t.breathPhase += breathSpeed;
        // 距离玩家判定（太远自动取消安装）
        const dist = Math.hypot(player.x - t.x, player.y - t.y);
        const pickRange: number = c.pickRange ?? 90;
        if (dist > pickRange + 20) {
            // 离开范围则退出安装 + 进度缓降
            t.isBeingInstalled = false;
        }

        if (t.isBeingInstalled) {
            // 进度按 60fps 推进：1/(installDuration*60) 每帧
            t.holdProgress = Math.min(1, t.holdProgress + 1 / (installDuration * 60));
            if (t.holdProgress >= 1) {
                // === 安装完成！触发视觉反馈 ===
                completeInstall(t, fb);
            }
        } else {
            // 不在安装态时缓慢回落，避免松手时进度瞬间清零（手感更柔）
            t.holdProgress = Math.max(0, t.holdProgress - 0.025);
        }
    }

    // === 更新飞行中的氧气瓶（从拾取点飞向玩家胸前） ===
    for (let i = fb.flyingTanks.length - 1; i >= 0; i--) {
        const fly = fb.flyingTanks[i];
        // 目标点动态跟踪玩家
        fly.targetX = player.x;
        fly.targetY = player.y;
        // 弹簧式跟踪
        const dx = fly.targetX - fly.x;
        const dy = fly.targetY - fly.y;
        fly.vx += dx * 0.08;
        fly.vy += dy * 0.08;
        fly.vx *= 0.85;
        fly.vy *= 0.85;
        fly.x += fly.vx;
        fly.y += fly.vy;
        fly.life = Math.max(0, fly.life - 1 / 30); // 0.5s 左右
        const arrived = Math.hypot(dx, dy) < 18;
        if (arrived && !fly.done) {
            // 到达玩家，触发真正的氧气补充 + 气泡爆发 + 屏幕辉光
            fly.done = true;
            player.o2 = Math.min(100, player.o2 + fly.amount);
            spawnBubbleBurst(fb, player.x, player.y, 24);
            fb.screenGlowTimer = 1;
            fb.o2RingPulse = 1;
            fb.floatText = {
                text: `+${Math.round(fly.amount)}%`,
                x: player.x,
                y: player.y - 40,
                timer: 1,
            };
        }
        if (fly.done && fly.life <= 0) {
            fb.flyingTanks.splice(i, 1);
        }
    }

    // === 更新气泡爆发 ===
    for (let i = fb.bubbleBurst.length - 1; i >= 0; i--) {
        const b = fb.bubbleBurst[i];
        b.x += b.vx;
        b.y += b.vy;
        b.vy -= 0.08; // 气泡往上浮
        b.vx *= 0.97;
        b.vy *= 0.97;
        b.life -= 0.02;
        if (b.life <= 0) fb.bubbleBurst.splice(i, 1);
    }

    // === 更新屏幕辉光 / 环脉冲 / 跳字 ===
    if (fb.screenGlowTimer > 0) fb.screenGlowTimer = Math.max(0, fb.screenGlowTimer - 1 / 45); // 0.75s
    if (fb.o2RingPulse > 0) fb.o2RingPulse = Math.max(0, fb.o2RingPulse - 1 / 60);
    if (fb.floatText) {
        fb.floatText.timer -= 1 / 90; // 1.5s
        fb.floatText.y -= 0.6;
        if (fb.floatText.timer <= 0) fb.floatText = null;
    }

    // === UI 显示氧气值渐增动画（追 player.o2） ===
    if (Math.abs(fb.o2DisplayAnim - player.o2) < 0.1) {
        fb.o2DisplayAnim = player.o2;
    } else {
        fb.o2DisplayAnim += (player.o2 - fb.o2DisplayAnim) * 0.08;
    }
}

/** 安装完成：把瓶子标记为已消耗，启动飞瓶动画；真正加氧气在飞瓶到达时做 */
function completeInstall(t: OxygenTank, fb: OxygenFeedback) {
    t.consumed = true;
    t.isBeingInstalled = false;
    // 写入 consumedTankIds，方便存档持久化
    const maze = state.mazeRescue;
    if (maze) {
        if (!Array.isArray(maze.consumedTankIds)) maze.consumedTankIds = [];
        if (maze.consumedTankIds.indexOf(t.id) < 0) maze.consumedTankIds.push(t.id);
    }
    // 从拾取位置向玩家抛出一个飞行瓶
    fb.flyingTanks.push({
        x: t.x,
        y: t.y,
        vx: (player.x - t.x) * 0.05,
        vy: (player.y - t.y) * 0.05,
        targetX: player.x,
        targetY: player.y,
        life: 1,
        amount: t.amount,
        done: false,
    });
}

function spawnBubbleBurst(fb: OxygenFeedback, cx: number, cy: number, count: number) {
    for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.2 + Math.random() * 2.5;
        fb.bubbleBurst.push({
            x: cx + Math.cos(ang) * 6,
            y: cy + Math.sin(ang) * 6,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 1.5,
            life: 1,
            size: 2 + Math.random() * 3.5,
        });
    }
}

// =============================================
// 对外：为迷宫生成完整氧气瓶数据（带派生 seed 包装）
// 由 MazeLogic 在新建地图 / 读档两个分支都调用
// =============================================
export function buildOxygenTanksForMaze(mainSeed: number, consumedIds: number[] | undefined): OxygenTank[] {
    const subSeed = ((mainSeed >>> 0) ^ 0xCAFEBABE) >>> 0;
    setActiveSeededRandom(subSeed);
    let list: OxygenTank[] = [];
    try {
        list = generateOxygenTanks();
    } finally {
        clearActiveSeededRandom();
    }
    // 剔除已消耗的
    if (consumedIds && consumedIds.length > 0) {
        const set = new Set(consumedIds);
        for (const t of list) if (set.has(t.id)) t.consumed = true;
    }
    return list;
}
