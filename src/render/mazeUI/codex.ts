// 岸上「图鉴」入口按钮 + 全屏图鉴页
// 调用方：
//   - shore.ts 在岸上主界面绘制后追加 drawCodexEntryBtn（岸上右上角）
//   - RenderMazeUI.drawMazeHUD 在岸上/结案留本关分支里，若 codexOpen=true 则绘制 drawCodexFullscreen
// 约定：
//   - 图鉴页走全屏，点空白或返回按钮关闭
//   - 已发现：彩色矢量图 + 名字 + 描述
//   - 未发现：灰色剪影 + "？？？" + 遮住 desc
//   - 底部显示 X / Y 进度
//
// 注意：本页需要导出矩形 getter 供 input.ts hit-test，函数签名与位置都要和渲染严格一致。

import { ctx } from '../Canvas';
import { state } from '../../core/state';
import {
    ALL_RELIC_KINDS,
    RELIC_TYPES,
    RelicKind,
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
// 岸上右上角「图鉴」入口按钮
// 位置：右上角，微信胶囊下方（y = 58 起，避开胶囊）
// =============================================
const CODEX_BTN_W = 90;
const CODEX_BTN_H = 34;
const CODEX_BTN_MARGIN_RIGHT = 16;
const CODEX_BTN_MARGIN_TOP = 62;  // 让开微信胶囊（胶囊大约 y=0~50）

export function getCodexEntryBtnRect(cw: number): { x: number; y: number; w: number; h: number } {
    return {
        x: cw - CODEX_BTN_W - CODEX_BTN_MARGIN_RIGHT,
        y: CODEX_BTN_MARGIN_TOP,
        w: CODEX_BTN_W,
        h: CODEX_BTN_H,
    };
}

export function drawCodexEntryBtn(cw: number, time: number) {
    const maze: any = state.mazeRescue;
    if (!maze) return;
    const rect = getCodexEntryBtnRect(cw);
    const relics = Array.isArray(maze.relics) ? maze.relics : [];
    const discoveredIds = Array.isArray(maze.discoveredRelicIds) ? maze.discoveredRelicIds : [];
    const found = discoveredIds.length;
    const total = relics.length;

    // 底色：深褐色半透明，像战地笔记本的皮面按钮
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(52, 38, 26, 0.85)';
    ctx.beginPath();
    rrect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();

    // 描边：暖金色
    ctx.strokeStyle = 'rgba(205, 165, 110, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rrect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.stroke();

    // 左侧放一个简笔海螺图标作为视觉锚（识别"图鉴"概念）
    const icX = rect.x + 16;
    const icY = rect.y + rect.h / 2;
    ctx.strokeStyle = 'rgba(230, 200, 150, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.fillStyle = 'rgba(230, 200, 150, 0.25)';
    ctx.beginPath();
    ctx.ellipse(icX, icY, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 简化螺纹一圈
    ctx.beginPath();
    ctx.ellipse(icX, icY, 3.5, 3, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 文字：图鉴 X/Y
    ctx.fillStyle = 'rgba(245, 220, 180, 0.95)';
    ctx.font = 'italic bold 13px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('图鉴', icX + 12, icY - 1);

    ctx.font = '11px Arial';
    ctx.fillStyle = 'rgba(230, 200, 150, 0.75)';
    ctx.fillText(found + '/' + total, icX + 42, icY);

    // 新发现红点：如果本次下潜刚结算有新发现，加一个小红点
    // （这里暂时不判定"是否刚结算完"，只要 found>0 && found<total 就不显示红点，避免误导）
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

// =============================================
// 全屏图鉴页
// 5 列 × 2 行 = 10 个物件，每格展示图标 + 名字 + 描述（未发现时全部灰掉）
// =============================================

// 图鉴页按钮矩形 getter
export function getCodexCloseBtnRect(): { x: number; y: number; w: number; h: number } {
    return { x: 8, y: 8, w: 78, h: 32 };
}

export function drawMazeCodex(cw: number, ch: number, time: number) {
    const maze: any = state.mazeRescue;
    if (!maze) return;

    const relics = Array.isArray(maze.relics) ? maze.relics : [];
    const discoveredIds = Array.isArray(maze.discoveredRelicIds) ? maze.discoveredRelicIds : [];
    const discoveredSet: { [k: string]: boolean } = {};
    for (const id of discoveredIds) discoveredSet[String(id)] = true;

    // 统计每种 kind 是否被发现过（只要有一个同 kind 的 relic 被发现即为已发现）
    const kindFound: { [k: string]: boolean } = {};
    for (const r of relics) {
        if (discoveredSet[String(r.id)]) {
            kindFound[r.kind] = true;
        }
    }

    // 背景：暖米色羊皮纸感
    ctx.save();
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

    // 标题
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('水下图鉴', cw / 2, 36);

    // 标题下波浪装饰
    ctx.strokeStyle = 'rgba(62,44,35,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cw * 0.3; x < cw * 0.7; x += 3) {
        const wy = 44 + Math.sin(x * 0.15) * 1.6;
        if (x === cw * 0.3) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
    }
    ctx.stroke();

    // 副标题
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#7A6B5C';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText('手电照到即可收入图鉴', cw / 2, 62);

    // 返回按钮（左上角）
    const closeRect = getCodexCloseBtnRect();
    ctx.globalAlpha = 0.85;
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

    // 网格参数：5 列 × 2 行
    const cols = 5;
    const rows = 2;
    const gridTop = 84;
    const gridBottom = ch - 60;
    const gridLeft = 16;
    const gridRight = cw - 16;
    const gap = 8;
    const cellW = (gridRight - gridLeft - gap * (cols - 1)) / cols;
    const cellH = (gridBottom - gridTop - gap * (rows - 1)) / rows;

    for (let idx = 0; idx < ALL_RELIC_KINDS.length; idx++) {
        const kind = ALL_RELIC_KINDS[idx];
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        if (row >= rows) break;

        const x = gridLeft + col * (cellW + gap);
        const y = gridTop + row * (cellH + gap);
        const found = !!kindFound[kind];

        drawCodexCell(ctx, x, y, cellW, cellH, kind, found);
    }

    // 底部进度条
    const progressY = ch - 36;
    const totalKinds = ALL_RELIC_KINDS.length;
    let foundKinds = 0;
    for (const k of ALL_RELIC_KINDS) {
        if (kindFound[k]) foundKinds++;
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#3E2C23';
    ctx.font = 'italic bold 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('本关图鉴 ' + foundKinds + ' / ' + totalKinds, cw / 2, progressY);

    // 进度条
    const barW = cw * 0.6;
    const barH = 4;
    const barX = (cw - barW) / 2;
    const barY = progressY + 10;
    ctx.fillStyle = 'rgba(70, 55, 45, 0.2)';
    ctx.beginPath();
    rrect(ctx, barX, barY, barW, barH, 2);
    ctx.fill();
    const progress = totalKinds > 0 ? foundKinds / totalKinds : 0;
    if (progress > 0) {
        ctx.fillStyle = 'rgba(170, 90, 40, 0.85)';
        ctx.beginPath();
        rrect(ctx, barX, barY, barW * progress, barH, 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
}

// =============================================
// 单格绘制
// =============================================
function drawCodexCell(
    ctx2: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    kind: RelicKind, found: boolean,
) {
    const def = RELIC_TYPES[kind];

    // 卡片底色：已发现=暖米色，未发现=冷灰色
    ctx2.globalAlpha = 1;
    if (found) {
        ctx2.fillStyle = 'rgba(248, 236, 212, 0.95)';
    } else {
        ctx2.fillStyle = 'rgba(200, 190, 172, 0.75)';
    }
    ctx2.shadowColor = 'rgba(0,0,0,0.12)';
    ctx2.shadowBlur = 4;
    ctx2.shadowOffsetX = 1;
    ctx2.shadowOffsetY = 1;
    ctx2.beginPath();
    rrect(ctx2, x, y, w, h, 8);
    ctx2.fill();
    ctx2.shadowBlur = 0;
    ctx2.shadowOffsetX = 0;
    ctx2.shadowOffsetY = 0;

    ctx2.strokeStyle = found ? 'rgba(70, 55, 45, 0.35)' : 'rgba(70, 55, 45, 0.2)';
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    rrect(ctx2, x, y, w, h, 8);
    ctx2.stroke();

    // 上半：图标区（占 65% 高度）
    const iconAreaH = h * 0.62;
    const iconCx = x + w / 2;
    const iconCy = y + iconAreaH / 2 + 2;

    // 图标放大：相对物件世界尺寸 1.5~1.9 × 1.1 ≈ 1.8，再这里放到更大给图鉴页用
    const iconScale = Math.min(w, iconAreaH) * 0.09;

    ctx2.save();
    ctx2.translate(iconCx, iconCy);
    ctx2.scale(iconScale, iconScale);

    if (found) {
        // 已发现：彩色矢量图
        drawRelicIcon(ctx2, kind);
    } else {
        // 未发现：剪影（灰色 + alpha 0.5）
        ctx2.globalAlpha = 0.5;
        ctx2.filter = 'grayscale(1)';  // 部分环境不支持 filter，但即便不支持也只是颜色饱和显示，影响不大
        drawRelicIcon(ctx2, kind);
        ctx2.filter = 'none';
        ctx2.globalAlpha = 1;
        // 额外盖一层米色半透明，让剪影更模糊
        ctx2.fillStyle = 'rgba(200, 190, 172, 0.55)';
        ctx2.fillRect(-20, -20, 40, 40);
        // 中央大问号
        ctx2.fillStyle = 'rgba(70, 55, 45, 0.6)';
        ctx2.font = 'bold 18px Georgia, serif';
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText('?', 0, 0);
    }

    ctx2.restore();

    // 下半：名字 + 描述
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';

    const nameY = y + iconAreaH + 14;
    if (found) {
        ctx2.fillStyle = '#3E2C23';
        ctx2.font = 'italic bold 11px Georgia, serif';
        ctx2.fillText(def.name, x + w / 2, nameY);

        // 描述：小字，两行自适应
        ctx2.fillStyle = 'rgba(90, 75, 60, 0.8)';
        ctx2.font = '9px Arial';
        const desc = def.desc;
        // 粗略按宽度截断
        const maxChars = Math.floor(w / 6);
        if (desc.length <= maxChars) {
            ctx2.fillText(desc, x + w / 2, nameY + 14);
        } else {
            const line1 = desc.slice(0, maxChars);
            const line2 = desc.slice(maxChars, maxChars * 2);
            ctx2.fillText(line1, x + w / 2, nameY + 13);
            ctx2.fillText(line2, x + w / 2, nameY + 23);
        }
    } else {
        ctx2.fillStyle = 'rgba(90, 75, 60, 0.55)';
        ctx2.font = 'italic bold 11px Georgia, serif';
        ctx2.fillText('？？？', x + w / 2, nameY);

        ctx2.fillStyle = 'rgba(90, 75, 60, 0.35)';
        ctx2.font = '9px Arial';
        ctx2.fillText('尚未发现', x + w / 2, nameY + 14);
    }
}

// =============================================
// 图鉴页专用的图标绘制（和世界层的 drawXxx 相同造型，但尺度由外层 scale 控制）
// 为避免与 RenderRelic 的私有函数耦合，这里独立实现一份简化图标
// =============================================
function drawRelicIcon(ctx2: CanvasRenderingContext2D, kind: RelicKind) {
    switch (kind) {
        case 'skeleton':    iconSkeleton(ctx2); break;
        case 'coin':        iconCoin(ctx2); break;
        case 'potshard':    iconPotshard(ctx2); break;
        case 'anchor':      iconAnchor(ctx2); break;
        case 'ring':        iconRing(ctx2); break;
        case 'stoneTablet': iconStoneTablet(ctx2); break;
        case 'fishhook':    iconFishhook(ctx2); break;
        case 'bell':        iconBell(ctx2); break;
        case 'rustyKey':    iconRustyKey(ctx2); break;
        case 'shell':       iconShell(ctx2); break;
    }
}

// 统一调色板（和 RenderRelic 保持一致）
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

function iconSkeleton(c: CanvasRenderingContext2D) {
    c.fillStyle = P.bone;
    c.strokeStyle = P.boneDark;
    c.lineWidth = 0.6;
    c.beginPath();
    c.ellipse(0, -2, 7, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = P.stoneDark;
    c.beginPath();
    c.arc(-2.4, -2.4, 1.4, 0, Math.PI * 2);
    c.arc(2.4, -2.4, 1.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = P.bone;
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-6, 6); c.lineTo(-10, 10); c.moveTo(6, 6); c.lineTo(10, 9);
    c.moveTo(0, 5); c.lineTo(2, 12);
    c.stroke();
    c.lineCap = 'butt';
}
function iconCoin(c: CanvasRenderingContext2D) {
    c.fillStyle = P.coinBody;
    c.strokeStyle = P.coinEdge;
    c.lineWidth = 0.6;
    c.beginPath();
    c.arc(0, 0, 7, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 5.3, 0, Math.PI * 2);
    c.lineWidth = 0.3;
    c.stroke();
    c.fillStyle = P.stoneDark;
    c.fillRect(-1.6, -1.6, 3.2, 3.2);
    c.fillStyle = 'rgba(80,130,90,0.7)';
    c.beginPath();
    c.arc(-4, -2.5, 0.8, 0, Math.PI * 2);
    c.arc(3.5, 2.5, 0.7, 0, Math.PI * 2);
    c.fill();
}
function iconPotshard(c: CanvasRenderingContext2D) {
    c.fillStyle = P.pot;
    c.strokeStyle = P.potEdge;
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(-9, 4);
    c.quadraticCurveTo(-8, -6, 0, -7);
    c.quadraticCurveTo(8, -6, 9, 4);
    c.lineTo(7, 5); c.lineTo(5, 4); c.lineTo(2, 5.2); c.lineTo(-2, 4); c.lineTo(-5, 5); c.lineTo(-7, 4);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = P.potEdge;
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-7, -2); c.lineTo(7, -2);
    c.moveTo(-6, 0); c.lineTo(6, 0);
    c.stroke();
}
function iconAnchor(c: CanvasRenderingContext2D) {
    c.strokeStyle = P.ironEdge;
    c.fillStyle = P.iron;
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, -8, 2.2, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(-5, -4); c.lineTo(5, -4);
    c.stroke();
    c.beginPath();
    c.moveTo(0, -6); c.lineTo(0, 7);
    c.stroke();
    c.beginPath();
    c.moveTo(0, 7); c.quadraticCurveTo(-6, 7, -6, 2);
    c.stroke();
    c.beginPath();
    c.moveTo(0, 7); c.quadraticCurveTo(6, 7, 6, 2);
    c.stroke();
    c.lineCap = 'butt';
}
function iconRing(c: CanvasRenderingContext2D) {
    c.strokeStyle = P.silver;
    c.lineWidth = 1.8;
    c.beginPath();
    c.arc(0, 0, 5.5, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = P.gem;
    c.beginPath();
    c.arc(0, -5.5, 1.8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = P.silverEdge;
    c.lineWidth = 0.4;
    c.stroke();
}
function iconStoneTablet(c: CanvasRenderingContext2D) {
    c.fillStyle = P.stone;
    c.strokeStyle = P.stoneDark;
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-8, -6); c.lineTo(7, -6.5); c.lineTo(8, 5); c.lineTo(-7, 6);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = P.stoneDark;
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-6, -3); c.lineTo(-2, -3); c.moveTo(0, -3); c.lineTo(5, -3);
    c.moveTo(-6, -1); c.lineTo(6, -1);
    c.moveTo(-5, 1.5); c.lineTo(-1, 1.5); c.moveTo(1.5, 1.5); c.lineTo(4, 1.5);
    c.moveTo(-5, 3.5); c.lineTo(4, 3.5);
    c.stroke();
}
function iconFishhook(c: CanvasRenderingContext2D) {
    c.strokeStyle = P.ironEdge;
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-1, -7); c.lineTo(-1, 2);
    c.quadraticCurveTo(-1, 7, 3, 7);
    c.quadraticCurveTo(7, 7, 7, 2.5);
    c.stroke();
    c.beginPath();
    c.moveTo(7, 2.5); c.lineTo(5, 4);
    c.stroke();
    c.beginPath();
    c.arc(-1, -7.8, 1.3, 0, Math.PI * 2);
    c.stroke();
    c.lineCap = 'butt';
}
function iconBell(c: CanvasRenderingContext2D) {
    c.fillStyle = P.brass;
    c.strokeStyle = P.brassEdge;
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-5.5, 4);
    c.quadraticCurveTo(-5.5, -5.5, 0, -5.5);
    c.quadraticCurveTo(5.5, -5.5, 5.5, 4);
    c.lineTo(6, 5);
    c.lineTo(-6, 5);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = P.brassEdge;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, -6.8, 1.3, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = P.brassEdge;
    c.beginPath();
    c.arc(0, 7, 1.2, 0, Math.PI * 2);
    c.fill();
}
function iconRustyKey(c: CanvasRenderingContext2D) {
    c.strokeStyle = P.brassEdge;
    c.fillStyle = P.brass;
    c.lineWidth = 0.6;
    c.beginPath();
    c.arc(-6, 0, 3.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = P.stoneDark;
    c.beginPath();
    c.arc(-6, 0, 1.7, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = P.brass;
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(-3, 0); c.lineTo(7.5, 0);
    c.stroke();
    c.fillStyle = P.brass;
    c.fillRect(4, 0.6, 1.6, 3);
    c.fillRect(6.4, 0.6, 1.4, 2);
}
function iconShell(c: CanvasRenderingContext2D) {
    c.fillStyle = P.shell;
    c.strokeStyle = P.shellLine;
    c.lineWidth = 0.5;
    c.beginPath();
    c.ellipse(0, 0, 7.5, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = P.shellLine;
    c.lineWidth = 0.4;
    c.beginPath();
    for (let i = 0; i < 3; i++) {
        const rx = 6.2 - i * 1.8;
        const ry = 4.8 - i * 1.4;
        c.moveTo(rx, 0);
        c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 1.6);
    }
    c.stroke();
    c.fillStyle = P.shellLine;
    c.beginPath();
    c.ellipse(5.5, 0, 1.2, 1.8, 0, 0, Math.PI * 2);
    c.fill();
}
