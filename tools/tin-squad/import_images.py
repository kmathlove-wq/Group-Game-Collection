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
            files[int(m.group(1))] = f
    made = []
    for n, f in sorted(files.items()):
        im = Image.open(f)
        if n in SHEETS:
            cols, rows, names, size = SHEETS[n]
            a = cut_background(im)
            h, w = a.shape[:2]
            for i, name in enumerate(names):
                x, y = i % cols, i // cols
                cell = trim(a[y * h // rows:(y + 1) * h // rows, x * w // cols:(x + 1) * w // cols])
                if cell is None:
                    print(f'⚠ {f.name}: {name} 칸이 비어 있어요(코드 그림을 써요)')
                    continue
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
            cell = trim(cut_background(im))
            if cell is None:
                print(f'⚠ {f.name}: 그림을 찾지 못했어요')
                continue
            name = f'boss_{BOSSES[n - 9]}'
            save_png(cell, out / f'{name}.png', 560)
            made.append(name)
        elif 17 <= n <= 24:
            cover(im, 1280, 720).save(out / f'bg_{WORLDS[n - 17]}.jpg', quality=82)
            made.append(f'bg_{WORLDS[n - 17]}')
    known = {p.stem: p.name for p in sorted(out.iterdir()) if p.suffix in ('.png', '.jpg')}
    (out / 'manifest.js').write_text(
        '// 자동으로 만들어지는 그림 목록(tools/tin-squad/import_images.py). 여기에 없는 그림은 코드로 그린다. 손으로 고치지 말 것.\n'
        'window.TinSquad = window.TinSquad || {};\n'
        f'window.TinSquad.IMAGES = {json.dumps(known, ensure_ascii=False)};\n', encoding='utf8', newline='\n')
    print(f'그림 파일 {len(files)}장 → 게임 그림 {len(made)}개를 넣었어요. 지금 쓰는 그림은 모두 {len(known)}개예요.')


if __name__ == '__main__':
    main()
