import { state } from '../core/state';
import { ctx, logicW, logicH } from './Canvas';
import { drawDiverSilhouette } from './RenderDiver';

function endingGetAlpha(t, start, end) {
    let local = t - start;
    let dur = end - start;
    if(local < 60) return local/60;
    if(local > dur-60) return (dur-local)/60;
    return 1;
}

export function drawEnding() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, logicW, logicH);
    let timer = state.endingTimer || 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // 第三关：熊子死亡结局
    if(state.story.flags.bearDied) {
        drawBearDiedEnding(timer);
        return;
    }

    // 第二关结局：第二三关衔接分页剧情
    if(state.story.flags.stage2Ending) {
        drawStage2to3Ending(timer);
        return;
    }

    // 旧结局（保留兜底）
    if(timer < 240) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,0,240)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "小潘把一个密闭的洞穴气室\n误当成了出口，\n最终在搅动的泥沙中彻底迷失方向，\n丧生在了黑暗之中。", logicW/2, logicH/2, 30);
    } else if(timer < 480) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,240,480)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "为了不让更多的人\n丧生在恐怖的雅各布井，\n当地政府最终彻底封闭了雅各布井。", logicW/2, logicH/2, 30);
    } else if(timer < 720) {
        let alpha = endingGetAlpha(timer, 480, 720);
        ctx.save(); ctx.globalAlpha = alpha;
        drawDiverSilhouette(ctx, logicW/2-60, logicH/2, '#555');
        drawDiverSilhouette(ctx, logicW/2+60, logicH/2+20, '#555', true);
        ctx.fillStyle = '#f00'; ctx.font = '16px Arial';
        ctx.fillText("(小熊)", logicW/2-60, logicH/2-50);
        ctx.fillText("(小潘)", logicW/2+60, logicH/2-40);
        ctx.fillStyle = '#333'; ctx.fillRect(logicW/2+80, logicH/2+30, 20, 10);
        ctx.restore();
    } else if(timer < 960) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,720,960)})`;
        ctx.font = '24px Arial'; ctx.fillText("感谢您的体验", logicW/2, logicH/2);
    } else if(timer < 1200) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,960,1200)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "当前版本持续优化中\n前往未知的深渊\n与带熊子潘子回家的故事\n未来有时间会完善。", logicW/2, logicH/2, 30);
    } else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = '20px Arial'; ctx.fillText("制作人员", logicW/2, logicH/2-40);
        ctx.font = '16px Arial'; ctx.fillText("小熊和他的小伙伴们", logicW/2, logicH/2);
        if(t > 120) {
            ctx.fillStyle = `rgba(255,255,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial'; ctx.fillText("点击屏幕重新开始", logicW/2, logicH-50);
        }
    }
}

// 第二关结局：第二三关衔接分页剧情
function drawStage2to3Ending(timer) {
    // 第1页 (0-300): 小潘在慌乱中迷失方向
    if(timer < 300) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,0,300)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "小潘在慌乱中迷失方向，\n错把一条向上的死路\n当成是上岸的路。", logicW/2, logicH/2, 32);
    }
    // 第2页 (300-600): 好在小潘及时醒悟
    else if(timer < 600) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,300,600)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "好在小潘及时醒悟过来，\n跟着亮子逃脱了\n迷宫般的洞穴。", logicW/2, logicH/2, 32);
    }
    // 第3页 (600-900): 亮子劫后余生，但来不及高兴
    else if(timer < 900) {
        ctx.fillStyle = `rgba(255,255,255,${endingGetAlpha(timer,600,900)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "亮子刚刚劫后余生，\n但来不及高兴，\n因为距离熊子消失在那大裂缝中，\n已经过去了半小时。", logicW/2, logicH/2, 32);
    }
    // 第4页 (900-1200): 入水动画 + 亮子再次出发
    else if(timer < 1200) {
        let alpha = endingGetAlpha(timer, 900, 1200);
        let t = timer - 900;
        ctx.save();
        ctx.globalAlpha = alpha;

        // 水面背景
        let waterGrad = ctx.createLinearGradient(0, logicH*0.4, 0, logicH);
        waterGrad.addColorStop(0, '#001a33');
        waterGrad.addColorStop(1, '#000811');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(0, logicH*0.4, logicW, logicH*0.6);

        // 水面波纹
        ctx.strokeStyle = 'rgba(100,220,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(let wx = 0; wx < logicW; wx += 8) {
            ctx.lineTo(wx, logicH*0.4 + Math.sin(wx/40 + t*0.05)*4);
        }
        ctx.stroke();

        // 入水动画：潜水员从上方落入水中
        let diverY = logicH*0.3 + Math.min(t * 0.8, logicH*0.25);
        let splashAlpha = Math.max(0, 1 - t/60);
        if(t > 30) {
            // 水花
            ctx.fillStyle = `rgba(150,220,255,${splashAlpha})`;
            for(let i = 0; i < 8; i++) {
                let angle = (i / 8) * Math.PI * 2;
                let r = 20 + (t-30) * 0.5;
                ctx.beginPath();
                ctx.arc(logicW/2 + Math.cos(angle)*r, logicH*0.4 + Math.sin(angle)*r*0.3, 3, 0, Math.PI*2);
                ctx.fill();
            }
        }
        drawDiverSilhouette(ctx, logicW/2, diverY, '#4af');
        ctx.restore();

        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = 'bold 20px Arial';
        ctx.fillText("亮子不敢再多想，", logicW/2, logicH*0.15);
        ctx.font = '18px Arial';
        ctx.fillText("简单调整后，再次出发！", logicW/2, logicH*0.22);
    }
    // 第5页 (1200+): 点击进入第三关
    else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = 'bold 22px Arial';
        ctx.fillText("第三章", logicW/2, logicH/2 - 30);
        ctx.font = '18px Arial';
        ctx.fillText("黑暗中的独行", logicW/2, logicH/2 + 10);
        if(t > 90) {
            ctx.fillStyle = `rgba(0,220,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial';
            ctx.fillText("点击屏幕继续", logicW/2, logicH - 50);
        }
    }
}

// 第三关：熊子死亡结局
function drawBearDiedEnding(timer) {
    // 第1页 (0-300): 黑暗中的独白
    if(timer < 300) {
        ctx.fillStyle = `rgba(180,180,180,${endingGetAlpha(timer,0,300)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "亮子最终没能找到熊子。", logicW/2, logicH/2, 32);
    }
    // 第2页 (300-600): 熊子的结局
    else if(timer < 600) {
        ctx.fillStyle = `rgba(200,200,200,${endingGetAlpha(timer,300,600)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "熊子独自困在那道大裂缝中，\n氧气耗尽，\n永远留在了雅各布井的黑暗里。", logicW/2, logicH/2, 32);
    }
    // 第3页 (600-900): 剪影
    else if(timer < 900) {
        let alpha = endingGetAlpha(timer, 600, 900);
        ctx.save();
        ctx.globalAlpha = alpha;
        // 黑暗背景中的孤独剪影
        let darkGrad = ctx.createRadialGradient(logicW/2, logicH/2, 0, logicW/2, logicH/2, 200);
        darkGrad.addColorStop(0, 'rgba(20,30,40,1)');
        darkGrad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = darkGrad;
        ctx.fillRect(0, 0, logicW, logicH);
        // 熊子剪影（静止，朝下）
        ctx.save();
        ctx.translate(logicW/2, logicH/2);
        ctx.rotate(Math.PI/2);
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(-10, -3, 6, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#f44';
        ctx.font = '14px Arial';
        ctx.fillText("（熊子）", logicW/2, logicH/2 - 60);
        ctx.restore();
    }
    // 第4页 (900-1200): 结语
    else if(timer < 1200) {
        ctx.fillStyle = `rgba(200,200,200,${endingGetAlpha(timer,900,1200)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "为了不让更多的人\n丧生在恐怖的雅各布井，\n当地政府最终彻底封闭了雅各布井。", logicW/2, logicH/2, 32);
    }
    // 第5页 (1200+): 返回主菜单
    else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(180,180,180,${alpha})`;
        ctx.font = '20px Arial';
        ctx.fillText("感谢您的体验", logicW/2, logicH/2 - 20);
        if(t > 90) {
            ctx.fillStyle = `rgba(255,255,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial';
            ctx.fillText("点击屏幕返回主菜单", logicW/2, logicH - 50);
        }
    }
}

function wrapText(renderCtx, text, x, y, lineHeight) {
    let lines = text.split('\n');
    let startY = y - (lines.length-1)*lineHeight/2;
    for(let i=0; i<lines.length; i++) renderCtx.fillText(lines[i], x, startY + i*lineHeight);
}

// =============================================
// 绘制凶猛鱼调试按钮（右上角，仅调试模式下显示）
// =============================================
