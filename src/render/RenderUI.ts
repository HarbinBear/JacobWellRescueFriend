import { CONFIG } from '../core/config';
import { state, player, target, touches } from '../core/state';
import { ctx, canvas } from './Canvas';
import { drawDiver, drawLungs, drawDiverSilhouette } from './RenderDiver';

export function drawUI() {
    ctx.fillStyle = 'rgba(0, 10, 15, 0.8)';
    ctx.fillRect(10, 10, 160, 200); 
    ctx.strokeStyle = '#445';
    ctx.strokeRect(10, 10, 160, 200);
    ctx.fillStyle = '#0ff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('潜水电脑', 20, 30);
    ctx.font = '12px Arial';
    ctx.fillText('深度: ' + Math.floor(player.y / CONFIG.tileSize) + 'm', 20, 50);

    if(!state.story.flags.tankDamaged) {
        ctx.fillStyle = '#8cf'; ctx.font = '12px Arial'; ctx.fillText('O2', 20, 70);
        ctx.fillStyle = '#222'; ctx.fillRect(50, 60, 100, 10);
        ctx.fillStyle = '#0f0'; ctx.fillRect(50, 60, Math.max(0, player.o2), 10);
    } else {
        ctx.fillStyle = '#f00'; ctx.font = 'bold 12px Arial'; ctx.fillText('氧气瓶已损毁', 20, 70);
        drawLungs(ctx, canvas.width/2, canvas.height/2 + 100, player.o2);
    }

    // Mini map & debug HUD (debug mode only)
    if(CONFIG.debug) {
        // Mini map
        if(state.explored && state.explored.length > 0) {
            let mapSize=140, mapX=20, mapY=60;
            ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(mapX,mapY,mapSize,mapSize);
            ctx.strokeStyle='#445'; ctx.strokeRect(mapX,mapY,mapSize,mapSize);
            let scaleX=mapSize/CONFIG.cols, scaleY=mapSize/CONFIG.rows;
            for(let r=0;r<CONFIG.rows;r++) {
                for(let c=0;c<CONFIG.cols;c++) {
                    if(state.explored[r]&&state.explored[r][c]) {
                        ctx.fillStyle = state.map[r][c] ? '#555' : 'rgba(50,100,150,0.5)';
                        ctx.fillRect(mapX+c*scaleX, mapY+r*scaleY, scaleX, scaleY);
                    }
                }
            }
            ctx.fillStyle='#0f0';
            ctx.beginPath(); ctx.arc(mapX+(player.x/CONFIG.tileSize)*scaleX, mapY+(player.y/CONFIG.tileSize)*scaleY, 2, 0, Math.PI*2); ctx.fill();
            let tr=Math.floor(target.y/CONFIG.tileSize), tc=Math.floor(target.x/CONFIG.tileSize);
            if(target.found||(state.explored[tr]&&state.explored[tr][tc])) {
                ctx.fillStyle='#f0f';
                ctx.beginPath(); ctx.arc(mapX+(target.x/CONFIG.tileSize)*scaleX, mapY+(target.y/CONFIG.tileSize)*scaleY, 2, 0, Math.PI*2); ctx.fill();
            }
        }

        // Real-time position HUD
        let col = Math.floor(player.x / CONFIG.tileSize);
        let row = Math.floor(player.y / CONFIG.tileSize);
        let px = Math.floor(player.x);
        let py = Math.floor(player.y);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(canvas.width - 210, 10, 200, 52);
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvas.width - 210, 10, 200, 52);
        ctx.fillStyle = '#0ff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`tile: col=${col}, row=${row}`, canvas.width - 200, 30);
        ctx.fillText(`pixel: x=${px}, y=${py}`, canvas.width - 200, 50);
        ctx.restore();
    }

    // Story text display
    if(state.alertMsg) {
        ctx.fillStyle = state.alertColor;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        let maxWidth = canvas.width * 0.8;
        let words = state.alertMsg.split('');
        let line = '', lines: string[] = [];
        for(let n=0; n<words.length; n++) {
            let testLine = line + words[n];
            if (ctx.measureText(testLine).width > maxWidth && n > 0) {
                lines.push(line); line = words[n];
            } else { line = testLine; }
        }
        lines.push(line);
        let startY = canvas.height/3;
        for(let i=0; i<lines.length; i++) ctx.fillText(lines[i], canvas.width/2, startY + i*30);
    }

    if(state.screen === 'ending') {
        drawEnding();
    } else if(state.screen === 'lose') {
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = '#f00'; ctx.font = '30px Arial'; ctx.textAlign = 'center';
        ctx.fillText('任务失败', canvas.width/2, canvas.height/2 - 20);
        ctx.fillStyle = '#fff'; ctx.font = '20px Arial';
        ctx.fillText(state.alertMsg, canvas.width/2, canvas.height/2 + 20);
        ctx.fillText('点击屏幕返回主菜单', canvas.width/2, canvas.height/2 + 60);
    } else if(state.screen === 'menu') {
        drawMenu();
    }
}

export function drawMenu() {
    let time = Date.now() / 1000;
    let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#001133'); grad.addColorStop(1, '#000011');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for(let i=0; i<3; i++) {
        let x = canvas.width/2 + Math.sin(time*0.5+i*2)*100;
        let angle = Math.PI/2 + Math.sin(time*0.3+i)*0.1;
        let rayGrad = ctx.createLinearGradient(x, 0, x, canvas.height);
        rayGrad.addColorStop(0, 'rgba(0,255,255,0.1)'); rayGrad.addColorStop(1, 'rgba(0,255,255,0)');
        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(x-50, 0); ctx.lineTo(x+50, 0);
        ctx.lineTo(x+Math.cos(angle)*200, canvas.height); ctx.lineTo(x-Math.cos(angle)*200, canvas.height);
        ctx.fill();
    }
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 36px Arial'; ctx.fillText("雅各布井", canvas.width/2, canvas.height/3);
    ctx.font = 'bold 28px Arial'; ctx.fillText("救援行动", canvas.width/2, canvas.height/3 + 40);
    let btnY = canvas.height * 0.6;
    let btnAlpha = 0.8 + Math.sin(time*3)*0.2;
    ctx.fillStyle = `rgba(0,255,255,${btnAlpha})`; ctx.font = 'bold 24px Arial'; ctx.fillText("开始游戏", canvas.width/2, btnY);
    ctx.strokeStyle = `rgba(0,255,255,${btnAlpha*0.5})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(canvas.width/2-60, btnY+10); ctx.lineTo(canvas.width/2+60, btnY+10); ctx.stroke();
    ctx.fillStyle = '#666'; ctx.font = '12px Arial'; ctx.fillText("v1.2.0 By 熊子", canvas.width/2, canvas.height-30);
}

function drawEnding() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let timer = state.endingTimer || 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    function getAlpha(t: number, start: number, end: number): number {
        let local = t - start;
        let dur = end - start;
        if(local < 60) return local/60;
        if(local > dur-60) return (dur-local)/60;
        return 1;
    }

    if(timer < 240) {
        ctx.fillStyle = `rgba(255,255,255,${getAlpha(timer,0,240)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "小潘把一个密闭的洞穴气室\n误当成了出口，\n最终在搅动的泥沙中彻底迷失方向，\n丧生在了黑暗之中。", canvas.width/2, canvas.height/2, 30);
    } else if(timer < 480) {
        ctx.fillStyle = `rgba(255,255,255,${getAlpha(timer,240,480)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "为了不让更多的人\n丧生在恐怖的雅各布井，\n当地政府最终彻底封闭了雅各布井。", canvas.width/2, canvas.height/2, 30);
    } else if(timer < 720) {
        let alpha = getAlpha(timer, 480, 720);
        ctx.save(); ctx.globalAlpha = alpha;
        drawDiverSilhouette(ctx, canvas.width/2-60, canvas.height/2, '#555');
        drawDiverSilhouette(ctx, canvas.width/2+60, canvas.height/2+20, '#555', true);
        ctx.fillStyle = '#f00'; ctx.font = '16px Arial';
        ctx.fillText("(小熊)", canvas.width/2-60, canvas.height/2-50);
        ctx.fillText("(小潘)", canvas.width/2+60, canvas.height/2-40);
        ctx.fillStyle = '#333'; ctx.fillRect(canvas.width/2+80, canvas.height/2+30, 20, 10);
        ctx.restore();
    } else if(timer < 960) {
        ctx.fillStyle = `rgba(255,255,255,${getAlpha(timer,720,960)})`;
        ctx.font = '24px Arial'; ctx.fillText("感谢您的体验", canvas.width/2, canvas.height/2);
    } else if(timer < 1200) {
        ctx.fillStyle = `rgba(255,255,255,${getAlpha(timer,960,1200)})`;
        ctx.font = '20px Arial';
        wrapText(ctx, "当前版本持续优化中\n前往未知的深渊\n与带熊子潘子回家的故事\n未来有时间会完善。", canvas.width/2, canvas.height/2, 30);
    } else {
        let t = timer - 1200;
        let alpha = Math.min(1, t/60);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = '20px Arial'; ctx.fillText("制作人员", canvas.width/2, canvas.height/2-40);
        ctx.font = '16px Arial'; ctx.fillText("小熊和他的小伙伴们", canvas.width/2, canvas.height/2);
        if(t > 120) {
            ctx.fillStyle = `rgba(255,255,255,${Math.abs(Math.sin(t/30))})`;
            ctx.font = '14px Arial'; ctx.fillText("点击屏幕重新开始", canvas.width/2, canvas.height-50);
        }
    }
}

function wrapText(renderCtx: CanvasRenderingContext2D, text: string, x: number, y: number, lineHeight: number) {
    let lines = text.split('\n');
    let startY = y - (lines.length-1)*lineHeight/2;
    for(let i=0; i<lines.length; i++) renderCtx.fillText(lines[i], x, startY + i*lineHeight);
}

export function drawControls() {
    if(state.screen !== 'play') return;
    if(touches.joystickId !== null) {
        ctx.beginPath(); ctx.arc(touches.start.x, touches.start.y, 40, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(touches.curr.x, touches.curr.y, 20, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(touches.start.x, touches.start.y); ctx.lineTo(touches.curr.x, touches.curr.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'center'; ctx.font = '14px Arial';
        ctx.fillText('按住屏幕任意位置移动', canvas.width/2, canvas.height-50);
    }
}
