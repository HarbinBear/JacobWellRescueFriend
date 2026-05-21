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
import { HOME_ASSET_KEYS, ROOM_WIDTH, ANCHORS, FLOOR_Y_RATIO, roomXToScreenX } from '../story/HomeRoom';

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

    // 1. 背景
    drawBackground(cw, ch, cameraX);

    // 2. 动效层（在背景之上、人物之下）
    ensureMotes();
    tickMotes();
    drawLampGlow(cw, ch, cameraX);
    drawTwinklingStars(cw, ch, cameraX);
    drawMotes(cw, ch, cameraX);

    // 3-4. 男主、女孩
    drawMan(cw, ch, cameraX);
    drawGirl(cw, ch, cameraX);

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
// 1. 背景图渲染（横向平移）
// ===========================================================
function drawBackground(cw: number, ch: number, cameraX: number) {
    const img = getImage(HOME_ASSET_KEYS.bgNight);
    if (!img) {
        // 未就绪：用深色木墙兜底
        ctx.fillStyle = '#1f1610';
        ctx.fillRect(0, 0, cw, ch);
        return;
    }

    // 图片以 ROOM_WIDTH × ch 的逻辑尺寸"贴"在屋内坐标系上。
    // 屏幕显示：屋内坐标 [cameraX, cameraX + cw] 这段贴到屏幕 [0, cw]。
    // 用 drawImage 的 9 参数版本：从源图按比例切片。

    const imgW = img.width || ROOM_WIDTH;
    const imgH = img.height || ch;
    // 源图按横向 sx 取片，按高度全切
    const sx = (cameraX / ROOM_WIDTH) * imgW;
    const sw = (cw / ROOM_WIDTH) * imgW;

    try {
        ctx.drawImage(img, sx, 0, sw, imgH, 0, 0, cw, ch);
    } catch {
        ctx.fillStyle = '#1f1610';
        ctx.fillRect(0, 0, cw, ch);
    }
}

// ===========================================================
// 2a. 台灯呼吸光晕（叠在桌子位置）
// ===========================================================
function drawLampGlow(cw: number, ch: number, cameraX: number) {
    const sx = roomXToScreenX(ANCHORS.desk + 30, cameraX); // 桌上灯的位置略偏右
    const sy = ch * 0.50;
    if (sx < -200 || sx > cw + 200) return;
    const t = Date.now() / 1000;
    const breathe = 0.85 + Math.sin(t * 1.6) * 0.08 + Math.sin(t * 0.7) * 0.04;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sx, sy, 8, sx, sy, 220);
    g.addColorStop(0, `rgba(255, 200, 120, ${0.35 * breathe})`);
    g.addColorStop(0.5, `rgba(255, 180, 100, ${0.12 * breathe})`);
    g.addColorStop(1, 'rgba(255, 180, 100, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 220, sy - 220, 440, 440);
    ctx.restore();
}

// ===========================================================
// 2b. 窗外星星闪烁
// ===========================================================
const STAR_OFFSETS: { dx: number; dy: number; phase: number; baseAlpha: number }[] = [
    { dx: -32, dy: -68, phase: 0.0, baseAlpha: 0.85 },
    { dx:  -8, dy: -94, phase: 1.7, baseAlpha: 0.6 },
    { dx:  24, dy: -52, phase: 3.1, baseAlpha: 0.9 },
    { dx:  48, dy: -82, phase: 0.8, baseAlpha: 0.7 },
    { dx:  -56, dy: -36, phase: 2.4, baseAlpha: 0.5 },
];

function drawTwinklingStars(cw: number, ch: number, cameraX: number) {
    const centerSx = roomXToScreenX(ANCHORS.window, cameraX);
    const centerSy = ch * 0.30;
    if (centerSx < -120 || centerSx > cw + 120) return;
    const t = Date.now() / 1000;
    ctx.save();
    for (const s of STAR_OFFSETS) {
        const a = s.baseAlpha * (0.5 + 0.5 * Math.sin(t * 2.2 + s.phase));
        ctx.fillStyle = `rgba(255, 245, 220, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(centerSx + s.dx, centerSy + s.dy, 1.4, 0, Math.PI * 2);
        ctx.fill();
        // 微弱光晕
        if (a > 0.6) {
            ctx.fillStyle = `rgba(255, 245, 220, ${(a - 0.6) * 0.5})`;
            ctx.beginPath();
            ctx.arc(centerSx + s.dx, centerSy + s.dy, 3, 0, Math.PI * 2);
            ctx.fill();
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
        const sx = m.rx - cameraX;
        if (sx < -4 || sx > cw + 4) continue;
        ctx.fillStyle = `rgba(255, 230, 190, ${m.alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ===========================================================
// 3. 男主
// ===========================================================
function drawMan(cw: number, _ch: number, cameraX: number) {
    const home: any = state.home;
    if (!home) return;
    const m = home.actors.man;
    const sx = m.x - cameraX;
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
    const sx = g.x - cameraX;
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
