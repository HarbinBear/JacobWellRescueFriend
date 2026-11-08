const fishModule = load('/src/logic/FishEnemy'), ropeModule = load('/src/logic/Rope');
const fishGeometry = load('/src/logic/FishGeometry'), interactionModule = load('/src/logic/Interaction');
const rockGeometry = load('/src/world/RockGeometry'), layoutModule = load('/src/logic/InteractionLayout');
const mazeModule = load('/src/logic/MazeLogic');
function reviewAnchor(origin, angle, walls) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let distance = 1200, wall = null;
    for (const candidate of walls) {
        const d = rockGeometry.rayHitsRock(candidate, origin.x, origin.y, dx, dy, distance);
        if (d < distance) { distance = d; wall = candidate; }
    }
    if (!wall || distance < 20) return null;
    return { point: { x: origin.x + dx * (distance - .3), y: origin.y + dy * (distance - .3) }, wall };
}
function arrangeFishReview(kind = 'rammer', captured = false) {
    mazeModule.startCaveRockTrial();
    const maze = state.mazeRescue, room = maze.caveRockRoom;
    maze.phase = 'play'; maze.startTime = Date.now(); maze.npcRescued = false; state.npc.active = false;
    interactionModule.resetInteractions(); ropeModule.cancelRopePlacement();
    CONFIG.infiniteO2 = true; player.o2 = player.o2Max; maze.maxDepthAllowed = 120;
    let best = null, score = Infinity;
    for (let y = 370; y < room.height - 90; y += 18) for (let x = 295; x < room.width - 150; x += 18) {
        const p = { x: room.x + x, y: room.y + y };
        if (rockGeometry.rockTrialCollision(maze, p.x, p.y, 47)) continue;
        const d = Math.hypot(x - room.player[0], y - room.player[1]);
        if (d < score) { best = p; score = d; }
    }
    if (!best) best = { x: room.x + room.player[0], y: room.y + room.player[1] };
    const ropes = [];
    for (const offset of [-24, -12, 0, 12, 24]) {
        const origin = { x: best.x, y: best.y + offset };
        const a = reviewAnchor(origin, Math.PI, maze.mazeWalls), b = reviewAnchor(origin, 0, maze.mazeWalls);
        if (a && b && rockGeometry.rockSegmentClear(maze.mazeWalls, a.point, b.point)) ropes.push({ start: a.point, end: b.point,
            startWall: a.wall, endWall: b.wall, path: [a.point, b.point], mode: 'tight', slackFactor: 0 });
    }
    for (const offset of [-22, 0, 22]) for (const angle of [Math.PI / 3, Math.PI * 2 / 3]) {
        const origin = { x: best.x + offset, y: best.y };
        const a = reviewAnchor(origin, angle + Math.PI, maze.mazeWalls), b = reviewAnchor(origin, angle, maze.mazeWalls);
        if (a && b && rockGeometry.rockSegmentClear(maze.mazeWalls, a.point, b.point)) ropes.push({ start: a.point, end: b.point,
            startWall: a.wall, endWall: b.wall, path: [a.point, b.point], mode: 'tight', slackFactor: 0 });
    }
    state.rope.ropes = ropes; ropeModule.resetRopeMotion();
    const fish = fishModule.createFishEnemy(best.x, best.y - 58, best.x, best.y, 150, kind);
    fish.angle = fish.targetAngle = Math.PI / 2; fish.vx = fish.vy = 0; state.fishEnemies = [fish];
    Object.assign(player, { x: best.x, y: best.y + 78, vx: 0, vy: 0, angle: -Math.PI / 2, targetAngle: -Math.PI / 2 });
    if (rockGeometry.rockTrialCollision(maze, player.x, player.y, CONFIG.maze.playerRadius)) {
        player.x = best.x - 25; player.y = best.y + 32;
    }
    state.flashlightOn = !captured;
    if (captured) {
        for (let i = 0; i < 60; i++) {
            ropeModule.updateRopeMotion();
            const from = { x: fish.x, y: fish.y }; fish.vx = 0; fish.vy = 3.7; fish.y += 3.7;
            ropeModule.resolveWovenRopeContact(fish, from, CONFIG.fishEnemy.size * .48, { x: 0, y: 3.7 }, () => true);
            if (ropeModule.getRopeContact(fish)?.kind === 'snag') break;
        }
        fish.vx = fish.vy = 0;
        nearFishReview('head');
    }
    load('/src/logic/BCDSystem').resetBCDSystem(); load('/src/logic/CameraLogic').snapCameraToPlayer();
    return { ropes: ropes.length, caught: ropeModule.getRopeContact(fish)?.kind === 'snag', center: best };
}
function nearFishReview(part = 'head') {
    const fish = state.fishEnemies[0]; if (!fish) return false;
    interactionModule.cancelInteractionInput();
    const p = part === 'knot' ? fishGeometry.fishKnotPoint(fish) : part === 'net' ? fishGeometry.fishNetHandlePoint(fish) : fishGeometry.fishHeadPoint(fish);
    const maze = state.mazeRescue;
    const outward=Math.atan2(p.y-fish.y,p.x-fish.x);
    const directions=part==='head'?[Math.PI,0,-Math.PI/2,Math.PI/2]:[outward,outward+.6,outward-.6,Math.PI,0,-Math.PI/2,Math.PI/2];
    for (const angle of directions) {
        const x = p.x + Math.cos(angle) * 24, y = p.y + Math.sin(angle) * 24;
        if (!rockGeometry.rockTrialCollision(maze, x, y, CONFIG.maze.playerRadius)) {
            Object.assign(player, { x, y, vx: 0, vy: 0, angle: angle + Math.PI, targetAngle: angle + Math.PI });
            input.targetAngle = player.angle; load('/src/logic/BCDSystem').resetBCDSystem(); load('/src/logic/CameraLogic').snapCameraToPlayer(); return true;
        }
    }
    return false;
}
window.DeepTapeGame.interactions = {
    setup: arrangeFishReview, near: nearFishReview, fishGeometry, rope: ropeModule,
    actions: load('/src/logic/ActionWheel'), targets: load('/src/logic/ActionTargets'),
    work: interactionModule, wheel: load('/src/logic/RopeWheel'), layout: layoutModule,
    motion: load('/src/render/InteractionPose'), statusRect: load('/src/render/RenderInteraction').getInteractionStatusRect,
    updateTethers: load('/src/logic/RopeTether').updateRopeTethers,
};
