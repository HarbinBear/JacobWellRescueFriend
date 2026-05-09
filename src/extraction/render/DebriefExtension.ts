// 撤离结算页扩展（在现有 debrief 页底部追加）
//
// 渲染内容：
// - 撤离方式标签（完整撤离 / 半成功 / 失败）
// - 本次收获列表（每件物品 + 估值）
// - 半成功时的丢失列表
// - 总计金币 + "全部卖出"按钮（点了直接结算并入金库）
//
// 调用方：mazeUI/debrief.ts 的 drawMazeDebrief 末尾追加 drawExtractionSettlement(maze, cw, ch, time)
// hit-test：input.ts 的 debrief 阶段松手判定追加 "is in 全部卖出按钮 → sellAll"

import { CONFIG } from '../../core/config';
import { ctx } from '../../render/Canvas';
import { getLastSettlement } from '../logic/ExtractionDive';
import { getItemDisplayName, computeItemPrice, sellAllWarehouseItems } from '../logic/Economy';
import { getCoins } from '../logic/Economy';
import { getExtractionState } from '../core/ExtractionState';

// 兼容圆角矩形
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
// "全部卖出" 按钮的矩形（供 input.ts 做 hit-test）
// =============================================

let _sellAllBtnRect: { x: number; y: number; w: number; h: number } | null = null;

export function getSellAllBtnRect(): { x: number; y: number; w: number; h: number } | null {
    return _sellAllBtnRect;
}

/** 一键卖出处理：返回卖出获得的金币（0 表示没东西可卖） */
export function performSellAll(): number {
    return sellAllWarehouseItems();
}

// =============================================
// 渲染
// =============================================

export function drawExtractionSettlement(maze: any, cw: number, ch: number, time: number): void {
    const settlement = getLastSettlement();
    if (!settlement) {
        _sellAllBtnRect = null;
        return;
    }

    // 仅在 debrief 阶段渲染
    if (maze.phase !== 'debrief') {
        _sellAllBtnRect = null;
        return;
    }

    // 等 debrief 主页渲染完（resultTimer >= 60 后按钮才出现）
    // 我们紧贴在原页面"回到岸上"按钮的上方
    const showAlpha = Math.min(1, maze.resultTimer / 30);
    if (showAlpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = showAlpha;

    // 渲染区域：左上角浮一层"撤离结算"小卡片
    // 不动主页面布局，做成右上角竖向小卡，避开微信胶囊
    const cardW = 220;
    const cardH = computeCardHeight(settlement);
    const cardX = cw - cardW - 14;
    const cardY = 70;

    // 卡片底
    ctx.fillStyle = 'rgba(15, 22, 32, 0.88)';
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 8);
    ctx.fill();

    // 描边色按 reason 区分
    let strokeColor = 'rgba(120, 200, 160, 0.5)'; // retreat
    if (settlement.reason === 'o2') strokeColor = 'rgba(220, 170, 90, 0.6)';
    else if (settlement.reason === 'fishkill') strokeColor = 'rgba(220, 110, 110, 0.6)';
    else if (settlement.reason === 'rescued') strokeColor = 'rgba(120, 220, 180, 0.6)';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    rrect(ctx, cardX, cardY, cardW, cardH, 8);
    ctx.stroke();

    // 标题
    let py = cardY + 10;
    ctx.fillStyle = 'rgba(220, 230, 245, 0.92)';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('撤离结算', cardX + 12, py);
    py += 18;

    // 撤离方式
    const reasonLabel = (() => {
        switch (settlement.reason) {
            case 'retreat':  return '完整撤离 ✓';
            case 'o2':       return '半成功撤离 ⚠';
            case 'fishkill': return '撤离失败 ✗';
            case 'rescued':  return '救援成功 ★';
            case 'beacon':   return '信标紧急撤离 ★';
            default:         return '撤离';
        }
    })();
    ctx.font = '11px Arial';
    ctx.fillStyle = strokeColor;
    ctx.fillText(reasonLabel, cardX + 12, py);
    py += 18;

    // 收获明细
    if (settlement.keptItems.length > 0) {
        ctx.fillStyle = 'rgba(180, 200, 220, 0.85)';
        ctx.font = '10px Arial';
        ctx.fillText('本次收获：', cardX + 12, py);
        py += 14;

        // 按 itemId+condition 归并
        const aggregated: { [k: string]: { name: string; count: number; total: number } } = {};
        for (const it of settlement.keptItems) {
            const display = getItemDisplayName(it.itemId, it.condition);
            const price = computeItemPrice(it.itemId, it.condition);
            const key = display;
            if (!aggregated[key]) {
                aggregated[key] = { name: display, count: 0, total: 0 };
            }
            aggregated[key].count++;
            aggregated[key].total += price;
        }

        ctx.font = '10px Arial';
        ctx.fillStyle = 'rgba(220, 200, 140, 0.9)';
        for (const k in aggregated) {
            if (Object.prototype.hasOwnProperty.call(aggregated, k)) {
                const r = aggregated[k];
                const left = r.count > 1 ? r.name + ' ×' + r.count : r.name;
                const right = '+' + r.total + ' 金';
                ctx.textAlign = 'left';
                ctx.fillText(left, cardX + 16, py);
                ctx.textAlign = 'right';
                ctx.fillText(right, cardX + cardW - 12, py);
                py += 13;
            }
        }
        py += 4;
    } else {
        ctx.fillStyle = 'rgba(150, 160, 180, 0.6)';
        ctx.font = 'italic 10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('本次未带回任何战利品', cardX + 12, py);
        py += 16;
    }

    // 半成功撤离的丢失列表
    if (settlement.lostItems.length > 0) {
        ctx.fillStyle = 'rgba(220, 130, 100, 0.9)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('呛水丢失：', cardX + 12, py);
        py += 14;
        ctx.fillStyle = 'rgba(200, 140, 130, 0.75)';
        for (const it of settlement.lostItems) {
            const display = getItemDisplayName(it.itemId, it.condition);
            const price = computeItemPrice(it.itemId, it.condition);
            ctx.textAlign = 'left';
            ctx.fillText(display, cardX + 16, py);
            ctx.textAlign = 'right';
            ctx.fillText('-' + price + ' 金', cardX + cardW - 12, py);
            py += 13;
        }
        py += 4;
    }

    // 分隔线
    ctx.strokeStyle = 'rgba(120, 140, 170, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 12, py + 2);
    ctx.lineTo(cardX + cardW - 12, py + 2);
    ctx.stroke();
    py += 10;

    // 总收益
    ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('本次净收益', cardX + 12, py);
    ctx.textAlign = 'right';
    ctx.fillText('+' + settlement.keptValue + ' 金', cardX + cardW - 12, py);
    py += 18;

    // 当前金库
    const ex = getExtractionState();
    const totalCoins = ex ? ex.coins : getCoins();
    const warehouseCount = ex ? ex.warehouse.length : 0;
    ctx.fillStyle = 'rgba(180, 200, 220, 0.7)';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('金库余额', cardX + 12, py);
    ctx.textAlign = 'right';
    ctx.fillText(totalCoins + ' 金', cardX + cardW - 12, py);
    py += 14;
    ctx.textAlign = 'left';
    ctx.fillText('仓库待售', cardX + 12, py);
    ctx.textAlign = 'right';
    ctx.fillText(warehouseCount + ' 件', cardX + cardW - 12, py);
    py += 18;

    // "一键卖出"按钮（如果仓库有东西）
    if (warehouseCount > 0 && maze.resultTimer >= 60) {
        const btnAlpha = Math.min(1, (maze.resultTimer - 60) / 20);
        ctx.globalAlpha = showAlpha * btnAlpha;
        const btnW = cardW - 24;
        const btnH = 28;
        const btnX = cardX + 12;
        const btnY = py;
        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
        btnGrad.addColorStop(0, 'rgba(140, 100, 30, 0.8)');
        btnGrad.addColorStop(1, 'rgba(180, 130, 40, 0.8)');
        ctx.fillStyle = btnGrad;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220, 180, 80, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        rrect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 230, 150, 0.95)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('全部卖给老板 ▶', btnX + btnW / 2, btnY + btnH / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        _sellAllBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    } else {
        _sellAllBtnRect = null;
    }

    ctx.restore();
}

/** 估算卡片高度（基于内容动态算） */
function computeCardHeight(settlement: any): number {
    let h = 10 + 18 + 18 + 4; // padding + 标题 + 撤离方式 + 间距
    if (settlement.keptItems.length > 0) {
        h += 14; // "本次收获"标题
        // 估算归并后的行数（最多与物品种类数相等）
        const kindSet = new Set();
        for (const it of settlement.keptItems) {
            kindSet.add(it.itemId + '_' + it.condition);
        }
        h += kindSet.size * 13 + 4;
    } else {
        h += 16;
    }
    if (settlement.lostItems.length > 0) {
        h += 14 + settlement.lostItems.length * 13 + 4;
    }
    h += 12 + 18 + 14 + 14 + 18; // 分隔线 + 净收益 + 余额 + 仓库 + 间距
    h += 28 + 12; // 卖出按钮
    return h;
}
