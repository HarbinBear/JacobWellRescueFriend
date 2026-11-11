export interface VolumeChunkRequest {
    id: number; ci: number; cj: number; visible: boolean; shadow: boolean; priority: number; distance: number;
}

// 只决定这一帧需要哪些块，生成和 GPU 资源仍由 RenderKarstVolume 管理。
export function planVolumeChunks(
    terrain: { x: number; y: number; step: number; cols: number; rows: number },
    chunkCells: number,
    view: { x: number; y: number; halfW: number; halfH: number; aheadX: number; aheadY: number },
    light: { x: number; y: number; radius: number },
    capacity: number,
) {
    const size = chunkCells * terrain.step, requests = new Map<number, VolumeChunkRequest>();
    const cols = Math.ceil((terrain.cols - 1) / chunkCells), rows = Math.ceil((terrain.rows - 1) / chunkCells);
    function addArea(left: number, top: number, right: number, bottom: number, priority: number) {
        const ci0 = Math.max(0, Math.floor((left - terrain.x) / size));
        const ci1 = Math.min(cols - 1, Math.floor((right - terrain.x) / size));
        const cj0 = Math.max(0, Math.floor((top - terrain.y) / size));
        const cj1 = Math.min(rows - 1, Math.floor((bottom - terrain.y) / size));
        for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
            const x = terrain.x + ci * size, y = terrain.y + cj * size;
            if (priority === 1) {
                const dx = Math.max(x - light.x, 0, light.x - x - size);
                const dy = Math.max(y - light.y, 0, light.y - y - size);
                if (dx * dx + dy * dy > light.radius * light.radius) continue;
            }
            const id = cj * 4096 + ci, previous = requests.get(id);
            if (previous) {
                previous.shadow = previous.shadow || priority === 1;
                continue;
            }
            const focusX = priority === 2 ? view.x + view.aheadX : view.x;
            const focusY = priority === 2 ? view.y + view.aheadY : view.y;
            requests.set(id, { id, ci, cj, visible: priority === 0, shadow: priority === 1, priority,
                distance: Math.hypot(x + size / 2 - focusX, y + size / 2 - focusY) });
        }
    }
    addArea(view.x - view.halfW, view.y - view.halfH, view.x + view.halfW, view.y + view.halfH, 0);
    if (light.radius > 0) addArea(light.x - light.radius, light.y - light.radius, light.x + light.radius, light.y + light.radius, 1);
    const required = requests.size, pad = size * .65;
    addArea(view.x - view.halfW + Math.min(0, view.aheadX) - pad,
        view.y - view.halfH + Math.min(0, view.aheadY) - pad,
        view.x + view.halfW + Math.max(0, view.aheadX) + pad,
        view.y + view.halfH + Math.max(0, view.aheadY) + pad, 2);
    // 当前画面和阴影不能被预热挤掉。极远镜头允许必要块临时超过常驻预算。
    return Array.from(requests.values()).sort((a, b) => a.priority - b.priority || a.distance - b.distance)
        .slice(0, Math.max(capacity, required));
}
