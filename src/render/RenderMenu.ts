import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';

// 兼容微信小游戏的圆角矩形
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

// =====================================================================
// 主菜单（新主线《唐老师的救援》）
//
// 4 项布局：继续游戏 / 剧情进度 / 新游戏 / 设置
//   - 继续游戏：直接进迷宫救援营地（旧存档继续）
//   - 剧情进度：进入 progressSelect 屏，可重玩任意已解锁的晚（沙盒模式）
//   - 新游戏：清存档重开（弹确认框）
//   - 设置：占位（暂不实装；阶段 4 之后接入音频/画质/GM）
//
// 旧的"开始游戏 / 章节选择 / 食人鱼竞技场 / 迷宫纯享版"四按钮已废弃。
// 食人鱼竞技场代码保留，主菜单不暴露入口（GM 面板可强制进）。
//
// 新游戏确认框由 state._menuConfirmNewGame 状态切换。
// =====================================================================

export type MenuButtonId = 'continue' | 'progress' | 'newGame' | 'settings';

interface MenuButtonRect {
    id: MenuButtonId;
    x: number; y: number; w: number; h: number;
    label: string;
    subLabel?: string;
    enabled: boolean;
    primary?: boolean;
}

// 给 input.ts 用的：返回当前所有按钮的命中矩形
export function getMenuButtonRects(): MenuButtonRect[] {
    const cw = logicW;
    const ch = logicH;
    const story2 = state.story2;
    const hasProgress = (story2.nightIndex || 0) > 0 || story2.knownNights.length > 0;

    const btnW = 220;
    const btnH = 52;
    const gap = 14;
    const groupTop = ch * 0.50;

    return [
        {
            id: 'continue',
            x: cw / 2 - btnW / 2,
            y: groupTop,
            w: btnW, h: btnH,
            label: '继续游戏',
            subLabel: hasProgress ? `第 ${Math.max(1, story2.nightIndex)} 晚` : '从第 1 晚开始',
            enabled: true,
            primary: true,
        },
        {
            id: 'progress',
            x: cw / 2 - btnW / 2,
            y: groupTop + (btnH + gap),
            w: btnW, h: btnH,
            label: '剧情进度',
            subLabel: hasProgress ? `已解锁 ${story2.knownNights.length} 晚` : '暂无解锁',
            enabled: hasProgress,
        },
        {
            id: 'newGame',
            x: cw / 2 - btnW / 2,
            y: groupTop + (btnH + gap) * 2,
            w: btnW, h: btnH,
            label: '新游戏',
            subLabel: hasProgress ? '清空进度，从头开始' : '',
            enabled: true,
        },
        {
            id: 'settings',
            x: cw / 2 - btnW / 2,
            y: groupTop + (btnH + gap) * 3,
            w: btnW, h: btnH,
            label: '设置',
            subLabel: '音频 · 画质 · GM',
            enabled: false, // 占位，阶段 4 之后再接入
        },
    ];
}

// 新游戏确认框矩形
export function getNewGameConfirmRects() {
    const cw = logicW, ch = logicH;
    const w = 280, h = 140;
    const x = cw / 2 - w / 2;
    const y = ch / 2 - h / 2;
    const btnW = 100, btnH = 36;
    return {
        panel: { x, y, w, h },
        confirm: { x: x + w / 2 - btnW - 8, y: y + h - btnH - 14, w: btnW, h: btnH },
        cancel:  { x: x + w / 2 + 8,        y: y + h - btnH - 14, w: btnW, h: btnH },
    };
}

// =====================================================================
// 渲染
// =====================================================================
export function drawMenu() {
    const time = Date.now() / 1000;
    drawBackground(time);
    drawTitle();
    drawButtons(time);
    drawVersion();
    if ((state as any)._menuConfirmNewGame) {
        drawNewGameConfirm();
    }
}

function drawBackground(time: number) {
    const grad = ctx.createLinearGradient(0, 0, 0, logicH);
    grad.addColorStop(0, '#001a33');
    grad.addColorStop(0.5, '#001122');
    grad.addColorStop(1, '#000811');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, logicW, logicH);

    ctx.save();
    for (let i = 0; i < 18; i++) {
        const bx = logicW * ((i * 0.137 + time * 0.02 * (1 + i % 3 * 0.3)) % 1);
        const by = logicH - (time * (15 + i % 5 * 5) + i * 80) % (logicH + 60);
        const br = 3 + (i % 4) * 3;
        const ba = 0.08 + (i % 3) * 0.05;
        ctx.fillStyle = `rgba(100,220,255,${ba})`;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${ba * 1.5})`;
        ctx.beginPath();
        ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
        const rx = logicW / 2 + Math.sin(time * 0.4 + i * 1.6) * 120;
        const rg = ctx.createLinearGradient(rx, 0, rx, logicH);
        rg.addColorStop(0, 'rgba(0,200,255,0.12)');
        rg.addColorStop(0.6, 'rgba(0,200,255,0.04)');
        rg.addColorStop(1, 'rgba(0,200,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(rx - 30, 0);
        ctx.lineTo(rx + 30, 0);
        ctx.lineTo(rx + 80, logicH);
        ctx.lineTo(rx - 80, logicH);
        ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(100,220,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let wx2 = 0; wx2 < logicW; wx2 += 10) {
        ctx.lineTo(wx2, 18 + Math.sin(wx2 / 60 + time * 1.5) * 5);
    }
    ctx.stroke();
}

function drawTitle() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const titleGlow = ctx.createRadialGradient(logicW / 2, logicH * 0.22, 0, logicW / 2, logicH * 0.22, 120);
    titleGlow.addColorStop(0, 'rgba(0,200,255,0.2)');
    titleGlow.addColorStop(1, 'rgba(0,200,255,0)');
    ctx.fillStyle = titleGlow;
    ctx.fillRect(logicW / 2 - 120, logicH * 0.22 - 60, 240, 120);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,200,255,0.15)';
    ctx.font = 'bold 36px Arial';
    ctx.fillText("唐老师的救援", logicW / 2 + 2, logicH * 0.22 + 2);
    ctx.fillStyle = '#e0f8ff';
    ctx.font = 'bold 36px Arial';
    ctx.fillText("唐老师的救援", logicW / 2, logicH * 0.22);

    ctx.fillStyle = 'rgba(160,200,220,0.55)';
    ctx.font = '14px Arial';
    ctx.fillText("Jacob's Well · Rescue", logicW / 2, logicH * 0.30);

    ctx.strokeStyle = 'rgba(0,200,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(logicW / 2 - 80, logicH * 0.36);
    ctx.lineTo(logicW / 2 + 80, logicH * 0.36);
    ctx.stroke();
}

function drawButtons(time: number) {
    const buttons = getMenuButtonRects();
    for (const b of buttons) {
        drawButton(b, time);
    }
}

function drawButton(b: MenuButtonRect, time: number) {
    const pulse = 0.85 + Math.sin(time * 2 + (b.primary ? 0 : 1)) * 0.15;
    const enabled = b.enabled;

    ctx.save();
    ctx.globalAlpha = enabled ? pulse : 0.4;

    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    if (!enabled) {
        grad.addColorStop(0, 'rgba(50,50,70,0.4)');
        grad.addColorStop(1, 'rgba(30,30,50,0.4)');
    } else if (b.primary) {
        grad.addColorStop(0, 'rgba(0,120,80,0.55)');
        grad.addColorStop(0.5, 'rgba(0,160,100,0.45)');
        grad.addColorStop(1, 'rgba(0,80,50,0.55)');
    } else {
        grad.addColorStop(0, 'rgba(20,40,68,0.6)');
        grad.addColorStop(1, 'rgba(10,22,40,0.7)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    rrect(ctx, b.x, b.y, b.w, b.h, 26);
    ctx.fill();

    ctx.strokeStyle = enabled
        ? (b.primary ? `rgba(0,220,140,${pulse * 0.95})` : `rgba(120,200,255,${pulse * 0.7})`)
        : 'rgba(80,80,100,0.4)';
    ctx.lineWidth = b.primary ? 1.5 : 1.1;
    ctx.beginPath();
    rrect(ctx, b.x, b.y, b.w, b.h, 26);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = enabled
        ? (b.primary ? `rgba(140,255,200,${pulse})` : `rgba(220,235,250,${pulse})`)
        : 'rgba(120,120,140,0.6)';
    ctx.font = `bold ${b.primary ? 20 : 18}px Arial`;
    const labelY = b.subLabel ? b.y + b.h / 2 - 8 : b.y + b.h / 2;
    ctx.fillText(b.label, b.x + b.w / 2, labelY);

    if (b.subLabel) {
        ctx.fillStyle = enabled ? 'rgba(180,210,230,0.7)' : 'rgba(120,120,140,0.5)';
        ctx.font = '11px Arial';
        ctx.fillText(b.subLabel, b.x + b.w / 2, b.y + b.h / 2 + 12);
    }
}

function drawVersion() {
    ctx.fillStyle = 'rgba(80,120,140,0.8)';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${CONFIG.version}  By 游呢王纸`, logicW / 2, logicH - 22);
}

// =====================================================================
// 新游戏确认框
// =====================================================================
function drawNewGameConfirm() {
    const r = getNewGameConfirmRects();

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, logicW, logicH);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(20,30,46,0.96)';
    ctx.beginPath();
    rrect(ctx, r.panel.x, r.panel.y, r.panel.w, r.panel.h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,180,220,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, r.panel.x, r.panel.y, r.panel.w, r.panel.h, 12);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#e0f0ff';
    ctx.font = 'bold 17px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('开始新游戏？', r.panel.x + r.panel.w / 2, r.panel.y + 30);

    ctx.fillStyle = 'rgba(180,200,220,0.85)';
    ctx.font = '12px Arial';
    ctx.fillText('当前进度（夜晚 / 装备 / 物品）将全部清空。', r.panel.x + r.panel.w / 2, r.panel.y + 60);
    ctx.fillText('此操作不可撤销。', r.panel.x + r.panel.w / 2, r.panel.y + 78);

    drawSimpleBtn(r.confirm, '确认', 'rgba(180,80,80,0.8)', '#fff');
    drawSimpleBtn(r.cancel,  '取消', 'rgba(60,80,100,0.8)', '#cce0f0');
}

function drawSimpleBtn(rect: {x: number; y: number; w: number; h: number}, label: string, bg: string, fg: string) {
    ctx.save();
    ctx.fillStyle = bg;
    ctx.beginPath();
    rrect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
}
