# ===== tools/baseball/pose_search.py =====
# 보이지 않는 블렌더에서 타격 자세를 자동으로 찾는 도구(사용자 블렌더 화면이 깜빡이지 않게).
#   blender --background --factory-startup --python pose_search.py -- 결과.json
# 자세마다 목표(손·배트 끝 위치)에 가깝고, 팔·배트가 몸통·골반·머리를 뚫지 않는 자세를 고른다.
import bpy, sys, json, random, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
G = {}
exec(open(os.path.join(HERE, 'models.py'), encoding='utf-8').read(), G)
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
objs = G['build_player']()
J, POSES = G['J'], G['POSES']
BAT_TIP = Vector((-0.228, -0.79, 0.92)) - Vector(J['bat'])


def seg_points(a, b, n):
    return [a.lerp(b, (i + 0.5) / n) for i in range(n)]


def penetration():
    """팔·배트 위 점들이 몸통(타원기둥)·골반·머리 안에 들어간 깊이의 합."""
    bpy.context.view_layer.update()
    W = lambda o, p=(0, 0, 0): o.matrix_world @ Vector(p)
    pts = []
    for s in ('r', 'l'):
        sh, el = W(objs['upper_arm_' + s]), W(objs['forearm_' + s])
        hand = W(objs['bat' if s == 'r' else 'glove'])
        pts += seg_points(sh.lerp(el, 0.35), el, 3) + seg_points(el, hand, 4)
    bat_hand = W(objs['bat'])
    bat_tip = W(objs['bat'], BAT_TIP)
    pts += seg_points(bat_hand.lerp(bat_tip, 0.15), bat_tip, 8)
    pen = 0.0
    torso_inv = objs['torso'].matrix_world.inverted()
    pelvis_inv = objs['pelvis'].matrix_world.inverted()
    head_inv = objs['head'].matrix_world.inverted()
    for p in pts:
        q = torso_inv @ p                        # 몸통: 관절에서 위로 -0.1 ~ 0.45, 가로 0.2, 앞뒤 0.135
        if -0.1 < q.z < 0.45:
            e = (q.x / 0.2) ** 2 + (q.y / 0.135) ** 2
            if e < 1: pen += 1 - e
        q = pelvis_inv @ p                       # 골반·엉덩이
        if -0.2 < q.z < 0.1 and abs(q.x) < 0.19 and abs(q.y) < 0.13:
            pen += 0.5
        q = head_inv @ p                         # 머리
        if (q - Vector((0, 0, 0.13))).length < 0.13:
            pen += 0.5
    return pen


def measure(pose):
    POSES['_t'] = pose
    G['PLANT']['_t'] = G['PLANT'].get(CURRENT, {})
    G['apply_pose'](objs, '_t')
    G['ground_feet'](objs)
    bpy.context.view_layer.update()
    mw = objs['bat'].matrix_world
    return mw @ Vector((0, 0, 0)), mw @ BAT_TIP, penetration()


def score(p, tg):
    h, t, pen = measure(p)
    d = (t - h).normalized()
    err = (t - tg['tip']).length + 0.7 * (h - tg['hand']).length + 4.0 * pen
    if tg.get('flat'):
        err += 0.6 * abs(d.z)
    return (err, p, h, t, pen)


R = random.uniform
TARGETS = {
    # 준비 자세: 두 손은 오른쪽 어깨 앞, 배트는 위·뒤로 세움
    'b_stance': dict(hand=Vector((-0.2, -0.12, 1.32)), tip=Vector((-0.35, 0.25, 2.05))),
    # 맞는 순간: 손은 몸 앞 허리 높이, 배트 끝은 홈플레이트 위(앞 -Y로 뻗음), 거의 수평
    'b_contact': dict(hand=Vector((0.12, -0.3, 1.0)), tip=Vector((-0.1, -1.05, 0.9)), flat=True),
    # 마무리: 손은 왼쪽 어깨 위, 배트는 등 뒤로 넘어감
    'b_follow': dict(hand=Vector((0.25, -0.1, 1.45)), tip=Vector((-0.1, 0.45, 1.55))),
}
random.seed(7)
result = {}
for CURRENT, tg in TARGETS.items():
    base = dict(POSES[CURRENT])
    best = None
    for i in range(2500):
        p = dict(base)
        if CURRENT == 'b_stance':
            p['torso'] = (R(0, 14), 0, R(-25, 0)); p['pelvis'] = (8, 0, R(-10, 10))
        elif CURRENT == 'b_contact':
            p['pelvis'] = (8, 0, R(30, 70)); p['torso'] = (R(0, 25), 0, R(10, 50))
        else:
            p['pelvis'] = (5, 0, R(70, 100)); p['torso'] = (R(-5, 15), 0, R(40, 80))
        p['upper_arm_r'] = (R(-110, 30), R(-40, 80), R(-30, 30)); p['upper_arm_l'] = (R(-120, 10), R(-70, 30), R(-30, 30))
        p['forearm_r'] = (R(-130, 0), 0, R(-50, 50)); p['forearm_l'] = (R(-130, 0), 0, R(-50, 50))
        p['bat'] = (R(-120, 20), 0, R(-50, 50))
        p['drop'] = base.get('drop', 0) + (R(0, 0.12) if CURRENT == 'b_contact' else 0)
        cand = score(p, tg)
        if best is None or cand[0] < best[0]:
            best = cand
    # 다듬기: 가장 좋은 자세를 조금씩 흔들어 보고 더 좋아지면 바꾼다(언덕 오르기)
    for i in range(2500):
        p = dict(best[1])
        for k in ('pelvis', 'torso', 'upper_arm_r', 'upper_arm_l', 'forearm_r', 'forearm_l', 'bat'):
            if random.random() < 0.5:
                p[k] = tuple(v + random.gauss(0, 5) if (j != 1 or k.startswith('upper') or k == 'torso') else v for j, v in enumerate(p[k]))
        if CURRENT == 'b_contact':
            p['drop'] = min(0.26, max(0.05, p.get('drop', 0.12) + random.gauss(0, 0.01)))
        cand = score(p, tg)
        if cand[0] < best[0]:
            best = cand
    err, p, h, t, pen = best
    result[CURRENT] = {k: [round(x, 1) for x in v] if isinstance(v, tuple) and len(v) == 3 else v for k, v in p.items()}
    print(CURRENT, 'err %.3f pen %.3f hand %s tip %s' % (err, pen, [round(c, 2) for c in h], [round(c, 2) for c in t]))

out = sys.argv[sys.argv.index('--') + 1]
json.dump(result, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('saved', out)
