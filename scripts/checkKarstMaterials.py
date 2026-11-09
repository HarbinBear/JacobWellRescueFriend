from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
color = np.asarray(Image.open(ROOT / 'images/karst/mineral-albedo.jpg').convert('RGB'))
relief = np.asarray(Image.open(ROOT / 'images/karst/mineral-relief.png').convert('RGBA'))
assert color.shape == (1024, 1024, 3)
assert relief.shape == (1024, 1024, 4)
report = {'scope': '正式材质高度/法线导出与接缝检查，不是微信渲染测试', 'tiles': []}
for tile in range(4):
    x, y = (tile % 2) * 512, (tile // 2) * 512
    image = relief[y:y + 512, x:x + 512]
    inner = image[8:-8, 8:-8].astype(float) / 255
    assert np.array_equal(image[8:-8, :8], image[8:-8, -16:-8])
    assert np.array_equal(image[8:-8, -8:], image[8:-8, 8:16])
    assert np.array_equal(image[:8, 8:-8], image[-16:-8, 8:-8])
    assert np.array_equal(image[-8:, 8:-8], image[8:16, 8:-8])
    height = inner[..., 2]
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * (12 / (320 / 496)) * .5
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * (12 / (320 / 496)) * .5
    length = np.sqrt(gx * gx + gy * gy + 1)
    expected = np.dstack((-gx / length, -gy / length, 1 / length))
    xy = inner[..., :2] * 2 - 1
    decoded = np.dstack((xy, np.sqrt(np.maximum(0, 1 - np.sum(xy * xy, axis=2)))))
    decoded /= np.maximum(1e-9, np.linalg.norm(decoded, axis=2))[..., None]
    angle = np.degrees(np.arccos(np.clip(np.sum(expected * decoded, axis=2), -1, 1)))
    mean, p95 = float(angle.mean()), float(np.percentile(angle, 95))
    assert mean < 2.1, (tile, mean)
    assert p95 < 4.7, (tile, p95)
    assert height.std() > .04
    report['tiles'].append({'tile': tile, 'meanHeightNormalDifferenceDeg': mean, 'p95HeightNormalDifferenceDeg': p95,
        'heightStd': float(height.std()), 'gutterCopiesCorrect': True})
report['status'] = 'passed'
out = ROOT / 'node_modules/.cache/karst-review/material-report.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
