from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'images' / 'karst'
SIZE, BORDER = 512, 8
N = SIZE - BORDER * 2
rng = np.random.default_rng(26111009)
y, x = np.mgrid[0:N, 0:N].astype(np.float64)


def noise(period, seed):
    local = np.random.default_rng(seed)
    count = max(3, round(N / period))
    grid = local.random((count, count)) * 2 - 1
    grid = np.pad(grid, ((1, 1), (1, 1)), mode='wrap')
    image = Image.fromarray(grid.astype(np.float32))
    expanded = np.asarray(image.resize(((count + 2) * N // count, (count + 2) * N // count), Image.Resampling.BICUBIC))
    border = N // count
    return expanded[border:border + N, border:border + N].astype(np.float64)


def smooth(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def pores(seed, density, depth):
    local = np.random.default_rng(seed)
    height = np.zeros((N, N), np.float64)
    for _ in range(density):
        px, py = local.uniform(0, N, 2)
        rx, ry = local.uniform(1.4, 13), local.uniform(1.2, 9)
        dx = np.minimum(np.abs(x - px), N - np.abs(x - px)) / rx
        dy = np.minimum(np.abs(y - py), N - np.abs(y - py)) / ry
        d = np.sqrt(dx * dx + dy * dy)
        perturb = .13 * np.sin(dx * 3 + py) + .11 * np.cos(dy * 4 + px)
        hollow = 1 - smooth(.40, 1.05, d + perturb)
        lip = np.exp(-((d - .94) / .15) ** 2) * .07
        height += (-hollow + lip) * local.uniform(.035, depth)
    return height


def joints(seed):
    local = np.random.default_rng(seed)
    out = np.zeros((N, N), np.float64)
    for _ in range(16):
        angle = local.uniform(-.50, .45) if local.random() < .65 else local.uniform(1.0, 1.65)
        px, py = local.uniform(0, N, 2)
        dx, dy = (x - px + N / 2) % N - N / 2, (y - py + N / 2) % N - N / 2
        along = dx * np.cos(angle) + dy * np.sin(angle)
        across = -dx * np.sin(angle) + dy * np.cos(angle)
        bend = np.sin(along / local.uniform(27, 65) + px) * local.uniform(1, 4)
        width = local.uniform(.6, 1.8)
        length = local.uniform(32, 185)
        taper = 1 - smooth(length * .65, length, np.abs(along))
        out -= np.exp(-((across + bend) / width) ** 2) * taper * local.uniform(.06, .18)
    return out


def make(kind):
    seed = 151 + kind * 997
    broad = noise(95, seed)
    mid = noise(23, seed + 1)
    grit = noise(4, seed + 2)
    dust = noise(1.7, seed + 3)
    clay = smooth(-.1, .62, noise(65, seed + 4))
    iron = smooth(.15, .77, noise(125, seed + 5) + mid * .25)
    if kind == 0:
        eroded = smooth(-.55, .68, mid + broad * .45)
        height = .48 + broad * .12 + eroded * .18 + grit * .025 + dust * .010
        height += pores(seed + 10, 155, .15) + joints(seed + 11) * .47
        ivory, ochre, rust = (177, 174, 153), (145, 130, 101), (118, 83, 56)
    elif kind == 1:
        warp = noise(85, seed + 6) * 1.3 + noise(28, seed + 7) * .32
        phase = x * 2 * np.pi / 31 + warp + np.sin(y * 2 * np.pi / N) * .44
        flute = np.power(np.clip(.5 + .5 * np.cos(phase), 0, 1), 1.5)
        terrace = np.sin(y * 2 * np.pi * 28 / N + broad * 2.4 + flute * .6)
        fine_flow = np.sin(phase * 3 + noise(13, seed + 8))
        height = .46 + flute * .23 + terrace * .032 + fine_flow * .023 + broad * .052 + grit * .011
        height += pores(seed + 10, 55, .075)
        clay *= .5
        ivory, ochre, rust = (204, 195, 164), (179, 151, 101), (128, 85, 46)
    elif kind == 2:
        warp = broad * 15 + mid * 3
        beds = .5 + .5 * np.sin((y + warp) * 2 * np.pi * 10 / N)
        bedding = np.power(beds, .55)
        seam = np.exp(-((beds - .08) / .06) ** 2)
        height = .47 + broad * .15 + bedding * .105 + mid * .042 + grit * .014 - seam * .09
        height += joints(seed + 11) + pores(seed + 10, 80, .07)
        ivory, ochre, rust = (171, 169, 148), (149, 134, 105), (122, 86, 57)
    else:
        lobes = smooth(-.6, .65, noise(17, seed + 6) + broad * .35)
        height = .40 + broad * .13 + lobes * .26 + grit * .031 + dust * .012
        height += pores(seed + 10, 240, .18) + joints(seed + 11) * .27
        ivory, ochre, rust = (184, 177, 152), (166, 149, 109), (131, 98, 63)
    height = np.clip(height, .04, .94)
    color = np.broadcast_to(np.array(ivory, float), (N, N, 3)).copy()
    color = color * (1 - clay[..., None] * .7) + np.array(ochre) * clay[..., None] * .7
    color = color * (1 - iron[..., None] * .63) + np.array(rust) * iron[..., None] * .63
    # Mineral density, not fixed illumination. Cavities darken only through AO.
    color *= (1 + broad[..., None] * .025 + dust[..., None] * .017)
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * (12 / (320 / N)) * .5
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * (12 / (320 / N)) * .5
    length = np.sqrt(gx * gx + gy * gy + 1)
    normal_x, normal_y = -gx / length, -gy / length
    blocked = np.zeros((N, N), float)
    for distance in (3, 7, 15):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)):
            other = np.roll(np.roll(height, dx * distance, 1), dy * distance, 0)
            blocked += np.clip((other - height - .017) / (.11 + distance * .013), 0, 1) / 24
    ao = np.clip(1 - blocked * .92, .31, 1)
    relief = np.dstack((normal_x * .5 + .5, normal_y * .5 + .5, height, ao))
    color = np.round(np.clip(color, 0, 255)).astype(np.uint8)
    relief = np.round(np.clip(relief * 255, 0, 255))
    # Controlled 6-bit normal/AO; keep all 8 height bits and full texture size.
    steps = np.array([4, 4, 1, 4], dtype=float)
    relief = np.clip(np.round(relief / steps) * steps, 0, 255).astype(np.uint8)
    return np.pad(color, ((BORDER, BORDER), (BORDER, BORDER), (0, 0)), mode='wrap'), np.pad(relief, ((BORDER, BORDER), (BORDER, BORDER), (0, 0)), mode='wrap'), {
        'kind': ('溶蚀石灰岩', '流石褶皱', '层状断面', '多孔钙华')[kind],
        'heightRange': [float(height.min()), float(height.max())], 'aoRange': [float(ao.min()), float(ao.max())],
        'normalDerivedFromHeight': True, 'fixedDirectionalLighting': False,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    albedo = Image.new('RGB', (SIZE * 2, SIZE * 2))
    relief = Image.new('RGBA', (SIZE * 2, SIZE * 2))
    report = []
    for kind in range(4):
        a, r, info = make(kind)
        offset = ((kind % 2) * SIZE, (kind // 2) * SIZE)
        albedo.paste(Image.fromarray(a), offset)
        relief.paste(Image.fromarray(r), offset)
        report.append(info)
    albedo.save(OUT / 'mineral-albedo.jpg', quality=91, subsampling=0, optimize=True)
    relief.save(OUT / 'mineral-relief.png', optimize=True)
    print(json.dumps({'size': [SIZE * 2, SIZE * 2], 'tileGutter': BORDER, 'seed': 26111009,
        'materials': report, 'bytes': sum(p.stat().st_size for p in OUT.iterdir() if p.is_file())}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
