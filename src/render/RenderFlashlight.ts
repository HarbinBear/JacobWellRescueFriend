/** 沿用原手电筒的黄色光束与圆形轮廓，不增加外层容器。 */
export function drawFlashlightIcon(c: CanvasRenderingContext2D, x: number, y: number, size: number, on: boolean) {
    c.save(); c.translate(x, y); c.scale(size / 56, size / 56);
    c.beginPath(); c.arc(0, 0, 28, 0, Math.PI * 2);
    c.fillStyle = on ? 'rgba(255,240,100,.2)' : 'rgba(20,20,30,.7)'; c.fill();
    c.strokeStyle = on ? 'rgba(255,240,100,.8)' : 'rgba(120,125,130,.55)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = on ? 'rgba(255,240,100,.95)' : '#929793';
    c.fillRect(-5, -10, 10, 14);
    c.beginPath(); c.moveTo(-8, -10); c.lineTo(8, -10); c.lineTo(6, -16); c.lineTo(-6, -16); c.closePath(); c.fill();
    if (on) {
        c.globalAlpha = .35; c.fillStyle = '#ffffb4';
        c.beginPath(); c.moveTo(-8, -16); c.lineTo(8, -16); c.lineTo(13, -26); c.lineTo(-13, -26); c.closePath(); c.fill();
    }
    c.restore();
}
