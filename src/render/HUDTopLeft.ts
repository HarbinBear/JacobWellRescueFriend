// 左上角 HUD 统一管理器
//
// 设计目标：
// - 所有左上角的HUD元素（氧气环、手动挡切换、音频开关、生命探知仪）统一由此管理
// - 统一的布局：顶部起点固定，每个元素之间有统一间距，竖向排列
// - 统一的交互：每个图标都支持"短按=主操作+弹tip"、可选"长按=展开详情"
// - 统一的入场动效：左侧滑入+淡入
// - 统一的浮窗tip：点按图标自动浮出，2秒后自动淡出消失
//
// 为什么不直接在RenderMazeUI里一堆if：
// - 左上角图标的数量、顺序、显隐会随着项目迭代变化
// - 每个图标的交互手势都类似，有统一抽象可以避免到处写hit-test和状态管理
// - tip系统是跨元素的通用能力，必须集中维护
//
// HUDItem 渲染契约：
// - iconDraw(ctx, cx, cy, size, t) 被调用时，(cx,cy)是图标中心屏幕坐标，size是图标可绘制的直径；
//   实现者负责在这个圈范围内画自己的图标
// - 超出size范围的绘制应谨慎，会穿出管理器规划区域
//
// 交互契约：
// - 每次点击先等待 touchEnd 判定：移动<8px且时长<300ms=短按，时长>=300ms=长按；
//   若item不支持长按（supportsLongPress=false），则touchStart就直接触发短按
// - 短按：onShortTap() 执行并展示 tipText
// - 长按：onLongHoldStart() 触发，松手时 onLongHoldEnd()

import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { ctx } from './Canvas';
import { drawAudioIcon, toggleMuted as audioToggleMuted } from './RenderAudioToggle';
import { getLifeDetectorRuntime } from '../logic/LifeDetector';
import { toggleGMOpen, isGMOpen } from '../gm/GMPanel';
import { getBreathPhaseAngle, getBreathPhase, getBreathPressure, getLungVolume } from '../logic/BreathSystem';
import { playSFX } from '../audio/AudioManager';
import { getActiveAirTanks } from '../extraction/logic/Loadout';

// ========== 布局常量 ==========
// 起点 X/Y，每项尺寸、间距（垂直排列）
// 注意：HUD_START_Y 必须避开微信小游戏右上角胶囊和设备前置摄像头
//       设计安全区基线 SAFE_TOP=62，图标顶边 = 62 → 中心 = 62 + ITEM_SIZE/2
const HUD_START_X = 46;         // 所有图标的中心X（左侧留足边距）
const HUD_START_Y = 84;         // 第一个图标中心Y（= SAFE_TOP 62 + HUD_ITEM_SIZE/2 22）
const HUD_ITEM_SIZE = 44;       // 图标直径（作为hitTest和视觉尺寸基准）
const HUD_ITEM_GAP = 18;        // 图标之间的垂直间距（从边缘到边缘）
const HUD_TIP_OFFSET_X = 8;     // tip面板相对图标右侧的X偏移
const HUD_TIP_MAX_WIDTH = 220;
const HUD_TIP_PADDING = 10;
const HUD_TIP_LINE_HEIGHT = 16;
const HUD_TIP_DURATION_MS = 2000;  // tip显示时长
const HUD_TIP_FADE_MS = 320;       // tip淡入淡出时长
const HUD_LONG_PRESS_MS = 280;     // 长按判定阈值
const HUD_TAP_MOVE_TOLERANCE = 10; // 点击手势允许的位移容差

// ========== 数据结构 ==========

// 每个左上角HUD项的定义
export interface HUDItem {
    id: string;                  // 唯一ID
    visible?: () => boolean;     // 是否可见（默认true）
    // 绘制图标（center center坐标，size为图标直径）
    iconDraw: (ctx2: CanvasRenderingContext2D, cx: number, cy: number, size: number, time: number) => void;
    // 短按回调（点击图标的主要操作）
    onShortTap?: () => void;
    // 短按后 tip 的内容（可以是动态的，调用时求值）
    tipText?: () => string;
    // 是否支持长按（支持的话区分短长按，否则任何按都是短按）
    supportsLongPress?: boolean;
    // 长按开始/结束
    onLongHoldStart?: () => void;
    onLongHoldEnd?: () => void;
    // 长按过程中的附加绘制（在图标周围绘制，比如氧气环的详情面板）
    longHoldDraw?: (ctx2: CanvasRenderingContext2D, cx: number, cy: number, size: number, progress: number) => void;
}

// Tip 运行态（模块单例）
interface TipState {
    itemId: string | null;
    text: string;
    spawnTime: number;       // 触发时间（ms）
    anchorX: number;
    anchorY: number;
}

// 触摸追踪（每个触点关联的HUD item）
interface HUDTouchTrack {
    touchId: number;
    itemId: string;
    startTime: number;
    startX: number;
    startY: number;
    longFired: boolean;      // 是否已触发长按
}

// ========== 模块状态 ==========

const hudItems: HUDItem[] = [];
const activeTouches: Map<number, HUDTouchTrack> = new Map();
let currentTip: TipState = { itemId: null, text: '', spawnTime: 0, anchorX: 0, anchorY: 0 };
let hudEntryTimer = 0;
const HUD_ENTRY_FRAMES = 40;

// ========== 注册API ==========

export function registerHUDItem(item: HUDItem): void {
    // 若已存在同id，则覆盖（支持热替换）
    const idx = hudItems.findIndex(x => x.id === item.id);
    if (idx >= 0) hudItems[idx] = item;
    else hudItems.push(item);
}

export function clearHUDItems(): void {
    hudItems.length = 0;
    activeTouches.clear();
    currentTip = { itemId: null, text: '', spawnTime: 0, anchorX: 0, anchorY: 0 };
    hudEntryTimer = 0;
}

// ========== 布局查询（供 input.ts / 渲染共用） ==========

interface HUDSlot {
    item: HUDItem;
    cx: number;
    cy: number;
    size: number;
}

// 返回当前可见HUD项的布局位置列表
function getVisibleSlots(): HUDSlot[] {
    const slots: HUDSlot[] = [];
    // 氧气环单独放大：参考 CONFIG.breath.oxygenRingSizeMul，其他图标保持原尺寸
    const cfgBreath: any = (CONFIG as any).breath || {};
    const oxygenSizeMul: number = cfgBreath.oxygenRingSizeMul ?? 1.0;
    let y = HUD_START_Y;
    let prevHalf = 0; // 上一项的半径，用于给不同尺寸图标之间留出正确间距
    for (const item of hudItems) {
        if (item.visible && !item.visible()) continue;
        const sizeHere = item.id === 'oxygen' ? HUD_ITEM_SIZE * oxygenSizeMul : HUD_ITEM_SIZE;
        const halfHere = sizeHere / 2;
        if (slots.length === 0) {
            // 第一个项以固定起点为中心（但若它被放大，起点往下挪让它离顶部有合理留白）
            y = HUD_START_Y + Math.max(0, halfHere - HUD_ITEM_SIZE / 2);
        } else {
            // 后续项基于上一项的下边缘 + 统一间距 + 本项半径
            y = y + prevHalf + HUD_ITEM_GAP + halfHere;
        }
        slots.push({ item, cx: HUD_START_X, cy: y, size: sizeHere });
        prevHalf = halfHere;
    }
    return slots;
}

// 返回被击中的slot（触摸点到图标中心 <= size/2 + 容差）
function hitTest(x: number, y: number): HUDSlot | null {
    const slots = getVisibleSlots();
    for (const slot of slots) {
        const hitR = slot.size / 2 + 6;
        if (Math.hypot(x - slot.cx, y - slot.cy) <= hitR) return slot;
    }
    return null;
}

// ========== 输入接口（供 input.ts 调用） ==========

// 返回 true 表示触摸已被HUD消费，input.ts应跳过后续逻辑
export function handleHUDTouchStart(touchId: number, x: number, y: number): boolean {
    const slot = hitTest(x, y);
    if (!slot) return false;

    // 记录触摸追踪
    activeTouches.set(touchId, {
        touchId,
        itemId: slot.item.id,
        startTime: Date.now(),
        startX: x,
        startY: y,
        longFired: false,
    });

    // 不支持长按的item：touchStart 立刻触发短按
    if (!slot.item.supportsLongPress) {
        fireShortTap(slot);
    }
    return true;
}

export function handleHUDTouchMove(touchId: number, x: number, y: number): boolean {
    const track = activeTouches.get(touchId);
    if (!track) return false;
    // 移动超出容差视为取消长按候选
    const moved = Math.hypot(x - track.startX, y - track.startY);
    if (moved > HUD_TAP_MOVE_TOLERANCE) {
        // 若长按已触发，保持（允许手指在图标上轻微移动），否则直接放弃
        if (!track.longFired) {
            const slot = findSlotById(track.itemId);
            if (slot && slot.item.supportsLongPress) {
                // 取消追踪，拒绝后续判定
                activeTouches.delete(touchId);
                return false;
            }
        }
    }

    // 如果已超过长按阈值还没触发长按，触发长按
    if (!track.longFired) {
        const slot = findSlotById(track.itemId);
        if (slot && slot.item.supportsLongPress) {
            const dt = Date.now() - track.startTime;
            if (dt >= HUD_LONG_PRESS_MS) {
                track.longFired = true;
                if (slot.item.onLongHoldStart) slot.item.onLongHoldStart();
            }
        }
    }
    return true;
}

export function handleHUDTouchEnd(touchId: number, x: number, y: number): boolean {
    void x; void y;
    const track = activeTouches.get(touchId);
    if (!track) return false;
    activeTouches.delete(touchId);

    const slot = findSlotById(track.itemId);
    if (!slot) return true;

    if (track.longFired) {
        // 长按松手
        if (slot.item.onLongHoldEnd) slot.item.onLongHoldEnd();
    } else {
        // 短按（对于支持长按的item，松手时才触发；不支持长按的在start时已经触发）
        if (slot.item.supportsLongPress) {
            fireShortTap(slot);
        }
    }
    return true;
}

function findSlotById(id: string): HUDSlot | null {
    const slots = getVisibleSlots();
    return slots.find(s => s.item.id === id) || null;
}

function fireShortTap(slot: HUDSlot): void {
    // HUD 栏所有图标点击都统一视为"次按钮"（切换/提示类辅助操作）
    playSFX('uiSecondary');
    if (slot.item.onShortTap) slot.item.onShortTap();
    const tipText = slot.item.tipText ? slot.item.tipText() : '';
    if (tipText) {
        currentTip = {
            itemId: slot.item.id,
            text: tipText,
            spawnTime: Date.now(),
            anchorX: slot.cx + slot.size / 2,
            anchorY: slot.cy,
        };
    }
}

// ========== 渲染入口 ==========

// 绘制整个左上角HUD（每帧由迷宫HUD调用）
export function drawHUDTopLeft(time: number): void {
    // 入场动效
    if (hudEntryTimer < HUD_ENTRY_FRAMES) hudEntryTimer++;
    const entry = hudEntryTimer / HUD_ENTRY_FRAMES;
    const ease = 1 - Math.pow(1 - entry, 3);
    const slideX = -50 * (1 - ease);
    const alpha = ease;

    const slots = getVisibleSlots();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(slideX, 0);

    // 先绘制所有图标（不带长按附加面板）
    for (const slot of slots) {
        slot.item.iconDraw(ctx, slot.cx, slot.cy, slot.size, time);
    }

    ctx.restore();

    // 长按中的附加绘制（不受入场alpha影响，全屏叠加）
    for (const slot of slots) {
        const track = [...activeTouches.values()].find(t => t.itemId === slot.item.id && t.longFired);
        if (track && slot.item.longHoldDraw) {
            const dt = Date.now() - track.startTime - HUD_LONG_PRESS_MS;
            const progress = Math.min(1, Math.max(0, dt / 180));
            slot.item.longHoldDraw(ctx, slot.cx, slot.cy, slot.size, progress);
        }
    }

    // Tip 浮窗
    drawTip();
}

function drawTip(): void {
    if (!currentTip.itemId) return;
    const now = Date.now();
    const age = now - currentTip.spawnTime;
    if (age > HUD_TIP_DURATION_MS) {
        currentTip.itemId = null;
        return;
    }
    // 淡入/保持/淡出
    let tipAlpha = 1;
    if (age < HUD_TIP_FADE_MS) {
        tipAlpha = age / HUD_TIP_FADE_MS;
    } else if (age > HUD_TIP_DURATION_MS - HUD_TIP_FADE_MS) {
        tipAlpha = (HUD_TIP_DURATION_MS - age) / HUD_TIP_FADE_MS;
    }
    tipAlpha = Math.max(0, Math.min(1, tipAlpha));

    // 计算面板尺寸（支持多行，用 \n 分割）
    const lines = currentTip.text.split('\n');
    const metrics = measureTipLines(lines);
    const panelW = metrics.width + HUD_TIP_PADDING * 2;
    const panelH = metrics.height + HUD_TIP_PADDING * 2;
    const panelX = currentTip.anchorX + HUD_TIP_OFFSET_X;
    const panelY = currentTip.anchorY - panelH / 2;

    ctx.save();
    ctx.globalAlpha = tipAlpha;
    // 背景
    ctx.fillStyle = 'rgba(8, 20, 35, 0.92)';
    drawRRect(ctx, panelX, panelY, panelW, panelH, 8);
    ctx.fill();
    // 细边
    ctx.strokeStyle = 'rgba(120, 180, 220, 0.35)';
    ctx.lineWidth = 0.6;
    drawRRect(ctx, panelX, panelY, panelW, panelH, 8);
    ctx.stroke();
    // 文字
    ctx.fillStyle = 'rgba(230, 245, 255, 0.96)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '12px Arial';
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], panelX + HUD_TIP_PADDING, panelY + HUD_TIP_PADDING + i * HUD_TIP_LINE_HEIGHT);
    }
    ctx.restore();
}

function measureTipLines(lines: string[]): { width: number, height: number } {
    ctx.save();
    ctx.font = '12px Arial';
    let maxW = 0;
    for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxW) maxW = w;
    }
    ctx.restore();
    return {
        width: Math.min(HUD_TIP_MAX_WIDTH, Math.max(50, maxW)),
        height: lines.length * HUD_TIP_LINE_HEIGHT - (HUD_TIP_LINE_HEIGHT - 12),
    };
}

function drawRRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
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

// ========== 初始化：注册迷宫模式的4个HUD项 ==========

// 在迷宫模式每次进入游戏时调用，确保items已经注册
export function initMazeHUDTopLeft(): void {
    clearHUDItems();

    // 1. 氧气环（短按弹 tip，不支持长按）
    registerHUDItem({
        id: 'oxygen',
        visible: () => true,
        iconDraw: drawOxygenIcon,
        supportsLongPress: false,
        onShortTap: () => { /* 无副作用；只弹tip */ },
        tipText: () => {
            const o2 = Math.ceil(player.o2);
            const o2Max = Math.max(1, Math.round(player.o2Max || 100));
            const tanks = getActiveAirTanks();
            const tankCnt = tanks.length;
            const maze = state.mazeRescue;
            const depth = maze ? Math.max(0, Math.floor(player.y / (maze.mazeTileSize || 40))) : 0;
            const tankLine = tankCnt > 1 ? `\n气瓶：双瓶携带` : (tankCnt === 1 ? `\n气瓶：单瓶` : '');
            return `氧气：${o2}/${o2Max}${tankLine}\n深度：${depth}m`;
        },
    });

    // 2. 深度仪表（显示当前深度 / 装备最大安全深度）
    registerHUDItem({
        id: 'depth',
        visible: () => true,
        iconDraw: drawDepthIcon,
        supportsLongPress: false,
        onShortTap: () => { /* 只弹 tip */ },
        tipText: () => {
            const maze = state.mazeRescue;
            const depth = maze ? Math.max(0, Math.floor(player.y / (maze.mazeTileSize || 120))) : 0;
            const maxAllowed = maze ? ((maze as any).maxDepthAllowed || 30) : 30;
            const overFlag = depth > maxAllowed ? '\n⚠ 已超出潜水衣极限！' : '';
            return `当前深度：${depth}m\n潜水衣极限：${maxAllowed}m${overFlag}`;
        },
    });

    // 2. 手动/自动挡切换（短按切换）
    registerHUDItem({
        id: 'driveMode',
        visible: () => true,
        iconDraw: drawDriveModeIcon,
        supportsLongPress: false,
        onShortTap: () => {
            CONFIG.manualDrive.enabled = !CONFIG.manualDrive.enabled;
        },
        tipText: () => {
            return CONFIG.manualDrive.enabled ? '已切换：手动挡\n搓屏驱动潜水员踢水' : '已切换：自动挡\n摇杆控制移动方向';
        },
    });

    // 3. 全局音频开关（短按切换）
    registerHUDItem({
        id: 'audio',
        visible: () => true,
        iconDraw: drawAudioIconWrapper,
        supportsLongPress: false,
        onShortTap: () => {
            audioToggleMuted();
        },
        tipText: () => {
            return state.audio.muted ? '音频：已静音' : '音频：已开启';
        },
    });

    // 4. 生命探知仪（短按弹tip）
    registerHUDItem({
        id: 'lifeDetector',
        visible: () => {
            const cfg = (CONFIG as any).lifeDetector;
            return !!(cfg && cfg.enabled && cfg.hudVisible);
        },
        iconDraw: drawLifeDetectorIcon,
        supportsLongPress: false,
        onShortTap: () => { /* 只弹tip */ },
        tipText: () => {
            const rt = getLifeDetectorRuntime();
            const maze = state.mazeRescue;
            if (maze && maze.npcRescued) return '生命探知仪\n状态：已完成救援';
            if (!rt.active) return '生命探知仪\n状态：未检测到目标';
            const pct = Math.round(rt.currentIntensity * 100);
            return `生命探知仪\n信号强度：${pct}%\n越近节奏越快`;
        },
    });

    // 5. GM 面板切换（调试工具，放在最后）
    // 旧的屏幕顶部独立 GM 按钮已下线，统一收缩到左上 HUD 栏
    // 方案 A：仅迷宫模式可切 GM 面板，菜单 / 主线 / 竞技场不提供入口
    registerHUDItem({
        id: 'gm',
        visible: () => true,
        iconDraw: drawGMIcon,
        supportsLongPress: false,
        onShortTap: () => {
            toggleGMOpen();
        },
        tipText: () => {
            return isGMOpen() ? 'GM 面板：已打开' : 'GM 面板：已关闭';
        },
    });
}

// ========== 图标绘制函数 ==========

// 氧气环图标：显示氧气百分比的圆环（替代原深度数字，现在只专注氧气视觉）
//
// 双瓶模式：用同心两条环表达
//   - 外圈 = 第一瓶（先被消耗，氧耗时由满 → 空）
//   - 内圈 = 第二瓶（外圈耗光后才开始消耗）
// 单瓶模式：保留原来的单一圆环外观（仅外圈）
function drawOxygenIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, time: number): void {
    const maze = state.mazeRescue;
    // 动画值优先（拾取时平滑上涨）
    const o2DisplayRaw = (maze && maze.oxygenFeedback && typeof maze.oxygenFeedback.o2DisplayAnim === 'number')
        ? maze.oxygenFeedback.o2DisplayAnim
        : player.o2;

    // === 解析当前携带的氧气瓶组合，算出每瓶的剩余比率 ===
    // 规则：瓶 0 先被耗光，再耗瓶 1。
    //   bottleRemaining[i] = clamp(o2 - sumOfPrevCaps, 0, cap[i]) / cap[i]
    //   bottleCap[i] 取自 startO2（airTankS=60 / M=100 / L=150）
    const tanks = getActiveAirTanks();
    const tankCaps: number[] = [];
    for (const id of tanks) {
        if (id === 'airTankL') tankCaps.push(150);
        else if (id === 'airTankM') tankCaps.push(100);
        else tankCaps.push(60);   // S 或未知
    }
    if (tankCaps.length === 0) tankCaps.push(Math.max(1, player.o2Max || 100));
    let totalCap = 0;
    for (const c of tankCaps) totalCap += c;
    if (totalCap < 1) totalCap = 1;

    // 各瓶余量 ratio（0~1）
    let remaining = Math.max(0, o2DisplayRaw);
    const bottleRatios: number[] = [];
    for (const cap of tankCaps) {
        const here = Math.max(0, Math.min(cap, remaining));
        bottleRatios.push(here / cap);
        remaining -= here;
    }
    // 总比率（用于颜色/低氧脉冲判定）
    const o2Ratio = Math.max(0, Math.min(1, o2DisplayRaw / totalCap));

    const ringR = size / 2 - 2;
    const ringW = 3.5;

    // 氧气颜色（按总比率）
    const o2Color = o2Ratio > 0.5 ? 'rgba(80,210,255,0.95)' :
                    o2Ratio > 0.25 ? 'rgba(255,200,80,0.95)' : 'rgba(255,80,80,0.95)';
    const o2ColorDim = o2Ratio > 0.5 ? 'rgba(80,210,255,0.18)' :
                       o2Ratio > 0.25 ? 'rgba(255,200,80,0.18)' : 'rgba(255,80,80,0.18)';

    c.save();

    // 背景圆（磨砂感）
    c.fillStyle = 'rgba(10,22,38,0.55)';
    c.beginPath();
    c.arc(cx, cy, ringR + 3, 0, Math.PI * 2);
    c.fill();

    const start = -Math.PI / 2;
    const drawRing = (radius: number, ratio: number, dim: string, fill: string) => {
        // 暗色轨道
        c.strokeStyle = dim;
        c.lineWidth = ringW;
        c.beginPath();
        c.arc(cx, cy, radius, 0, Math.PI * 2);
        c.stroke();
        // 进度环
        if (ratio > 0.005) {
            c.strokeStyle = fill;
            c.lineWidth = ringW;
            c.lineCap = 'round';
            c.beginPath();
            c.arc(cx, cy, radius, start, start + Math.PI * 2 * ratio);
            c.stroke();
            c.lineCap = 'butt';
        }
    };

    if (bottleRatios.length >= 2) {
        // 双瓶：外圈=瓶 0，内圈=瓶 1（半径再小 5）
        drawRing(ringR, bottleRatios[0], o2ColorDim, o2Color);
        drawRing(ringR - ringW - 1.6, bottleRatios[1], o2ColorDim, o2Color);
    } else {
        drawRing(ringR, bottleRatios[0] || 0, o2ColorDim, o2Color);
    }

    // 撞岩石损失红色弧（按总比率算位置；只画在外圈上，反映"刚损失的总量"）
    const lossT = (maze && maze.oxygenFeedback && maze.oxygenFeedback.o2LossTimer) || 0;
    if (lossT > 0) {
        // o2LossFromRatio / o2LossToRatio 是按 o2Max 归一化（见 OxygenTank.triggerO2LossFlash）
        // 这里只展示在外圈，把总比率范围映射到外圈瓶 0 的弧上
        const cap0 = tankCaps[0];
        const cap0Ratio = cap0 / totalCap;   // 瓶 0 占总容量的比例
        const fromTotal = Math.max(0, Math.min(1, maze!.oxygenFeedback!.o2LossFromRatio));
        const toTotal = Math.max(0, Math.min(1, maze!.oxygenFeedback!.o2LossToRatio));
        // 把"总比率"投影到瓶 0 的弧（瓶 1 的损失我们简单跳过；多数玩家的红条都集中在瓶 0 段）
        const fromRatio = Math.min(1, fromTotal / Math.max(0.0001, cap0Ratio));
        const toRatio = Math.min(1, toTotal / Math.max(0.0001, cap0Ratio));
        if (fromRatio > toRatio + 0.002) {
            const lossStart = start + Math.PI * 2 * toRatio;
            const lossEnd = start + Math.PI * 2 * fromRatio;
            const lossAlpha = lossT * 0.95;
            c.save();
            c.globalAlpha = lossAlpha;
            c.strokeStyle = 'rgba(255, 60, 60, 1)';
            c.lineWidth = ringW + 1.5;
            c.lineCap = 'round';
            c.beginPath();
            c.arc(cx, cy, ringR, lossStart, lossEnd);
            c.stroke();
            c.globalAlpha = lossAlpha * 0.5;
            c.strokeStyle = 'rgba(255, 120, 120, 1)';
            c.lineWidth = ringW + 4;
            c.beginPath();
            c.arc(cx, cy, ringR, lossStart, lossEnd);
            c.stroke();
            c.lineCap = 'butt';
            c.restore();
        }
    }

    // 低氧脉冲（按总比率）
    if (o2Ratio <= 0.25) {
        const pulse = 0.3 + 0.2 * Math.sin(time * 5);
        c.globalAlpha = pulse;
        c.strokeStyle = 'rgba(255,60,60,0.4)';
        c.lineWidth = 7;
        c.beginPath();
        c.arc(cx, cy, ringR + 2, start, start + Math.PI * 2 * o2Ratio);
        c.stroke();
        c.lineWidth = ringW;
        c.globalAlpha = 1;
    }

    // 氧气拾取脉冲
    const pulseT = (maze && maze.oxygenFeedback && maze.oxygenFeedback.o2RingPulse) || 0;
    if (pulseT > 0) {
        const expandR = ringR + 4 + (1 - pulseT) * 22;
        c.globalAlpha = pulseT * 0.9;
        c.strokeStyle = 'rgba(120, 255, 180, 0.85)';
        c.lineWidth = 3 * pulseT + 1;
        c.beginPath();
        c.arc(cx, cy, expandR, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
    }

    // 中心显示"肺"形图标
    drawLungs(c, cx, cy, ringR, o2Ratio);

    c.restore();
}

// ---- 矢量肺图标：两瓣 + 气管 ----
// 规模尺寸：以氧气环内圈半径 R 为参考，肺的最大覆盖半径约 0.78R
// 动画：直接读取 BreathSystem 的肺容积 lungVolume（0~1，0=吐完最小, 1=吸完最大）
//   exhale 阶段：1→0，连续收缩
//   holdEmpty：保持 0，肺图标保持最小（玩家能看到"吐完气后的停顿保持"）
//   inhale 阶段：0→1，连续膨胀
//   holdFull：保持 1，肺图标保持最大（玩家能看到"吸完气后的停顿保持"）
function drawLungs(c: CanvasRenderingContext2D, cx: number, cy: number, ringR: number, o2Ratio: number): void {
    const cfg: any = (CONFIG as any).breath || {};
    // ==== 缩放动画：按肺容积在 exhale 谷值 ~ inhale 峰值之间线性插值 ====
    const lungVolume = Math.max(0, Math.min(1, getLungVolume()));
    const pressure = Math.max(0, Math.min(1, getBreathPressure()));
    const scaleInhale: number = cfg.lungScaleInhale ?? 1.15;
    const scaleExhale: number = cfg.lungScaleExhale ?? 0.85;
    // lungVolume=0 → 吐完最小缩放；lungVolume=1 → 吸完最大缩放
    let scale = scaleExhale + (scaleInhale - scaleExhale) * lungVolume;
    // 急促度越高，呼吸起伏越剧烈，整体缩放幅度再加码 30%
    scale = 1 + (scale - 1) * (1 + pressure * 0.3);
    // phaseAngle/phase 只用于下方气管口气泡判断（exhale 瞬间冒一个白气泡），保持不变
    const phase = getBreathPhase();
    const phaseAngle = getBreathPhaseAngle();
    void phaseAngle;

    // ==== 颜色：按 o2Ratio 分段 ====
    const colorHealthy: string = cfg.lungColorHealthy ?? 'rgba(240,140,150,1)';
    const colorMid: string = cfg.lungColorMid ?? 'rgba(210,120,150,1)';
    const colorLow: string = cfg.lungColorLow ?? 'rgba(150,100,130,1)';
    const colorCritical: string = cfg.lungColorCritical ?? 'rgba(120,140,160,1)';
    let lungColor: string;
    if (o2Ratio > 0.5) lungColor = colorHealthy;
    else if (o2Ratio > 0.25) lungColor = colorMid;
    else if (o2Ratio > 0.1) lungColor = colorLow;
    else lungColor = colorCritical;

    // 基础尺寸：覆盖约环内径的 80%
    const R = ringR * 0.78;

    c.save();
    c.translate(cx, cy);
    c.scale(scale, scale);

    // ==== 气管（中央竖线 + 主支气管分叉）====
    const tracheaColor = 'rgba(60, 50, 60, 0.75)';
    c.strokeStyle = tracheaColor;
    c.lineWidth = Math.max(1, R * 0.12);
    c.lineCap = 'round';
    c.beginPath();
    // 气管顶部到分叉点
    c.moveTo(0, -R * 0.85);
    c.lineTo(0, -R * 0.15);
    c.stroke();
    // 左右主支气管（短段斜向外）
    c.lineWidth = Math.max(0.8, R * 0.09);
    c.beginPath();
    c.moveTo(0, -R * 0.15);
    c.lineTo(-R * 0.35, R * 0.05);
    c.moveTo(0, -R * 0.15);
    c.lineTo(R * 0.35, R * 0.05);
    c.stroke();

    // ==== 肺叶：两瓣对称形（左右）====
    // 每瓣用贝塞尔曲线勾一个"豆形"，外侧圆弧、内侧平直
    const drawLobe = (sign: number) => {
        // sign=-1 画左肺，sign=+1 画右肺
        c.save();
        c.scale(sign, 1);
        // 描边稍暗一点
        c.strokeStyle = 'rgba(90, 40, 55, 0.85)';
        c.lineWidth = Math.max(1, R * 0.08);
        c.fillStyle = lungColor;
        c.beginPath();
        // 从支气管接入点开始
        c.moveTo(R * 0.15, -R * 0.05);
        // 上顶：向外向上的圆弧（肺尖）
        c.bezierCurveTo(R * 0.55, -R * 0.55, R * 0.95, -R * 0.15, R * 0.88, R * 0.25);
        // 外下：外侧向下扩
        c.bezierCurveTo(R * 0.85, R * 0.55, R * 0.55, R * 0.88, R * 0.30, R * 0.80);
        // 底内：往里收回到内侧
        c.bezierCurveTo(R * 0.10, R * 0.75, R * 0.05, R * 0.55, R * 0.10, R * 0.30);
        // 内侧回到起点（直上）
        c.lineTo(R * 0.15, -R * 0.05);
        c.closePath();
        c.fill();
        c.stroke();

        // 肺纹（内部淡色曲线，增加识别感）
        c.strokeStyle = 'rgba(255, 210, 220, 0.35)';
        c.lineWidth = Math.max(0.6, R * 0.04);
        c.beginPath();
        c.moveTo(R * 0.30, R * 0.10);
        c.bezierCurveTo(R * 0.45, R * 0.25, R * 0.55, R * 0.40, R * 0.50, R * 0.60);
        c.stroke();
        c.restore();
    };

    drawLobe(-1);
    drawLobe(+1);

    // ==== 吐气阶段从气管顶部冒一个小白气泡（表示"正在吐气"）====
    // exhale 阶段 lungVolume 从 1 → 0，用 (1 - lungVolume) 作为吐气进度 ep
    // ep > 0.15 时才画（吐气刚开始的 15% 时间不画，避免一切换就弹）
    if (phase === 'exhale') {
        const ep = 1 - lungVolume;  // 吐气进度 0~1
        if (ep > 0.15) {
            const puffAlpha = Math.min(1, ep * 1.4);
            const puffR = R * 0.12 * (0.6 + ep * 0.8);
            const puffY = -R * 0.95 - ep * R * 0.3;
            c.fillStyle = `rgba(220, 240, 255, ${(0.65 * puffAlpha).toFixed(3)})`;
            c.beginPath();
            c.arc(0, puffY, puffR, 0, Math.PI * 2);
            c.fill();
        }
    }

    c.lineCap = 'butt';
    c.restore();
}

// 深度仪表图标（直观的"垂直水深尺 + 游标 + 大数字"）
//
// 视觉语义：
//   左半 = 垂直水深尺（顶部 0m / 底部 = 安全极限），尺子上有几条横向刻度线
//   右半 = 一个明显的三角游标，沿尺子高度移动表示当前深度比率
//   底部 = 大字号当前深度数字（比如 "12m"）
//   超过极限：尺子整体红光 + 三角游标变成警告"!"
function drawDepthIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, _time: number): void {
    const maze = state.mazeRescue;
    const tile = maze ? (maze.mazeTileSize || 120) : 120;
    const curDepth = maze ? Math.max(0, Math.floor(player.y / tile)) : 0;
    const maxAllowed = maze ? ((maze as any).maxDepthAllowed || 30) : 30;
    // 比率（用 1.0 表示到达极限；可超过 1）
    const ratio = curDepth / Math.max(1, maxAllowed);
    const overLimit = curDepth > maxAllowed;
    const r = size / 2 - 2;

    c.save();

    // === 底圆（仪表盘背景，统一其他 HUD 风格）===
    const baseColor = overLimit
        ? 'rgba(60, 10, 10, 0.95)'
        : (ratio > 0.85 ? 'rgba(40, 30, 15, 0.92)' : 'rgba(8, 22, 36, 0.92)');
    c.fillStyle = baseColor;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();

    // 描边（超限脉冲红）
    if (overLimit) {
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 150);
        c.strokeStyle = `rgba(255, 90, 90, ${pulse})`;
        c.lineWidth = 1.8;
    } else {
        c.strokeStyle = 'rgba(140, 200, 240, 0.55)';
        c.lineWidth = 1.2;
    }
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();

    // === 垂直水深尺：放在图标左半部分 ===
    // 把 ratio 钳到 [0, 1.15]：超过 1 时游标会冒出极限红线一截，强调"超深"
    const ratioVis = Math.max(0, Math.min(1.15, ratio));
    const scaleX = cx - r * 0.20;          // 尺子的中心 X
    const scaleTop = cy - r * 0.62;        // 尺子顶（0m）
    const scaleH = r * 1.18;               // 尺子高度（对应 0~maxAllowed）
    const scaleW = 4;                      // 尺子主轴宽度

    // 主轴
    c.strokeStyle = overLimit ? 'rgba(255, 130, 130, 0.85)' : 'rgba(160, 210, 240, 0.7)';
    c.lineWidth = scaleW;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(scaleX, scaleTop);
    c.lineTo(scaleX, scaleTop + scaleH);
    c.stroke();
    c.lineCap = 'butt';

    // 刻度线（4 等分：0% / 33% / 66% / 100%）
    const ticks = [0, 1 / 3, 2 / 3, 1];
    for (let i = 0; i < ticks.length; i++) {
        const ty = scaleTop + scaleH * ticks[i];
        const isLimit = ticks[i] === 1;
        c.strokeStyle = isLimit
            ? (overLimit ? 'rgba(255, 90, 90, 1)' : 'rgba(255, 140, 90, 0.9)')
            : 'rgba(180, 220, 240, 0.55)';
        c.lineWidth = isLimit ? 1.6 : 1;
        const tickW = isLimit ? 6 : 3;
        c.beginPath();
        c.moveTo(scaleX - tickW, ty);
        c.lineTo(scaleX + tickW, ty);
        c.stroke();
    }

    // === 三角游标（指示当前深度位置）===
    // 游标从尺子右侧伸出小三角，y 随 ratioVis 移动
    const cursorY = scaleTop + scaleH * Math.min(1.05, ratioVis);
    const cursorX = scaleX + 5;
    const cursorW = 9;
    const cursorH = 7;
    if (overLimit) {
        // 超限：游标变成红色警示三角 + 闪烁
        const blink = 0.6 + 0.4 * Math.sin(Date.now() / 90);
        c.fillStyle = `rgba(255, 90, 90, ${blink})`;
    } else if (ratio > 0.85) {
        c.fillStyle = 'rgba(255, 200, 100, 0.95)';
    } else {
        c.fillStyle = 'rgba(120, 220, 255, 0.95)';
    }
    c.beginPath();
    c.moveTo(cursorX, cursorY);                       // 三角尖（指向尺子）
    c.lineTo(cursorX + cursorW, cursorY - cursorH / 2);
    c.lineTo(cursorX + cursorW, cursorY + cursorH / 2);
    c.closePath();
    c.fill();
    // 游标描边（增加可读性）
    c.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    c.lineWidth = 0.8;
    c.stroke();

    // === 右上角：极限数字（小字，灰色）===
    c.fillStyle = overLimit ? 'rgba(255, 180, 180, 0.95)' : 'rgba(200, 230, 245, 0.7)';
    c.font = 'bold 7px Arial';
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillText(maxAllowed + 'm', cx + r * 0.85, cy - r * 0.55);
    // 顶部 0m 标
    c.fillStyle = 'rgba(200, 230, 245, 0.55)';
    c.fillText('0m', cx + r * 0.85, scaleTop + 1);

    // === 右半中部：当前深度大数字（视觉重点）===
    c.fillStyle = overLimit ? 'rgba(255, 200, 200, 1)' : 'rgba(230, 245, 255, 0.98)';
    c.font = 'bold 12px Arial';
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillText(String(curDepth), cx + r * 0.92, cy + 2);
    c.font = 'bold 7px Arial';
    c.fillStyle = 'rgba(180, 220, 240, 0.75)';
    c.fillText('m', cx + r * 0.95, cy + 11);

    // 超限时左下角追加警示符
    if (overLimit) {
        const blink = 0.5 + 0.5 * Math.sin(Date.now() / 100);
        c.fillStyle = `rgba(255, 90, 90, ${blink})`;
        c.font = 'bold 11px Arial';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('!', cx - r * 0.7, cy + r * 0.55);
    }

    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.restore();
}

// 手动/自动挡图标：圆形背景 + M/A 字母
function drawDriveModeIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, _time: number): void {
    const isManual = CONFIG.manualDrive.enabled;
    const r = size / 2 - 2;

    c.save();
    // 底圆（按状态着色）
    c.fillStyle = isManual ? 'rgba(240,120,50,0.78)' : 'rgba(60,200,120,0.68)';
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    // 外框
    c.strokeStyle = isManual ? 'rgba(255,160,80,0.55)' : 'rgba(80,220,140,0.45)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
    // 字母
    c.fillStyle = 'rgba(255,255,255,0.96)';
    c.font = 'bold 16px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(isManual ? 'M' : 'A', cx, cy + 1);
    c.textBaseline = 'alphabetic';
    c.restore();
}

// 音频开关图标：调用 RenderAudioToggle 里已有的音符绘制
function drawAudioIconWrapper(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, _time: number): void {
    drawAudioIcon(c, cx, cy, size);
}

// 生命探知仪图标：同心圆脉冲波纹设计
// 视觉语义：仪表盘底 + 中心信号源点 + 每次"嘀"响时从中心向外扩散一圈波纹
// 波纹队列化：每次检测到脉冲触发（pulseT 从低跳到 1 的上升沿），push 一个新波纹
// 波纹自身会随时间扩张半径 + 淡出透明度，淡出后自动从队列移除
//
// 为什么这样设计：
// - 信号越近，"嘀"响越密集 → 波纹队列里同时存在的波纹也越多 → 视觉上环越密
// - 静默时只有中心一个暗点，画面非常干净
// - 没有任何持续旋转的元素，不会产生"狂转"的视觉噪音

interface DetectorWave {
    birth: number;   // 出生时间戳（ms）
    life: number;    // 波纹持续时长（ms）
    strength: number; // 诞生时的强度（0~1），决定初始不透明度
}
const detectorWaves: DetectorWave[] = [];
let lastDetectorPulse = 0;  // 上一帧的 pulseT，用于检测上升沿

function drawLifeDetectorIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, _time: number): void {
    const cfg = (CONFIG as any).lifeDetector;
    const rt = getLifeDetectorRuntime();
    const r = size / 2 - 2;
    const now = Date.now();

    // === 波纹触发检测（上升沿：上一帧<0.5 本帧>=0.95 视为一次新脉冲） ===
    if (rt.active && lastDetectorPulse < 0.5 && rt.pulseT >= 0.95) {
        // 波纹寿命：信号越强，扩散越快（寿命越短）；保证密集脉冲时视觉追得上
        const life = 360 + (1 - rt.currentIntensity) * 420;  // 360ms ~ 780ms
        detectorWaves.push({ birth: now, life, strength: 0.5 + rt.currentIntensity * 0.5 });
        // 限制同时存在的波纹数量，防止极近时波纹堆积过多
        if (detectorWaves.length > 6) detectorWaves.shift();
    }
    lastDetectorPulse = rt.pulseT;

    // 清理已淡出的波纹
    for (let i = detectorWaves.length - 1; i >= 0; i--) {
        if (now - detectorWaves[i].birth > detectorWaves[i].life) {
            detectorWaves.splice(i, 1);
        }
    }

    c.save();

    // === 底圆（深色仪表盘） ===
    const grd = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, 'rgba(20, 50, 60, 0.92)');
    grd.addColorStop(1, 'rgba(5, 15, 22, 0.88)');
    c.fillStyle = grd;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();

    // === 外环（仪表边框） ===
    c.strokeStyle = 'rgba(120, 200, 220, 0.6)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();

    // === 刻度点（12 个小圆点替代原来的刻度线，更像仪表表盘） ===
    c.fillStyle = 'rgba(80, 160, 180, 0.45)';
    for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        const px = cx + Math.cos(a) * (r - 3);
        const py = cy + Math.sin(a) * (r - 3);
        c.beginPath();
        c.arc(px, py, 0.7, 0, Math.PI * 2);
        c.fill();
    }

    // === 同心圆波纹（核心视觉） ===
    // 裁剪在仪表内部，防止波纹画到外环外
    c.save();
    c.beginPath();
    c.arc(cx, cy, r - 1, 0, Math.PI * 2);
    c.clip();

    const maxWaveR = r - 2;
    for (const w of detectorWaves) {
        const age = now - w.birth;
        const t = Math.min(1, Math.max(0, age / w.life));  // 0=刚诞生  1=即将消失
        const waveR = 2 + t * (maxWaveR - 2);
        // 透明度：先涨后落（正弦峰），但总体受 strength 控制
        const fade = Math.sin(t * Math.PI) * w.strength;
        if (fade <= 0.02) continue;
        // 波纹主体（亮青绿色细线）
        c.strokeStyle = `rgba(160, 255, 220, ${(0.75 * fade).toFixed(3)})`;
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(cx, cy, waveR, 0, Math.PI * 2);
        c.stroke();
        // 内部柔和辉光（让波纹更像"有厚度的光环"）
        c.strokeStyle = `rgba(140, 230, 200, ${(0.25 * fade).toFixed(3)})`;
        c.lineWidth = 2.6;
        c.stroke();
    }
    c.restore();

    // === 中心信号源 ===
    // 激活时亮青绿色；脉冲瞬间放大；静默时暗蓝灰色
    const pulseT = Math.max(0, Math.min(1, rt.pulseT));
    if (rt.active) {
        const coreR = 2.2 + pulseT * 2.4 + rt.currentIntensity * 1.4;
        // 辉光
        const coreGlow = c.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
        coreGlow.addColorStop(0, `rgba(200, 255, 240, ${(0.55 * (0.4 + 0.6 * pulseT)).toFixed(3)})`);
        coreGlow.addColorStop(1, 'rgba(200, 255, 240, 0)');
        c.fillStyle = coreGlow;
        c.beginPath();
        c.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2);
        c.fill();
        // 核心点
        c.fillStyle = cfg && cfg.hudColorPulse ? cfg.hudColorPulse : 'rgba(200, 255, 240, 1.0)';
        c.beginPath();
        c.arc(cx, cy, coreR, 0, Math.PI * 2);
        c.fill();
    } else {
        // 静默：中心一个暗点 + 一圈静态瞄准圈，暗示仪器在待机
        c.strokeStyle = 'rgba(80, 140, 160, 0.35)';
        c.lineWidth = 0.6;
        c.beginPath();
        c.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = 'rgba(100, 170, 190, 0.45)';
        c.beginPath();
        c.arc(cx, cy, 1.6, 0, Math.PI * 2);
        c.fill();
    }

    c.restore();
}

// GM 面板切换图标：橙色齿轮样式，打开时变亮并有轻微旋转
// 旧的 GM 按钮是屏幕顶部中央的 "GM" 文字圆；迁入 HUD 栏后换一个工具型图标，避免和其他 HUD 项冲突
function drawGMIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, time: number): void {
    const open = isGMOpen();
    const r = size / 2 - 2;

    c.save();

    // 底圆（打开时橙色，关闭时暗灰）
    c.fillStyle = open ? 'rgba(255, 136, 0, 0.65)' : 'rgba(60, 60, 60, 0.55)';
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();

    // 外框
    c.strokeStyle = open ? 'rgba(255, 180, 80, 0.7)' : 'rgba(180, 180, 180, 0.4)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();

    // 齿轮主体
    c.save();
    c.translate(cx, cy);
    // 打开时缓慢旋转
    const rot = open ? (time * 0.4) : 0;
    c.rotate(rot);

    const teeth = 8;
    const outerR = r * 0.70;
    const innerR = r * 0.50;
    const toothDepth = r * 0.16;

    c.fillStyle = open ? 'rgba(255, 255, 255, 0.95)' : 'rgba(200, 200, 200, 0.85)';
    c.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rad = i % 2 === 0 ? outerR + toothDepth : outerR;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();

    // 中心孔
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(0, 0, innerR * 0.55, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';

    c.restore();

    // 打开时底部显示 "ON" 小字
    if (open) {
        c.fillStyle = 'rgba(255, 255, 255, 0.85)';
        c.font = 'bold 7px Arial';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('ON', cx, cy + r * 0.78);
    }

    c.restore();
}