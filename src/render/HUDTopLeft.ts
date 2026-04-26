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

// ========== 布局常量 ==========
// 起点 X/Y，每项尺寸、间距（垂直排列）
const HUD_START_X = 46;         // 所有图标的中心X（左侧留足边距）
const HUD_START_Y = 48;         // 第一个图标中心Y
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
    let y = HUD_START_Y;
    for (const item of hudItems) {
        if (item.visible && !item.visible()) continue;
        slots.push({ item, cx: HUD_START_X, cy: y, size: HUD_ITEM_SIZE });
        y += HUD_ITEM_SIZE + HUD_ITEM_GAP;
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

    // 1. 氧气环（支持长按展开详情）
    registerHUDItem({
        id: 'oxygen',
        visible: () => true,
        iconDraw: drawOxygenIcon,
        supportsLongPress: true,
        onShortTap: () => { /* 无副作用；只弹tip */ },
        tipText: () => {
            const o2 = Math.ceil(player.o2);
            const maze = state.mazeRescue;
            const depth = maze ? Math.max(0, Math.floor(player.y / (maze.mazeTileSize || 40))) : 0;
            return `氧气：${o2}%\n深度：${depth}m\n长按可展开详情`;
        },
        onLongHoldStart: () => {
            if (state.mazeRescue) state.mazeRescue._hudDetailHolding = true;
        },
        onLongHoldEnd: () => {
            if (state.mazeRescue) state.mazeRescue._hudDetailHolding = false;
        },
        longHoldDraw: drawOxygenDetailPanel,
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
}

// ========== 图标绘制函数 ==========

// 氧气环图标：显示氧气百分比的圆环（替代原深度数字，现在只专注氧气视觉）
function drawOxygenIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, time: number): void {
    const maze = state.mazeRescue;
    // 动画值优先（拾取时平滑上涨）
    const o2DisplayRaw = (maze && maze.oxygenFeedback && typeof maze.oxygenFeedback.o2DisplayAnim === 'number')
        ? maze.oxygenFeedback.o2DisplayAnim
        : player.o2;
    const o2Ratio = Math.max(0, Math.min(1, o2DisplayRaw / 100));

    const ringR = size / 2 - 2;
    const ringW = 3.5;

    // 氧气颜色
    const o2Color = o2Ratio > 0.5 ? 'rgba(80,210,255,0.95)' :
                    o2Ratio > 0.25 ? 'rgba(255,200,80,0.95)' : 'rgba(255,80,80,0.95)';
    const o2ColorDim = o2Ratio > 0.5 ? 'rgba(80,210,255,0.18)' :
                       o2Ratio > 0.25 ? 'rgba(255,200,80,0.18)' : 'rgba(255,80,80,0.18)';

    c.save();

    // 背景圆（磨砂感，统一所有图标的底）
    c.fillStyle = 'rgba(10,22,38,0.55)';
    c.beginPath();
    c.arc(cx, cy, ringR + 3, 0, Math.PI * 2);
    c.fill();

    // 暗色轨道
    c.strokeStyle = o2ColorDim;
    c.lineWidth = ringW;
    c.beginPath();
    c.arc(cx, cy, ringR, 0, Math.PI * 2);
    c.stroke();

    // 氧气进度环（从顶部顺时针）
    c.strokeStyle = o2Color;
    c.lineWidth = ringW;
    c.lineCap = 'round';
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * o2Ratio;
    if (o2Ratio > 0.005) {
        c.beginPath();
        c.arc(cx, cy, ringR, start, end);
        c.stroke();
    }
    c.lineCap = 'butt';

    // 低氧脉冲
    if (o2Ratio <= 0.25) {
        const pulse = 0.3 + 0.2 * Math.sin(time * 5);
        c.globalAlpha = pulse;
        c.strokeStyle = 'rgba(255,60,60,0.4)';
        c.lineWidth = 7;
        c.beginPath();
        c.arc(cx, cy, ringR + 2, start, end);
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

    // 中心小液滴符号（代替数字显示，更简洁）
    // 一个小水滴形状，颜色跟随氧气状态
    c.fillStyle = o2Color;
    c.beginPath();
    const dropW = 5, dropH = 8;
    c.moveTo(cx, cy - dropH);
    c.bezierCurveTo(cx - dropW, cy - dropH / 3, cx - dropW, cy + dropH / 2, cx, cy + dropH / 2);
    c.bezierCurveTo(cx + dropW, cy + dropH / 2, cx + dropW, cy - dropH / 3, cx, cy - dropH);
    c.closePath();
    c.fill();

    c.restore();
}

// 氧气环长按时展开的详情面板（和原实现保持语义一致：显示氧气百分比/深度/操控模式）
function drawOxygenDetailPanel(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, progress: number): void {
    const maze = state.mazeRescue;
    if (!maze) return;
    const depth = Math.max(0, Math.floor(player.y / (maze.mazeTileSize || 40)));
    const ease = progress * progress * (3 - 2 * progress);
    const panelW = 120 * ease;
    const panelH = 74 * ease;
    const panelX = cx + size / 2 + 6;
    const panelY = cy - panelH / 2;

    c.save();
    c.globalAlpha = 0.88 * ease;
    c.fillStyle = 'rgba(8,20,35,0.88)';
    drawRRect(c, panelX, panelY, panelW, panelH, 8 * ease);
    c.fill();
    c.strokeStyle = 'rgba(80,160,220,0.22)';
    c.lineWidth = 0.6;
    drawRRect(c, panelX, panelY, panelW, panelH, 8 * ease);
    c.stroke();

    if (ease > 0.5) {
        const contentAlpha = (ease - 0.5) * 2;
        c.globalAlpha = 0.92 * contentAlpha;
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
        const o2 = Math.ceil(player.o2);
        const o2Color = o2 > 50 ? 'rgba(80,210,255,0.95)' : o2 > 25 ? 'rgba(255,200,80,0.95)' : 'rgba(255,80,80,0.95)';
        c.fillStyle = o2Color;
        c.font = 'bold 11px Arial';
        c.fillText('O₂', panelX + 8, panelY + 18);
        c.fillStyle = 'rgba(220,240,255,0.9)';
        c.font = '11px Arial';
        c.fillText(`${o2}%`, panelX + 30, panelY + 18);

        c.fillStyle = 'rgba(140,190,220,0.75)';
        c.font = 'bold 11px Arial';
        c.fillText('深度', panelX + 8, panelY + 36);
        c.fillStyle = 'rgba(220,240,255,0.9)';
        c.font = '11px Arial';
        c.fillText(`${depth}m`, panelX + 38, panelY + 36);

        const isManual = CONFIG.manualDrive.enabled;
        c.fillStyle = 'rgba(140,190,220,0.75)';
        c.font = 'bold 11px Arial';
        c.fillText('操控', panelX + 8, panelY + 54);
        c.fillStyle = isManual ? 'rgba(80,255,200,0.95)' : 'rgba(200,200,220,0.9)';
        c.font = '11px Arial';
        c.fillText(isManual ? '手动' : '自动', panelX + 38, panelY + 54);
    }
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

// 生命探知仪图标：重新设计视觉 —— 像潜艇声纳：底圆 + 扇形扫描臂 + 脉冲波纹
// 当有目标时扫描臂顺时针旋转；脉冲强度驱动波纹扩散
function drawLifeDetectorIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, time: number): void {
    const cfg = (CONFIG as any).lifeDetector;
    const rt = getLifeDetectorRuntime();
    const r = size / 2 - 2;

    c.save();

    // 底圆（深色仪表盘感）
    const grd = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, 'rgba(20, 50, 60, 0.9)');
    grd.addColorStop(1, 'rgba(5, 15, 22, 0.85)');
    c.fillStyle = grd;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();

    // 外环（仪表边框）
    c.strokeStyle = 'rgba(120, 200, 220, 0.6)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();

    // 内部刻度线（仪表感）
    c.strokeStyle = 'rgba(80, 160, 180, 0.35)';
    c.lineWidth = 0.6;
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
        c.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
        c.stroke();
    }

    // 内圆（刻度盘面，有目标时脉冲放大）
    const pulseT = Math.max(0, Math.min(1, rt.pulseT));
    const innerR = r * 0.55 + pulseT * 3;
    c.strokeStyle = 'rgba(120, 200, 220, 0.3)';
    c.lineWidth = 0.6;
    c.beginPath();
    c.arc(cx, cy, innerR, 0, Math.PI * 2);
    c.stroke();

    // 如果探知仪激活：绘制旋转扫描臂 + 脉冲波纹
    if (rt.active) {
        // 扫描臂：旋转速度与信号强度正相关
        const sweepSpeed = 1.0 + rt.currentIntensity * 3.0;
        const sweepAngle = (time * sweepSpeed) % (Math.PI * 2);

        // 扫描扇（渐变尾巴）
        const sweepGrd = c.createRadialGradient(cx, cy, 0, cx, cy, r - 2);
        sweepGrd.addColorStop(0, 'rgba(150, 255, 210, 0.0)');
        sweepGrd.addColorStop(1, 'rgba(150, 255, 210, 0.35)');
        c.fillStyle = sweepGrd;
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, r - 2, sweepAngle - Math.PI / 3, sweepAngle);
        c.closePath();
        c.fill();

        // 扫描臂（亮线）
        c.strokeStyle = 'rgba(180, 255, 220, 0.9)';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(sweepAngle) * (r - 2), cy + Math.sin(sweepAngle) * (r - 2));
        c.stroke();

        // 目标光点（随脉冲闪烁，位于信号强度对应的半径处）
        if (pulseT > 0.05) {
            const blipR = (r - 4) * rt.currentIntensity;
            const blipAngle = sweepAngle - 0.2;
            const blipX = cx + Math.cos(blipAngle) * blipR;
            const blipY = cy + Math.sin(blipAngle) * blipR;
            // 发光晕
            const glowR = 4 + pulseT * 4;
            const blipGlow = c.createRadialGradient(blipX, blipY, 0, blipX, blipY, glowR);
            blipGlow.addColorStop(0, `rgba(200,255,240,${0.6 * pulseT})`);
            blipGlow.addColorStop(1, 'rgba(200,255,240,0)');
            c.fillStyle = blipGlow;
            c.beginPath();
            c.arc(blipX, blipY, glowR, 0, Math.PI * 2);
            c.fill();
            // 光点
            c.fillStyle = cfg.hudColorPulse || 'rgba(200, 255, 240, 1.0)';
            c.beginPath();
            c.arc(blipX, blipY, 1.6 + pulseT * 1.4, 0, Math.PI * 2);
            c.fill();
        }

        // 脉冲扩散波纹（从中心向外，每次播音触发）
        if (pulseT > 0.05) {
            const waveR = innerR + (1 - pulseT) * (r - innerR - 2);
            c.strokeStyle = `rgba(150, 255, 210, ${0.6 * pulseT})`;
            c.lineWidth = 1.2;
            c.beginPath();
            c.arc(cx, cy, waveR, 0, Math.PI * 2);
            c.stroke();
        }
    } else {
        // 静默状态：一个暗色十字瞄准线
        c.strokeStyle = 'rgba(80, 140, 160, 0.4)';
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(cx - r + 4, cy);
        c.lineTo(cx + r - 4, cy);
        c.moveTo(cx, cy - r + 4);
        c.lineTo(cx, cy + r - 4);
        c.stroke();
    }

    c.restore();
}
