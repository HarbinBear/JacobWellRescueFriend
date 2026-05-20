// 家场景渲染
//
// 当前为占位美术：用纯色块 + 简单几何形状画出"客厅"。
// 等正式美术资产到位后替换 drawBackground / drawMan / drawGirl 三个函数即可。
//
// 渲染层级（从底到顶）：
//   1. 客厅背景（墙、地面、窗、桌、收音机、墙上挂物）
//   2. 男主立绘
//   3. 女孩立绘
//   4. 对话框（dialogue 阶段）
//   5. 屋内热点高亮（free 阶段）
//   6. 睡觉按钮（free 阶段）
//   7. 黑场遮罩（fadeAlpha）

import { ctx, logicW, logicH } from './Canvas';
import { state } from '../core/state';
import { getCurrentNode } from '../story/DialogueRunner';
import { getSleepBtnRect } from '../story/HomeScene';

// 圆角矩形
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

// =============================================
// 主入口
// =============================================
export function drawHomeScene() {
    const home: any = state.home;
    if (!home) return;
    const cw = logicW;
    const ch = logicH;

    drawBackground(cw, ch);
    drawDeskAndWindow(cw, ch);
    drawWallPhotos(cw, ch);
    drawWindowSillStones(cw, ch);
    drawMan(cw, ch);
    drawGirl(cw, ch);

    if (home.phase === 'dialogue') {
        drawDialogueBox(cw, ch);
    }
    if (home.phase === 'free' && home.sleepBtnVisible) {
        drawHint(cw, ch, '时候不早了');
        drawSleepBtn(cw, ch);
    }

    // 黑场遮罩
    if (home.fadeAlpha > 0.001) {
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${home.fadeAlpha})`;
        ctx.fillRect(0, 0, cw, ch);
        ctx.restore();
    }
}

// =============================================
// 客厅背景：墙、地面、踢脚线
// =============================================
function drawBackground(cw: number, ch: number) {
    // 上半墙：暖灰
    const grad = ctx.createLinearGradient(0, 0, 0, ch * 0.7);
    grad.addColorStop(0, '#3a3128');
    grad.addColorStop(1, '#5a4a38');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch * 0.7);

    // 下半地面：木地板棕
    const floor = ctx.createLinearGradient(0, ch * 0.7, 0, ch);
    floor.addColorStop(0, '#3d2c1d');
    floor.addColorStop(1, '#1f1610');
    ctx.fillStyle = floor;
    ctx.fillRect(0, ch * 0.7, cw, ch * 0.3);

    // 踢脚线
    ctx.fillStyle = '#241914';
    ctx.fillRect(0, ch * 0.69, cw, 4);

    // 木地板纹理：横纹
    ctx.strokeStyle = 'rgba(60, 40, 25, 0.4)';
    ctx.lineWidth = 1;
    for (let y = ch * 0.74; y < ch; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
        ctx.stroke();
    }

    // 灯光晕：从天花板中央打下来一片暖光
    const lamp = ctx.createRadialGradient(cw * 0.5, ch * 0.2, 30, cw * 0.5, ch * 0.55, ch * 0.6);
    lamp.addColorStop(0, 'rgba(255, 220, 160, 0.18)');
    lamp.addColorStop(1, 'rgba(255, 220, 160, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, cw, ch);
}

// =============================================
// 桌子 + 窗户 + 收音机
// =============================================
function drawDeskAndWindow(cw: number, ch: number) {
    // 桌子（左侧 desk 锚点附近）
    const dx = cw * 0.16, dy = ch * 0.66;
    ctx.fillStyle = '#2c1f15';
    ctx.beginPath(); rrect(ctx, dx, dy, 90, 40, 4); ctx.fill();
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(dx + 6, dy + 38, 6, 26);
    ctx.fillRect(dx + 78, dy + 38, 6, 26);
    // 桌上放一摞纸（救援报告）
    ctx.fillStyle = '#d4cab0';
    ctx.fillRect(dx + 14, dy + 8, 24, 18);

    // 窗户（中央上方）
    const wx = cw * 0.55, wy = ch * 0.18;
    const ww = 110, wh = 130;
    // 窗框
    ctx.fillStyle = '#211711';
    ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
    // 玻璃 → 夜晚深蓝
    const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, '#0a1f3a');
    sky.addColorStop(1, '#1c2d4f');
    ctx.fillStyle = sky;
    ctx.fillRect(wx, wy, ww, wh);
    // 几颗星
    ctx.fillStyle = 'rgba(255, 240, 200, 0.85)';
    for (const [px, py] of [[0.2, 0.3], [0.55, 0.18], [0.75, 0.45], [0.4, 0.6]]) {
        ctx.beginPath();
        ctx.arc(wx + ww * px, wy + wh * py, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
    // 窗框十字
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(wx, wy + wh / 2 - 2, ww, 4);
    ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);

    // 收音机（窗下方）
    const rx = wx + 12, ry = wy + wh + 18;
    ctx.fillStyle = '#3b2a1a';
    ctx.beginPath(); rrect(ctx, rx, ry, 86, 38, 4); ctx.fill();
    ctx.fillStyle = '#7d6240';
    ctx.fillRect(rx + 8, ry + 8, 32, 22);
    ctx.fillStyle = '#241710';
    ctx.beginPath();
    ctx.arc(rx + 60, ry + 12, 5, 0, Math.PI * 2);
    ctx.arc(rx + 76, ry + 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#aa8c5a';
    ctx.fillRect(rx + 50, ry + 24, 30, 8);
}

// =============================================
// 墙上挂物（占位：3 张方框示意）
// =============================================
function drawWallPhotos(cw: number, ch: number) {
    const baseY = ch * 0.10;
    // 小学毕业班合影（左）
    drawPhotoFrame(cw * 0.22, baseY, 84, 52, '#7a6248');
    // 护林队合影（中偏右）
    drawPhotoFrame(cw * 0.40, baseY, 84, 52, '#6b573f');
    // 男主单人照（右上）
    drawPhotoFrame(cw * 0.78, baseY, 60, 76, '#806548');
}

function drawPhotoFrame(x: number, y: number, w: number, h: number, frame: string) {
    ctx.fillStyle = frame;
    ctx.beginPath(); rrect(ctx, x, y, w, h, 3); ctx.fill();
    ctx.fillStyle = 'rgba(220, 200, 170, 0.55)';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
}

// =============================================
// 窗台小石头
// =============================================
function drawWindowSillStones(cw: number, ch: number) {
    // 绘制累计石头数量（暂以 story2.flags['stoneCountAdded'] 计数 + nightIndex 估算）
    // 简单表现：每经历过一个 known night 多一颗
    const count = Math.min(8, state.story2.knownNights.length);
    if (count <= 0) return;
    const baseX = cw * 0.55 - 4;
    const baseY = ch * 0.18 + 130 + 8;
    for (let i = 0; i < count; i++) {
        ctx.fillStyle = '#5b4a3a';
        ctx.beginPath();
        ctx.ellipse(baseX + i * 10, baseY, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

// =============================================
// 男主：占位为简笔人
// =============================================
function drawMan(cw: number, ch: number) {
    const home: any = state.home;
    if (!home) return;
    const m = home.actors.man;
    if (m.x < -40 || m.x > cw + 40) return;
    drawSimpleHuman(m.x, m.y, 1.0, '#3b3b46', '#c6a486');
}

function drawGirl(cw: number, ch: number) {
    const home: any = state.home;
    if (!home || !home.actors.girl.visible) return;
    const g = home.actors.girl;
    if (g.x < -40 || g.x > cw + 40) return;
    drawSimpleHuman(g.x, g.y, 0.65, '#a7c4e3', '#f1d7c0');
}

function drawSimpleHuman(x: number, y: number, scale: number, bodyColor: string, skinColor: string) {
    // 人物站立时 y 对应脚底
    const headR = 8 * scale;
    const bodyW = 16 * scale;
    const bodyH = 26 * scale;
    const legH = 18 * scale;
    const feetY = y;
    const bodyBottomY = feetY - legH;
    const bodyTopY = bodyBottomY - bodyH;
    const headCY = bodyTopY - headR - 1 * scale;

    // 影子
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(x, feetY + 2, headR * 1.2, headR * 0.4, 0, 0, Math.PI * 2);
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

// =============================================
// 对话框
// =============================================
function drawDialogueBox(cw: number, ch: number) {
    const node = getCurrentNode();
    if (!node) return;
    const home: any = state.home;
    const text = (node.text || '').slice(0, Math.floor(home.dialogue.textProgress));

    const boxX = cw * 0.06;
    const boxY = ch * 0.74;
    const boxW = cw * 0.88;
    const boxH = ch * 0.22 - 12;

    // 底色
    ctx.save();
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
    // 中文按字符切分
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

// =============================================
// 睡觉按钮
// =============================================
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
