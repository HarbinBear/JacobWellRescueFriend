import { activeWorld, depthMeters } from '../world/continuous/Geometry';
// 原生 HUD：横屏贴顶横排，竖屏贴左竖列；绘制与触摸共用 UILayout。
// 图标视觉尺寸与 44px 触摸间距分开；切屏统一释放长按副作用。
import { CONFIG } from '../core/config';
import { getUILayout } from '../core/UILayout';
import { drawFlashlightIcon } from './RenderFlashlight';
import { state, player } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { drawTapeDeck, drawTapeSleeve, cutPanel, drawCutPanelProgress, TAPE } from './TapeDeckVisual';
import { getRescueTapeVisual } from './RescueTape';
import { getTapeLoadingLabel, retryTapeLoading } from './TapeEntry';
import { toggleMuted as audioToggleMuted } from './RenderAudioToggle';
import { toggleGMOpen, isGMOpen } from '../gm/GMPanel';
import { getBreathPhaseAngle, getBreathPhase, getBreathPressure, getLungVolume } from '../logic/BreathSystem';
import { playSFX } from '../audio/AudioManager';
import { getEquipmentEffects } from '../extraction/core/ExtractionRegistry';
import { getActiveAirTanks } from '../extraction/logic/Loadout';
import {
    getDecoRuntime, getDecoLevel, getCurrentStopInfo, isDecompressionRequired,
    isDecoLockActive,
    setDecoBoost, getCurrentDepthMeters,
} from '../logic/DecompressionSystem';

const HUD_TIP_OFFSET_X = 8;     // tip面板相对图标右侧的X偏移
const HUD_TIP_MAX_WIDTH = 220;
const HUD_TIP_PADDING = 10;
const HUD_TIP_LINE_HEIGHT = 16;
const HUD_TIP_DURATION_MS = 2000;  // tip显示时长
const HUD_TIP_FADE_MS = 320;       // tip淡入淡出时长
const HUD_LONG_PRESS_MS = 280;     // 长按判定阈值
const HUD_TAP_MOVE_TOLERANCE = 10; // 点击手势允许的位移容差


export interface HUDItem {
    id: string;                  // 唯一ID
    visible?: () => boolean;     // 是否可见（默认true）
    iconDraw: (ctx2: CanvasRenderingContext2D, cx: number, cy: number, size: number, time: number) => void;
    onShortTap?: () => void;
    onPressStart?: () => void;
    onPressEnd?: () => void;
    tipText?: () => string;
    supportsLongPress?: boolean;
    onLongHoldStart?: () => void;
    onLongHoldEnd?: () => void;
    longHoldDraw?: (ctx2: CanvasRenderingContext2D, cx: number, cy: number, size: number, progress: number) => void;
}

interface TipState {
    itemId: string | null;
    text: string;
    spawnTime: number;       // 触发时间（ms）
    anchorX: number;
    anchorY: number;
}

interface HUDTouchTrack {
    touchId: number;
    itemId: string;
    startTime: number;
    startX: number;
    startY: number;
    longFired: boolean;      // 是否已触发长按
}


const hudItems: HUDItem[] = [];
const activeTouches: Map<number, HUDTouchTrack> = new Map();
let currentTip: TipState = { itemId: null, text: '', spawnTime: 0, anchorX: 0, anchorY: 0 };
let hudEntryTimer = 0;
const HUD_ENTRY_FRAMES = 40;


export function registerHUDItem(item: HUDItem): void {
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


interface HUDSlot {
    item: HUDItem;
    cx: number;
    cy: number;
    size: number;
}

function getVisibleSlots(): HUDSlot[] {
    const slots: HUDSlot[] = [], L = getUILayout();
    const positions = { oxygen: L.oxygen, depth: L.depth, deco: L.deco,
        lifeDetector: L.tape, retreat: L.retreat, gm: L.settings, flashlight: L.flashlight };
    for (const item of hudItems) {
        if (item.visible && !item.visible()) continue;
        const p = positions[item.id];
        if (p) slots.push({ item, cx: p.x, cy: p.y, size: p.size });
    }
    return slots;
}

function hitTest(x: number, y: number): HUDSlot | null {
    const slots = getVisibleSlots();
    for (const slot of slots) {
        const hitR = Math.max(22, slot.size / 2);
        if (Math.hypot(x - slot.cx, y - slot.cy) <= hitR) return slot;
    }
    return null;
}


export function cancelHUDTouches(): void {
    for (const track of activeTouches.values()) {
        const item = hudItems.find(i => i.id === track.itemId);
        if (item?.onPressEnd) item.onPressEnd();
        if (track.longFired && item?.onLongHoldEnd) item.onLongHoldEnd();
    }
    activeTouches.clear();
    currentTip.itemId = null;
}

export function handleHUDTouchStart(touchId: number, x: number, y: number): boolean {
    const slot = hitTest(x, y);
    if (!slot) return false;

    activeTouches.set(touchId, {
        touchId,
        itemId: slot.item.id,
        startTime: Date.now(),
        startX: x,
        startY: y,
        longFired: false,
    });
    if (slot.item.onPressStart) slot.item.onPressStart();

    if (!slot.item.supportsLongPress) {
        fireShortTap(slot);
    }
    return true;
}

export function handleHUDTouchMove(touchId: number, x: number, y: number): boolean {
    const track = activeTouches.get(touchId);
    if (!track) return false;
    const pressedSlot = findSlotById(track.itemId);
    if (pressedSlot?.item.onPressEnd && Math.hypot(x - pressedSlot.cx, y - pressedSlot.cy) > pressedSlot.size / 2 + 10) {
        pressedSlot.item.onPressEnd(); activeTouches.delete(touchId); return true;
    }
    const moved = Math.hypot(x - track.startX, y - track.startY);
    if (moved > HUD_TAP_MOVE_TOLERANCE) {
        if (!track.longFired) {
            const slot = findSlotById(track.itemId);
            if (slot && slot.item.supportsLongPress) {
                if (slot.item.onPressEnd) slot.item.onPressEnd();
                activeTouches.delete(touchId);
                return false;
            }
        }
    }

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
    if (slot.item.onPressEnd) slot.item.onPressEnd();

    if (track.longFired) {
        if (slot.item.onLongHoldEnd) slot.item.onLongHoldEnd();
    } else {
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


export function drawHUDTopLeft(time: number): void {
    for (const track of activeTouches.values()) {
        const slot = findSlotById(track.itemId);
        if (!track.longFired && slot && slot.item.supportsLongPress && Date.now() - track.startTime >= HUD_LONG_PRESS_MS) {
            track.longFired = true;
            currentTip.itemId = null;
            if (slot.item.onLongHoldStart) slot.item.onLongHoldStart();
        }
    }
    if (hudEntryTimer < HUD_ENTRY_FRAMES) hudEntryTimer++;
    const entry = hudEntryTimer / HUD_ENTRY_FRAMES;
    const ease = 1 - Math.pow(1 - entry, 3);
    const slideX = -50 * (1 - ease);
    const alpha = ease;

    const slots = getVisibleSlots();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(slideX, 0);

    for (const slot of slots) {
        slot.item.iconDraw(ctx, slot.cx, slot.cy, slot.size, time);
    }

    ctx.restore();

    for (const slot of slots) {
        const track = [...activeTouches.values()].find(t => t.itemId === slot.item.id && t.longFired);
        if (track && slot.item.longHoldDraw) {
            const dt = Date.now() - track.startTime - HUD_LONG_PRESS_MS;
            const progress = Math.min(1, Math.max(0, dt / 180));
            slot.item.longHoldDraw(ctx, slot.cx, slot.cy, slot.size, progress);
        }
    }

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
    let tipAlpha = 1;
    if (age < HUD_TIP_FADE_MS) {
        tipAlpha = age / HUD_TIP_FADE_MS;
    } else if (age > HUD_TIP_DURATION_MS - HUD_TIP_FADE_MS) {
        tipAlpha = (HUD_TIP_DURATION_MS - age) / HUD_TIP_FADE_MS;
    }
    tipAlpha = Math.max(0, Math.min(1, tipAlpha));

    const lines = currentTip.text.split('\n');
    const metrics = measureTipLines(lines);
    const panelW = metrics.width + HUD_TIP_PADDING * 2;
    const panelH = metrics.height + HUD_TIP_PADDING * 2;
    const panelX = Math.max(8, Math.min(logicW - panelW - 8, currentTip.anchorX + HUD_TIP_OFFSET_X));
    const panelY = Math.max(8, Math.min(logicH - panelH - 8, currentTip.anchorY + 26));

    ctx.save();
    ctx.globalAlpha = tipAlpha;
    ctx.fillStyle = TAPE.ink;
    cutPanel(ctx, panelX, panelY, panelW, panelH, 6);
    ctx.fill();
    ctx.strokeStyle = TAPE.orange;
    ctx.lineWidth = 0.6;
    cutPanel(ctx, panelX, panelY, panelW, panelH, 6);
    ctx.stroke();
    ctx.fillStyle = TAPE.paper;
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


export function initMazeHUDTopLeft(): void {
    clearHUDItems();

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
            const depth = maze ? Math.floor(depthMeters(player.y)) : 0;
            const tankLine = tankCnt > 1 ? `\n气瓶：双瓶携带` : (tankCnt === 1 ? `\n气瓶：单瓶` : '');
            return `氧气：${o2}/${o2Max}${tankLine}\n深度：${depth}m`;
        },
    });

    registerHUDItem({
        id: 'depth',
        visible: () => true,
        iconDraw: drawDepthIcon,
        supportsLongPress: false,
        onShortTap: () => { /* 只弹 tip */ },
        tipText: () => {
            const maze = state.mazeRescue;
            const depth = maze ? Math.floor(depthMeters(player.y)) : 0;
            const maxAllowed = maze ? ((maze as any).maxDepthAllowed || 90) : 90;
            const overFlag = depth > maxAllowed ? '\n⚠ 已超出潜水衣极限！' : '';
            return `当前深度：${depth}m\n潜水衣极限：${maxAllowed}m${overFlag}`;
        },
    });

    registerHUDItem({
        id: 'deco',
        visible: () => {
            const cfg: any = (CONFIG as any).deco;
            if (!cfg || !cfg.enabled || !cfg.hudVisible) return false;
            const rt = getDecoRuntime();
            return isDecoLockActive() || rt.nitrogenLoad > 0.001 || isDecompressionRequired();
        },
        iconDraw: drawDecoIcon,
        supportsLongPress: true,
        onShortTap: () => { /* 只弹 tip */ },
        tipText: () => {
            const rt = getDecoRuntime();
            const cfg: any = (CONFIG as any).deco;
            const pct = Math.round((rt.nitrogenLoad / (cfg?.thresholdCritical || 1.5)) * 100);
            const stop = getCurrentStopInfo();
            const depth = Math.floor(getCurrentDepthMeters());
            const lockHint = isDecoLockActive() ? '\n🔒 强行出水 = 重度减压病' : '';
            if (!stop) {
                if (getDecoLevel() === 0 && !isDecoLockActive()) {
                    return `氮气：${pct}%（安全）\n深度：${depth}m\n（深于 20m 开始累积）`;
                }
                return `氮气：${pct}%\n深度：${depth}m${lockHint}`;
            }
            const remain = Math.max(0, (stop.hold - stop.progress)).toFixed(1);
            const diff = depth - stop.depth;
            const depthHint = Math.abs(diff) <= 1.5
                ? '✓ 已在档内，静止即可减压'
                : (diff > 0 ? `↑ 上浮 ${diff}m 到停留点` : `↓ 下沉 ${-diff}m 到停留点`);
            return `氮气：${pct}%\n下一档：${stop.depth}m（剩 ${remain}s）\n${depthHint}\n长按 5× 加速（耗氧 3×）${lockHint}`;
        },
        onLongHoldStart: () => {
            setDecoBoost(true);
        },
        onLongHoldEnd: () => {
            setDecoBoost(false);
        },
    });

    registerHUDItem({
        id: 'lifeDetector',
        visible: () => {
            const cfg = (CONFIG as any).lifeDetector;
            return !!(cfg && cfg.enabled && cfg.hudVisible);
        },
        iconDraw: drawLifeDetectorIcon,
        supportsLongPress: true,
        longHoldDraw: (c, cx, cy, _size, progress) => {
            c.save(); c.globalAlpha *= progress;
            const w = Math.min(248, logicW - 24);
            drawTapeSleeve(c, Math.min(cx + 38, logicW - w - 12), Math.max(64, Math.min(cy - 112, logicH - 236)), w, getRescueTapeVisual());
            c.restore();
        },
        onShortTap: () => { if (!retryTapeLoading()) audioToggleMuted(); },
        tipText: () => {
            const loading = getTapeLoadingLabel();
            if (loading) return loading + '\n可继续游动，不影响救援';
            const v = getRescueTapeVisual();
            if (state.audio.muted) return '深流随身听 · 已静音\n轻点磁带恢复声音\n按住磁带可看分层节奏';
            if (v.fallback) return '深流随身听 · 双音模式\n按住查看节奏';
            if (!v.playing) return '深流随身听 · 音轨就绪\n靠近救援对象时才播放\n按住查看分层节奏';
            return `深流随身听 · ${v.mood === 'return' ? 'B 面' : 'A 面'}\n${v.level}/5 层 · 120 BPM\n按住查看分层节奏`;
        },
    });

    registerHUDItem({
        id: 'retreat', visible: () => !activeWorld() && !state.mazeRescue?.npcRescued,
        iconDraw: drawRetreatIcon, supportsLongPress: true,
        onPressStart: () => {
            const maze = state.mazeRescue;
            if (!maze || maze.phase !== 'play') return;
            maze.retreatHolding = true; maze.retreatHoldStart = Date.now();
        },
        onPressEnd: () => { if (state.mazeRescue) state.mazeRescue.retreatHolding = false; },
    });

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

    registerHUDItem({
        id: 'flashlight', visible: () => true, supportsLongPress: false,
        iconDraw: (c, x, y, size) => drawFlashlightIcon(c, x, y, size, state.flashlightOn !== false),
        onShortTap: () => { state.flashlightOn = state.flashlightOn === false; },
        tipText: () => state.flashlightOn === false ? '手电已关闭' : '手电已开启',
    });
}


function drawOxygenIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, time: number): void {
    const maze = state.mazeRescue;
    const o2DisplayRaw = (maze && maze.oxygenFeedback && typeof maze.oxygenFeedback.o2DisplayAnim === 'number')
        ? maze.oxygenFeedback.o2DisplayAnim
        : player.o2;

    const tanks = getActiveAirTanks();
    const tankCaps: number[] = [];
    for (const id of tanks) {
        tankCaps.push(getEquipmentEffects(id)?.startO2 ?? 120);
    }
    if (tankCaps.length === 0) tankCaps.push(Math.max(1, player.o2Max || 100));
    let totalCap = 0;
    for (const c of tankCaps) totalCap += c;
    if (totalCap < 1) totalCap = 1;

    let remaining = Math.max(0, o2DisplayRaw);
    const bottleRatios: number[] = [];
    for (const cap of tankCaps) {
        const here = Math.max(0, Math.min(cap, remaining));
        bottleRatios.push(here / cap);
        remaining -= here;
    }
    const o2Ratio = Math.max(0, Math.min(1, o2DisplayRaw / totalCap));

    const ringR = size / 2 - 2;
    const ringW = 3.5;

    const o2Color = o2Ratio > 0.5 ? TAPE.mint :
                    o2Ratio > 0.25 ? 'rgba(255,200,80,0.95)' : 'rgba(255,80,80,0.95)';
    const o2ColorDim = o2Ratio > 0.5 ? 'rgba(129,227,206,0.18)' :
                       o2Ratio > 0.25 ? 'rgba(255,200,80,0.18)' : 'rgba(255,80,80,0.18)';

    c.save();

    c.fillStyle = 'rgba(10,22,38,0.55)';
    c.beginPath();
    c.arc(cx, cy, ringR + 3, 0, Math.PI * 2);
    c.fill();

    const start = -Math.PI / 2;
    const drawRing = (radius: number, ratio: number, dim: string, fill: string) => {
        c.strokeStyle = dim;
        c.lineWidth = ringW;
        c.beginPath();
        c.arc(cx, cy, radius, 0, Math.PI * 2);
        c.stroke();
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
        drawRing(ringR, bottleRatios[0], o2ColorDim, o2Color);
        drawRing(ringR - ringW - 1.6, bottleRatios[1], o2ColorDim, o2Color);
    } else {
        drawRing(ringR, bottleRatios[0] || 0, o2ColorDim, o2Color);
    }

    const lossT = (maze && maze.oxygenFeedback && maze.oxygenFeedback.o2LossTimer) || 0;
    if (lossT > 0) {
        const cap0 = tankCaps[0];
        const cap0Ratio = cap0 / totalCap;   // 瓶 0 占总容量的比例
        const fromTotal = Math.max(0, Math.min(1, maze!.oxygenFeedback!.o2LossFromRatio));
        const toTotal = Math.max(0, Math.min(1, maze!.oxygenFeedback!.o2LossToRatio));
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

    drawLungs(c, cx, cy, ringR, o2Ratio);

    c.restore();
}

function drawLungs(c: CanvasRenderingContext2D, cx: number, cy: number, ringR: number, o2Ratio: number): void {
    const cfg: any = (CONFIG as any).breath || {};
    const lungVolume = Math.max(0, Math.min(1, getLungVolume()));
    const pressure = Math.max(0, Math.min(1, getBreathPressure()));
    const scaleInhale: number = cfg.lungScaleInhale ?? 1.15;
    const scaleExhale: number = cfg.lungScaleExhale ?? 0.85;
    let scale = scaleExhale + (scaleInhale - scaleExhale) * lungVolume;
    scale = 1 + (scale - 1) * (1 + pressure * 0.3);
    const phase = getBreathPhase();
    const phaseAngle = getBreathPhaseAngle();
    void phaseAngle;

    const colorHealthy: string = cfg.lungColorHealthy ?? 'rgba(240,140,150,1)';
    const colorMid: string = cfg.lungColorMid ?? 'rgba(210,120,150,1)';
    const colorLow: string = cfg.lungColorLow ?? 'rgba(150,100,130,1)';
    const colorCritical: string = cfg.lungColorCritical ?? 'rgba(120,140,160,1)';
    let lungColor: string;
    if (o2Ratio > 0.5) lungColor = colorHealthy;
    else if (o2Ratio > 0.25) lungColor = colorMid;
    else if (o2Ratio > 0.1) lungColor = colorLow;
    else lungColor = colorCritical;

    const R = ringR * 0.78;

    c.save();
    c.translate(cx, cy);
    c.scale(scale, scale);

    const tracheaColor = 'rgba(60, 50, 60, 0.75)';
    c.strokeStyle = tracheaColor;
    c.lineWidth = Math.max(1, R * 0.12);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, -R * 0.85);
    c.lineTo(0, -R * 0.15);
    c.stroke();
    c.lineWidth = Math.max(0.8, R * 0.09);
    c.beginPath();
    c.moveTo(0, -R * 0.15);
    c.lineTo(-R * 0.35, R * 0.05);
    c.moveTo(0, -R * 0.15);
    c.lineTo(R * 0.35, R * 0.05);
    c.stroke();

    const drawLobe = (sign: number) => {
        c.save();
        c.scale(sign, 1);
        c.strokeStyle = 'rgba(90, 40, 55, 0.85)';
        c.lineWidth = Math.max(1, R * 0.08);
        c.fillStyle = lungColor;
        c.beginPath();
        c.moveTo(R * 0.15, -R * 0.05);
        c.bezierCurveTo(R * 0.55, -R * 0.55, R * 0.95, -R * 0.15, R * 0.88, R * 0.25);
        c.bezierCurveTo(R * 0.85, R * 0.55, R * 0.55, R * 0.88, R * 0.30, R * 0.80);
        c.bezierCurveTo(R * 0.10, R * 0.75, R * 0.05, R * 0.55, R * 0.10, R * 0.30);
        c.lineTo(R * 0.15, -R * 0.05);
        c.closePath();
        c.fill();
        c.stroke();

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

function drawDepthIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, _time: number): void {
    const maze = state.mazeRescue;
    const tile = maze ? (maze.mazeTileSize || 120) : 120;
    const curDepth = maze ? Math.floor(depthMeters(player.y)) : 0;
    const maxAllowed = maze ? ((maze as any).maxDepthAllowed || 90) : 90;
    const ratio = curDepth / Math.max(1, maxAllowed);
    const overLimit = curDepth > maxAllowed;
    const r = size / 2 - 2;

    c.save();

    const baseColor = overLimit
        ? 'rgba(60, 10, 10, 0.95)'
        : (ratio > 0.85 ? 'rgba(40, 30, 15, 0.92)' : TAPE.ink);
    c.fillStyle = baseColor;
    cutPanel(c, cx - r, cy - r, r * 2, r * 2, 6);
    c.fill();

    if (overLimit) {
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 150);
        c.strokeStyle = `rgba(255, 90, 90, ${pulse})`;
        c.lineWidth = 1.8;
    } else {
        c.strokeStyle = TAPE.paper;
        c.lineWidth = 1.2;
    }
    cutPanel(c, cx - r, cy - r, r * 2, r * 2, 6);
    c.stroke();

    if (overLimit) {
        const blink = 0.65 + 0.35 * Math.sin(Date.now() / 110);
        c.fillStyle = `rgba(255, 110, 110, ${blink})`;
    } else if (ratio > 0.85) {
        c.fillStyle = 'rgba(255, 220, 140, 1)';
    } else {
        c.fillStyle = 'rgba(230, 245, 255, 1)';
    }
    c.font = 'bold 16px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(curDepth), cx - r * 0.05, cy - r * 0.32);
    c.font = 'bold 8px Arial';
    c.fillStyle = overLimit ? 'rgba(255, 180, 180, 0.95)' : 'rgba(200, 230, 245, 0.85)';
    c.fillText('m', cx + r * 0.45, cy - r * 0.28);

    c.strokeStyle = 'rgba(180, 220, 240, 0.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx - r * 0.55, cy + r * 0.05);
    c.lineTo(cx + r * 0.55, cy + r * 0.05);
    c.stroke();

    c.fillStyle = overLimit ? 'rgba(255, 160, 160, 0.85)' : 'rgba(180, 215, 235, 0.8)';
    c.font = 'bold 10px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(maxAllowed + 'm', cx, cy + r * 0.42);

    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.restore();
}

function drawDecoIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, _time: number): void {
    const rt = getDecoRuntime();
    const level = getDecoLevel();
    const stop = getCurrentStopInfo();
    const r = size / 2 - 2;
    const now = Date.now();

    c.save();

    let bgColor: string;
    if (level >= 3)      bgColor = 'rgba(60, 10, 20, 0.95)';       // 深红
    else if (level === 2) bgColor = 'rgba(55, 15, 15, 0.92)';      // 红
    else if (level === 1) bgColor = 'rgba(45, 35, 10, 0.90)';      // 黄
    else                  bgColor = 'rgba(10, 25, 30, 0.85)';      // 绿/暗
    c.fillStyle = bgColor;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();

    let strokeColor: string;
    let strokeW = 1.1;
    if (level >= 2) {
        const pulse = 0.65 + 0.35 * Math.sin(now / (level >= 3 ? 110 : 180));
        strokeColor = `rgba(255, ${level >= 3 ? 60 : 100}, ${level >= 3 ? 80 : 100}, ${pulse})`;
        strokeW = 1.8;
    } else if (level === 1) {
        strokeColor = 'rgba(255, 210, 90, 0.75)';
        strokeW = 1.3;
    } else {
        strokeColor = 'rgba(120, 200, 180, 0.45)';
    }
    c.strokeStyle = strokeColor;
    c.lineWidth = strokeW;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();

    if (stop) {
        const cfg: any = (CONFIG as any).deco;
        const holdSec = cfg.stopHoldSec[stop.idx] || 3;
        const p = Math.max(0, Math.min(1, stop.progress / Math.max(0.01, holdSec)));
        const start = -Math.PI / 2;
        const ringR = r - 3;

        c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(cx, cy, ringR, 0, Math.PI * 2);
        c.stroke();

        if (p > 0.002) {
            let arcColor: string;
            if (rt.boostActive && rt.inHoldWindow) {
                arcColor = 'rgba(255, 220, 100, 0.98)';
            } else if (rt.inHoldWindow) {
                arcColor = 'rgba(100, 255, 210, 0.95)';
            } else {
                arcColor = 'rgba(160, 180, 190, 0.55)';
            }
            c.strokeStyle = arcColor;
            c.lineWidth = 3;
            c.lineCap = 'round';
            c.beginPath();
            c.arc(cx, cy, ringR, start, start + Math.PI * 2 * p);
            c.stroke();
            c.lineCap = 'butt';
        }

        if (rt.inHoldWindow) {
            const glow = 0.45 + 0.35 * Math.sin(now / 220);
            c.globalAlpha = glow;
            c.strokeStyle = rt.boostActive ? 'rgba(255, 220, 100, 0.5)' : 'rgba(100, 255, 210, 0.45)';
            c.lineWidth = 5.5;
            c.beginPath();
            c.arc(cx, cy, ringR + 1.5, 0, Math.PI * 2);
            c.stroke();
            c.globalAlpha = 1;
        }

        c.fillStyle = rt.inHoldWindow ? 'rgba(230, 255, 245, 1)' : 'rgba(220, 230, 240, 0.85)';
        c.font = 'bold 16px Arial';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(stop.depth), cx - 3, cy - 2);
        c.font = 'bold 8px Arial';
        c.fillStyle = rt.inHoldWindow ? 'rgba(200, 255, 230, 0.9)' : 'rgba(200, 215, 225, 0.8)';
        c.fillText('m', cx + 8, cy + 1);

        if (rt.boostActive && rt.inHoldWindow) {
            c.fillStyle = 'rgba(255, 230, 120, 1)';
            c.font = 'bold 9px Arial';
            c.fillText('×5', cx, cy + r * 0.55);
        } else {
            const remain = Math.max(0, holdSec - stop.progress);
            c.fillStyle = 'rgba(200, 220, 230, 0.85)';
            c.font = 'bold 8px Arial';
            c.fillText(remain.toFixed(1) + 's', cx, cy + r * 0.55);
        }
        c.textAlign = 'start';
        c.textBaseline = 'alphabetic';
    } else {
        if (level === 0) {
            c.fillStyle = 'rgba(120, 230, 180, 0.9)';
            c.beginPath();
            c.arc(cx, cy, 2.2, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = 'rgba(150, 200, 190, 0.55)';
            c.font = 'bold 9px Arial';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('N₂', cx, cy + r * 0.52);
            c.textAlign = 'start';
            c.textBaseline = 'alphabetic';
        } else {
            let textColor = 'rgba(255, 215, 110, 1)';
            if (level >= 3) {
                const blink = 0.6 + 0.4 * Math.sin(now / 130);
                textColor = `rgba(255, 110, 120, ${blink})`;
            } else if (level === 2) {
                textColor = 'rgba(255, 140, 120, 1)';
            }
            c.fillStyle = textColor;
            c.font = 'bold 11px Arial';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('DECO', cx, cy - 2);

            if (level >= 2) {
                const triY = cy + r * 0.42;
                const triSize = 5;
                c.fillStyle = textColor;
                c.beginPath();
                c.moveTo(cx, triY - triSize);
                c.lineTo(cx + triSize, triY + triSize * 0.6);
                c.lineTo(cx - triSize, triY + triSize * 0.6);
                c.closePath();
                c.fill();
                c.strokeStyle = 'rgba(40, 10, 10, 0.9)';
                c.lineWidth = 1.2;
                c.beginPath();
                c.moveTo(cx, triY - 1);
                c.lineTo(cx, triY + 2);
                c.stroke();
            } else {
                const cfg: any = (CONFIG as any).deco;
                const pct = Math.round((rt.nitrogenLoad / (cfg?.thresholdCritical || 1.5)) * 100);
                c.fillStyle = 'rgba(255, 225, 150, 0.9)';
                c.font = 'bold 8px Arial';
                c.fillText(pct + '%', cx, cy + r * 0.52);
            }
            c.textAlign = 'start';
            c.textBaseline = 'alphabetic';
        }
    }

    c.restore();
}

function drawRetreatIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    const r = size / 2 - 2, maze = state.mazeRescue;
    c.save(); c.fillStyle = TAPE.ink; c.strokeStyle = maze?.retreatHolding ? 'rgba(129,227,206,.25)' : TAPE.mint; c.lineWidth = 1;
    cutPanel(c, cx - r, cy - r, r * 2, r * 2, 6); c.fill(); c.stroke();
    c.strokeStyle = TAPE.paper; c.lineWidth = 2; c.beginPath();
    c.moveTo(cx, cy + 9); c.lineTo(cx, cy - 8); c.moveTo(cx - 6, cy - 2); c.lineTo(cx, cy - 8); c.lineTo(cx + 6, cy - 2); c.stroke();
    if (maze?.retreatHolding) {
        const progress = Math.min(1, (Date.now() - maze.retreatHoldStart) / (CONFIG.maze.retreatHoldDuration * 1000));
        c.strokeStyle = TAPE.mint; c.lineWidth = 2.5; c.lineCap = 'butt';
        drawCutPanelProgress(c, cx - r, cy - r, r * 2, r * 2, progress, 6);
    }
    c.restore();
}

function drawLifeDetectorIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, _time: number): void {
    const v = getRescueTapeVisual();
    drawTapeDeck(c, cx, cy, size, v);
}

function drawGMIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, time: number): void {
    const open = isGMOpen();
    const r = size / 2 - 2;

    c.save();

    c.fillStyle = open ? 'rgba(255, 136, 0, 0.65)' : 'rgba(60, 60, 60, 0.55)';
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = open ? 'rgba(255, 180, 80, 0.7)' : 'rgba(180, 180, 180, 0.4)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();

    c.save();
    c.translate(cx, cy);
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

    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(0, 0, innerR * 0.55, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';

    c.restore();

    if (open) {
        c.fillStyle = 'rgba(255, 255, 255, 0.85)';
        c.font = 'bold 7px Arial';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('ON', cx, cy + r * 0.78);
    }

    c.restore();
}
