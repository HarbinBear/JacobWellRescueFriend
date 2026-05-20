// 营地按钮注册表（轻量级）
//
// 设计目的：
//   营地（mazeRescue.phase === 'shore' / 'resolved_idle'）下，
//   旧的按钮（返回/杂货铺/仓库/图鉴/放弃救援/接受新任务/水池下潜/探索记录卡）
//   分散在 4 个文件里硬编码，不在本注册表内动它们——它们已经稳定运行很久。
//
//   本注册表只负责承接"新增按钮"。第一个就是新主线的"今天就到这吧"（回家）按钮。
//
//   未来若再加其它营地按钮，按本注册表的 ShoreButton 接口追加一条配置即可：
//     - id / label / icon / slot / order
//     - visible / enabled / disabledHint
//     - onTap
//   渲染、hit-test、置灰提示、点击音效，注册表统一管理。
//
// 使用约定：
//   - drawShoreButtonBar(cw, ch, time)  在 RenderMazeUI.drawMazeHUD 的 shore / resolved_idle 分支末尾调用
//   - tryShoreButtonBar(tx, ty)         在 input.ts 营地分支早期调用，返回 true 表示已被本注册表消费

import { ctx } from '../Canvas';
import { state } from '../../core/state';
import { playSFX } from '../../audio/AudioManager';
import { goHome } from '../../logic/MazeLogic';

// =============================================
// 圆角矩形（与本目录其它 mazeUI 文件风格一致）
// =============================================
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
// 槽位定义
//
// 营地屏幕区域占用情况：
//   左上 (14, 62)：返回 / 杂货铺 / 仓库（一行水平排开）
//   右上 (cw-114, 62)：图鉴 / 接受新任务（不同 phase 下取其一）
//   屏幕中央 (cw*0.5, ch*0.44)：水池"点击下潜"
//   底部 (margin-x=cw*0.06, h=48~ch*0.42)：探索记录卡（横跨整个屏幕底部）
//   屏幕中下：放弃救援按钮
//
// 因此本注册表使用：
//   - topRightStack：右上图鉴/接受新任务按钮 *正下方* 纵向堆叠
//   其它槽位（topLeft / bottomLeft / bottomRight）暂留备用——底部被探索记录卡占满，新按钮要慎放。
// =============================================
type Slot = 'topRightStack';

interface Rect { x: number; y: number; w: number; h: number; }

interface ShoreButton {
    id: string;
    slot: Slot;
    order: number;              // 同槽位内的顺序（0,1,2... 从靠边那一端起）
    label: string;
    icon?: string;              // 单字符 emoji 或短串；不画就留空
    width: number;              // 像素
    height: number;             // 像素
    visible: () => boolean;
    enabled: () => boolean;
    disabledHint?: string;
    sfx?: 'uiPrimary' | 'uiSecondary';
    onTap: () => void;
}

// =============================================
// 边距常量
//
// topRightStack 与图鉴按钮 (codex.ts) 共享右边距。
// 图鉴按钮：y=62, h=34，所以本栈起始 y = 62+34+8 = 104
// 接受新任务按钮：y=52, h=34，所以堆叠按钮在 resolved_idle 也位于其下方约 12px 处
// 取较大者保证不撞，stack 起点 = 104。
// =============================================
const STACK_RIGHT_MARGIN = 16;
const STACK_TOP = 104;
const STACK_GAP = 8;

// =============================================
// 按钮配置表
//
// 注：旧按钮（返回 / 杂货铺 / 仓库 / 图鉴 / 接受新任务 / 放弃救援）暂不迁入。
//     如果未来要迁，把它们的 visible/enabled/onTap 包装成本表的一项即可。
// =============================================
const BUTTONS: ShoreButton[] = [
    {
        id: 'goHome',
        slot: 'topRightStack',
        order: 0,
        label: '今天到这吧',
        icon: '🏠',
        width: 128,
        height: 38,
        visible: () => {
            const m: any = state.mazeRescue;
            if (!m) return false;
            // 仅在岸上正常态显示，不在覆盖层（全屏地图/图鉴/警情通报）下显示
            if (m.phase !== 'shore' && m.phase !== 'resolved_idle') return false;
            if (m.shoreMapOpen) return false;
            if (m.codexOpen) return false;
            if (m.phase === 'shore' && !m.briefingShown) return false;
            return true;
        },
        enabled: () => state.story2.dayHadAnyDive === true,
        disabledHint: '今天还没下水，先跑一趟吧',
        sfx: 'uiPrimary',
        onTap: () => goHome(),
    },
    // 未来在这里追加更多按钮……
];

// =============================================
// 布局：根据 slot + order 计算屏幕矩形
// =============================================
function layoutButton(btn: ShoreButton, cw: number, _ch: number): Rect {
    if (btn.slot === 'topRightStack') {
        // 同栈按钮按 order 从上到下堆叠
        const same = BUTTONS.filter(b => b.slot === 'topRightStack').sort((a, b) => a.order - b.order);
        let yAcc = STACK_TOP;
        for (const b of same) {
            if (b.id === btn.id) break;
            yAcc += b.height + STACK_GAP;
        }
        return {
            x: cw - btn.width - STACK_RIGHT_MARGIN,
            y: yAcc,
            w: btn.width,
            h: btn.height,
        };
    }
    // 兜底：屏幕中央（理论上不会走到，slot 类型已收窄到 topRightStack）
    return { x: 0, y: 0, w: btn.width, h: btn.height };
}

// =============================================
// 单个按钮的绘制
// =============================================
function drawButton(btn: ShoreButton, rect: Rect, time: number) {
    const enabled = btn.enabled();

    ctx.save();

    // 底色
    ctx.globalAlpha = enabled ? 0.92 : 0.55;
    ctx.fillStyle = enabled ? 'rgba(34, 52, 68, 0.92)' : 'rgba(40, 42, 48, 0.85)';
    ctx.beginPath();
    rrect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();

    // 描边（启用时呼吸光晕）
    const pulse = 0.85 + Math.sin(time * 2.4) * 0.15;
    ctx.strokeStyle = enabled
        ? `rgba(140, 200, 255, ${0.55 * pulse})`
        : 'rgba(120, 130, 140, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    rrect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.stroke();

    // 图标 + 文字
    const cy = rect.y + rect.h / 2;
    let textX = rect.x + 14;
    if (btn.icon) {
        ctx.font = '18px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = enabled ? 'rgba(220, 240, 255, 0.95)' : 'rgba(170, 175, 180, 0.7)';
        ctx.fillText(btn.icon, textX, cy);
        textX += 24;
    }
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = enabled ? 'rgba(225, 240, 255, 0.96)' : 'rgba(160, 170, 180, 0.7)';
    ctx.fillText(btn.label, textX, cy);

    ctx.restore();
}

// =============================================
// 禁用提示气泡（点击禁用按钮时短暂出现一行小字）
// =============================================
let _disabledHintText = '';
let _disabledHintShownAt = 0;
const HINT_DURATION = 1800;

function drawDisabledHint(cw: number, _ch: number) {
    if (!_disabledHintText) return;
    const elapsed = Date.now() - _disabledHintShownAt;
    if (elapsed > HINT_DURATION) { _disabledHintText = ''; return; }
    const t = 1 - elapsed / HINT_DURATION;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.5);
    ctx.fillStyle = 'rgba(20, 28, 36, 0.85)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const pad = 10;
    const w = ctx.measureText(_disabledHintText).width + pad * 2;
    const h = 24;
    // 紧贴 goHome 按钮左侧（避免遮挡按钮本身）
    const x = cw - STACK_RIGHT_MARGIN - 128 - 8 - w;
    const y = STACK_TOP + 7;
    ctx.beginPath();
    rrect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(220, 230, 240, 0.95)';
    ctx.fillText(_disabledHintText, x + w - pad, y + h / 2);
    ctx.restore();
}

// =============================================
// 对外：渲染 + 命中
// =============================================
export function drawShoreButtonBar(cw: number, ch: number, time: number) {
    for (const btn of BUTTONS) {
        if (!btn.visible()) continue;
        const rect = layoutButton(btn, cw, ch);
        drawButton(btn, rect, time);
    }
    drawDisabledHint(cw, ch);
}

/**
 * 营地点击派发：返回 true 表示本次点击被注册表消费（input.ts 应停止后续处理）。
 */
export function tryShoreButtonBar(tx: number, ty: number, cw: number, ch: number): boolean {
    for (const btn of BUTTONS) {
        if (!btn.visible()) continue;
        const r = layoutButton(btn, cw, ch);
        if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h) {
            if (!btn.enabled()) {
                if (btn.disabledHint) {
                    _disabledHintText = btn.disabledHint;
                    _disabledHintShownAt = Date.now();
                }
                playSFX('uiSecondary');
                return true;
            }
            playSFX(btn.sfx ?? 'uiPrimary');
            btn.onTap();
            return true;
        }
    }
    return false;
}
