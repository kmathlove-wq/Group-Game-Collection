# 깡통 소탕대 그림 넣기: '사진/깡통소탕대(Tin Squad)/'의 01~24번 그림을 배경을 지우고 잘라서
# public/tin-squad/img/ 에 넣고 manifest.js(그림 목록)를 새로 만든다. 여러 번 돌려도 된다.
# 쓰는 법(프로젝트 폴더에서): python tools/tin-squad/import_images.py [--src 폴더] [--out 폴더]
import argparse
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HERO = ['hero_idle', 'hero_run1', 'hero_run2', 'hero_run3', 'hero_jump', 'hero_crouch', 'hero_up', 'hero_hurt']
WORLDS = ['market', 'junk', 'subway', 'park', 'ice', 'sky', 'lava', 'core']
BOSSES = ['toastking', 'dustking', 'train', 'clown', 'queen', 'airship', 'dragon', 'overlord']
# 번호: (가로 칸, 세로 칸, 이름들, 최대 크기)
SHEETS = {
    1: (4, 2, HERO, 220),
    2: (3, 2, ['mech', 'pet_0', 'pet_1', 'pet_2', 'pet_3', 'prop_cage'], 260),
    3: (2, 2, ['enemy_toaster', 'enemy_kettle', 'enemy_fan', 'enemy_bulb'], 220),
    4: (2, 2, ['enemy_vacuum', 'enemy_turret', 'enemy_cam', 'enemy_speaker'], 220),
    5: (2, 2, ['enemy_microwave', 'enemy_blender', 'enemy_iron', 'enemy_fridge'], 260),
    6: (4, 3, ['item_coin', 'item_heart', 'item_bomb', 'prop_crate', 'prop_barrel', 'item_rapid', 'item_spread', 'item_rocket', 'item_laser', 'item_flame', 'item_ball', 'item_zap'], 110),
}


FLIP = {'enemy_turret'}  # 왼쪽을 보고 그려진 그림은 오른쪽을 보게 뒤집는다


def cut_background(im):
    """투명 배경이면 그대로, 아니면 네 모서리 색과 비슷한 색을 투명하게(가장자리는 부드럽게)."""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    h, w = a.shape[:2]
    if (a[..., 3] < 20).mean() > 0.08:
        return a
    s = max(2, min(h, w) // 60)
    corners = np.concatenate([a[:s, :s, :3].reshape(-1, 3), a[:s, -s:, :3].reshape(-1, 3), a[-s:, :s, :3].reshape(-1, 3), a[-s:, -s:, :3].reshape(-1, 3)])
    key = np.median(corners, axis=0)
    d = np.sqrt(((a[..., :3] - key) ** 2).sum(-1))
    magenta = key[0] > 150 and key[2] > 150 and key[1] < 110
    if magenta:  # 자홍색 정도로 판단하면 배경이 조금 얼룩져도 깨끗하게 지워진다
        m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
        full = max(60.0, float(min(key[0], key[2]) - key[1]))
        ratio = np.clip(m / full, 0, 1)
        alpha = np.clip((0.82 - ratio) / 0.35, 0, 1)
        spill = np.clip(m, 0, None) * (alpha < 0.999)
        a[..., 0] -= spill * 0.9
        a[..., 2] -= spill * 0.9
    else:
        alpha = np.clip((d - 26) / 34, 0, 1)
    a[..., 3] *= alpha
    return np.clip(a, 0, 255)

# 25~29번: 옷장 옷(주인공 동작 8개와 같은 배치)
SKINS = ['mint', 'pink', 'lemon', 'ninja', 'gold']
for _i, _s in enumerate(SKINS):
    SHEETS[25 + _i] = (4, 2, [f'sk_{_s}_{h}' for h in HERO], 220)


def fix_airship(a):
    """그려진 프로펠러와 잔상을 지우고(게임이 코드로 돌린다) 뒤의 빨간 몸을 메운다."""
    from scipy import ndimage
    from cut_parts import nearest_fill, poly_mask
    h, w = a.shape[:2]
    a = np.round(a)
    ys, xs = np.mgrid[0:h, 0:w]
    e = np.hypot((xs / w - 0.57) / 0.342, (ys / h - 0.415) / 0.423)  # 풍선 몸통을 타원으로 본다
    left = (xs < w * 0.42) & (ys < h * 0.8)
    out = (left & (e > 1)) | ((xs < w * 0.355) & (ys >= h * 0.8))
    a[out | ((a[..., 3] < 215) & (xs < w * 0.5) & (e > 1)), 3] = 0
    hull = left & (e <= 1)
    a[hull, 3] = 255
    edge = hull & (e > 0.972)
    a[edge, :3] = (44, 14, 46)
    swirl = hull & ~edge & ~poly_mask([(22, 22), (45, 18), (45, 36), (24, 38)], w, h) & ~((a[..., 0] > 150) & (a[..., 0] - a[..., 1] > 130))
    red0 = hull & ~edge & ~swirl & (a[..., 0] - a[..., 1] > 130)
    nearest_fill(a, a.copy(), red0, swirl)
    blade = poly_mask([(21, 36.5), (47.5, 37), (47.5, 61), (21, 61)], w, h) & (a[..., 3] > 0) & ~edge
    red = (a[..., 0] > 150) & (a[..., 0] - a[..., 1] > 110) & (a[..., 3] > 200)
    gray = ndimage.binary_dilation(blade & ~red, iterations=3) & blade
    nearest_fill(a, a.copy(), red & ~gray, gray)
    soft = (gray | swirl) & ~edge
    for ch in range(3):
        a[..., ch] = np.where(soft, ndimage.gaussian_filter(a[..., ch], 7), a[..., ch])
    return a


def fix_glow(a, name):
    """빛무리·날개 잔상에 섞인 자홍빛을 어울리는 색으로 바꾼다."""
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    if name == 'enemy_bulb':
        # 빛무리는 지우고(게임이 코드로 빛을 그린다) 어두운 테두리·더듬이는 남긴다
        h, w = a.shape[:2]
        ys, xs = np.mgrid[0:h, 0:w]
        x, y = xs / w, ys / h
        dist = np.hypot(x - 0.68, (y - 0.365) * h / w)
        luma = a[..., :3] @ np.array([0.3, 0.59, 0.11])
        keep = (dist < 0.181) | (x < 0.365 + y * 0.22) | ((y > 0.57) & (x < 0.775)) | ((x > 0.36) & (x < 0.56) & (y > 0.435) & (y < 0.62))
        a[~keep, 3] = 0
        a[(m > 10) & (luma > 45) & (dist > 0.165), 3] = 0
        a[(dist > 0.165) & (dist < 0.181) & (y < 0.57) & (a[..., 3] > 0), :3] = (52, 30, 44)
        a[(a[..., 3] > 60) & (luma < 60), 3] = 255
        a[a[..., 3] <= 60, 3] = 0
    elif name == 'boss_overlord':
        hit = m > 50
        a[hit, 0], a[hit, 1], a[hit, 2] = 61, 225, 240
    elif name == 'boss_airship':
        a = fix_airship(a)
    elif name == 'boss_clown':
        hit = (m > 95) & (a[..., 0] > 150)
        a[hit, 0], a[hit, 1], a[hit, 2] = 238, 242, 250
        a[hit, 3] *= 0.7
    return a


def close_end(a):
    """오른쪽이 그림 밖으로 잘린 전동차: 뒤쪽 모서리를 둥글게 하고 테두리를 그려 마무리한다."""
    h, w = a.shape[:2]
    if (a[:, -2, 3] > 128).mean() < 0.5:
        return a
    r, line = round(h * 0.13), max(4, h // 60)
    ys, xs = np.mgrid[0:h, 0:w]
    top = np.where(a[:, -2, 3] > 128)[0][0]
    dx, dy = xs - (w - r), (top + r) - ys
    dist = np.sqrt(np.clip(dx, 0, None) ** 2 + np.clip(dy, 0, None) ** 2)
    corner = (dx > 0) & (dy > 0)
    a[corner & (dist > r), 3] = 0
    edge = (corner & (dist > r - line)) | ((xs >= w - line) & (dy <= 0))
    a[edge & (a[..., 3] > 0), :3] = (38, 16, 48)
    return a


def clean_specks(a):
    """떨어져 있는 작은 자홍빛 얼룩(배경 찌꺼기)을 지운다."""
    from scipy import ndimage
    lab, n = ndimage.label(a[..., 3] > 24)
    if n < 2:
        return a
    idx = range(1, n + 1)
    area = ndimage.sum(np.ones(lab.shape), lab, idx)
    tint = ndimage.mean((a[..., 0] + a[..., 2]) / 2 - a[..., 1], lab, idx)
    solid = ndimage.mean(a[..., 3], lab, idx)
    biggest = area.max()
    for i in idx:
        small = area[i - 1] < biggest * 0.06
        if area[i - 1] < biggest * 0.002 or (small and (tint[i - 1] > 22 or solid[i - 1] < 140)):
            a[lab == i] = 0
    return a


def trim(a):
    mask = a[..., 3] > 40
    # 옆 칸에서 살짝 넘어온 조각 지우기: 가장자리에 붙은 얇은 줄이 전체의 2%보다 작으면 무시
    rows, cols = mask.sum(1), mask.sum(0)
    ys, xs = np.where(rows > 1)[0], np.where(cols > 1)[0]
    if len(ys) < 4 or len(xs) < 4:
        return None
    def main_span(line):
        idx = np.where(line > 1)[0]
        runs = np.split(idx, np.where(np.diff(idx) > max(3, len(line) // 40))[0] + 1)
        total = line.sum()
        keep = [r for r in runs if line[r].sum() > total * 0.02 or not (r[0] <= 1 or r[-1] >= len(line) - 2)]
        return (keep[0][0], keep[-1][-1] + 1) if keep else (idx[0], idx[-1] + 1)
    y0, y1 = main_span(rows)
    x0, x1 = main_span(cols)
    return a[y0:y1, x0:x1]


def save_png(a, path, size):
    im = Image.fromarray(a.astype(np.uint8), 'RGBA')
    im.thumbnail((size, size), Image.LANCZOS)
    im.save(path, optimize=True)


def cover(im, w, h):
    im = im.convert('RGB')
    k = max(w / im.width, h / im.height)
    im = im.resize((max(w, round(im.width * k)), max(h, round(im.height * k))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=str(ROOT / '사진' / '깡통소탕대(Tin Squad)'))
    ap.add_argument('--out', default=str(ROOT / 'public' / 'tin-squad' / 'img'))
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    files = {}
    for f in sorted(src.iterdir()):
        m = re.match(r'^(\d{1,2})\D', f.name)
        if m and f.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp'):
            n = int(m.group(1))
            hint = re.search(r'적\s*([ABC])', f.name)  # '03_적B'처럼 번호를 잘못 적어도 A·B·C를 믿는다
            files[{'A': 3, 'B': 4, 'C': 5}[hint.group(1)] if hint else n] = f
    made = []
    for n, f in sorted(files.items()):
        im = Image.open(f)
        if n in SHEETS:
            cols, rows, names, size = SHEETS[n]
            a = cut_background(im)
            h, w = a.shape[:2]
            for i, name in enumerate(names):
                x, y = i % cols, i // cols
                cell = trim(clean_specks(a[y * h // rows:(y + 1) * h // rows, x * w // cols:(x + 1) * w // cols].copy()))
                if cell is None:
                    print(f'⚠ {f.name}: {name} 칸이 비어 있어요(코드 그림을 써요)')
                    continue
                cell = fix_glow(cell, name)
                if name in FLIP:
                    cell = cell[:, ::-1]
                save_png(cell, out / f'{name}.png', size)
                made.append(name)
        elif n == 7:
            im = im.convert('RGB')
            cw, ch = im.width / 4, im.height / 2
            for i, world in enumerate(WORLDS):
                x, y = i % 4, i // 4
                side = min(cw, ch) * 0.86
                cx, cy = (x + 0.5) * cw, (y + 0.5) * ch
                im.crop((round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))).resize((90, 90), Image.LANCZOS).save(out / f'tile_{world}.jpg', quality=88)
                made.append(f'tile_{world}')
        elif n == 8:
            cover(im, 1280, 720).save(out / 'title.jpg', quality=84)
            made.append('title')
        elif 9 <= n <= 16:
            cell = trim(clean_specks(cut_background(im)))
            if cell is None:
                print(f'⚠ {f.name}: 그림을 찾지 못했어요')
                continue
            name = f'boss_{BOSSES[n - 9]}'
            cell = fix_glow(close_end(cell) if n == 11 else cell, name)
            save_png(cell, out / f'{name}.png', 560)
            made.append(name)
        elif 17 <= n <= 24:
            cover(im, 1280, 720).save(out / f'bg_{WORLDS[n - 17]}.jpg', quality=82)
            made.append(f'bg_{WORLDS[n - 17]}')
    from cut_parts import run as cut_run
    print(f'관절 그림 {cut_run(out, out / "rigs.js")}개를 만들었어요.')
    known = {p.stem: p.name for p in sorted(out.iterdir()) if p.suffix in ('.png', '.jpg')}
    (out / 'manifest.js').write_text(
        '// 자동으로 만들어지는 그림 목록(tools/tin-squad/import_images.py). 여기에 없는 그림은 코드로 그린다. 손으로 고치지 말 것.\n'
        'window.TinSquad = window.TinSquad || {};\n'
        f'window.TinSquad.IMAGES = {json.dumps(known, ensure_ascii=False)};\n', encoding='utf8', newline='\n')
    print(f'그림 파일 {len(files)}장 → 게임 그림 {len(made)}개를 넣었어요. 지금 쓰는 그림은 모두 {len(known)}개예요.')


if __name__ == '__main__':
    main()
