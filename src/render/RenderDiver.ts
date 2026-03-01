// 统一的潜水员绘制函数
export function drawDiver(renderCtx: CanvasRenderingContext2D, x: number, y: number, angle: number, colors: any = null, animTime: number = 0, hasTank: boolean = true) {
    renderCtx.save();
    
    let swayX = Math.sin(Date.now() / 1000) * 2;
    let swayY = Math.cos(Date.now() / 1300) * 2;
    renderCtx.translate(x + swayX, y + swayY);
    renderCtx.rotate(angle);

    const defaultColors = { suit: '#333', body: '#dd0', tank: '#bef', mask: '#fa0' };
    const c = colors || defaultColors;

    let time = animTime || Date.now() / 150;
    
    // 左脚踼
    renderCtx.save();
    renderCtx.translate(-15, -4);
    let leftScale = 0.7 + Math.sin(time) * 0.3;
    renderCtx.scale(leftScale, 1);
    renderCtx.fillStyle = c.suit;
    renderCtx.beginPath();
    renderCtx.moveTo(0, -2); renderCtx.lineTo(-12, -4); renderCtx.lineTo(-12, 4); renderCtx.lineTo(0, 2);
    renderCtx.fill();
    renderCtx.restore();

    // 右脚踼
    renderCtx.save();
    renderCtx.translate(-15, 4);
    let rightScale = 0.7 + Math.sin(time + Math.PI) * 0.3;
    renderCtx.scale(rightScale, 1);
    renderCtx.fillStyle = c.suit;
    renderCtx.beginPath();
    renderCtx.moveTo(0, -2); renderCtx.lineTo(-12, -4); renderCtx.lineTo(-12, 4); renderCtx.lineTo(0, 2);
    renderCtx.fill();
    renderCtx.restore();

    // 身体
    renderCtx.fillStyle = c.body;
    renderCtx.fillRect(-8, -5, 16, 10);

    // 气瓶
    if(hasTank) {
        renderCtx.fillStyle = '#111'; 
        renderCtx.fillRect(-3, -7, 6, 14);
        renderCtx.fillStyle = '#FFD700'; 
        renderCtx.strokeStyle = '#000';
        renderCtx.lineWidth = 1;
        renderCtx.beginPath(); 
        if ((renderCtx as any).roundRect) {
            (renderCtx as any).roundRect(3, -7, 9, 14, [3]);
        } else {
            renderCtx.rect(3, -7, 9, 14);
        }
        renderCtx.fill();
        renderCtx.stroke();
        renderCtx.fillStyle = '#888';
        renderCtx.fillRect(5, -9, 4, 2);
    }

    // 头部
    renderCtx.fillStyle = '#dcb';
    renderCtx.beginPath(); renderCtx.arc(0, 0, 7, 0, Math.PI*2); renderCtx.fill();
    renderCtx.fillStyle = '#222';
    renderCtx.beginPath(); 
    renderCtx.arc(0, 0, 7.5, Math.PI/2, -Math.PI/2, true);
    renderCtx.fill();

    // 面镜
    renderCtx.fillStyle = c.mask; 
    renderCtx.strokeStyle = '#111';
    renderCtx.lineWidth = 1;
    renderCtx.beginPath(); 
    renderCtx.ellipse(4, 0, 3, 5, 0, 0, Math.PI*2);
    renderCtx.fill();
    renderCtx.stroke();
    
    // 面镜反光
    renderCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    renderCtx.beginPath();
    renderCtx.ellipse(5, -2, 1, 2, 0.5, 0, Math.PI*2);
    renderCtx.fill();

    renderCtx.restore();
}

export function drawLungs(renderCtx: CanvasRenderingContext2D, x: number, y: number, o2: number) {
    renderCtx.save();
    renderCtx.translate(x, y);
    
    let breath = Math.sin(Date.now() / 800) * 0.05;
    renderCtx.scale(1 + breath, 1 + breath);
    
    const w = 40, h = 60, gap = 6;
    
    // 气管
    renderCtx.fillStyle = '#888';
    renderCtx.beginPath();
    renderCtx.moveTo(-3, -h/2 - 10); renderCtx.lineTo(3, -h/2 - 10);
    renderCtx.lineTo(3, -h/2 - 20); renderCtx.lineTo(-3, -h/2 - 20);
    renderCtx.fill();
    
    drawLungLobe(renderCtx, -w/2 - gap/2, 0, w, h, o2, true);
    drawLungLobe(renderCtx, w/2 + gap/2, 0, w, h, o2, false);
    
    renderCtx.fillStyle = '#fff';
    renderCtx.font = 'bold 16px Arial';
    renderCtx.textAlign = 'center';
    renderCtx.fillText(Math.floor(o2) + '%', 0, 5);
    
    if(o2 < 30) {
        let alpha = 0.5 + Math.sin(Date.now()/100) * 0.5;
        renderCtx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
        renderCtx.font = 'bold 14px Arial';
        renderCtx.fillText("WARNING", 0, h/2 + 20);
    }
    
    renderCtx.restore();
}

function drawLungLobe(renderCtx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o2: number, isLeft: boolean) {
    renderCtx.save();
    renderCtx.translate(x, y);
    
    renderCtx.beginPath();
    if (isLeft) {
        renderCtx.moveTo(w/2, -h/2); 
        renderCtx.bezierCurveTo(w/2, -h/2, -w/2, -h/2 + 15, -w/2, 0); 
        renderCtx.bezierCurveTo(-w/2, h/2 - 5, 0, h/2, w/2, h/2); 
        renderCtx.lineTo(w/2, -h/2); 
    } else {
        renderCtx.moveTo(-w/2, -h/2); 
        renderCtx.bezierCurveTo(-w/2, -h/2, w/2, -h/2 + 15, w/2, 0); 
        renderCtx.bezierCurveTo(w/2, h/2 - 5, 0, h/2, -w/2, h/2); 
        renderCtx.lineTo(-w/2, -h/2); 
    }
    renderCtx.closePath();
    
    renderCtx.fillStyle = 'rgba(20, 0, 0, 0.9)';
    renderCtx.fill();
    renderCtx.strokeStyle = '#311';
    renderCtx.lineWidth = 2;
    renderCtx.stroke();
    renderCtx.clip();
    
    let fillHeight = h * (o2 / 100);
    let fillY = h/2 - fillHeight;
    
    let lungColor = 'rgba(237, 106, 106, 1)';
    if (o2 < 30) {
        let flash = Math.floor(Date.now() / 200) % 2 === 0;
        lungColor = flash ? 'rgba(237, 106, 106, 1)' : 'rgba(98, 54, 54, 1)';
    }
    
    renderCtx.fillStyle = lungColor;
    renderCtx.fillRect(-w, fillY, w*2, fillHeight);
    
    renderCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    renderCtx.lineWidth = 1;
    renderCtx.beginPath();
    if(isLeft) {
        renderCtx.moveTo(w/4, -h/4); renderCtx.quadraticCurveTo(0, 0, -w/4, h/4);
        renderCtx.moveTo(w/4, -h/4); renderCtx.quadraticCurveTo(w/4, 0, 0, h/3);
    } else {
        renderCtx.moveTo(-w/4, -h/4); renderCtx.quadraticCurveTo(0, 0, w/4, h/4);
        renderCtx.moveTo(-w/4, -h/4); renderCtx.quadraticCurveTo(-w/4, 0, 0, h/3);
    }
    renderCtx.stroke();
    
    renderCtx.restore();
}

export function drawDiverSilhouette(renderCtx: CanvasRenderingContext2D, x: number, y: number, color: string, isDead: boolean = false) {
    renderCtx.save(); renderCtx.translate(x, y);
    if(isDead) renderCtx.rotate(Math.PI/2);
    renderCtx.fillStyle = color;
    renderCtx.beginPath(); renderCtx.arc(0, -20, 10, 0, Math.PI*2); renderCtx.fill();
    renderCtx.fillRect(-10, -10, 20, 30); renderCtx.fillRect(-12, -10, 4, 20); renderCtx.fillRect(8, -10, 4, 20);
    renderCtx.fillRect(-8, 20, 6, 20); renderCtx.fillRect(2, 20, 6, 20);
    renderCtx.restore();
}
