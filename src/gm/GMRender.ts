// GM面板绘制模块
// 负责GM按钮和面板的所有渲染逻辑

import {
    TABS, GMNumberItem,
    BTN_RADIUS, BTN_X, BTN_Y,
    PANEL_X, PANEL_Y, PANEL_W, PANEL_H,
    TAB_H, ITEM_H, ITEM_PAD, LABEL_W_RATIO, INPUT_H,
} from './GMConfig';
import { getGMState, getConfigValue } from './GMPanel';

// ============ 绘制 ============

export function drawGMButton(ctx: CanvasRenderingContext2D): void {
    const { open } = getGMState();
    ctx.save();
    ctx.globalAlpha = open ? 0.9 : 0.5;
    ctx.fillStyle = open ? '#f80' : '#555';
    ctx.beginPath();
    ctx.arc(BTN_X, BTN_Y, BTN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GM', BTN_X, BTN_Y);
    ctx.globalAlpha = 1;
    ctx.restore();
}

export function drawGMPanel(ctx: CanvasRenderingContext2D): void {
    const { open, activeTab, scrollY, editingItem, editingValue } = getGMState();
    if (!open) return;

    const tab = TABS[activeTab];
    if (!tab) return;

    ctx.save();

    // 面板背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.beginPath();
    _rrect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 136, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    _rrect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 8);
    ctx.stroke();

    // Tab 页签
    const tabW = PANEL_W / TABS.length;
    for (let i = 0; i < TABS.length; i++) {
        const tx = PANEL_X + i * tabW;
        const ty = PANEL_Y;
        const isActive = i === activeTab;

        ctx.fillStyle = isActive ? 'rgba(255, 136, 0, 0.3)' : 'rgba(40, 40, 40, 0.8)';
        ctx.fillRect(tx, ty, tabW, TAB_H);

        if (isActive) {
            ctx.fillStyle = '#f80';
            ctx.fillRect(tx, ty + TAB_H - 2, tabW, 2);
        }

        ctx.fillStyle = isActive ? '#fff' : '#888';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(TABS[i].name, tx + tabW / 2, ty + TAB_H / 2);
    }

    // 内容区域裁剪
    const contentY = PANEL_Y + TAB_H + 2;
    const contentH = PANEL_H - TAB_H - 4;
    ctx.save();
    ctx.beginPath();
    ctx.rect(PANEL_X, contentY, PANEL_W, contentH);
    ctx.clip();

    // 绘制条目
    const items = tab.items;
    const labelW = PANEL_W * LABEL_W_RATIO;
    const valueX = PANEL_X + labelW + 4;
    const valueW = PANEL_W - labelW - 12;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const iy = contentY + i * ITEM_H - scrollY + ITEM_PAD;

        // 超出可见区域跳过
        if (iy + ITEM_H < contentY || iy > contentY + contentH) continue;

        // 条目背景（交替色）
        ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 30, 30, 0.5)' : 'rgba(20, 20, 20, 0.3)';
        ctx.fillRect(PANEL_X + 2, iy, PANEL_W - 4, ITEM_H - 2);

        // 标签
        ctx.fillStyle = '#ccc';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const labelText = item.label.length > 22 ? item.label.substring(0, 22) + '..' : item.label;
        ctx.fillText(labelText, PANEL_X + 6, iy + ITEM_H / 2);

        if (item.type === 'number') {
            const numItem = item as GMNumberItem;
            const currentVal = getConfigValue(numItem.path);
            const precision = numItem.precision ?? 0;
            const displayVal = typeof currentVal === 'number' ? currentVal.toFixed(precision) : String(currentVal);

            const isEditing = editingItem === numItem.path;

            // 减号按钮
            const minusBtnX = valueX;
            const minusBtnW = 24;
            ctx.fillStyle = 'rgba(80, 80, 80, 0.8)';
            ctx.fillRect(minusBtnX, iy + (ITEM_H - INPUT_H) / 2, minusBtnW, INPUT_H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('−', minusBtnX + minusBtnW / 2, iy + ITEM_H / 2);

            // 数值显示框
            const inputX = minusBtnX + minusBtnW + 2;
            const inputW = valueW - minusBtnW * 2 - 4;
            ctx.fillStyle = isEditing ? 'rgba(255, 136, 0, 0.2)' : 'rgba(50, 50, 50, 0.8)';
            ctx.fillRect(inputX, iy + (ITEM_H - INPUT_H) / 2, inputW, INPUT_H);
            ctx.strokeStyle = isEditing ? '#f80' : '#555';
            ctx.lineWidth = 1;
            ctx.strokeRect(inputX, iy + (ITEM_H - INPUT_H) / 2, inputW, INPUT_H);

            ctx.fillStyle = isEditing ? '#ff8' : '#eee';
            ctx.font = '12px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isEditing ? editingValue + '|' : displayVal, inputX + inputW / 2, iy + ITEM_H / 2);

            // 加号按钮
            const plusBtnX = inputX + inputW + 2;
            ctx.fillStyle = 'rgba(80, 80, 80, 0.8)';
            ctx.fillRect(plusBtnX, iy + (ITEM_H - INPUT_H) / 2, minusBtnW, INPUT_H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+', plusBtnX + minusBtnW / 2, iy + ITEM_H / 2);

        } else if (item.type === 'bool') {
            const currentVal = !!getConfigValue(item.path);

            // 勾选框
            const checkX = valueX + valueW / 2 - 12;
            const checkY = iy + (ITEM_H - 24) / 2;
            const checkSize = 24;

            ctx.strokeStyle = currentVal ? '#0f0' : '#666';
            ctx.lineWidth = 2;
            ctx.strokeRect(checkX, checkY, checkSize, checkSize);

            if (currentVal) {
                ctx.fillStyle = 'rgba(0, 200, 0, 0.3)';
                ctx.fillRect(checkX, checkY, checkSize, checkSize);
                // 勾号
                ctx.strokeStyle = '#0f0';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(checkX + 5, checkY + 12);
                ctx.lineTo(checkX + 10, checkY + 18);
                ctx.lineTo(checkX + 19, checkY + 6);
                ctx.stroke();
            }
        }
    }

    // 滚动条
    const totalH = items.length * ITEM_H;
    if (totalH > contentH) {
        const scrollBarH = Math.max(20, contentH * (contentH / totalH));
        const scrollBarY = contentY + (scrollY / (totalH - contentH)) * (contentH - scrollBarH);
        ctx.fillStyle = 'rgba(255, 136, 0, 0.3)';
        ctx.fillRect(PANEL_X + PANEL_W - 6, scrollBarY, 4, scrollBarH);
    }

    ctx.restore(); // 恢复裁剪
    ctx.restore(); // 恢复最外层save
}

// ============ 辅助函数 ============

function _rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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