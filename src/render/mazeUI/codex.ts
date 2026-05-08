// 岸上「图鉴」入口按钮 + 全屏图鉴页（总图鉴 32 种）
//
// 设计要点：
//   - 总图鉴跨关累计：每一格代表一个 RelicKind 类型，已发现=彩色图+名+描述，未发现=灰剪影+???
//   - 4 列 × 8 行网格
//   - 里程碑条幅：8/16/24/32 四档达成时在标题下方显示一条荣誉称号
//   - 点单格 → 弹出详情卡（居中大图 + 名字 + 描述），点空白关闭
//   - 进度条金色填充，底下文字 X / 32
//   - 入口按钮显示 种类累计已发现数 / 总种类数，不再是"本关物件数"
//
// 状态：state.mazeRescue.codexSelectedKind（运行时字段，不进存档）
//        = null → 没选中；= RelicKind 字符串 → 显示该种详情卡
//
// 对外导出（供 input.ts 判断 hit-test）：
//   getCodexEntryBtnRect / getCodexCloseBtnRect
//   getCodexCellRectByIndex / getCodexCellCount（给 input.ts 遍历所有单格做点击判定）

import { ctx } from '../Canvas';
import { state } from '../../core/state';
import {
    ALL_RELIC_KINDS,
    RELIC_TYPES,
    RelicKind,
    getCodexFoundKindSet,
    getCodexFoundKindCount,
    getCodexTotalKindCount,
} from '../../logic/Relic';

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
// 岸上入口按钮
// =============================================
const CODEX_BTN_W = 98;
const CODEX_BTN_H = 34;
const CODEX_BTN_MARGIN_RIGHT = 16;
const CODEX_BTN_MARGIN_TOP = 62;

export function getCodexEntryBtnRect(cw: number): { x: number; y: number; w: number; h: number } {
    return {
        x: cw - CODEX_BTN_W - CODEX_BTN_MARGIN_RIGHT,
        y: CODEX_BTN_MARGIN_TOP,
        w: CODEX_BTN_W,
        h: CODEX_BTN_H,
    };
}

export function drawCodexEntryBtn(cw: number, _time: number) {
    const maze: any = state.mazeRescue;
    if (!maze) return;
    const rect = getCodexEntryBtnRect(cw);

    const found = getCodexFoundKindCount();
    const total = getCodexTotalKindCount();

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(52, 38, 26, 0.88)';
    ctx.beginPath();
    rrect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();

    ctx.strokeStyle = found >= total ? 'rgba(255, 210, 110, 0.95)' : 'rgba(205, 165, 110, 0.7)';
    ctx.lineWidth = found >= total ? 1.6 : 1;
    ctx.beginPath();
    rrect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.stroke();

    // 左侧小螺图标
    const icX = rect.x + 16;
    const icY = rect.y + rect.h / 2;
    ctx.strokeStyle = 'rgba(230, 200, 150, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.fillStyle = 'rgba(230, 200, 150, 0.25)';
    ctx.beginPath();
    ctx.ellipse(icX, icY, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(icX, icY, 3.5, 3, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 文字
    ctx.fillStyle = 'rgba(245, 220, 180, 0.95)';
    ctx.font = 'italic bold 13px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('图鉴', icX + 12, icY - 1);

    ctx.font = '11px Arial';
    ctx.fillStyle = found >= total ? 'rgba(255, 220, 140, 0.95)' : 'rgba(230, 200, 150, 0.75)';
    ctx.fillText(found + '/' + total, icX + 42, icY);

    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

// =============================================
// 图鉴页布局常量（全屏）
// =============================================
const GRID_COLS = 4;
const GRID_ROWS = 8;
const GRID_TOP = 128;      // 标题 + 条幅占到 ~125
const GRID_PAD_X = 14;
const GRID_GAP = 6;
const GRID_BOTTOM_FROM_CH = 68;  // 底部留给进度条

// 单格区域（外部可查询，用于 input.ts hit-test）
export function getCodexCellCount(): number { return ALL_RELIC_KINDS.length; }

export function getCodexCellRectByIndex(cw: number, ch: number, idx: number): { x: number; y: number; w: number; h: number } | null {
    if (idx < 0 || idx >= ALL_RELIC_KINDS.length) return null;
    const gridBottom = ch - GRID_BOTTOM_FROM_CH;
    const cellW = (cw - GRID_PAD_X * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
    const cellH = (gridBottom - GRID_TOP - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;
    const row = Math.floor(idx / GRID_COLS);
    const col = idx % GRID_COLS;
    return {
        x: GRID_PAD_X + col * (cellW + GRID_GAP),
        y: GRID_TOP + row * (cellH + GRID_GAP),
        w: cellW,
        h: cellH,
    };
}

// 返回按钮
export function getCodexCloseBtnRect(): { x: number; y: number; w: number; h: number } {
    return { x: 8, y: 8, w: 78, h: 32 };
}

// =============================================
// 里程碑称号
// =============================================
const MILESTONES: Array<{ threshold: number; title: string; desc: string }> = [
    { threshold: 8,  title: '探索初见',         desc: '你已收录了第一批遗物' },
    { threshold: 16, title: '博物学家',         desc: '过半的水下档案正在被你整理' },
    { threshold: 24, title: '资深考古',         desc: '这口井的秘密已经对你敞开' },
    { threshold: 32, title: '雅各布井档案官',   desc: '无人能比你更了解这里的一切' },
];

function getCurrentMilestone(found: number): { threshold: number; title: string; desc: string } | null {
    let cur: { threshold: number; title: string; desc: string } | null = null;
    for (const m of MILESTONES) {
        if (found >= m.threshold) cur = m;
    }
    return cur;
}

// =============================================
// 全屏图鉴页
// =============================================
export function drawMazeCodex(cw: number, ch: number, _time: number) {
    const maze: any = state.mazeRescue;
    if (!maze) return;

    const foundSet = getCodexFoundKindSet();
    const foundCount = getCodexFoundKindCount();
    const total = getCodexTotalKindCount();
    const milestone = getCurrentMilestone(foundCount);
    const isMax = foundCount >= total;

    ctx.save();

    // 背景：羊皮纸
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(232, 220, 192, 1)';
    ctx.fillRect(0, 0, cw, ch);

    // 羊皮纸噪点
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 80; i++) {
        const sx = Math.sin(i * 7.3 + 0.5) * cw * 0.5 + cw * 0.5;
        const sy = Math.cos(i * 5.1 + 1.2) * ch * 0.5 + ch * 0.5;
        const sr = Math.abs(1.5 + Math.sin(i * 3.7) * 1.2);
        ctx.fillStyle = i % 3 === 0 ? '#8B7355' : '#A0926B';
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 标题
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic bold 22px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('水下图鉴', cw / 2, 40);

    // 标题下波浪线
    ctx.strokeStyle = 'rgba(62,44,35,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cw * 0.3; x < cw * 0.7; x += 3) {
        const wy = 48 + Math.sin(x * 0.15) * 1.6;
        if (x === cw * 0.3) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
    }
    ctx.stroke();

    // 里程碑条幅
    if (milestone) {
        const bannerY = 62;
        const bannerH = 40;
        const bannerW = Math.min(cw - 48, 340);
        const bx = (cw - bannerW) / 2;
        // 金色底
        if (isMax) {
            // 满级：加宽金色辉光
            const grad = ctx.createLinearGradient(bx, 0, bx + bannerW, 0);
            grad.addColorStop(0, 'rgba(200,150,40,0.15)');
            grad.addColorStop(0.5, 'rgba(255,210,110,0.55)');
            grad.addColorStop(1, 'rgba(200,150,40,0.15)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            rrect(ctx, bx, bannerY, bannerW, bannerH, 6);
            ctx.fill();
            ctx.strokeStyle = 'rgba(200,140,50,0.9)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            rrect(ctx, bx, bannerY, bannerW, bannerH, 6);
            ctx.stroke();
            // 两侧小五星
            ctx.fillStyle = '#a07020';
            drawSmallStar(ctx, bx + 18, bannerY + bannerH / 2, 5);
            drawSmallStar(ctx, bx + bannerW - 18, bannerY + bannerH / 2, 5);
        } else {
            ctx.fillStyle = 'rgba(100, 70, 30, 0.12)';
            ctx.beginPath();
            rrect(ctx, bx, bannerY, bannerW, bannerH, 6);
            ctx.fill();
            ctx.strokeStyle = 'rgba(130, 90, 40, 0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            rrect(ctx, bx, bannerY, bannerW, bannerH, 6);
            ctx.stroke();
        }
        // 文字
        ctx.fillStyle = isMax ? '#6a3f10' : '#4a351f';
        ctx.font = 'italic bold 14px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('· ' + milestone.title + ' ·', cw / 2, bannerY + 14);
        ctx.fillStyle = isMax ? 'rgba(106,63,16,0.85)' : 'rgba(100,75,50,0.8)';
        ctx.font = 'italic 10px Georgia, serif';
        ctx.fillText(milestone.desc, cw / 2, bannerY + 29);
        ctx.textBaseline = 'alphabetic';
    } else {
        // 还没到第一档：显示激励
        ctx.fillStyle = 'rgba(100, 80, 60, 0.6)';
        ctx.font = 'italic 11px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('收集 ' + MILESTONES[0].threshold + ' 种，解锁「' + MILESTONES[0].title + '」称号', cw / 2, 82);
        ctx.textBaseline = 'alphabetic';
    }

    // 返回按钮
    const closeRect = getCodexCloseBtnRect();
    ctx.fillStyle = 'rgba(62,44,35,0.12)';
    ctx.beginPath();
    rrect(ctx, closeRect.x, closeRect.y, closeRect.w, closeRect.h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(62,44,35,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, closeRect.x, closeRect.y, closeRect.w, closeRect.h, 14);
    ctx.stroke();
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 返回', closeRect.x + closeRect.w / 2, closeRect.y + closeRect.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';

    // 32 格网格
    for (let idx = 0; idx < ALL_RELIC_KINDS.length; idx++) {
        const rect = getCodexCellRectByIndex(cw, ch, idx);
        if (!rect) continue;
        const kind = ALL_RELIC_KINDS[idx];
        const found = foundSet.has(kind);
        drawCodexCell(ctx, rect.x, rect.y, rect.w, rect.h, kind, found);
    }

    // 底部进度条
    const progressY = ch - 40;
    const barW = cw * 0.7;
    const barH = 8;
    const barX = (cw - barW) / 2;
    const barY = progressY + 4;
    // 底色
    ctx.fillStyle = 'rgba(70, 55, 45, 0.18)';
    ctx.beginPath();
    rrect(ctx, barX, barY, barW, barH, 4);
    ctx.fill();
    // 金色填充
    const progress = total > 0 ? foundCount / total : 0;
    if (progress > 0) {
        const fillW = barW * progress;
        const gradFill = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        if (isMax) {
            gradFill.addColorStop(0, '#b07a30');
            gradFill.addColorStop(0.5, '#f4d270');
            gradFill.addColorStop(1, '#b07a30');
        } else {
            gradFill.addColorStop(0, '#8a5a28');
            gradFill.addColorStop(1, '#cf9e48');
        }
        ctx.fillStyle = gradFill;
        ctx.beginPath();
        rrect(ctx, barX, barY, fillW, barH, 4);
        ctx.fill();
    }
    // 里程碑小刻度
    ctx.fillStyle = 'rgba(70,55,45,0.55)';
    for (const m of MILESTONES) {
        const fracX = barX + barW * (m.threshold / total);
        ctx.fillRect(fracX - 0.5, barY - 2, 1, barH + 4);
    }
    // 文字
    ctx.fillStyle = isMax ? '#6a3f10' : '#3E2C23';
    ctx.font = isMax ? 'italic bold 14px Georgia, serif' : 'italic bold 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('图鉴进度 ' + foundCount + ' / ' + total, cw / 2, progressY - 6);
    ctx.textBaseline = 'alphabetic';

    // 详情卡
    const selKind: RelicKind | null = (maze.codexSelectedKind as RelicKind) || null;
    if (selKind && ALL_RELIC_KINDS.indexOf(selKind) >= 0) {
        drawCodexDetailCard(cw, ch, selKind, foundSet.has(selKind));
    }

    ctx.restore();
}

// =============================================
// 单格
// =============================================
function drawCodexCell(
    ctx2: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    kind: RelicKind, found: boolean,
) {
    const def = RELIC_TYPES[kind];

    ctx2.globalAlpha = 1;
    if (found) {
        ctx2.fillStyle = 'rgba(248, 236, 212, 0.95)';
    } else {
        ctx2.fillStyle = 'rgba(200, 190, 172, 0.7)';
    }
    ctx2.beginPath();
    rrect(ctx2, x, y, w, h, 6);
    ctx2.fill();

    ctx2.strokeStyle = found ? 'rgba(70, 55, 45, 0.35)' : 'rgba(70, 55, 45, 0.18)';
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    rrect(ctx2, x, y, w, h, 6);
    ctx2.stroke();

    // 图标区
    const iconAreaH = h * 0.65;
    const iconCx = x + w / 2;
    const iconCy = y + iconAreaH / 2 + 1;
    const iconScale = Math.min(w, iconAreaH) * 0.08;

    ctx2.save();
    ctx2.translate(iconCx, iconCy);
    ctx2.scale(iconScale, iconScale);

    if (found) {
        drawIconVector(ctx2, kind);
    } else {
        // 灰剪影
        ctx2.globalAlpha = 0.35;
        drawIconVector(ctx2, kind);
        ctx2.globalAlpha = 1;
        // 中央大问号覆盖
        ctx2.fillStyle = 'rgba(70, 55, 45, 0.75)';
        ctx2.font = 'bold 16px Georgia, serif';
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText('?', 0, 0);
    }

    ctx2.restore();

    // 名字条
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    const nameY = y + iconAreaH + 12;
    if (found) {
        ctx2.fillStyle = '#3E2C23';
        ctx2.font = 'italic bold 10.5px Georgia, serif';
        ctx2.fillText(def.name, x + w / 2, nameY);
    } else {
        ctx2.fillStyle = 'rgba(90, 75, 60, 0.55)';
        ctx2.font = 'italic bold 10.5px Georgia, serif';
        ctx2.fillText('？？？', x + w / 2, nameY);
    }
}

// =============================================
// 详情卡（居中弹出）
// =============================================
function drawCodexDetailCard(cw: number, ch: number, kind: RelicKind, found: boolean) {
    // 半透明背板（不遮全屏，压一层让详情聚焦）
    ctx.fillStyle = 'rgba(40, 30, 20, 0.45)';
    ctx.fillRect(0, 0, cw, ch);

    const def = RELIC_TYPES[kind];
    const cardW = Math.min(cw - 48, 320);
    const cardH = 240;
    const cardX = (cw - cardW) / 2;
    const cardY = (ch - cardH) / 2;

    // 卡片底
    ctx.fillStyle = 'rgba(250, 240, 216, 0.98)';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 10);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 卡片描边
    ctx.strokeStyle = found ? 'rgba(200,140,60,0.85)' : 'rgba(130,100,70,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 10);
    ctx.stroke();

    // 大图区
    const iconR = 56;
    const iconCx = cardX + cardW / 2;
    const iconCy = cardY + 66;
    // 背景圆
    ctx.fillStyle = found ? 'rgba(200,160,90,0.18)' : 'rgba(120,100,80,0.12)';
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = found ? 'rgba(160,110,50,0.55)' : 'rgba(110,90,70,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
    ctx.stroke();

    // 图标
    ctx.save();
    ctx.translate(iconCx, iconCy);
    ctx.scale(4.2, 4.2);
    if (found) {
        drawIconVector(ctx, kind);
    } else {
        ctx.globalAlpha = 0.35;
        drawIconVector(ctx, kind);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(70, 55, 45, 0.75)';
        ctx.font = 'bold 10px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 0);
    }
    ctx.restore();

    // 名字
    ctx.fillStyle = found ? '#3E2C23' : 'rgba(70,55,45,0.6)';
    ctx.font = 'italic bold 16px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(found ? def.name : '？？？', cardX + cardW / 2, cardY + 150);

    // 描述
    const desc = found ? def.desc : '仍未收录。继续下潜，让手电的光照进那些还没看过的角落。';
    wrapText(ctx, desc, cardX + cardW / 2, cardY + 172, cardW - 36, 16);

    // 底部"点空白关闭"提示
    ctx.fillStyle = 'rgba(100,80,60,0.5)';
    ctx.font = 'italic 10px Georgia, serif';
    ctx.fillText('— 点空白处关闭 —', cardX + cardW / 2, cardY + cardH - 14);
}

function wrapText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
    c.fillStyle = 'rgba(70, 55, 45, 0.85)';
    c.font = 'italic 12px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    // 按中文字符宽度估算，每行最多 maxW/10 个字符
    const perLine = Math.max(8, Math.floor(maxW / 12));
    const lines: string[] = [];
    let cur = 0;
    while (cur < text.length) {
        lines.push(text.slice(cur, cur + perLine));
        cur += perLine;
        if (lines.length >= 3) break;
    }
    for (let i = 0; i < lines.length; i++) {
        c.fillText(lines[i], x, y + i * lineH);
    }
}

function drawSmallStar(c: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        const px = cx + Math.cos(ang) * rr;
        const py = cy + Math.sin(ang) * rr;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
}

// =============================================
// 图标绘制：32 种矢量图（与世界层风格一致的小号版本）
// =============================================
const P = {
    bone: '#c9c0a8', boneDark: '#706a58',
    coinBody: '#8a7030', coinEdge: '#5c4a20',
    pot: '#6e4c34', potEdge: '#3b2416',
    iron: '#6a7378', ironEdge: '#2e3437', rust: '#a55a30',
    silver: '#b8c0c5', silverEdge: '#676d72', gem: '#4a8daf',
    stone: '#6a655a', stoneDark: '#3a3530',
    brass: '#a07030', brassEdge: '#5c3a14',
    shell: '#b8a27a', shellLine: '#6a5432',
};

function drawIconVector(c: CanvasRenderingContext2D, kind: RelicKind) {
    switch (kind) {
        case 'skeleton':     iconSkeleton(c); break;
        case 'coin':         iconCoin(c); break;
        case 'potshard':     iconPotshard(c); break;
        case 'anchor':       iconAnchor(c); break;
        case 'ring':         iconRing(c); break;
        case 'stoneTablet':  iconStoneTablet(c); break;
        case 'fishhook':     iconFishhook(c); break;
        case 'bell':         iconBell(c); break;
        case 'rustyKey':     iconRustyKey(c); break;
        case 'shell':        iconShell(c); break;
        case 'silverCoin':   iconSilverCoin(c); break;
        case 'humanSkull':   iconHumanSkull(c); break;
        case 'pocketWatch':  iconPocketWatch(c); break;
        case 'oilLamp':      iconOilLamp(c); break;
        case 'smallKnife':   iconSmallKnife(c); break;
        case 'maskShard':    iconMaskShard(c); break;
        case 'waterFlask':   iconWaterFlask(c); break;
        case 'ironNail':     iconIronNail(c); break;
        case 'brassCompass': iconBrassCompass(c); break;
        case 'leatherBoot':  iconLeatherBoot(c); break;
        case 'cross':        iconCross(c); break;
        case 'amulet':       iconAmulet(c); break;
        case 'idolFigure':   iconIdolFigure(c); break;
        case 'crystal':      iconCrystal(c); break;
        case 'ceramicBowl':  iconCeramicBowl(c); break;
        case 'glassBottle':  iconGlassBottle(c); break;
        case 'coralChunk':   iconCoralChunk(c); break;
        case 'sharkTooth':   iconSharkTooth(c); break;
        case 'fishSkeleton': iconFishSkeleton(c); break;
        case 'fossil':       iconFossil(c); break;
        case 'obsidian':     iconObsidian(c); break;
        case 'cameraHousing':iconCameraHousing(c); break;
    }
}

// 老 10 种（保持原样，和上个版本一致）
function iconSkeleton(c: CanvasRenderingContext2D) {
    c.fillStyle = P.bone; c.strokeStyle = P.boneDark; c.lineWidth = 0.6;
    c.beginPath(); c.ellipse(0, -2, 7, 6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = P.stoneDark;
    c.beginPath(); c.arc(-2.4, -2.4, 1.4, 0, Math.PI * 2); c.arc(2.4, -2.4, 1.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = P.bone; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-6, 6); c.lineTo(-10, 10); c.moveTo(6, 6); c.lineTo(10, 9);
    c.moveTo(0, 5); c.lineTo(2, 12);
    c.stroke();
    c.lineCap = 'butt';
}
function iconCoin(c: CanvasRenderingContext2D) {
    c.fillStyle = P.coinBody; c.strokeStyle = P.coinEdge; c.lineWidth = 0.6;
    c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0, 5.3, 0, Math.PI * 2); c.lineWidth = 0.3; c.stroke();
    c.fillStyle = P.stoneDark; c.fillRect(-1.6, -1.6, 3.2, 3.2);
    c.fillStyle = 'rgba(80,130,90,0.7)';
    c.beginPath(); c.arc(-4, -2.5, 0.8, 0, Math.PI * 2); c.arc(3.5, 2.5, 0.7, 0, Math.PI * 2); c.fill();
}
function iconPotshard(c: CanvasRenderingContext2D) {
    c.fillStyle = P.pot; c.strokeStyle = P.potEdge; c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(-9, 4);
    c.quadraticCurveTo(-8, -6, 0, -7);
    c.quadraticCurveTo(8, -6, 9, 4);
    c.lineTo(7, 5); c.lineTo(5, 4); c.lineTo(2, 5.2); c.lineTo(-2, 4); c.lineTo(-5, 5); c.lineTo(-7, 4);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = P.potEdge; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-7, -2); c.lineTo(7, -2);
    c.moveTo(-6, 0); c.lineTo(6, 0);
    c.stroke();
}
function iconAnchor(c: CanvasRenderingContext2D) {
    c.strokeStyle = P.ironEdge; c.fillStyle = P.iron; c.lineWidth = 1.4; c.lineCap = 'round';
    c.beginPath(); c.arc(0, -8, 2.2, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(-5, -4); c.lineTo(5, -4); c.stroke();
    c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 7); c.stroke();
    c.beginPath(); c.moveTo(0, 7); c.quadraticCurveTo(-6, 7, -6, 2); c.stroke();
    c.beginPath(); c.moveTo(0, 7); c.quadraticCurveTo(6, 7, 6, 2); c.stroke();
    c.lineCap = 'butt';
}
function iconRing(c: CanvasRenderingContext2D) {
    c.strokeStyle = P.silver; c.lineWidth = 1.8;
    c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2); c.stroke();
    c.fillStyle = P.gem;
    c.beginPath(); c.arc(0, -5.5, 1.8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = P.silverEdge; c.lineWidth = 0.4; c.stroke();
}
function iconStoneTablet(c: CanvasRenderingContext2D) {
    c.fillStyle = P.stone; c.strokeStyle = P.stoneDark; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-8, -6); c.lineTo(7, -6.5); c.lineTo(8, 5); c.lineTo(-7, 6);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = P.stoneDark; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-6, -3); c.lineTo(-2, -3); c.moveTo(0, -3); c.lineTo(5, -3);
    c.moveTo(-6, -1); c.lineTo(6, -1);
    c.moveTo(-5, 1.5); c.lineTo(-1, 1.5); c.moveTo(1.5, 1.5); c.lineTo(4, 1.5);
    c.moveTo(-5, 3.5); c.lineTo(4, 3.5);
    c.stroke();
}
function iconFishhook(c: CanvasRenderingContext2D) {
    c.strokeStyle = P.ironEdge; c.lineWidth = 1.4; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-1, -7); c.lineTo(-1, 2);
    c.quadraticCurveTo(-1, 7, 3, 7);
    c.quadraticCurveTo(7, 7, 7, 2.5);
    c.stroke();
    c.beginPath(); c.moveTo(7, 2.5); c.lineTo(5, 4); c.stroke();
    c.beginPath(); c.arc(-1, -7.8, 1.3, 0, Math.PI * 2); c.stroke();
    c.lineCap = 'butt';
}
function iconBell(c: CanvasRenderingContext2D) {
    c.fillStyle = P.brass; c.strokeStyle = P.brassEdge; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-5.5, 4);
    c.quadraticCurveTo(-5.5, -5.5, 0, -5.5);
    c.quadraticCurveTo(5.5, -5.5, 5.5, 4);
    c.lineTo(6, 5); c.lineTo(-6, 5);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = P.brassEdge; c.lineWidth = 1;
    c.beginPath(); c.arc(0, -6.8, 1.3, 0, Math.PI * 2); c.stroke();
    c.fillStyle = P.brassEdge;
    c.beginPath(); c.arc(0, 7, 1.2, 0, Math.PI * 2); c.fill();
}
function iconRustyKey(c: CanvasRenderingContext2D) {
    c.strokeStyle = P.brassEdge; c.fillStyle = P.brass; c.lineWidth = 0.6;
    c.beginPath(); c.arc(-6, 0, 3.5, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = P.stoneDark;
    c.beginPath(); c.arc(-6, 0, 1.7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = P.brass; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(-3, 0); c.lineTo(7.5, 0); c.stroke();
    c.fillStyle = P.brass;
    c.fillRect(4, 0.6, 1.6, 3);
    c.fillRect(6.4, 0.6, 1.4, 2);
}
function iconShell(c: CanvasRenderingContext2D) {
    c.fillStyle = P.shell; c.strokeStyle = P.shellLine; c.lineWidth = 0.5;
    c.beginPath(); c.ellipse(0, 0, 7.5, 6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = P.shellLine; c.lineWidth = 0.4;
    c.beginPath();
    for (let i = 0; i < 3; i++) {
        const rx = 6.2 - i * 1.8;
        const ry = 4.8 - i * 1.4;
        c.moveTo(rx, 0);
        c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 1.6);
    }
    c.stroke();
    c.fillStyle = P.shellLine;
    c.beginPath(); c.ellipse(5.5, 0, 1.2, 1.8, 0, 0, Math.PI * 2); c.fill();
}

// 扩展 22 种（与世界层 RenderRelic.ts 对应，尺寸略微缩小适配小格图标）
function iconSilverCoin(c: CanvasRenderingContext2D) {
    c.fillStyle = P.silver; c.strokeStyle = P.silverEdge; c.lineWidth = 0.6;
    c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = P.silverEdge; c.lineWidth = 0.3;
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        c.beginPath();
        c.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
        c.lineTo(Math.cos(a) * 6.7, Math.sin(a) * 6.7);
        c.stroke();
    }
    c.fillStyle = P.silverEdge;
    c.beginPath(); c.ellipse(0, 0.5, 2.2, 3, 0, 0, Math.PI * 2); c.fill();
}
function iconHumanSkull(c: CanvasRenderingContext2D) {
    c.fillStyle = P.bone; c.strokeStyle = P.boneDark; c.lineWidth = 0.6;
    c.beginPath(); c.ellipse(0, -1, 7, 6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(-4, 5); c.quadraticCurveTo(0, 9, 4, 5); c.lineTo(3, 3.5); c.lineTo(-3, 3.5);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = P.stoneDark;
    c.beginPath(); c.ellipse(-2.3, -1, 1.5, 1.9, 0, 0, Math.PI * 2); c.ellipse(2.3, -1, 1.5, 1.9, 0, 0, Math.PI * 2); c.fill();
    c.beginPath();
    c.moveTo(0, 1.2); c.lineTo(-1, 3); c.lineTo(1, 3); c.closePath(); c.fill();
    c.strokeStyle = P.boneDark; c.lineWidth = 0.3;
    c.beginPath();
    c.moveTo(-2.5, 6); c.lineTo(2.5, 6); c.moveTo(0, 4); c.lineTo(0, 7.5);
    c.stroke();
}
function iconPocketWatch(c: CanvasRenderingContext2D) {
    c.fillStyle = P.brass; c.strokeStyle = P.brassEdge; c.lineWidth = 0.6;
    c.beginPath(); c.arc(0, 0, 6.5, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(240,230,200,0.9)';
    c.beginPath(); c.arc(0, 0, 5.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = P.brassEdge;
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        c.beginPath(); c.arc(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0.3, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = P.stoneDark; c.lineWidth = 0.6; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(-2, -2.5);
    c.moveTo(0, 0); c.lineTo(3, 1.5);
    c.stroke();
    c.lineCap = 'butt';
    c.fillStyle = P.brassEdge; c.fillRect(-0.7, -8, 1.4, 1.4);
}
function iconOilLamp(c: CanvasRenderingContext2D) {
    c.fillStyle = P.iron; c.strokeStyle = P.ironEdge; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-5, 6); c.lineTo(5, 6); c.lineTo(4, 3); c.lineTo(-4, 3);
    c.closePath(); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(-3.5, 3); c.lineTo(3.5, 3); c.lineTo(3, 0); c.lineTo(-3, 0);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(180,200,210,0.4)';
    c.beginPath();
    c.moveTo(-2.5, 0); c.lineTo(-2.2, -5); c.lineTo(-1.5, -6.5); c.lineTo(1.5, -6.5); c.lineTo(2.2, -5); c.lineTo(2.5, 0);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = P.ironEdge; c.lineWidth = 0.8;
    c.beginPath(); c.arc(5, 1.5, 2, -Math.PI / 2, Math.PI / 2); c.stroke();
}
function iconSmallKnife(c: CanvasRenderingContext2D) {
    c.fillStyle = P.pot; c.strokeStyle = P.potEdge; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-8, -1.2); c.lineTo(-2, -1.4); c.lineTo(-2, 1.4); c.lineTo(-8, 1.2);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = P.brassEdge;
    c.beginPath(); c.arc(-6, 0, 0.4, 0, Math.PI * 2); c.arc(-4, 0, 0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = P.iron; c.strokeStyle = P.ironEdge;
    c.beginPath();
    c.moveTo(-2, -1.2); c.lineTo(8, -0.4); c.lineTo(8.8, 0); c.lineTo(8, 0.6); c.lineTo(-2, 1.2);
    c.closePath(); c.fill(); c.stroke();
}
function iconMaskShard(c: CanvasRenderingContext2D) {
    c.fillStyle = P.stoneDark;
    c.beginPath();
    c.moveTo(-7, -4); c.quadraticCurveTo(0, -7, 7, -3); c.lineTo(6, -1); c.quadraticCurveTo(0, -4.5, -6, -2);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(140,170,180,0.6)'; c.strokeStyle = 'rgba(80,100,110,0.8)'; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-6, -2); c.quadraticCurveTo(0, -4, 5, -1.5); c.lineTo(4, 2); c.lineTo(2, 5); c.lineTo(-3, 3);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.3;
    c.beginPath(); c.moveTo(-2, -1); c.lineTo(0, 1); c.lineTo(2, 3); c.stroke();
}
function iconWaterFlask(c: CanvasRenderingContext2D) {
    c.fillStyle = P.silver; c.strokeStyle = P.silverEdge; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-4, -4); c.lineTo(4, -4); c.lineTo(5, 7); c.lineTo(-5, 7);
    c.closePath(); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(-2, -6); c.lineTo(2, -6); c.lineTo(2, -4); c.lineTo(-2, -4);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = P.ironEdge; c.fillRect(-2.4, -7.2, 4.8, 1.4);
    c.fillStyle = 'rgba(180,150,100,0.6)'; c.fillRect(-3.2, 0, 6.4, 3);
}
function iconIronNail(c: CanvasRenderingContext2D) {
    c.fillStyle = P.iron; c.strokeStyle = P.ironEdge; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-3, -7); c.lineTo(3, -7); c.lineTo(2.5, -5.5); c.lineTo(-2.5, -5.5);
    c.closePath(); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(-1.2, -5.5); c.lineTo(1.2, -5.5); c.lineTo(0.4, 8); c.lineTo(-0.4, 8);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = P.rust;
    c.beginPath();
    c.arc(0, -3, 0.5, 0, Math.PI * 2); c.arc(0, 0, 0.5, 0, Math.PI * 2); c.arc(0, 3, 0.5, 0, Math.PI * 2);
    c.fill();
}
function iconBrassCompass(c: CanvasRenderingContext2D) {
    c.fillStyle = P.brass; c.strokeStyle = P.brassEdge; c.lineWidth = 0.6;
    c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(240,230,200,0.8)';
    c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2); c.fill();
    c.save(); c.rotate(0.25);
    c.fillStyle = '#a03020';
    c.beginPath(); c.moveTo(0, -4.5); c.lineTo(-0.8, 0); c.lineTo(0.8, 0); c.closePath(); c.fill();
    c.fillStyle = P.stoneDark;
    c.beginPath(); c.moveTo(0, 4.5); c.lineTo(-0.8, 0); c.lineTo(0.8, 0); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = P.brassEdge;
    c.beginPath(); c.arc(0, 0, 0.7, 0, Math.PI * 2); c.fill();
}
function iconLeatherBoot(c: CanvasRenderingContext2D) {
    c.fillStyle = '#5a3b22'; c.strokeStyle = '#2e1f11'; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-6, -4); c.lineTo(-3, -4); c.lineTo(-2, 3); c.lineTo(8, 3); c.lineTo(9, 5); c.lineTo(8, 6); c.lineTo(-6, 6);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#1d1108';
    c.fillRect(-6, 5, 15, 1.2);
}
function iconCross(c: CanvasRenderingContext2D) {
    c.fillStyle = P.brass; c.strokeStyle = P.brassEdge; c.lineWidth = 0.5;
    c.beginPath(); c.rect(-1, -7, 2, 14); c.fill(); c.stroke();
    c.beginPath(); c.rect(-5, -2.5, 10, 2); c.fill(); c.stroke();
    c.fillStyle = P.gem;
    c.beginPath(); c.arc(0, -1.5, 0.7, 0, Math.PI * 2); c.fill();
}
function iconAmulet(c: CanvasRenderingContext2D) {
    c.strokeStyle = '#6a4f30'; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-4, -6); c.lineTo(0, -3); c.lineTo(4, -6);
    c.stroke();
    c.fillStyle = P.bone; c.strokeStyle = P.boneDark; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-4, -2); c.quadraticCurveTo(-5, 2, -3, 6); c.quadraticCurveTo(0, 8, 3, 6); c.quadraticCurveTo(5, 2, 4, -2); c.quadraticCurveTo(0, -4.5, -4, -2);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = P.stoneDark; c.lineWidth = 0.3;
    c.beginPath();
    c.moveTo(-2, 0); c.lineTo(2, 0); c.moveTo(0, -0.5); c.lineTo(0, 4);
    c.moveTo(-1.5, 2); c.lineTo(1.5, 2); c.moveTo(-2, 4); c.lineTo(2, 4);
    c.stroke();
}
function iconIdolFigure(c: CanvasRenderingContext2D) {
    c.fillStyle = P.stone; c.strokeStyle = P.stoneDark; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-4, 7); c.lineTo(4, 7); c.lineTo(3, 4); c.lineTo(-3, 4);
    c.closePath(); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(-2.5, 4); c.lineTo(2.5, 4); c.lineTo(2, -2); c.lineTo(-2, -2);
    c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, -4, 3, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = P.stoneDark;
    c.beginPath();
    c.arc(-1, -4.2, 0.5, 0, Math.PI * 2); c.arc(1, -4.2, 0.5, 0, Math.PI * 2);
    c.fill();
}
function iconCrystal(c: CanvasRenderingContext2D) {
    c.fillStyle = 'rgba(180,220,230,0.75)'; c.strokeStyle = 'rgba(80,120,140,0.9)'; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(0, -8); c.lineTo(-2.5, -3); c.lineTo(-2.5, 5); c.lineTo(2.5, 5); c.lineTo(2.5, -3);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(160,200,215,0.75)';
    c.beginPath();
    c.moveTo(-5, -4); c.lineTo(-6.5, 0); c.lineTo(-6.5, 5); c.lineTo(-3.5, 5); c.lineTo(-3.5, 0);
    c.closePath(); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(5, -5.5); c.lineTo(3.5, -1); c.lineTo(3.5, 5); c.lineTo(6.5, 5); c.lineTo(6.5, -1);
    c.closePath(); c.fill(); c.stroke();
}
function iconCeramicBowl(c: CanvasRenderingContext2D) {
    c.fillStyle = P.pot; c.strokeStyle = P.potEdge; c.lineWidth = 0.6;
    c.beginPath(); c.ellipse(0, 0, 8, 5.5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#4a3220';
    c.beginPath(); c.ellipse(0, 0.5, 6.5, 4.4, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(80,70,50,0.8)';
    c.beginPath(); c.ellipse(0, 1.5, 4.5, 2.5, 0, 0, Math.PI * 2); c.fill();
}
function iconGlassBottle(c: CanvasRenderingContext2D) {
    c.fillStyle = 'rgba(100,140,100,0.55)'; c.strokeStyle = 'rgba(50,80,50,0.85)'; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-3, -2); c.lineTo(3, -2); c.lineTo(3.5, 8); c.lineTo(-3.5, 8);
    c.closePath(); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(-1.2, -6); c.lineTo(1.2, -6); c.lineTo(1.5, -2); c.lineTo(-1.5, -2);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(60,90,60,0.7)'; c.fillRect(-1.5, -7.2, 3, 1.4);
    c.strokeRect(-1.5, -7.2, 3, 1.4);
}
function iconCoralChunk(c: CanvasRenderingContext2D) {
    c.strokeStyle = '#c85040'; c.lineWidth = 1.3; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, 7); c.lineTo(0, -2);
    c.moveTo(0, 2); c.lineTo(-5, -3); c.moveTo(-5, -3); c.lineTo(-6, -6);
    c.moveTo(-5, -3); c.lineTo(-3, -7);
    c.moveTo(0, 0); c.lineTo(5, -4); c.moveTo(5, -4); c.lineTo(4, -7);
    c.moveTo(5, -4); c.lineTo(7, -6);
    c.stroke();
    c.fillStyle = '#d86050';
    c.beginPath();
    c.arc(-6, -6, 0.9, 0, Math.PI * 2);
    c.arc(-3, -7, 0.7, 0, Math.PI * 2);
    c.arc(4, -7, 0.8, 0, Math.PI * 2);
    c.arc(7, -6, 0.9, 0, Math.PI * 2);
    c.fill();
    c.lineCap = 'butt';
}
function iconSharkTooth(c: CanvasRenderingContext2D) {
    c.fillStyle = '#e8e0cc'; c.strokeStyle = '#8a7f68'; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-3.5, 6); c.lineTo(3.5, 6); c.lineTo(0, -7);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#b0a58d';
    c.beginPath();
    c.moveTo(-3.5, 6); c.lineTo(3.5, 6); c.lineTo(3, 4); c.lineTo(-3, 4);
    c.closePath(); c.fill();
}
function iconFishSkeleton(c: CanvasRenderingContext2D) {
    c.strokeStyle = P.bone; c.fillStyle = P.bone; c.lineWidth = 0.9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-7, 0); c.lineTo(6, 0); c.stroke();
    for (let i = 0; i < 6; i++) {
        const x = -5 + i * 2; const len = 2.6 - Math.abs(i - 2.5) * 0.3;
        c.beginPath();
        c.moveTo(x, 0); c.lineTo(x, -len);
        c.moveTo(x, 0); c.lineTo(x, len);
        c.stroke();
    }
    c.fillStyle = P.bone; c.strokeStyle = P.boneDark; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(6, -3); c.lineTo(9, 0); c.lineTo(6, 3);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = P.stoneDark;
    c.beginPath(); c.arc(7, 0, 0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = P.bone;
    c.beginPath();
    c.moveTo(-7, 0); c.lineTo(-10, -3); c.lineTo(-10, 3);
    c.closePath(); c.fill(); c.stroke();
    c.lineCap = 'butt';
}
function iconFossil(c: CanvasRenderingContext2D) {
    c.fillStyle = P.stone; c.strokeStyle = P.stoneDark; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-7, -5); c.lineTo(6, -6); c.lineTo(8, 5); c.lineTo(-6, 6);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#2a2520'; c.lineWidth = 0.5;
    c.beginPath();
    for (let t = 0; t < Math.PI * 4; t += 0.08) {
        const r = 4.5 - t * 0.5;
        if (r < 0.3) break;
        const x = 0.5 + Math.cos(t) * r;
        const y = 0.5 + Math.sin(t) * r;
        if (t === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
}
function iconObsidian(c: CanvasRenderingContext2D) {
    c.fillStyle = '#18171c'; c.strokeStyle = '#0a090c'; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-6, -3); c.lineTo(-3, -6); c.lineTo(4, -5); c.lineTo(7, 0); c.lineTo(5, 5); c.lineTo(-2, 6); c.lineTo(-6, 2);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(200,200,220,0.5)'; c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-3, -5); c.lineTo(0, 0); c.lineTo(5, 4);
    c.moveTo(0, 0); c.lineTo(-5, 2);
    c.moveTo(0, 0); c.lineTo(6, -2);
    c.stroke();
    c.fillStyle = 'rgba(220,220,240,0.75)';
    c.beginPath(); c.arc(-2, -2, 0.5, 0, Math.PI * 2); c.arc(3, 1.5, 0.4, 0, Math.PI * 2); c.fill();
}
function iconCameraHousing(c: CanvasRenderingContext2D) {
    c.fillStyle = '#2a2a28'; c.strokeStyle = '#0f0f0e'; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-7, -4); c.lineTo(7, -4); c.lineTo(7, 5); c.lineTo(-7, 5);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#0f0f0e';
    c.beginPath(); c.arc(0, 0.5, 3.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#7a7a78'; c.lineWidth = 0.5;
    c.beginPath(); c.arc(0, 0.5, 3.5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(0, 0.5, 2.2, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(100,120,130,0.55)';
    c.beginPath(); c.arc(-0.8, -0.3, 1.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4a4a48'; c.fillRect(4, -5.5, 1.8, 1.5);
    c.fillStyle = '#a03020'; c.fillRect(-6, -3.8, 3, 0.5);
}
