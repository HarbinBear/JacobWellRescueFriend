import { CONFIG } from '../core/config';
import { state } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';

// 兼容微信小游戏的圆角矩形（手动绘制，避免roundRect兼容性问题）
function rrect(c, x, y, w, h, r) {
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
// 主菜单（新主线）
//
// 旧的"开始游戏 / 章节选择 / 食人鱼竞技场 / 迷宫纯享版"四按钮已废弃。
// 当前过渡期：只暴露"进入游戏"（=进入迷宫救援营地）一个入口。
// 阶段 4 会重构为：继续 / 剧情进度 / 新游戏 / 设置。
// 食人鱼竞技场作为彩蛋保留代码，但主菜单不暴露入口（GM 面板可强制进）。
// =====================================================================

export function drawMenu() {
    let time = Date.now() / 1000;

    // 背景：深海渐变
    let grad = ctx.createLinearGradient(0, 0, 0, logicH);
    grad.addColorStop(0, '#001a33');
    grad.addColorStop(0.5, '#001122');
    grad.addColorStop(1, '#000811');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, logicW, logicH);

    // 动态气泡背景
    ctx.save();
    for(let i = 0; i < 18; i++) {
        let bx = logicW * ((i * 0.137 + time * 0.02 * (1 + i % 3 * 0.3)) % 1);
        let by = logicH - (time * (15 + i % 5 * 5) + i * 80) % (logicH + 60);
        let br = 3 + (i % 4) * 3;
        let ba = 0.08 + (i % 3) * 0.05;
        ctx.fillStyle = `rgba(100,220,255,${ba})`;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        // 气泡高光
        ctx.fillStyle = `rgba(255,255,255,${ba * 1.5})`;
        ctx.beginPath();
        ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 丁达尔光柱
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for(let i = 0; i < 4; i++) {
        let rx = logicW / 2 + Math.sin(time * 0.4 + i * 1.6) * 120;
        let rg = ctx.createLinearGradient(rx, 0, rx, logicH);
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

    // 水面波纹（顶部）
    ctx.strokeStyle = 'rgba(100,220,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let wx2 = 0; wx2 < logicW; wx2 += 10) {
        ctx.lineTo(wx2, 18 + Math.sin(wx2 / 60 + time * 1.5) * 5);
    }
    ctx.stroke();

    // 标题
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 标题光晕
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    let titleGlow = ctx.createRadialGradient(logicW / 2, logicH * 0.27, 0, logicW / 2, logicH * 0.27, 120);
    titleGlow.addColorStop(0, 'rgba(0,200,255,0.2)');
    titleGlow.addColorStop(1, 'rgba(0,200,255,0)');
    ctx.fillStyle = titleGlow;
    ctx.fillRect(logicW / 2 - 120, logicH * 0.27 - 60, 240, 120);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,200,255,0.15)';
    ctx.font = 'bold 40px Arial';
    ctx.fillText("雅各布井", logicW / 2 + 2, logicH * 0.27 + 2);
    ctx.fillStyle = '#e0f8ff';
    ctx.font = 'bold 40px Arial';
    ctx.fillText("雅各布井", logicW / 2, logicH * 0.27);

    ctx.fillStyle = 'rgba(0,180,220,0.15)';
    ctx.font = 'bold 28px Arial';
    ctx.fillText("救援行动", logicW / 2 + 1, logicH * 0.35 + 1);
    ctx.fillStyle = '#a0d8ef';
    ctx.font = 'bold 28px Arial';
    ctx.fillText("救援行动", logicW / 2, logicH * 0.35);

    // 分割线
    ctx.strokeStyle = 'rgba(0,200,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(logicW / 2 - 80, logicH * 0.43);
    ctx.lineTo(logicW / 2 + 80, logicH * 0.43);
    ctx.stroke();

    const unlock = CONFIG.menuUnlock;

    // ---- 按钮：进入游戏（接迷宫救援营地，等同于过去的"迷宫纯享版"按钮）----
    let mazeBtnY = logicH * 0.55;
    let mazeBtnW = 200, mazeBtnH = 56;
    let mazeBtnX = logicW / 2 - mazeBtnW / 2;
    let mazeBtnTop = mazeBtnY - mazeBtnH / 2;
    let mazeLocked = !unlock.mazeMode;
    let mazePulse = mazeLocked ? 0.4 : (0.85 + Math.sin(time * 2.0 + 1.0) * 0.15);

    ctx.save();
    ctx.globalAlpha = mazePulse;
    let mazeGrad = ctx.createLinearGradient(mazeBtnX, mazeBtnTop, mazeBtnX, mazeBtnTop + mazeBtnH);
    if (mazeLocked) {
        mazeGrad.addColorStop(0, 'rgba(60,60,80,0.4)');
        mazeGrad.addColorStop(1, 'rgba(30,30,50,0.4)');
    } else {
        mazeGrad.addColorStop(0, 'rgba(0,120,80,0.55)');
        mazeGrad.addColorStop(0.5, 'rgba(0,160,100,0.45)');
        mazeGrad.addColorStop(1, 'rgba(0,80,50,0.55)');
    }
    ctx.fillStyle = mazeGrad;
    ctx.beginPath();
    rrect(ctx, mazeBtnX, mazeBtnTop, mazeBtnW, mazeBtnH, 28);
    ctx.fill();
    ctx.strokeStyle = mazeLocked ? 'rgba(80,80,100,0.5)' : `rgba(0,220,140,${mazePulse * 0.9})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rrect(ctx, mazeBtnX, mazeBtnTop, mazeBtnW, mazeBtnH, 28);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = mazeLocked ? 'rgba(100,100,120,0.6)' : `rgba(100,255,180,${mazePulse})`;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(mazeLocked ? "🔒  进入游戏" : "▶  进入游戏", logicW / 2, mazeBtnY);

    // 副标题
    ctx.fillStyle = 'rgba(160,200,220,0.6)';
    ctx.font = '12px Arial';
    ctx.fillText("洞穴潜水救援", logicW / 2, mazeBtnY + 38);

    // 版本号
    ctx.fillStyle = 'rgba(80,120,140,0.8)';
    ctx.font = '11px Arial';
    ctx.fillText(`${CONFIG.version}  By 游呢王纸`, logicW / 2, logicH - 22);
}

// 旧的章节插画（drawChapterImage1~4）/ drawChapterSelect / drawChapterCard 已全部删除
