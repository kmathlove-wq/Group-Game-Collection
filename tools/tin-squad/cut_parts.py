# 깡통 소탕대 관절 오리기: 그림 한 장을 몸 + 팔다리 조각으로 윤곽을 따라 오려
# public/tin-squad/img/rig_<이름>.png(몸과 조각을 나란히 붙인 그림)와 js/rigs.js(자리 표)를 만든다.
# import_images.py가 끝날 때 저절로 부른다. 자리 숫자는 모두 그림 크기의 퍼센트(0~100)다.
#
# 조각 하나 = (이름, 다각형, 도는 중심, 옵션)
#   다각형은 넉넉히 그려도 된다: 다각형 안에서 '가장 큰 한 덩어리'만 조각이 되고, 떨어져 있는 다른 조각은 몸에 남는다.
#   back: 몸 뒤에 그린다 → 조각을 몸 속으로 n픽셀 늘려 관절 틈을 가린다
#   (back이 아니면) 몸을 조각 자리 안으로 n픽셀 늘려 떼어 낸 자리를 메운다
#   r: 관절 동그라미 반지름(폭 %) — 늘리기·메우기를 관절 둘레로만 한다(뾰족한 조각이 안 생김)
#   under: 조각 뒤에 몸이 있어야 하는 자리(다각형) — 주변 색으로 메운다 / keep: 몸에서 지우지 않는다(커지기만 하는 조각)
#   blue: 다각형 안의 파란 부분만(선풍기 날개)
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]


def P(name, poly, pivot, **opt):
    return (name, poly, pivot, opt)


SPEC = {
    'enemy_toaster': [
        P('legL', [(20, 66.6), (42, 66.6), (48, 101), (16, 101)], (30.5, 67), back=1, r=6),
        P('legR', [(58, 66.9), (79, 66.6), (86, 101), (56, 101)], (70, 67), back=1, r=6)],
    'enemy_kettle': [
        P('legL', [(4, 73), (19, 76), (24, 78.6), (37, 80.2), (38, 96), (4, 98)], (31, 80), back=1, r=4.5),
        P('legR', [(50, 80), (58, 79.9), (67, 78.9), (84, 82), (84, 102), (55, 102)], (63, 80.5), back=1, r=4),
        P('armL', [(-2, 38), (22.5, 40), (22.5, 54), (16.5, 55), (14.5, 70), (-2, 72)], (23.5, 47.5), r=3, under=[(20, 44), (23, 44), (23, 52), (20, 52)]),
        P('armR', [(72.8, 58), (78, 55.4), (82, 50), (95, 50), (95, 72), (72.8, 72)], (72.5, 62), back=1, r=4),
        P('steam', [(80, 5), (102, 5), (102, 32.5), (80, 32.5)], (84, 30), n=0)],
    'enemy_fan': [P('blades', [(17, 8), (92, 8), (92, 90), (17, 90)], (57.5, 49), blue=1, n=0)],
    'enemy_bulb': [P('wings', [(-2, 4), (24, 0), (36, 0), (46, 38), (46.5, 43.5), (40, 49), (37, 51.5), (28, 56.8), (14, 59), (-2, 58)], (43, 46.5), back=1, r=3)],
    'enemy_vacuum': [P('brush', [(-2, 64), (9, 69.5), (14, 72.5), (24, 78.5), (32, 81), (42, 82.5), (42, 102), (-2, 102)], (20, 79), back=1, r=7)],
    'enemy_turret': [P('head', [(-2, -2), (102, -2), (102, 42), (50, 43), (45, 45.5), (38, 47.6), (30, 48.6), (22, 47.6), (-2, 40)], (33, 43), r=8.5)],
    'enemy_cam': [P('head', [(-2, -2), (102, -2), (102, 41), (56, 41), (55, 45), (47, 45), (28, 45), (19, 45), (19, 41), (-2, 41)], (37, 41.5), r=7)],
    'enemy_microwave': [
        P('legL', [(12, 65.6), (36, 65.6), (36, 102), (12, 102)], (28.5, 66), back=1, r=4),
        P('legR', [(43, 65.6), (60, 65.6), (66, 90), (66, 102), (43, 102)], (51, 66), back=1, r=4),
        P('shield', [(64.6, 15.4), (70, 13.4), (74.8, 9.6), (78.4, 4), (79.4, -2), (90, -2), (102, 12), (102, 45), (96, 78), (88, 94), (79, 94), (70, 76), (66, 63), (64.4, 40)], (72, 58), n=0, panel=[61.8, 3.2, 13, 61, '#e9edf6'])],
    'enemy_blender': [
        P('legL', [(12, 81), (28, 80.4), (46, 81), (46, 102), (12, 102)], (37, 81.5), back=1, r=5.5),
        P('legR', [(58, 81.3), (70, 80.2), (75.5, 77.6), (95, 80), (95, 102), (58, 102)], (68, 81), back=1, r=5),
        P('armL', [(-2, 56), (24, 56), (26.5, 58.5), (26.5, 69), (21, 71), (18, 82), (-2, 82)], (29, 63), r=4, under=[(25.5, 60), (28, 60), (28, 70), (25.5, 70)]),
        P('armR', [(70.8, 45), (102, 45), (102, 72), (74, 72), (72.6, 66), (70.8, 60)], (72, 63), back=1, r=3.6)],
    'enemy_fridge': [
        P('legL', [(22.5, 71), (27, 67.6), (36, 69.6), (46, 69.6), (46, 102), (17, 102), (21, 80)], (35, 70), back=1, r=7),
        P('legR', [(53, 69.5), (70, 69), (82, 72), (86, 102), (53, 102)], (63, 69.5), back=1, r=7),
        P('armL', [(-2, 28), (11.5, 30), (18.6, 37), (18.6, 58), (19.6, 64), (22, 67), (22, 79), (-2, 79)], (16, 33), back=1, r=5),
        P('armR', [(76.9, 34), (82, 36), (102, 50), (102, 76), (80, 72), (76.9, 56)], (78.5, 37), back=1, r=3)],
    'mech': [
        P('cannon', [(70.6, 24), (102, 26), (102, 52), (70.6, 52)], (71, 39), back=1, r=6),
        P('legR', [(49, 72), (56, 68.6), (67, 68.4), (70, 60), (80, 64), (80, 102), (47, 102)], (65, 69.5), back=1, r=6),
        P('legL', [(19, 53), (26, 51.5), (35.5, 67), (36.5, 102), (8, 102), (8, 73), (17, 72.6), (20.5, 71), (22, 66), (21, 59)], (25, 57), n=3, under=[(18, 52), (31, 52), (35.5, 66.8), (20, 66.8)])],
    'boss_toastking': [
        P('legL', [(24, 73), (31, 69.8), (37, 69.8), (39.5, 75.5), (41, 78), (46, 102), (14, 102), (20, 80)], (34, 71.5), back=1, r=4.5),
        P('legR', [(55.6, 69.8), (63, 69.8), (64.5, 75.5), (68, 78.8), (70, 83.8), (74, 86), (78, 87), (84, 89), (84, 102), (53, 102), (53, 76)], (60, 71.5), back=1, r=4),
        P('armL', [(-2, 60), (9.6, 62), (10.4, 70), (25, 70), (17, 78), (14, 87), (-2, 87)], (16, 69), back=1, r=5),
        P('toast', [(50.6, 6), (56, 1), (78, 1), (78, 19.4), (52.4, 19.4)], (64, 19.4), keep=1, n=0)],
    'boss_dustking': [P('mouth', [(-2, 28), (11, 29), (16, 43), (17.5, 60), (15, 77), (10, 88), (-2, 88)], (17, 58), keep=1, n=0)],
    'boss_clown': [
        P('rotor', [(-2, -2), (86, -2), (86, 20.4), (74, 20.2), (66, 19.8), (62, 21), (60, 24.2), (50, 24.4), (47, 15.4), (38.5, 15.4), (36.4, 24.2), (28, 23), (-2, 22.4)], (42.6, 12), n=0),
        P('propL', [(5, 67), (17.5, 67), (17, 79.5), (19, 82.5), (28, 84), (28, 90), (21, 97), (5, 97)], (15.4, 83), n=0)],
    'boss_queen': [
        P('skirt', [(21, 69.6), (71.4, 69.6), (74, 73), (77.4, 77), (85.5, 77), (88, 72), (102, 72), (102, 102), (5, 102), (12, 75)], (48, 70), back=1, n=14),
        P('crown', [(21, -2), (57, -2), (57, 16), (23, 17)], (37, 16.5), keep=1, n=0),
        P('armL', [(-2, 53), (21.4, 53), (21.4, 66), (15, 75), (-2, 75)], (21.5, 58), back=1, r=3)],
    'boss_airship': [
        P('tail', [(89.4, 20), (102, 20), (102, 62), (89.8, 62), (88.8, 52), (88.8, 36)], (89, 42), back=1, n=12)],
    'boss_dragon': [
        P('tail', [(81.4, 56), (85, 61), (86, 28), (102, 28), (102, 76), (95, 87), (75, 87), (77.4, 81.5), (80.4, 76), (81.6, 66)], (81, 73), back=1, r=6),
        P('head', [(-2, -2), (36, -2), (36, 8), (34, 14), (32.4, 19), (31, 26), (28, 32), (24, 37), (17, 49), (-2, 49)], (31, 27), n=16)],
    'boss_overlord': [
        P('legL', [(32, 74), (39, 68), (46.5, 61.8), (49, 63.5), (51, 69.5), (57, 73), (57, 102), (32, 102)], (46, 67), back=1, r=5.5),
        P('legR', [(62.4, 72), (63.2, 63), (66, 58), (74, 57), (80, 62), (88, 102), (59, 102), (59, 80)], (70, 63), back=1, r=6),
        P('head', [(6, 4), (33, 4), (34.6, 14), (33.6, 25.5), (25.5, 34), (6, 34)], (30, 19), n=14),
        P('fistL', [(-2, 48), (33.2, 50), (33.2, 75), (-2, 75)], (16, 60), n=0),
        P('fistR', [(79.2, 46), (79.6, 29), (84, 29), (86, 25), (102, 25), (102, 64), (78.6, 64)], (90, 45), n=0)],
    'hero_idle': [
        P('scarf', [(-2, 34), (29, 35.4), (31, 38.4), (29, 41.4), (25, 46), (17.5, 50.8), (8, 55), (-2, 55)], (30.5, 39), back=1, n=6),
        P('gun', [(59.8, 43.6), (61.4, 41.8), (68, 41), (102, 40), (102, 65), (60.4, 65), (60.4, 52)], (63, 56.5), r=5)],
    'hero_run1': [
        P('scarf', [(12, 29), (35, 33), (42, 36), (45, 39.4), (41, 43.2), (36, 46), (28, 49.4), (12, 52)], (45, 40), back=1, n=6),
        P('gun', [(66.5, 41), (102, 41), (102, 67), (69.4, 67), (69.4, 53), (67, 51)], (72, 58), r=4)],
    'hero_run2': [
        P('scarf', [(-2, 29), (25, 33), (34, 36.4), (36, 39.4), (31, 43), (24.5, 47.6), (-2, 51)], (36, 39.5), back=1, n=6),
        P('gun', [(62.6, 44.4), (64, 42.2), (69, 41.4), (102, 41), (102, 66), (64.2, 66), (64.2, 53.4), (62.8, 51)], (67, 57), r=4.5)],
    'hero_run3': [
        P('scarf', [(10, 29), (34, 33), (42, 36.4), (44, 39.4), (39, 43), (33, 47), (10, 51)], (44, 40), back=1, n=6),
        P('gun', [(66, 40), (102, 40), (102, 67), (68, 67), (68, 53), (66.4, 51)], (71, 57), r=4)],
    'hero_jump': [
        P('scarf', [(-2, 31), (24, 35.4), (33, 38), (34, 40.4), (30, 44.4), (20, 50.4), (-2, 53)], (34, 40), back=1, n=6),
        P('gun', [(61.4, 43), (63.4, 41), (68, 40), (102, 39.4), (102, 62.8), (62, 62.8), (62, 52)], (65, 56), r=4.5)],
    'hero_crouch': [
        P('scarf', [(-2, 32), (27, 36.4), (35, 39.4), (37, 42.4), (31, 48), (20, 53), (-2, 56)], (37, 42), back=1, n=6)],
}


def poly_mask(poly, w, h):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).polygon([(x / 100 * w, y / 100 * h) for x, y in poly], fill=255)
    return np.asarray(m) > 0


def nearest_fill(dst, src, src_mask, want):
    """want 자리를 src_mask 가운데 가장 가까운 픽셀 색으로 채운다."""
    if not want.any() or not src_mask.any():
        return
    _, (iy, ix) = ndimage.distance_transform_edt(~src_mask, return_indices=True)
    dst[want] = src[iy[want], ix[want]]
    dst[want, 3] = 255


def cut(name, img):
    a = np.asarray(img.convert('RGBA')).copy()
    h, w = a.shape[:2]
    alpha = a[..., 3] > 12
    masks = []
    taken = np.zeros((h, w), bool)
    for pid, poly, pivot, opt in SPEC[name]:
        m = poly_mask(poly, w, h) & alpha & ~taken
        if opt.get('blue'):
            r, b = a[..., 0].astype(int), a[..., 2].astype(int)
            core = ndimage.binary_opening(m & (b > r + 70) & (b > 120), iterations=1)
            m = ndimage.binary_dilation(core, iterations=6) & alpha
        else:
            lab, n = ndimage.label(m, np.ones((3, 3)))
            if n > 1:
                size = ndimage.sum(m, lab, range(1, n + 1))
                m = lab == (1 + int(np.argmax(size)))
        masks.append(m)
        if not opt.get('keep'):
            taken |= m
    # 오린 자리 옆에 실처럼 남는 조각은 가장 가까운 팔다리에 붙여 준다(움직일 때 남지 않게)
    rest = alpha & ~taken
    thin = rest & ~ndimage.binary_opening(rest, iterations=2) & ndimage.binary_dilation(taken, iterations=3)
    old, _ = ndimage.label(alpha)
    lab, n = ndimage.label(rest)
    if n:
        size = ndimage.sum(rest, lab, range(1, n + 1))
        for i in range(1, n + 1):
            piece = lab == i
            if size[i - 1] < w * h * 0.004 and (ndimage.binary_dilation(piece, iterations=2) & taken).any():
                thin |= piece
    if thin.any() and taken.any():
        owner = np.zeros((h, w), int)
        for k, (m, spec) in enumerate(zip(masks, SPEC[name])):
            if not spec[3].get('keep'):
                owner[m] = k + 1
        _, (iy, ix) = ndimage.distance_transform_edt(owner == 0, return_indices=True)
        for k in range(len(masks)):
            masks[k] = masks[k] | (thin & (owner[iy, ix] == k + 1))
        taken |= thin
    body = a.copy()
    body[taken] = 0
    body[(body[..., 3] <= 12)] = 0
    rest = alpha & ~taken
    solid = a[..., 3] > 200
    luma = a[..., :3].astype(float) @ np.array([0.3, 0.59, 0.11])
    ys, xs = np.mgrid[0:h, 0:w]

    def inner(mask):
        """메울 색은 어두운 테두리를 뺀 속살에서 고른다(온통 어두운 그림은 그대로)."""
        light = mask & solid & (luma > 75)
        return light if light.sum() > mask.sum() * 0.3 else mask & solid
    parts = []
    for (pid, poly, pivot, opt), m in zip(SPEC[name], masks):
        part = np.zeros_like(a)
        part[m] = a[m]
        n = opt.get('n', 0)
        if opt.get('r'):
            rad = opt['r'] / 100 * w
            disc = np.hypot(xs - pivot[0] / 100 * w, ys - pivot[1] / 100 * h) <= rad
            near = np.hypot(xs - pivot[0] / 100 * w, ys - pivot[1] / 100 * h) <= rad * 2.2
            if opt.get('back'):
                nearest_fill(part, a, inner(m) & near if (inner(m) & near).any() else inner(m), disc & rest & solid)
            else:
                nearest_fill(body, a, inner(rest) & near if (inner(rest) & near).any() else inner(rest), disc & m & solid)
        elif n and opt.get('back'):  # 몸 속으로 늘리기(몸 뒤에 숨는다)
            grow = ndimage.binary_dilation(m, iterations=n) & rest & solid
            nearest_fill(part, a, m & solid, grow)
        elif n:  # 몸을 조각 자리 안으로 늘리기
            grow = ndimage.binary_dilation(rest, iterations=n) & m & solid
            nearest_fill(body, a, rest & solid, grow)
        if opt.get('under'):
            nearest_fill(body, a, rest & solid, poly_mask(opt['under'], w, h) & m)
        if opt.get('panel'):
            x, y, pw, ph, col = opt['panel']
            box = [x / 100 * w, y / 100 * h, (x + pw) / 100 * w, (y + ph) / 100 * h]
            p = Image.new('RGBA', (w, h))
            ImageDraw.Draw(p).rounded_rectangle(box, radius=w * 0.02, fill=col, outline='#2c1038', width=max(3, w // 60))
            p = np.asarray(p)
            put = (p[..., 3] > 0) & (a[..., 3] > 0)
            body[put] = p[put]
        parts.append((pid, part, pivot, opt))
    # 몸과 조각을 나란히 붙인 그림
    boxes = []
    for pid, part, pivot, opt in parts:
        ys, xs = np.where(part[..., 3] > 0)
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    aw = w + 2 + sum(b[2] - b[0] + 2 for b in boxes)
    ah = max([h] + [b[3] - b[1] for b in boxes])
    atlas = Image.new('RGBA', (int(aw), int(ah)))
    atlas.paste(Image.fromarray(body), (0, 0))
    ox = w + 2
    rig = {'w': w, 'h': h, 'parts': []}
    for (pid, part, pivot, opt), b in zip(parts, boxes):
        atlas.paste(Image.fromarray(part[b[1]:b[3], b[0]:b[2]]), (int(ox), 0))
        rig['parts'].append({'id': pid, 'back': 1 if opt.get('back') else 0, 'sx': int(ox), 'x': int(b[0]), 'y': int(b[1]), 'w': int(b[2] - b[0]), 'h': int(b[3] - b[1]),
                             'px': round(pivot[0] / 100 * w, 1), 'py': round(pivot[1] / 100 * h, 1)})
        ox += b[2] - b[0] + 2
    return atlas, rig


def run(img_dir, js_path):
    rigs = {}
    for name in SPEC:
        f = img_dir / f'{name}.png'
        if not f.exists():
            continue
        atlas, rig = cut(name, Image.open(f))
        atlas.save(img_dir / f'rig_{name}.png', optimize=True)
        rigs[name] = rig
    js_path.write_text('// 자동으로 만들어지는 관절 자리 표(tools/tin-squad/cut_parts.py). 손으로 고치지 말 것.\nwindow.TinSquad = window.TinSquad || {};\n'
                       + f'window.TinSquad.RIGS = {json.dumps(rigs, separators=(",", ":"))};\n', encoding='utf8', newline='\n')
    return len(rigs)


if __name__ == '__main__':
    print(f"관절 그림 {run(ROOT / 'public' / 'tin-squad' / 'img', ROOT / 'public' / 'tin-squad' / 'img' / 'rigs.js')}개를 만들었어요.")
