export type RockPoint = { x: number; y: number };
export type RockWall = { x: number; y: number; r: number; row: number; col: number; rockPolygon?: RockPoint[] };

export interface RockSurface {
    closest(x: number, y: number): RockPoint & { dist: number };
    circle(x: number, y: number, radius: number): boolean;
    ray(x: number, y: number, dx: number, dy: number, range: number): number;
}
// Semantic wall handles stay in their seeded order. Runtime surface delegates
// live outside state/JSON, so neither old rope indices nor save sizes change.
const surfaces = new WeakMap<object, RockSurface>();
export function registerRockSurface(wall: RockWall, surface: RockSurface) { surfaces.set(wall, surface); }
export function hasRockSurface(wall: RockWall) { return surfaces.has(wall); }
export function unregisterRockSurface(wall: RockWall) { surfaces.delete(wall); }

export function pointInRock(points: RockPoint[], x: number, y: number): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}
export function closestRockPoint(wall: RockWall, x: number, y: number): RockPoint & { dist: number } {
    const surface = surfaces.get(wall);
    if (surface) return surface.closest(x, y);
    if (!wall.rockPolygon) {
        const dx = x - wall.x, dy = y - wall.y, distance = Math.hypot(dx, dy) || 1;
        return { x: wall.x + dx / distance * wall.r, y: wall.y + dy / distance * wall.r, dist: distance - wall.r };
    }
    const p = wall.rockPolygon;
    let best = { x: p[0].x, y: p[0].y, dist: Infinity };
    for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        const px = a.x + t * dx, py = a.y + t * dy, dist = Math.hypot(px - x, py - y);
        if (dist < best.dist) best = { x: px, y: py, dist };
    }
    if (pointInRock(p, x, y)) best.dist *= -1;
    return best;
}
export function circleHitsRock(wall: RockWall, x: number, y: number, radius: number): boolean {
    const surface = surfaces.get(wall);
    if (surface) return surface.circle(x, y, radius);
    if (!wall.rockPolygon) return Math.hypot(x - wall.x, y - wall.y) < wall.r + radius;
    if (Math.abs(x - wall.x) > wall.r + radius || Math.abs(y - wall.y) > wall.r + radius) return false;
    if (pointInRock(wall.rockPolygon, x, y)) return true;
    return radius > 0 && closestRockPoint(wall, x, y).dist < radius;
}
export function rayHitsRock(wall: RockWall, x: number, y: number, dx: number, dy: number, range: number): number {
    const surface = surfaces.get(wall);
    if (surface) return surface.ray(x, y, dx, dy, range);
    const p = wall.rockPolygon;
    if (!p) return range;
    let distance = range;
    for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], ex = b.x - a.x, ey = b.y - a.y;
        const det = dx * ey - dy * ex;
        if (Math.abs(det) < 1e-9) continue;
        const ax = a.x - x, ay = a.y - y;
        const t = (ax * ey - ay * ex) / det, u = (ax * dy - ay * dx) / det;
        if (t > .001 && t < distance && u >= -1e-8 && u <= 1 + 1e-8) distance = t;
    }
    return distance;
}
export function rockSegmentClear(walls: RockWall[], a: RockPoint, b: RockPoint, padding = 0): boolean {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < .001) return true;
    const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
    for (const wall of walls) {
        if (!wall.rockPolygon && !surfaces.has(wall)) continue;
        if (rayHitsRock(wall, a.x, a.y, dx, dy, length) < length - .01) return false;
        // Padding is intentionally eased only at the two physical anchor endpoints.
        for (let d = .5; d < length; d += 3) {
            const radius = Math.min(padding, d * .45, (length - d) * .45);
            if (circleHitsRock(wall, a.x + dx * d, a.y + dy * d, radius)) return false;
        }
    }
    return true;
}
export function rockTrialCollision(maze: any, x: number, y: number, radius: number): boolean {
    if (x < radius || x > maze.mazeCols * maze.mazeTileSize - radius || y < radius || y > maze.mazeRows * maze.mazeTileSize - radius) return true;
    for (const wall of maze.mazeWalls) if (circleHitsRock(wall, x, y, radius)) return true;
    return false;
}
