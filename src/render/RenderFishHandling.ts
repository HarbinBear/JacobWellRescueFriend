import { CONFIG } from '../core/config';
import { player, state } from '../core/state';
import { fishShape, fishKnotPoint } from '../logic/FishGeometry';
import { isFishStunned } from '../logic/FishHandling';
import type { FishEnemy } from '../logic/FishEnemy';

function star(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4, r = i % 2 ? size * .28 : size;
        if (i === 0) c.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        else c.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }
    c.closePath(); c.fill();
}

export function drawFishHandlingWorld(c: CanvasRenderingContext2D, fish: FishEnemy) {
    const shape = fishShape(fish), stunned = isFishStunned(fish);
    if (!stunned && !fish.bound) return;
    c.save(); c.translate(fish.x, fish.y); c.rotate(fish.angle);
    if (fish.bound) {
        c.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
            const x = -CONFIG.fishEnemy.size * (.12 + i * .30);
            c.strokeStyle = '#293b39'; c.lineWidth = 3.5;
            c.beginPath(); c.ellipse(x, 0, 3.3, shape.radius + 1, -.12, 0, Math.PI * 2); c.stroke();
            c.strokeStyle = '#e6d4a6'; c.lineWidth = 1.8; c.stroke();
        }
        c.strokeStyle = '#e6d4a6'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(-CONFIG.fishEnemy.size * .44, shape.radius);
        c.lineTo(-CONFIG.fishEnemy.size * .15, shape.radius + 5); c.stroke();
    }
    if (stunned) {
        c.strokeStyle = '#d8ece2'; c.lineWidth = 1.8; c.lineCap = 'round';
        for (const side of [-1, 1]) {
            c.beginPath(); c.moveTo(shape.head - 5, side * 5 - 2);
            c.lineTo(shape.head - 2, side * 5); c.lineTo(shape.head - 5, side * 5 + 2); c.stroke();
        }
    }
    c.restore();
    if (fish.bound) {
        const p = fishKnotPoint(fish);
        c.save(); c.translate(p.x, p.y); c.rotate(fish.angle);
        c.strokeStyle = '#f0dbab'; c.lineWidth = 1.7;
        c.beginPath(); c.ellipse(-2, 0, 3.5, 2, -.5, 0, Math.PI * 2);
        c.ellipse(2, 0, 3.5, 2, .5, 0, Math.PI * 2); c.stroke();
        c.restore();
    }
    if (stunned) {
        const angle = Date.now() / 330;
        c.save(); c.translate(fish.x, fish.y - shape.radius - 10);
        c.strokeStyle = 'rgba(227,220,165,.45)'; c.lineWidth = .8;
        c.beginPath(); c.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#f8dfaa';
        for (let i = 0; i < 3; i++) star(c, Math.cos(angle + i * Math.PI * 2 / 3) * 14,
            Math.sin(angle + i * Math.PI * 2 / 3) * 5, 2.6);
        c.restore();
    }
    if (state.interaction.task || Math.hypot(player.x - fish.x, player.y - fish.y) > 140) return;
    const zoom = Math.max(.5, state.camera.zoom);
    c.save(); c.translate(fish.x, fish.y - shape.radius - 29); c.scale(1 / zoom, 1 / zoom);
    c.font = '10px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#e7dfbe';
    c.fillText(stunned ? '眩晕 ' + (fish.stunFrames / 60).toFixed(1) + 's' : '醒着 · 已绑', 0, 0);
    if (stunned) {
        c.strokeStyle = 'rgba(180,192,188,.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-17, 8); c.lineTo(17, 8); c.stroke();
        c.strokeStyle = '#edda9e'; c.beginPath(); c.moveTo(-17, 8);
        c.lineTo(-17 + 34 * fish.stunFrames / CONFIG.fishInteraction.stunFrames, 8); c.stroke();
    }
    c.restore();
}
