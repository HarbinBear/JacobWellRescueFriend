// 商店 / 背包 / 仓库等通用：装备和消耗品的矢量图标库
//
// 设计目标：
// - 取代原"圆底 + 首字"的占位图标，给商店每件商品一个可识别的视觉
// - 都用 canvas 矢量原语画，无图片资源依赖，跟随尺寸自适应
// - 古物（Relic）已有 drawRelicIconAt，本模块只覆盖装备类（bag*/fins*/suit*）和消耗品（airTank*/battery*/ropePack*）
//
// 用法：
//   import { drawShopItemIcon } from './ShopItemIcons';
//   drawShopItemIcon(ctx, 'bag12', cx, cy, 44);
//
// 调用前 ctx 状态由调用方负责 save/restore；本模块内部已 save/restore。

// =============================================
// 工具：圆角矩形
// =============================================
function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
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
// 装备图标
// =============================================

/** 背包：方梯形包体 + 上方提手 + 数字格子徽章 */
function drawBagIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, slots: number, tier: number): void {
    // tier: 1=basic 灰、2=uncommon 棕、3=rare 蓝、4=epic 紫
    const palette = [
        ['#5a4a35', '#8a7355'],   // tier1 灰棕
        ['#6b4a2a', '#a07840'],   // tier2 棕
        ['#2a4a7a', '#4080c0'],   // tier3 海蓝
        ['#5a3a8a', '#9060d0'],   // tier4 紫
    ];
    const [base, hi] = palette[Math.max(0, Math.min(3, tier - 1))];

    const w = size * 0.78;
    const h = size * 0.86;
    const x = cx - w / 2;
    const y = cy - h / 2 + size * 0.04;

    // 提手
    c.strokeStyle = '#b58b50';
    c.lineWidth = Math.max(1.4, size * 0.045);
    c.beginPath();
    c.arc(cx, y - size * 0.04, w * 0.32, Math.PI, 0, false);
    c.stroke();

    // 包体（梯形：上窄下宽）
    c.fillStyle = base;
    c.beginPath();
    c.moveTo(x + w * 0.08, y);
    c.lineTo(x + w * 0.92, y);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.closePath();
    c.fill();
    c.strokeStyle = hi;
    c.lineWidth = 1.2;
    c.stroke();

    // 主带子横纹
    c.strokeStyle = hi;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + w * 0.05, y + h * 0.62);
    c.lineTo(x + w * 0.95, y + h * 0.62);
    c.stroke();

    // 中央扣环
    c.fillStyle = '#d6b46c';
    c.beginPath();
    c.arc(cx, y + h * 0.62, Math.max(2, size * 0.06), 0, Math.PI * 2);
    c.fill();

    // 数字格子标签（右下小角标）
    const tagSize = size * 0.32;
    const tagX = cx + w * 0.18;
    const tagY = y + h - tagSize * 0.55;
    c.fillStyle = 'rgba(20, 15, 10, 0.85)';
    rrect(c, tagX, tagY, tagSize, tagSize * 0.62, tagSize * 0.18);
    c.fill();
    c.fillStyle = '#fff7d0';
    c.font = 'bold ' + Math.round(tagSize * 0.5) + 'px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(slots), tagX + tagSize / 2, tagY + tagSize * 0.31);
}

/** 脚蹼：一对 V 字蛙鞋 */
function drawFinsIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, kind: 'basic' | 'racing' | 'endurance'): void {
    let blade = '#3a3a40';
    let strap = '#1a1a1c';
    if (kind === 'racing') { blade = '#d96a3a'; strap = '#7a3018'; }
    else if (kind === 'endurance') { blade = '#3a6a5a'; strap = '#1c3a30'; }

    const half = size * 0.34;
    const finH = size * 0.7;
    const finW = size * 0.32;

    // 左蛙鞋（叶片+鞋套）
    c.save();
    c.translate(cx - half, cy);
    c.rotate(-0.18);
    // 叶片（梯形）
    c.fillStyle = blade;
    c.beginPath();
    c.moveTo(-finW * 0.5, -finH * 0.45);
    c.lineTo(finW * 0.5, -finH * 0.5);
    c.lineTo(finW * 0.6, finH * 0.4);
    c.lineTo(-finW * 0.6, finH * 0.4);
    c.closePath();
    c.fill();
    // 中筋
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, -finH * 0.45);
    c.lineTo(0, finH * 0.4);
    c.stroke();
    // 鞋套（顶部小椭圆）
    c.fillStyle = strap;
    c.beginPath();
    c.ellipse(0, -finH * 0.5, finW * 0.55, finH * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // 右蛙鞋（镜像）
    c.save();
    c.translate(cx + half, cy);
    c.rotate(0.18);
    c.fillStyle = blade;
    c.beginPath();
    c.moveTo(finW * 0.5, -finH * 0.45);
    c.lineTo(-finW * 0.5, -finH * 0.5);
    c.lineTo(-finW * 0.6, finH * 0.4);
    c.lineTo(finW * 0.6, finH * 0.4);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, -finH * 0.45);
    c.lineTo(0, finH * 0.4);
    c.stroke();
    c.fillStyle = strap;
    c.beginPath();
    c.ellipse(0, -finH * 0.5, finW * 0.55, finH * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
}

/** 潜水衣 / 呼吸器：连体潜水衣轮廓 + 头盔 + 气瓶；CCR 用绿色循环罐 */
function drawSuitIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, kind: 'basic' | 'deep' | 'ccr'): void {
    let suit = '#2d3b43';
    let mask = '#8ea1ab';
    let tank = '#c7d8df';
    let accent = '#5f7078';
    if (kind === 'deep')      { suit = '#1c3654'; mask = '#ffd35a'; tank = '#aab8c4'; accent = '#e0b85c'; }
    else if (kind === 'ccr')  { suit = '#3a2820'; mask = '#cfd6dc'; tank = '#3da46a'; accent = '#c8c0b4'; }

    const w = size * 0.6;
    const h = size * 0.92;
    const x = cx - w / 2;
    const y = cy - h / 2 + size * 0.02;

    // 气瓶（背在身后，左右各一只 / CCR 是中央一只大罐）
    if (kind === 'ccr') {
        // 中央一只大循环罐
        const tw = w * 0.55;
        const th = h * 0.58;
        const tx = cx - tw / 2;
        const ty = y + h * 0.12;
        c.fillStyle = tank;
        rrect(c, tx, ty, tw, th, tw * 0.3);
        c.fill();
        // 罐顶把手
        c.fillStyle = '#1f1f1f';
        c.beginPath();
        c.arc(cx, ty, tw * 0.2, Math.PI, 0, false);
        c.fill();
        // 罐身条纹
        c.strokeStyle = 'rgba(0,0,0,0.25)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(tx + tw * 0.5, ty + th * 0.15);
        c.lineTo(tx + tw * 0.5, ty + th * 0.85);
        c.stroke();
        // CCR 标签
        c.fillStyle = 'rgba(255,255,255,0.92)';
        c.font = 'bold ' + Math.round(size * 0.16) + 'px Arial';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('CCR', cx, ty + th * 0.5);
    } else {
        // 普通双气瓶（左右）
        const tw = w * 0.22;
        const th = h * 0.55;
        const ty = y + h * 0.18;
        c.fillStyle = tank;
        rrect(c, cx - w * 0.4, ty, tw, th, tw * 0.3);
        c.fill();
        rrect(c, cx + w * 0.4 - tw, ty, tw, th, tw * 0.3);
        c.fill();
    }

    // 潜水衣身体（连体衣）
    c.fillStyle = suit;
    c.beginPath();
    // 头部圆
    c.arc(cx, y + h * 0.16, w * 0.22, 0, Math.PI * 2);
    c.fill();
    // 躯干
    rrect(c, x + w * 0.18, y + h * 0.3, w * 0.64, h * 0.4, w * 0.1);
    c.fill();
    // 双腿
    rrect(c, x + w * 0.22, y + h * 0.65, w * 0.22, h * 0.3, w * 0.08);
    c.fill();
    rrect(c, x + w * 0.56, y + h * 0.65, w * 0.22, h * 0.3, w * 0.08);
    c.fill();

    // 面镜（高光椭圆）
    c.fillStyle = mask;
    c.beginPath();
    c.ellipse(cx, y + h * 0.16, w * 0.16, w * 0.1, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.beginPath();
    c.ellipse(cx - w * 0.05, y + h * 0.13, w * 0.04, w * 0.025, -0.4, 0, Math.PI * 2);
    c.fill();

    // 腰带（accent）
    c.fillStyle = accent;
    c.fillRect(x + w * 0.18, y + h * 0.55, w * 0.64, h * 0.06);
}

// =============================================
// 消耗品图标
// =============================================

/** 氧气瓶：竖立的瓶身 + 阀门把手 + 标签数字 */
function drawAirTankIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, capacity: 'S' | 'M' | 'L'): void {
    const colorMap = {
        'S': { body: '#a4b8b8', label: '60'  },
        'M': { body: '#5a90c4', label: '100' },
        'L': { body: '#c45a5a', label: '150' },
    };
    const { body, label } = colorMap[capacity];

    const w = size * 0.45;
    const h = size * 0.78;
    const x = cx - w / 2;
    const y = cy - h / 2 + size * 0.04;

    // 阀门顶帽
    c.fillStyle = '#5a5a5a';
    c.beginPath();
    c.arc(cx, y - size * 0.04, w * 0.22, Math.PI, 0, false);
    c.fill();
    c.fillStyle = '#3a3a3a';
    c.fillRect(cx - w * 0.06, y - size * 0.06, w * 0.12, size * 0.08);

    // 瓶身（圆角矩形）
    c.fillStyle = body;
    rrect(c, x, y, w, h, w * 0.25);
    c.fill();

    // 高光
    c.fillStyle = 'rgba(255,255,255,0.28)';
    rrect(c, x + w * 0.12, y + h * 0.1, w * 0.18, h * 0.7, w * 0.1);
    c.fill();

    // 标签条
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(x + w * 0.05, y + h * 0.45, w * 0.9, h * 0.22);
    c.fillStyle = '#ffffff';
    c.font = 'bold ' + Math.round(size * 0.16) + 'px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, cx, y + h * 0.56);
}

/** 电池：电池外壳 + 电量条 */
function drawBatteryIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, level: 'weak' | 'std' | 'high'): void {
    const w = size * 0.74;
    const h = size * 0.42;
    const x = cx - w / 2;
    const y = cy - h / 2;

    // 正极头
    c.fillStyle = '#bdbdbd';
    c.fillRect(x + w, y + h * 0.25, size * 0.06, h * 0.5);

    // 外壳
    c.fillStyle = '#1f1f1f';
    rrect(c, x, y, w, h, h * 0.18);
    c.fill();

    // 电量条
    let bars = level === 'weak' ? 1 : level === 'std' ? 2 : 3;
    const barColors = level === 'weak' ? ['#f08040'] : level === 'std' ? ['#f0c040', '#f0c040'] : ['#40d870', '#40d870', '#40d870'];
    const barW = w * 0.22;
    const barH = h * 0.6;
    const barY = y + (h - barH) / 2;
    for (let i = 0; i < bars; i++) {
        const bx = x + w * 0.08 + i * (barW + w * 0.04);
        c.fillStyle = barColors[i];
        rrect(c, bx, barY, barW, barH, barH * 0.18);
        c.fill();
    }
}

/** 绳索盘：环形线缠绕 + 中心数字 */
function drawRopeIcon(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, length: 5 | 15): void {
    const r = size * 0.42;

    // 外圈绳索（多层）
    c.strokeStyle = '#c8884a';
    c.lineWidth = Math.max(2, size * 0.075);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#a06830';
    c.lineWidth = Math.max(1.4, size * 0.05);
    c.beginPath();
    c.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
    c.stroke();

    // 绳索纹理（径向短线）
    c.strokeStyle = 'rgba(40,20,10,0.45)';
    c.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const ix = cx + Math.cos(a) * r * 0.85;
        const iy = cy + Math.sin(a) * r * 0.85;
        const ox = cx + Math.cos(a) * r * 1.05;
        const oy = cy + Math.sin(a) * r * 1.05;
        c.beginPath();
        c.moveTo(ix, iy);
        c.lineTo(ox, oy);
        c.stroke();
    }

    // 中心标签：长度数字
    c.fillStyle = 'rgba(20,15,10,0.9)';
    c.beginPath();
    c.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffd984';
    c.font = 'bold ' + Math.round(size * 0.22) + 'px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(length), cx, cy);
    c.font = 'bold ' + Math.round(size * 0.1) + 'px Arial';
    c.fillText('段', cx, cy + size * 0.18);
}

// =============================================
// 总入口
// =============================================

/**
 * 按 itemId 在 (cx, cy) 画 size × size 的图标。
 * 返回 true 表示本模块认识该 itemId 并已绘制；返回 false 表示没匹配，调用方自行兜底。
 */
export function drawShopItemIcon(c: CanvasRenderingContext2D, itemId: string, cx: number, cy: number, size: number): boolean {
    c.save();
    let drawn = true;
    switch (itemId) {
        // 背包
        case 'bag4':  drawBagIcon(c, cx, cy, size, 4, 1); break;
        case 'bag8':  drawBagIcon(c, cx, cy, size, 8, 2); break;
        case 'bag12': drawBagIcon(c, cx, cy, size, 12, 3); break;
        case 'bag16': drawBagIcon(c, cx, cy, size, 16, 4); break;
        // 脚蹼
        case 'finsBasic':     drawFinsIcon(c, cx, cy, size, 'basic'); break;
        case 'finsRacing':    drawFinsIcon(c, cx, cy, size, 'racing'); break;
        case 'finsEndurance': drawFinsIcon(c, cx, cy, size, 'endurance'); break;
        // 潜水衣
        case 'suitBasic': drawSuitIcon(c, cx, cy, size, 'basic'); break;
        case 'suitDeep':  drawSuitIcon(c, cx, cy, size, 'deep'); break;
        case 'suitCCR':   drawSuitIcon(c, cx, cy, size, 'ccr'); break;
        // 氧气瓶
        case 'airTankS': drawAirTankIcon(c, cx, cy, size, 'S'); break;
        case 'airTankM': drawAirTankIcon(c, cx, cy, size, 'M'); break;
        case 'airTankL': drawAirTankIcon(c, cx, cy, size, 'L'); break;
        // 电池
        case 'batteryWeak': drawBatteryIcon(c, cx, cy, size, 'weak'); break;
        case 'batteryStd':  drawBatteryIcon(c, cx, cy, size, 'std'); break;
        case 'batteryHigh': drawBatteryIcon(c, cx, cy, size, 'high'); break;
        // 绳索
        case 'ropePack5':  drawRopeIcon(c, cx, cy, size, 5); break;
        case 'ropePack15': drawRopeIcon(c, cx, cy, size, 15); break;
        default:
            drawn = false;
            break;
    }
    c.restore();
    return drawn;
}

/** 是否能用本模块绘制（hit-test 用） */
export function hasShopItemIcon(itemId: string): boolean {
    switch (itemId) {
        case 'bag4': case 'bag8': case 'bag12': case 'bag16':
        case 'finsBasic': case 'finsRacing': case 'finsEndurance':
        case 'suitBasic': case 'suitDeep': case 'suitCCR':
        case 'airTankS': case 'airTankM': case 'airTankL':
        case 'batteryWeak': case 'batteryStd': case 'batteryHigh':
        case 'ropePack5': case 'ropePack15':
            return true;
        default:
            return false;
    }
}
