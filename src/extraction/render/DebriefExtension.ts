// 撤离结算条带（嵌入 debrief 主页底部、回到岸上按钮上方）
//
// 视觉融合策略：
// - 不再做"右上角浮窗"那种贴靠感
// - 改为底部全宽横条（cw - 28 宽，高度 64），与原"回到岸上"按钮形成纵向堆叠
// - 内部三栏布局（单行）：
//     左栏（固定 110px）：本次净收益（金色大字）+ 撤离方式标签
//     中栏（弹性）：物品图标横排 + "本次收获"小字标题
//     右栏（固定 144px）：金库/仓库小字 + "全部卖给老板"按钮
// - 撤离失败时在条带上方追加丢失提示条（含战利品遗失行 + 装备遗失行）
// - 失败/无收获时整体灰色调降级显示
// - 撤离失败（o2 溺水 / fishkill 被咬死）：所有战利品都进 lostItems，装备消耗一件并显示回退去向
//
// 与 debrief 主页的兼容：
// - 原 debrief 在 mapY + mapH 之后画 4 KPI（用时/深度/探索/绳索）+ tipY 文字流
// - 我的条带顶边 = ch - 144，会和较低位置的 tipY 文字流重叠
// - 处理方式：在条带绘制前再画一层与背景同色的遮罩，整洁覆盖被遮的旧文字
//   （图鉴进度等次要信息暂时让位给撤离结算）

import { ctx } from '../../render/Canvas';
import { getLastSettlement } from '../logic/ExtractionDive';
import { getItemDisplayName, computeItemPrice, sellAllWarehouseItems } from '../logic/Economy';
import { getCoins } from '../logic/Economy';
import { getExtractionState } from '../core/ExtractionState';
import { getItemDef } from '../core/ExtractionRegistry';

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

// 品相 → 边框色
function conditionColor(condition: string): string {
    switch (condition) {
        case 'perfect':    return 'rgba(255, 220, 130, 0.95)';
        case 'inscribed':  return 'rgba(180, 130, 255, 0.95)';
        case 'pristine':   return 'rgba(140, 220, 255, 0.95)';
        case 'intact':
        case 'normal':     return 'rgba(180, 200, 220, 0.85)';
        default:           return 'rgba(160, 130, 100, 0.7)';
    }
}

// =============================================
// 按钮矩形（hit-test 暴露）
// =============================================

let _sellAllBtnRect: { x: number; y: number; w: number; h: number } | null = null;

export function getSellAllBtnRect(): { x: number; y: number; w: number; h: number } | null {
    return _sellAllBtnRect;
}

export function performSellAll(): number {
    return sellAllWarehouseItems();
}

// =============================================
// 渲染主入口
// =============================================

export function drawExtractionSettlement(maze: any, cw: number, ch: number, time: number): void {
    const settlement = getLastSettlement();
    if (!settlement) {
        _sellAllBtnRect = null;
        return;
    }
    if (maze.phase !== 'debrief') {
        _sellAllBtnRect = null;
        return;
    }

    const showAlpha = Math.min(1, maze.resultTimer / 30);
    if (showAlpha <= 0) return;

    // === 几何 ===
    const margin = 14;
    const barW = cw - margin * 2;
    const barH = 64;
    const barX = margin;
    // 主页"回到岸上"按钮中线在 ch-50，按钮高 44 → 顶边在 ch-72
    // 条带与按钮的间隙 8px
    const barY = ch - 72 - 8 - barH;

    // 半成功 / 失败撤离：上方加丢失提示条（如有遗失装备则增加一行高度）
    const hasLost = settlement.lostItems.length > 0;
    const hasLostEquip = (settlement.lostEquipment && settlement.lostEquipment.length > 0);
    const lostBannerH = hasLost ? (hasLostEquip ? 40 : 22) : (hasLostEquip ? 22 : 0);
    const showLostBanner = hasLost || hasLostEquip;
    const totalY = barY - lostBannerH - (showLostBanner ? 4 : 0);
    const totalH = barH + lostBannerH + (showLostBanner ? 4 : 0);

    ctx.save();
    ctx.globalAlpha = showAlpha;

    // === 0. 与原 debrief 文字流的视觉过渡：在条带上方画一条 8px 的渐变蒙版
    // 这能让条带顶部边缘融入深色页面背景，避免硬切感
    const fadeH = 14;
    const fadeGrad = ctx.createLinearGradient(0, totalY - fadeH, 0, totalY);
    fadeGrad.addColorStop(0, 'rgba(8, 16, 28, 0)');
    fadeGrad.addColorStop(1, 'rgba(8, 16, 28, 0.85)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(barX, totalY - fadeH, barW, fadeH);

    // === 1. 丢失提示横条（撤离失败 / 半成功）===
    if (showLostBanner) {
        ctx.fillStyle = 'rgba(80, 30, 25, 0.92)';
        ctx.beginPath();
        rrect(ctx, barX, barY - lostBannerH - 4, barW, lostBannerH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220, 120, 100, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        rrect(ctx, barX, barY - lostBannerH - 4, barW, lostBannerH, 6);
        ctx.stroke();

        const bannerTop = barY - lostBannerH - 4;
        const lineH = 18;
        let lineY = bannerTop + 2;

        // 行 1：战利品遗失
        if (hasLost) {
            let lostValue = 0;
            for (const it of settlement.lostItems) {
                lostValue += computeItemPrice(it.itemId, it.condition);
            }
            const cy = lineY + lineH / 2;
            ctx.fillStyle = 'rgba(255, 180, 160, 0.95)';
            ctx.font = 'bold 11px "PingFang SC", Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚠ 战利品遗失 ' + settlement.lostItems.length + ' 件', barX + 12, cy);
            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(220, 140, 130, 0.85)';
            ctx.fillText('-' + lostValue + ' 金', barX + barW - 12, cy);
            lineY += lineH;
        }

        // 行 2：装备遗失（撤离失败时销毁的当前装备）
        if (hasLostEquip) {
            const cy = lineY + lineH / 2;
            const names: string[] = [];
            for (const eq of settlement.lostEquipment) {
                const def = getItemDef(eq.itemId);
                if (def) names.push(def.name);
            }
            ctx.fillStyle = 'rgba(255, 200, 170, 0.95)';
            ctx.font = 'bold 11px "PingFang SC", Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('💔 装备遗失：' + names.join(' / '), barX + 12, cy);
            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(200, 160, 150, 0.8)';
            ctx.font = '10px "PingFang SC", Arial';
            // 显示回退后的装备
            const fallbackNames: string[] = [];
            for (const eq of settlement.lostEquipment) {
                const fbDef = getItemDef(eq.fallbackTo);
                if (fbDef) fallbackNames.push(fbDef.name);
            }
            if (fallbackNames.length > 0) {
                ctx.fillText('回退至 ' + fallbackNames.join(' / '), barX + barW - 12, cy);
            }
        }
    }

    // === 2. 主条带背景 ===
    const grad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    grad.addColorStop(0, 'rgba(20, 32, 48, 0.95)');
    grad.addColorStop(1, 'rgba(12, 20, 32, 0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    rrect(ctx, barX, barY, barW, barH, 10);
    ctx.fill();

    let strokeColor = 'rgba(120, 200, 160, 0.55)';
    if (settlement.reason === 'o2') strokeColor = 'rgba(220, 110, 110, 0.55)';
    else if (settlement.reason === 'fishkill') strokeColor = 'rgba(220, 110, 110, 0.55)';
    else if (settlement.reason === 'rescued') strokeColor = 'rgba(120, 220, 180, 0.65)';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    rrect(ctx, barX, barY, barW, barH, 10);
    ctx.stroke();

    // === 3. 三栏布局 ===
    const padding = 14;
    const leftW = 110;
    const rightW = 144;
    const centerX = barX + leftW + padding;
    const centerW = barW - leftW - rightW - padding * 2;

    // ----- 左栏：本次净收益 + 撤离方式 -----
    {
        const reasonLabel = (() => {
            switch (settlement.reason) {
                case 'retreat':  return '完整撤离';
                case 'o2':       return '撤离失败 · 溺水';
                case 'fishkill': return '撤离失败 · 遇袭';
                case 'rescued':  return '救援成功';
                case 'beacon':   return '紧急撤离';
                case 'deco':     return '撤离失败 · 减压病';
                default:         return '撤离结束';
            }
        })();
        ctx.fillStyle = strokeColor;
        ctx.font = '10px "PingFang SC", Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(reasonLabel, barX + padding, barY + 8);

        ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
        ctx.font = 'bold 22px "PingFang SC", Arial';
        ctx.textBaseline = 'top';
        const valStr = '+' + settlement.keptValue;
        ctx.fillText(valStr, barX + padding, barY + 22);

        const valW = ctx.measureText(valStr).width;
        ctx.fillStyle = 'rgba(200, 170, 110, 0.85)';
        ctx.font = '11px "PingFang SC", Arial';
        ctx.fillText('金', barX + padding + valW + 4, barY + 32);

        ctx.fillStyle = 'rgba(160, 180, 200, 0.65)';
        ctx.font = '9px "PingFang SC", Arial';
        ctx.fillText(settlement.keptItems.length + ' 件战利品', barX + padding, barY + 50);
    }

    // ----- 中栏：物品图标 + 标题 -----
    {
        const items = settlement.keptItems;
        if (items.length === 0) {
            ctx.fillStyle = 'rgba(150, 160, 180, 0.55)';
            ctx.font = 'italic 12px "PingFang SC", Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('本次未带回任何战利品', centerX + centerW / 2, barY + barH / 2);
        } else {
            // 标题
            ctx.fillStyle = 'rgba(200, 220, 240, 0.65)';
            ctx.font = '9px "PingFang SC", Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('本次收获', centerX + centerW / 2, barY + 7);

            // 图标
            const iconSize = 28;
            const iconGap = 4;
            const maxIcons = Math.floor((centerW + iconGap) / (iconSize + iconGap));
            const showCount = Math.min(items.length, maxIcons);
            const totalIconsW = showCount * iconSize + (showCount - 1) * iconGap;
            const startX = centerX + (centerW - totalIconsW) / 2;
            const iconY = barY + 22;

            for (let i = 0; i < showCount; i++) {
                const it = items[i];
                const def = getItemDef(it.itemId);
                if (!def) continue;
                const x = startX + i * (iconSize + iconGap);
                const y = iconY;

                ctx.fillStyle = 'rgba(40, 52, 70, 0.85)';
                ctx.beginPath();
                rrect(ctx, x, y, iconSize, iconSize, 4);
                ctx.fill();
                ctx.strokeStyle = conditionColor(it.condition);
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                rrect(ctx, x, y, iconSize, iconSize, 4);
                ctx.stroke();
                const cx = x + iconSize / 2;
                const cy = y + iconSize / 2;
                ctx.fillStyle = 'rgba(190, 155, 80, 0.85)';
                ctx.beginPath();
                ctx.arc(cx, cy, iconSize * 0.34, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1a1a1a';
                ctx.font = 'bold 11px "PingFang SC", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(def.name.charAt(0), cx, cy + 0.5);
            }

            if (items.length > showCount) {
                ctx.fillStyle = 'rgba(200, 220, 240, 0.85)';
                ctx.font = 'bold 10px "PingFang SC", Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText('+' + (items.length - showCount), startX + totalIconsW + 4, iconY + iconSize / 2);
            }
        }
    }

    // ----- 右栏：金库余额 + 全部卖出按钮 -----
    {
        const ex = getExtractionState();
        const totalCoins = ex ? ex.coins : getCoins();
        const warehouseCount = ex ? ex.warehouse.length : 0;
        const rightX = barX + barW - rightW - padding;

        // 顶部小字行：金库 + 仓库（横排）
        ctx.fillStyle = 'rgba(180, 200, 220, 0.65)';
        ctx.font = '9px "PingFang SC", Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('金库 ' + totalCoins, rightX, barY + 8);
        ctx.textAlign = 'right';
        ctx.fillStyle = warehouseCount > 0 ? 'rgba(220, 200, 140, 0.85)' : 'rgba(150, 160, 180, 0.55)';
        ctx.fillText('待售 ' + warehouseCount + ' 件', barX + barW - padding, barY + 8);

        // "全部卖出"按钮
        const btnW = rightW;
        const btnH = 32;
        const btnX = rightX;
        const btnY = barY + barH - btnH - 8;

        if (warehouseCount > 0 && maze.resultTimer >= 60) {
            const btnAlpha = Math.min(1, (maze.resultTimer - 60) / 20);
            ctx.globalAlpha = showAlpha * btnAlpha;

            const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
            btnGrad.addColorStop(0, 'rgba(150, 100, 30, 0.95)');
            btnGrad.addColorStop(1, 'rgba(200, 140, 50, 0.95)');
            ctx.fillStyle = btnGrad;
            ctx.beginPath();
            rrect(ctx, btnX, btnY, btnW, btnH, 16);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 210, 110, 0.85)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            rrect(ctx, btnX, btnY, btnW, btnH, 16);
            ctx.stroke();

            // 顶部高光
            const highGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH * 0.5);
            highGrad.addColorStop(0, 'rgba(255, 230, 160, 0.4)');
            highGrad.addColorStop(1, 'rgba(255, 230, 160, 0)');
            ctx.fillStyle = highGrad;
            ctx.beginPath();
            rrect(ctx, btnX + 2, btnY + 2, btnW - 4, btnH * 0.45, 14);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 240, 180, 0.98)';
            ctx.font = 'bold 12px "PingFang SC", Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('全部卖给老板 ▶', btnX + btnW / 2, btnY + btnH / 2);

            ctx.globalAlpha = showAlpha;
            _sellAllBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        } else {
            // 仓库为空：占位按钮
            ctx.fillStyle = 'rgba(40, 50, 65, 0.5)';
            ctx.beginPath();
            rrect(ctx, btnX, btnY, btnW, btnH, 16);
            ctx.fill();
            ctx.strokeStyle = 'rgba(120, 130, 150, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            rrect(ctx, btnX, btnY, btnW, btnH, 16);
            ctx.stroke();
            ctx.fillStyle = 'rgba(140, 150, 170, 0.55)';
            ctx.font = 'italic 10px "PingFang SC", Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(warehouseCount === 0 ? '仓库为空' : '请稍候…', btnX + btnW / 2, btnY + btnH / 2);
            _sellAllBtnRect = null;
        }
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
