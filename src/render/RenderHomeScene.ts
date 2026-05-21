// 家场景渲染
//
// 渲染层级（从底到顶）：
//   1. 背景图（横屏静态图 + cameraX 横向平移）
//   2. 程序化动效层：台灯呼吸光 / 窗外星星闪烁 / 灰尘粒子浮动
//   3. 男主立绘（屋内坐标系，按 cameraX 平移到屏幕）
//   4. 女孩立绘
//   5. 对话框（dialogue 阶段）
//   6. 睡觉按钮 + 提示文字（free 阶段）
//   7. 黑场遮罩（fadeAlpha）
//
// 背景图未加载完成时，渲染纯黑兜底（用 fadeIn 黑场覆盖玩家也察觉不到）。

import { ctx, logicW, logicH } from './Canvas';
import { state } from '../core/state';
import { getCurrentNode } from '../story/DialogueRunner';
import { getSleepBtnRect } from '../story/HomeScene';
import { getImage } from './ImageAssets';
import {
    HOME_ASSET_KEYS, ROOM_WIDTH, anchorRoomX, FLOOR_Y_RATIO,
    syncRoomWidthFromImage, roomXToScreenXScaled,
} from '../story/HomeRoom';

// 屏幕宽度对应"屋内宽度"的多少像素。值越大左右视野越宽。
// 推荐 ROOM_WIDTH * 0.42 ~ 0.55；当前取 0.5 = 屏幕显示半个屋内
const SCREEN_VIEW_RATIO = 0.5;

function getViewWidthInRoom(): number {
    return ROOM_WIDTH * SCREEN_VIEW_RATIO;
}

// ===========================================================
// 工具
// ===========================================================
function rrect(c: any, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
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

// ===========================================================
// 灰尘粒子（屋内坐标系，进 home_evening 时懒初始化）
// ===========================================================
type Mote = { rx: number; y: number; vx: number; vy: number; alpha: number; r: number };
let _motes: Mote[] | null = null;

function ensureMotes() {
    if (_motes) return;
    _motes = [];
    for (let i = 0; i < 36; i++) {
        _motes.push({
            rx: Math.random() * ROOM_WIDTH,
            y: 80 + Math.random() * (logicH * 0.55),
            vx: (Math.random() - 0.5) * 0.15,
            vy: (Math.random() - 0.5) * 0.08,
            alpha: 0.08 + Math.random() * 0.12,
            r: 0.7 + Math.random() * 1.6,
        });
    }
}

function tickMotes() {
    if (!_motes) return;
    for (const m of _motes) {
        m.rx += m.vx;
        m.y += m.vy;
        // 缓慢扰动
        if (Math.random() < 0.01) m.vx = (Math.random() - 0.5) * 0.18;
        if (Math.random() < 0.01) m.vy = (Math.random() - 0.5) * 0.08;
        // 屋内 wrap
        if (m.rx < 0) m.rx += ROOM_WIDTH;
        if (m.rx > ROOM_WIDTH) m.rx -= ROOM_WIDTH;
        if (m.y < 60) { m.y = logicH * 0.6; }
        if (m.y > logicH * 0.78) { m.y = 60; }
    }
}

// ===========================================================
// 主入口
// ===========================================================
export function drawHomeScene() {
    const home: any = state.home;
    if (!home) return;
    const cw = logicW;
    const ch = logicH;

    const cameraX = home.cameraX || 0;

    // 镜头微呼吸：整画面纵向极弱漂浮（让静态图有"活着"感）
    const t = Date.now() / 1000;
    const breatheY = Math.sin(t * 0.6) * 1.5 + Math.sin(t * 1.3) * 0.8;

    ctx.save();
    ctx.translate(0, breatheY);

    // 1. 背景
    drawBackground(cw, ch, cameraX);

    // 2. 动效层（在背景之上、人物之下）
    ensureMotes();
    tickMotes();
    drawFireGlow(cw, ch, cameraX);     // 壁炉火光（暖色辐射）
    drawLampGlow(cw, ch, cameraX);     // 台灯呼吸（最亮）
    drawTwinklingStars(cw, ch, cameraX);
    drawMotes(cw, ch, cameraX);

    // 3-4. 男主、女孩
    drawMan(cw, ch, cameraX);
    drawGirl(cw, ch, cameraX);

    ctx.restore(); // 镜头微呼吸结束，下面 UI 不参与抖动

    // 5. 对话框
    if (home.phase === 'dialogue') {
        drawDialogueBox(cw, ch);
    }

    // 6. 睡觉按钮 + 提示
    if (home.phase === 'free' && home.sleepBtnVisible) {
        drawHint(cw, ch, '时候不早了');
        drawSleepBtn(cw, ch);
    }

    // 7. 黑场
    if (home.fadeAlpha > 0.001) {
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${home.fadeAlpha})`;
        ctx.fillRect(0, 0, cw, ch);
        ctx.restore();
    }
}

// ===========================================================
// 1. 背景图渲染（按高度填屏 + 横向 cameraX 切片）
//
// 思路：
//   1) 背景图按"屏幕高度"等比缩放高度；图的逻辑像素宽度 = imgW（屋内坐标系）
//   2) 屏幕显示屋内 [cameraX, cameraX + viewW] 这段
//      其中 viewW = ROOM_WIDTH * SCREEN_VIEW_RATIO（让屏幕能看到更宽屋内）
//   3) 因为图是按高度等比的，所以屏幕显示宽度 cw 对应图的 viewW 段，可能图被横向压缩
//      （ratio = cw / viewW < 1 → 看起来更"广角"），但这是有意的——情绪戏不需要透视真实
//   4) 上下额外区域用渐变阴影 / 暗角填充
// ===========================================================
function drawBackground(cw: number, ch: number, cameraX: number) {
    const img = getImage(HOME_ASSET_KEYS.bgNight);
    if (!img) {
        ctx.fillStyle = '#1f1610';
        ctx.fillRect(0, 0, cw, ch);
        return;
    }

    // 图加载完成后同步 ROOM_WIDTH 到图实际宽度
    syncRoomWidthFromImage();

    const imgW = img.width || ROOM_WIDTH;
    const imgH = img.height || ch;

    const viewW = getViewWidthInRoom();

    // 源切片：从屋内 [cameraX, cameraX+viewW] 取
    const sx = (cameraX / ROOM_WIDTH) * imgW;
    const sw = (viewW / ROOM_WIDTH) * imgW;
    // 把这段切片在垂直方向"按屏高填满"——但保持横向不变形地撑到 cw
    // 实际做法：按高度等比缩放图，结果可能高度大于屏高（多出来的上下被裁掉）
    // 缩放比 k = cw / sw（横向把切片撑到 cw）
    const k = cw / sw;
    const drawH = imgH * k;
    // 垂直居中（如果 drawH > ch，上下被裁掉；如果 drawH < ch，上下留黑由渐变填）
    const dy = (ch - drawH) / 2;

    ctx.save();
    try {
        ctx.drawImage(img, sx, 0, sw, imgH, 0, dy, cw, drawH);
    } catch {
        ctx.fillStyle = '#1f1610';
        ctx.fillRect(0, 0, cw, ch);
        ctx.restore();
        return;
    }
    ctx.restore();

    // 上下渐变暗角：把可能的留黑/边缘融入屋内氛围
    drawTopBottomGradient(cw, ch);
}

// 上下暗角 + 装饰渐变：横向视野扩大后，画面上下可能有黑/截断，用渐变盖一层
function drawTopBottomGradient(cw: number, ch: number) {
    ctx.save();
    // 上方：从天花板梁的暗色渐变到透明
    const topH = Math.round(ch * 0.18);
    const gTop = ctx.createLinearGradient(0, 0, 0, topH);
    gTop.addColorStop(0, 'rgba(8, 5, 3, 0.95)');
    gTop.addColorStop(0.6, 'rgba(20, 12, 8, 0.4)');
    gTop.addColorStop(1, 'rgba(20, 12, 8, 0)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, 0, cw, topH);

    // 下方：地板阴影渐变到透明
    const botH = Math.round(ch * 0.20);
    const gBot = ctx.createLinearGradient(0, ch - botH, 0, ch);
    gBot.addColorStop(0, 'rgba(10, 6, 4, 0)');
    gBot.addColorStop(0.7, 'rgba(10, 6, 4, 0.55)');
    gBot.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, ch - botH, cw, botH);

    // 左右边缘暗角（vignette）
    const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.55, cw / 2, ch / 2, Math.max(cw, ch) * 0.85);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
}

// ===========================================================
// 2a. 台灯呼吸光晕（叠在桌子位置）
// ===========================================================
function drawLampGlow(cw: number, ch: number, cameraX: number) {
    const sx = roomXToScreenXScaled(anchorRoomX('desk'), cameraX, cw);
    const sy = ch * 0.52; // 台灯灯罩高度（地板线之上一点）
    if (sx < -260 || sx > cw + 260) return;

    const t = Date.now() / 1000;
    // 双频率呼吸 + 极低概率"灯丝抖一下"
    const slow = Math.sin(t * 1.4);
    const fast = Math.sin(t * 5.7);
    const flicker = (Math.random() < 0.02) ? -0.15 : 0;
    const breathe = 1.0 + slow * 0.10 + fast * 0.03 + flicker;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 内核（更强）
    const inner = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    inner.addColorStop(0, `rgba(255, 220, 150, ${(0.55 * breathe).toFixed(3)})`);
    inner.addColorStop(0.5, `rgba(255, 200, 120, ${(0.25 * breathe).toFixed(3)})`);
    inner.addColorStop(1, 'rgba(255, 180, 100, 0)');
    ctx.fillStyle = inner;
    ctx.fillRect(sx - 100, sy - 100, 200, 200);
    // 外圈（柔光辐射到房间）
    const outer = ctx.createRadialGradient(sx, sy, 20, sx, sy, 260);
    outer.addColorStop(0, `rgba(255, 190, 110, ${(0.22 * breathe).toFixed(3)})`);
    outer.addColorStop(0.5, `rgba(255, 170, 90, ${(0.08 * breathe).toFixed(3)})`);
    outer.addColorStop(1, 'rgba(255, 170, 90, 0)');
    ctx.fillStyle = outer;
    ctx.fillRect(sx - 280, sy - 280, 560, 560);
    ctx.restore();
}

// ===========================================================
// 2b. 窗外星星闪烁（位置相对窗户中心，更密更亮）
// ===========================================================
const STAR_OFFSETS: { dx: number; dy: number; phase: number; baseAlpha: number; size: number }[] = [
    { dx: -38, dy: -62, phase: 0.0, baseAlpha: 1.0, size: 1.6 },
    { dx: -14, dy: -88, phase: 1.7, baseAlpha: 0.8, size: 1.2 },
    { dx:  16, dy: -50, phase: 3.1, baseAlpha: 1.0, size: 1.8 },
    { dx:  38, dy: -78, phase: 0.8, baseAlpha: 0.85, size: 1.4 },
    { dx:  -50, dy: -30, phase: 2.4, baseAlpha: 0.7, size: 1.1 },
    { dx:  56, dy: -28, phase: 4.5, baseAlpha: 0.85, size: 1.3 },
    { dx:   0, dy: -106, phase: 5.2, baseAlpha: 0.9, size: 1.5 },
];

function drawTwinklingStars(cw: number, ch: number, cameraX: number) {
    const centerSx = roomXToScreenXScaled(anchorRoomX('window'), cameraX, cw);
    const centerSy = ch * 0.28;
    if (centerSx < -160 || centerSx > cw + 160) return;
    const t = Date.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of STAR_OFFSETS) {
        const a = s.baseAlpha * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.2 + s.phase)));
        const px = centerSx + s.dx;
        const py = centerSy + s.dy;
        // 主体
        ctx.fillStyle = `rgba(255, 248, 220, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, s.size, 0, Math.PI * 2);
        ctx.fill();
        // 十字光晕（更醒目）
        if (a > 0.5) {
            const glow = (a - 0.5) * 0.7;
            ctx.fillStyle = `rgba(255, 248, 220, ${glow.toFixed(3)})`;
            ctx.fillRect(px - s.size * 3, py - 0.5, s.size * 6, 1);
            ctx.fillRect(px - 0.5, py - s.size * 3, 1, s.size * 6);
        }
    }
    ctx.restore();
}

// ===========================================================
// 2c. 灰尘粒子
// ===========================================================
function drawMotes(cw: number, _ch: number, cameraX: number) {
    if (!_motes) return;
    ctx.save();
    for (const m of _motes) {
        const sx = roomXToScreenXScaled(m.rx, cameraX, cw);
        if (sx < -4 || sx > cw + 4) continue;
        ctx.fillStyle = `rgba(255, 230, 190, ${m.alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ===========================================================
// 2d. 壁炉火光（暖橙跳动）
// ===========================================================
function drawFireGlow(cw: number, ch: number, cameraX: number) {
    const sx = roomXToScreenXScaled(anchorRoomX('fire'), cameraX, cw);
    const sy = ch * 0.62; // 壁炉嘴位置
    if (sx < -200 || sx > cw + 200) return;

    const t = Date.now() / 1000;
    // 火光跳动：3 个不同周期的 sin 叠加 + 高频微抖
    const flicker = 0.85
        + Math.sin(t * 7.3) * 0.08
        + Math.sin(t * 3.1) * 0.05
        + Math.sin(t * 12.7) * 0.04;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, 150);
    g.addColorStop(0, `rgba(255, 130, 50, ${(0.45 * flicker).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(255, 90, 30, ${(0.18 * flicker).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255, 90, 30, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 160, sy - 160, 320, 320);
    ctx.restore();
}

// ===========================================================
// 3. 男主
// ===========================================================
function drawMan(cw: number, _ch: number, cameraX: number) {
    const home: any = state.home;
    if (!home) return;
    const m = home.actors.man;
    const sx = roomXToScreenXScaled(m.x, cameraX, cw);
    if (sx < -60 || sx > cw + 60) return;
    drawSimpleHuman(sx, m.y, 1.0, '#3b3b46', '#c6a486');
}

// ===========================================================
// 4. 女孩
// ===========================================================
function drawGirl(cw: number, _ch: number, cameraX: number) {
    const home: any = state.home;
    if (!home || !home.actors.girl.visible) return;
    const g = home.actors.girl;
    const sx = roomXToScreenXScaled(g.x, cameraX, cw);
    if (sx < -60 || sx > cw + 60) return;
    drawSimpleHuman(sx, g.y, 0.65, '#a7c4e3', '#f1d7c0');
}

function drawSimpleHuman(x: number, y: number, scale: number, bodyColor: string, skinColor: string) {
    // y 对应脚底
    const headR = 8 * scale;
    const bodyW = 16 * scale;
    const bodyH = 26 * scale;
    const legH = 18 * scale;
    const feetY = y;
    const bodyBottomY = feetY - legH;
    const bodyTopY = bodyBottomY - bodyH;
    const headCY = bodyTopY - headR - 1 * scale;

    // 影子
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, feetY + 2, headR * 1.3, headR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // 腿
    ctx.fillStyle = '#1a1812';
    ctx.fillRect(x - bodyW * 0.32, bodyBottomY, bodyW * 0.28, legH);
    ctx.fillRect(x + bodyW * 0.04, bodyBottomY, bodyW * 0.28, legH);

    // 身体
    ctx.fillStyle = bodyColor;
    ctx.beginPath(); rrect(ctx, x - bodyW / 2, bodyTopY, bodyW, bodyH, 3); ctx.fill();

    // 头
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(x, headCY, headR, 0, Math.PI * 2);
    ctx.fill();

    // 头发（顶上一抹）
    ctx.fillStyle = '#2b1f15';
    ctx.beginPath();
    ctx.arc(x, headCY - headR * 0.5, headR * 0.92, Math.PI, Math.PI * 2);
    ctx.fill();
}

// ===========================================================
// 5. 对话框
// ===========================================================
function drawDialogueBox(cw: number, ch: number) {
    const node = getCurrentNode();
    if (!node) return;
    const home: any = state.home;
    const text = (node.text || '').slice(0, Math.floor(home.dialogue.textProgress));

    const boxX = cw * 0.06;
    const boxY = ch * 0.74;
    const boxW = cw * 0.88;
    const boxH = ch * 0.22 - 12;

    ctx.save();
    // 底色
    ctx.fillStyle = 'rgba(8, 12, 20, 0.85)';
    ctx.beginPath(); rrect(ctx, boxX, boxY, boxW, boxH, 12); ctx.fill();
    // 描边
    ctx.strokeStyle = 'rgba(180, 200, 230, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); rrect(ctx, boxX, boxY, boxW, boxH, 12); ctx.stroke();

    // 说话人标签
    let speakerText = '';
    let speakerColor = 'rgba(220, 230, 240, 0.95)';
    if (node.speaker === 'man') { speakerText = '男主'; speakerColor = '#9bc3ff'; }
    else if (node.speaker === 'girl') { speakerText = '女孩'; speakerColor = '#ffc0c0'; }
    else if (node.speaker === 'narration') { speakerText = ''; speakerColor = 'rgba(200, 200, 210, 0.9)'; }

    if (speakerText) {
        ctx.fillStyle = speakerColor;
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(speakerText, boxX + 16, boxY + 10);
    }

    // 正文
    ctx.fillStyle = node.speaker === 'narration' ? 'rgba(200, 200, 210, 0.85)' : 'rgba(235, 240, 248, 0.95)';
    ctx.font = node.speaker === 'narration' ? 'italic 14px Arial' : '15px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, text, boxX + 16, boxY + (speakerText ? 32 : 18), boxW - 32, 22);

    // 推进提示
    if (home.dialogue.waitingForTap) {
        const t = (Date.now() % 1000) / 1000;
        ctx.fillStyle = `rgba(220, 230, 240, ${0.4 + Math.sin(t * Math.PI * 2) * 0.3})`;
        ctx.font = '14px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('▼', boxX + boxW - 18, boxY + boxH - 26);
    }
    ctx.restore();
}

function drawWrappedText(c: any, text: string, x: number, y: number, maxW: number, lineH: number) {
    let line = '';
    let curY = y;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const test = line + ch;
        if (c.measureText(test).width > maxW && line.length > 0) {
            c.fillText(line, x, curY);
            line = ch;
            curY += lineH;
        } else {
            line = test;
        }
    }
    if (line) c.fillText(line, x, curY);
}

// ===========================================================
// 6. 睡觉按钮 + 提示
// ===========================================================
function drawSleepBtn(cw: number, ch: number) {
    const r = getSleepBtnRect(cw, ch);
    ctx.save();
    ctx.fillStyle = 'rgba(40, 28, 56, 0.9)';
    ctx.beginPath(); rrect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    const t = Date.now() / 1000;
    const pulse = 0.7 + Math.sin(t * 2.2) * 0.2;
    ctx.strokeStyle = `rgba(180, 160, 220, ${0.5 * pulse})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); rrect(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke();

    ctx.fillStyle = 'rgba(230, 220, 240, 0.95)';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌙  睡觉', r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
}

function drawHint(cw: number, ch: number, text: string) {
    ctx.save();
    ctx.fillStyle = 'rgba(180, 180, 200, 0.55)';
    ctx.font = 'italic 13px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cw - 18, ch - 24 - 40 - 14);
    ctx.restore();
}

// 重置粒子（场景退出时调用以省内存，不强制）
export function resetHomeSceneFx() {
    _motes = null;
}

// 让重写的 FLOOR_Y_RATIO 仍可被外部读到
export { FLOOR_Y_RATIO };
