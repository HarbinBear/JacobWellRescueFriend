// 性能分析 HUD
// -------------------------------------------------
// 职责：
//   1. 为主循环 6 个 phase 以及各 phase 内部子段提供计时 API：
//      profileBegin(name) / profileEnd(name) —— 支持嵌套
//   2. 维护每个段的滑动平均耗时（最近 N 帧）与本段最大耗时
//   3. 在屏幕中央以纯文字（无背景）显示总 FPS / 帧时 / 各段耗时
//   4. 可选调用 performance.mark() + performance.measure()，
//      让 Chrome DevTools Performance 录制的 Timings 轨道上出现带真名的色块，
//      不受 minify 影响（录火焰图时打开，不录时关掉减少开销）
//
// 用法：
//   import { profileBegin, profileEnd, perfFrameBegin, perfFrameEnd, drawPerfHUD } from './debug/PerfHUD';
//   每一帧：
//     perfFrameBegin();
//       profileBegin('update'); update(); profileEnd('update');
//       ... 其他 phase ...
//       profileBegin('draw'); draw(); profileEnd('draw');
//     perfFrameEnd();
//   draw() 末尾调用：drawPerfHUD(ctx);
//
// 所有开关由 CONFIG.perfHUD 控制，默认关闭。

import { CONFIG } from '../core/config';
import { logicW, logicH } from '../render/Canvas';

// 滑动窗口长度（最近多少帧做平均）
const WINDOW_SIZE = 60;

// 是否真正产生 performance.mark/measure 调用；读配置，运行时可动态切换
function enableMarks(): boolean {
    const cfg = (CONFIG as any).perfHUD;
    return !!(cfg && cfg.enabled && cfg.enableMarks);
}

// 是否启用 HUD 总开关
function hudEnabled(): boolean {
    const cfg = (CONFIG as any).perfHUD;
    return !!(cfg && cfg.enabled);
}

// 是否启用计时（即便不显示 HUD，也可能希望计时以便录火焰图）
function timingEnabled(): boolean {
    const cfg = (CONFIG as any).perfHUD;
    return !!(cfg && cfg.enabled);
}

interface SegStat {
    // 最近 WINDOW_SIZE 帧的耗时（ms），按帧聚合（同段同帧多次调用会累加）
    samples: number[];
    // 当前帧累计值（perfFrameEnd 时 push 到 samples）
    currentFrameMs: number;
    // 最近 WINDOW_SIZE 帧中的最大单帧耗时
    maxMs: number;
    // 计算好的滑动平均（ms）
    avgMs: number;
    // 该段出现顺序（首次出现时分配，决定 HUD 行序）
    order: number;
}

// 段名 -> 统计
const segs: Map<string, SegStat> = new Map();
let segOrderCounter = 0;

// 段嵌套栈：push 的时候记录名字与开始时间
interface StackFrame {
    name: string;
    t0: number;
    markName: string; // performance.mark 用的 start 标记名
}
const stack: StackFrame[] = [];

// 帧统计（FPS + 帧时）
const frameTimes: number[] = []; // 最近 WINDOW_SIZE 帧的总帧时（ms）
let frameStartT = 0;
let lastFrameEndT = 0;
let fps = 0;
let frameMs = 0;
let maxFrameMs = 0;

function now(): number {
    return (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
}

function getOrCreateSeg(name: string): SegStat {
    let s = segs.get(name);
    if (!s) {
        s = {
            samples: [],
            currentFrameMs: 0,
            maxMs: 0,
            avgMs: 0,
            order: segOrderCounter++,
        };
        segs.set(name, s);
    }
    return s;
}

// 开始一段计时
export function profileBegin(name: string): void {
    if (!timingEnabled()) return;
    const t0 = now();
    const markName = `pb_${name}_${t0}`;
    if (enableMarks() && typeof performance !== 'undefined' && performance.mark) {
        try { performance.mark(markName); } catch (e) { /* ignore */ }
    }
    stack.push({ name, t0, markName });
}

// 结束最近一段计时
export function profileEnd(name: string): void {
    if (!timingEnabled()) return;
    // 找到栈顶匹配名字的帧（容错：如果不匹配，就直接弹出栈顶，避免错配扩散）
    if (stack.length === 0) return;
    let frame = stack[stack.length - 1];
    if (frame.name !== name) {
        // 名字对不上时，尝试回溯查找；找不到就放弃
        let found = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].name === name) { found = i; break; }
        }
        if (found < 0) return;
        frame = stack[found];
        // 丢弃中间未结束的（代码层面 bug，但不要让 profiler 自己崩）
        stack.length = found;
    } else {
        stack.pop();
    }
    const dt = now() - frame.t0;
    const seg = getOrCreateSeg(name);
    seg.currentFrameMs += dt;
    if (enableMarks() && typeof performance !== 'undefined' && performance.measure) {
        try {
            performance.measure(name, frame.markName);
        } catch (e) { /* ignore */ }
        // 清理 mark 避免堆积（非关键）
        try {
            if (performance.clearMarks) performance.clearMarks(frame.markName);
        } catch (e) { /* ignore */ }
    }
}

// 帧开始：清空"本帧累计"
export function perfFrameBegin(): void {
    if (!timingEnabled()) return;
    frameStartT = now();
    // 清理栈（防止上一帧异常导致残留）
    stack.length = 0;
    // 清空本帧累计
    segs.forEach(s => { s.currentFrameMs = 0; });
}

// 帧结束：把本帧累计值 push 到滑动窗口，重算平均值
export function perfFrameEnd(): void {
    if (!timingEnabled()) return;
    const frameEndT = now();
    const totalMs = frameEndT - frameStartT;
    // 帧时样本
    frameTimes.push(totalMs);
    if (frameTimes.length > WINDOW_SIZE) frameTimes.shift();
    // 总帧时统计
    let sum = 0;
    let mx = 0;
    for (let i = 0; i < frameTimes.length; i++) {
        sum += frameTimes[i];
        if (frameTimes[i] > mx) mx = frameTimes[i];
    }
    frameMs = sum / frameTimes.length;
    maxFrameMs = mx;
    // FPS 用 wall-clock 差值，更贴近真实显示帧率
    if (lastFrameEndT > 0) {
        const wallDt = frameEndT - lastFrameEndT;
        // 平滑一下
        const instantFps = wallDt > 0 ? 1000 / wallDt : 0;
        fps = fps === 0 ? instantFps : fps * 0.9 + instantFps * 0.1;
    }
    lastFrameEndT = frameEndT;

    // 各段聚合
    segs.forEach(s => {
        s.samples.push(s.currentFrameMs);
        if (s.samples.length > WINDOW_SIZE) s.samples.shift();
        let ssum = 0;
        let smx = 0;
        for (let i = 0; i < s.samples.length; i++) {
            ssum += s.samples[i];
            if (s.samples[i] > smx) smx = s.samples[i];
        }
        s.avgMs = ssum / s.samples.length;
        s.maxMs = smx;
    });
}

// 在屏幕中央绘制纯文字 HUD（无背景）
export function drawPerfHUD(ctx: CanvasRenderingContext2D): void {
    if (!hudEnabled()) return;
    const cfg = (CONFIG as any).perfHUD;

    ctx.save();
    ctx.font = (cfg && cfg.fontSize ? `${cfg.fontSize}px` : '11px') + ' monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // 行高
    const lh = (cfg && cfg.fontSize ? cfg.fontSize : 11) + 2;
    // 顶部起始 Y（屏幕中央再上移一点，避免太靠下被 UI 遮挡）
    const cx = logicW / 2;
    let y = logicH * 0.22;

    // 按 order 排序段名
    const list: { name: string; seg: SegStat }[] = [];
    segs.forEach((seg, name) => list.push({ name, seg }));
    list.sort((a, b) => a.seg.order - b.seg.order);

    // 总览行：FPS + 帧时 + 最大帧时（绿色）
    const frameLine = `FPS ${fps.toFixed(1)}  frame ${frameMs.toFixed(2)}ms  max ${maxFrameMs.toFixed(2)}ms`;
    // 轻微描边提升无背景下的可读性
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.fillStyle = '#6f6';
    ctx.strokeText(frameLine, cx, y);
    ctx.fillText(frameLine, cx, y);
    y += lh;

    // 每段一行：名字、平均 ms、峰值 ms
    for (const { name, seg } of list) {
        // 热点用红色，次热用黄色，其它白色
        let color = '#ddd';
        if (seg.avgMs >= 8) color = '#f66';
        else if (seg.avgMs >= 3) color = '#fd6';
        const line = `${padRight(name, 24)} ${padLeft(seg.avgMs.toFixed(2), 6)}ms  max ${padLeft(seg.maxMs.toFixed(2), 6)}ms`;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.fillStyle = color;
        ctx.strokeText(line, cx, y);
        ctx.fillText(line, cx, y);
        y += lh;
    }

    ctx.restore();
}

function padRight(s: string, n: number): string {
    if (s.length >= n) return s;
    return s + ' '.repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
    if (s.length >= n) return s;
    return ' '.repeat(n - s.length) + s;
}

// 重置全部统计（切场景等可调用）
export function resetPerfHUD(): void {
    segs.clear();
    segOrderCounter = 0;
    stack.length = 0;
    frameTimes.length = 0;
    frameStartT = 0;
    lastFrameEndT = 0;
    fps = 0;
    frameMs = 0;
    maxFrameMs = 0;
}
