import { CONFIG } from '../core/config';
import { state, player } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';

// 兼容微信小游戏的圆角矩形
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

export function drawArenaHUD() {
    const arena = state.fishArena;
    if (!arena) return;

    const cw = logicW;
    const ch = logicH;
    const time = Date.now() / 1000;

    // --- 死亡结算页面 ---
    if (arena.phase === 'dead') {
        drawArenaDeathScreen(arena, cw, ch, time);
        return;
    }

    // --- 顶部信息栏 ---
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, cw, 56);
    ctx.strokeStyle = 'rgba(255,60,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 56);
    ctx.lineTo(cw, 56);
    ctx.stroke();
    ctx.restore();

    // 轮次（左侧）
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = 'rgba(255,150,80,0.7)';
    ctx.fillText('ROUND', 14, 20);
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#ff8040';
    ctx.fillText(`${arena.round}`, 14, 42);
    ctx.restore();

    // 存活鱼数（中间）
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fishCountText = arena.phase === 'prep' ? '?' : `${arena.fishAlive}`;
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = 'rgba(255,80,80,0.7)';
    ctx.fillText('🦈 存活', cw / 2, 18);
    ctx.font = `bold ${arena.fishAlive > 0 ? '28' : '24'}px Arial`;
    ctx.fillStyle = arena.fishAlive > 0 ? '#ff4040' : '#40ff80';
    ctx.fillText(fishCountText, cw / 2, 42);
    ctx.restore();

    // 累计击杀（右侧）
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = 'rgba(255,200,80,0.7)';
    ctx.fillText('KILLS', cw - 14, 20);
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#ffc840';
    ctx.fillText(`${arena.totalKills}`, cw - 14, 42);
    ctx.restore();

    // --- 准备阶段倒计时 ---
    if (arena.phase === 'prep') {
        const prepLeft = Math.ceil(arena.prepTimer);
        const prepAlpha = 0.7 + Math.sin(time * 4) * 0.3;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 56, cw, ch - 56);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 光晕
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const prepGlow = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, 100);
        prepGlow.addColorStop(0, `rgba(255,100,0,${prepAlpha * 0.3})`);
        prepGlow.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = prepGlow;
        ctx.fillRect(cw / 2 - 100, ch / 2 - 100, 200, 200);
        ctx.restore();

        ctx.font = 'bold 80px Arial';
        ctx.fillStyle = `rgba(255,80,20,${prepAlpha})`;
        ctx.fillText(`${prepLeft}`, cw / 2, ch / 2 - 20);

        ctx.font = 'bold 22px Arial';
        ctx.fillStyle = `rgba(255,200,150,${prepAlpha * 0.9})`;
        const roundText = arena.round === 1 ? '准备好了吗？' : `第 ${arena.round} 轮 — 做好准备！`;
        ctx.fillText(roundText, cw / 2, ch / 2 + 50);

        ctx.font = '16px Arial';
        ctx.fillStyle = `rgba(255,150,100,${prepAlpha * 0.8})`;
        const fishCountThisRound = arena.round === 1 ? 1 : (arena.round - 1) * 5;
        ctx.fillText(`本轮将出现 ${fishCountThisRound} 条食人鱼`, cw / 2, ch / 2 + 80);
        ctx.restore();
    }

    // --- 清图庆祝阶段 ---
    if (arena.phase === 'clear') {
        const clearProgress = arena.clearTimer / 150;
        const clearAlpha = clearProgress < 0.2 ? clearProgress / 0.2 :
                           clearProgress > 0.8 ? (1 - clearProgress) / 0.2 : 1;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (arena.achievementText) {
            const scale = 1 + Math.sin(clearProgress * Math.PI) * 0.15;
            ctx.save();
            ctx.translate(cw / 2, ch * 0.42);
            ctx.scale(scale, scale);

            // 文字光晕
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const achGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 150);
            achGlow.addColorStop(0, `rgba(255,200,0,${clearAlpha * 0.4})`);
            achGlow.addColorStop(1, 'rgba(255,200,0,0)');
            ctx.fillStyle = achGlow;
            ctx.fillRect(-150, -80, 300, 160);
            ctx.restore();

            // 阴影
            ctx.fillStyle = `rgba(0,0,0,${clearAlpha * 0.6})`;
            ctx.font = 'bold 42px Arial';
            ctx.fillText(arena.achievementText, 3, 3);
            // 主文字
            ctx.fillStyle = `rgba(255,220,60,${clearAlpha})`;
            ctx.fillText(arena.achievementText, 0, 0);
            ctx.restore();
        }

        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = `rgba(200,240,255,${clearAlpha * 0.9})`;
        ctx.fillText(`第 ${arena.round + 1} 轮即将开始...`, cw / 2, ch * 0.58);
        ctx.restore();
    }

    // --- 战斗中成就文字浮现 ---
    if (arena.achievementTimer > 0 && arena.phase === 'fight') {
        const achAlpha = Math.min(1, arena.achievementTimer / 30);
        const achY = ch * 0.35 - (1 - arena.achievementTimer / 120) * 30;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 36px Arial';
        ctx.fillStyle = `rgba(255,220,60,${achAlpha})`;
        ctx.fillText(arena.achievementText, cw / 2, achY);
        ctx.restore();
    }
}

// 竞技场死亡结算页面
function drawArenaDeathScreen(arena: any, cw: number, ch: number, time: number) {
    const deadProgress = Math.min(1, arena.deadTimer / 60);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${deadProgress * 0.92})`;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();

    if (arena.deadTimer < 30) return;

    const showAlpha = Math.min(1, (arena.deadTimer - 30) / 40);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 血红光晕
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const titleGlow = ctx.createRadialGradient(cw / 2, ch * 0.22, 0, cw / 2, ch * 0.22, 160);
    titleGlow.addColorStop(0, `rgba(255,0,0,${showAlpha * 0.3})`);
    titleGlow.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = titleGlow;
    ctx.fillRect(cw / 2 - 160, ch * 0.1, 320, 240);
    ctx.restore();

    // 死亡标题
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = `rgba(255,40,20,${showAlpha})`;
    ctx.fillText('YOU DIED', cw / 2, ch * 0.22);

    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = `rgba(255,150,100,${showAlpha * 0.9})`;
    ctx.fillText('被食人鱼撕碎了...', cw / 2, ch * 0.32);

    // 分割线
    ctx.save();
    ctx.strokeStyle = `rgba(255,60,0,${showAlpha * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cw * 0.2, ch * 0.38);
    ctx.lineTo(cw * 0.8, ch * 0.38);
    ctx.stroke();
    ctx.restore();

    // 统计数据
    const statY = ch * 0.46;
    const statGap = ch * 0.075;

    // 最高轮次
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = `rgba(180,180,200,${showAlpha * 0.7})`;
    ctx.fillText('最高轮次', cw / 2, statY);
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = `rgba(255,180,80,${showAlpha})`;
    ctx.fillText(`第 ${arena.round} 轮`, cw / 2, statY + statGap * 0.7);

    // 击杀总数
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = `rgba(180,180,200,${showAlpha * 0.7})`;
    ctx.fillText('击杀总数', cw / 2, statY + statGap * 1.6);
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = `rgba(255,80,80,${showAlpha})`;
    ctx.fillText(`${arena.totalKills} 条`, cw / 2, statY + statGap * 2.3);

    // 存活时间
    const minutes = Math.floor(arena.surviveTime / 60);
    const seconds = Math.floor(arena.surviveTime % 60);
    const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = `rgba(180,180,200,${showAlpha * 0.7})`;
    ctx.fillText('存活时间', cw / 2, statY + statGap * 3.2);
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = `rgba(100,220,255,${showAlpha})`;
    ctx.fillText(timeStr, cw / 2, statY + statGap * 3.9);

    // 评价语
    const rating = getArenaRating(arena.round, arena.totalKills);
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = `rgba(255,220,100,${showAlpha})`;
    ctx.fillText(rating, cw / 2, statY + statGap * 5.0);

    // 返回提示（2秒后出现）
    if (arena.deadTimer >= 120) {
        const tapAlpha = 0.5 + Math.sin(time * 2.5) * 0.5;
        ctx.font = '16px Arial';
        ctx.fillStyle = `rgba(150,180,200,${tapAlpha * showAlpha})`;
        ctx.fillText('点击屏幕返回主菜单', cw / 2, ch * 0.92);
    }

    ctx.restore();
}

// 根据轮次给出评价语
function getArenaRating(round: number, kills: number): string {
    if (round >= 10) return '🏆 深海传说！无人能敌！';
    if (round >= 7)  return '⚡ 不可思议！你是怪物！';
    if (round >= 5)  return '🔥 势不可挡！太强了！';
    if (round >= 3)  return '💪 不错！继续挑战！';
    if (round >= 2)  return '👍 还行，再来一局！';
    return '😅 被第一轮干掉了...加油！';
}

// =============================================
// 迷宫引导绳模式：HUD 绘制
// =============================================
