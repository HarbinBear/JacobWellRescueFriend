// 剧情进度选择页（沙盒重玩任意已解锁的晚）
//
// 入口：主菜单点"剧情进度"按钮 → state.screen = 'progressSelect'
// 渲染：纵向卡片列表（每张卡片对应一个 DialogueScene）
// 行为：点卡片 → state._isProgressSandbox = true，进入对应的 home 场景
//      重玩不污染主存档（HomeScene.returnToCampNextDay 会判断 sandbox 模式直接返回菜单）
//
// 解锁规则：
//   - 玩家在主存档已经历过的 night（state.story2.knownNights 包含其 id）即解锁
//   - 暂时简化：未解锁的晚不显示（不画灰色锁定卡，避免剧透）

import { state } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { getAllScenes } from '../story/scripts/_index';
import { DialogueScene } from '../story/scripts/types';

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

// 卡片布局
const CARD_W_RATIO = 0.84;
const CARD_H = 72;
const CARD_GAP = 12;
const LIST_TOP = 110;

export function getProgressBackBtnRect(): { x: number; y: number; w: number; h: number } {
    return { x: 14, y: 56, w: 72, h: 30 };
}

export function getUnlockedScenes(): DialogueScene[] {
    const known = new Set(state.story2.knownNights);
    return getAllScenes()
        .filter(s => known.has(s.id))
        .sort((a, b) => a.nightIndex - b.nightIndex);
}

export function getProgressCardRect(index: number): { x: number; y: number; w: number; h: number } {
    const cw = logicW;
    const w = cw * CARD_W_RATIO;
    const x = (cw - w) / 2;
    const y = LIST_TOP + index * (CARD_H + CARD_GAP);
    return { x, y, w, h: CARD_H };
}

export function drawProgressSelect() {
    const cw = logicW;
    const ch = logicH;
    const time = Date.now() / 1000;

    // 背景：与主菜单同款深海
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, '#001a2c');
    grad.addColorStop(1, '#000713');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    // 浮动气泡（轻量版）
    ctx.save();
    for (let i = 0; i < 10; i++) {
        const bx = cw * ((i * 0.137 + time * 0.015) % 1);
        const by = ch - (time * (10 + i % 4 * 4) + i * 80) % (ch + 40);
        const ba = 0.05 + (i % 3) * 0.03;
        ctx.fillStyle = `rgba(100,200,255,${ba})`;
        ctx.beginPath();
        ctx.arc(bx, by, 3 + (i % 3) * 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 返回按钮
    drawBackBtn();

    // 标题
    ctx.fillStyle = '#e0f0ff';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('剧情进度', cw / 2, 70);

    // 副标题
    const unlocked = getUnlockedScenes();
    ctx.fillStyle = 'rgba(180,210,230,0.65)';
    ctx.font = '12px Arial';
    ctx.fillText(`已解锁 ${unlocked.length} 个夜晚 · 点卡片可重温`, cw / 2, 92);

    // 列表
    if (unlocked.length === 0) {
        ctx.fillStyle = 'rgba(160,180,200,0.55)';
        ctx.font = '14px Arial';
        ctx.fillText('暂无已解锁的剧情。先去救人吧。', cw / 2, ch * 0.45);
        return;
    }

    for (let i = 0; i < unlocked.length; i++) {
        drawCard(unlocked[i], i, time);
    }
}

function drawBackBtn() {
    const r = getProgressBackBtnRect();
    ctx.save();
    ctx.fillStyle = 'rgba(20,30,50,0.85)';
    ctx.beginPath();
    rrect(ctx, r.x, r.y, r.w, r.h, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,180,220,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, r.x, r.y, r.w, r.h, 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,235,250,0.95)';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 返回', r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
}

function drawCard(scene: DialogueScene, index: number, time: number) {
    const r = getProgressCardRect(index);
    const pulse = 0.85 + Math.sin(time * 1.4 + index * 0.7) * 0.15;

    ctx.save();
    // 底色
    const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    grad.addColorStop(0, 'rgba(28,42,68,0.85)');
    grad.addColorStop(1, 'rgba(14,22,40,0.9)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    rrect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.strokeStyle = `rgba(140,200,255,${0.5 * pulse})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    rrect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.stroke();
    ctx.restore();

    // 左侧：夜序号
    ctx.fillStyle = 'rgba(180,220,255,0.8)';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`第 ${scene.nightIndex} 晚`, r.x + 16, r.y + 12);

    // 标题
    ctx.fillStyle = '#e0f0ff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(scene.title.replace(/^第 \d+ 晚 · /, ''), r.x + 16, r.y + 30);

    // 提示
    ctx.fillStyle = 'rgba(160,200,230,0.55)';
    ctx.font = '11px Arial';
    ctx.fillText('点击重温', r.x + 16, r.y + r.h - 18);

    // 右侧：播放图标
    ctx.fillStyle = `rgba(140,255,200,${0.7 * (0.6 + Math.sin(time * 2 + index) * 0.4)})`;
    ctx.font = '20px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶', r.x + r.w - 18, r.y + r.h / 2);
}
