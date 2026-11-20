# ===== tools/baseball/models.py =====
# 풀카운트 야구(/baseball/)의 3D 모형을 블렌더로 직접 만드는 설계도.
# 블렌더 안에서 exec(open(이 파일).read(), G) 한 뒤 G['build_player']() · G['build_props']() · G['export_all'](폴더).
# 단위 미터, Z가 위, 선수의 앞쪽은 -Y, 선수의 오른쪽은 -X(왼쪽 +X).
#
# 선수는 관절 부품(골반 → 몸통 → 머리/윗팔 → 아랫팔 → 글러브·배트, 골반 → 허벅지 → 정강이)을
# 부모-자식으로 이은 "인형"이다. 부품 원점 = 관절 자리, 동작은 관절 회전 키프레임(초당 30칸).
# 재질 이름(bb_jersey, bb_pants, bb_cap, bb_accent, bb_sock …)으로 게임에서 팀 유니폼 색을 바꿔 입힌다.
import bpy
import math
from mathutils import Vector

SCENE_NAME = '풀카운트야구_모형'
FPS = 30
PARTS = []

# 유니폼 미리보기 색(게임에서는 팀마다 바꿈)
COLORS = {
    'bb_jersey': ('#f4f6fa', 0.7), 'bb_pants': ('#eef0f4', 0.75), 'bb_cap': ('#1d3a8a', 0.6), 'bb_accent': ('#2f6fe0', 0.55),
    'bb_sock': ('#1d3a8a', 0.8), 'bb_skin': ('#e9b996', 0.55), 'bb_hair': ('#2a1d15', 0.8), 'bb_eye': ('#1a1410', 0.3),
    'bb_shoe': ('#15171c', 0.45), 'bb_sole': ('#e8e8e8', 0.6), 'bb_belt': ('#1c1c20', 0.5), 'bb_glove': ('#8a4f22', 0.5),
    'bb_lace': ('#d9b38a', 0.6), 'bb_bat': ('#c9935a', 0.35), 'bb_batgrip': ('#202024', 0.7), 'bb_helmet': ('#1d3a8a', 0.25),
    'bb_number': ('#2f6fe0', 0.6),
}


def scene():
    sc = bpy.data.scenes.get(SCENE_NAME)
    if sc is None:
        sc = bpy.data.scenes.new(SCENE_NAME)
    if bpy.context.window is not None:
        bpy.context.window.scene = sc
    sc.render.fps = FPS
    return sc


def hex_lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def mat(name, color=None, rough=None, metal=0.0, emit=None):
    m = bpy.data.materials.get(name)
    if m is None:
        col, r = COLORS.get(name, (color or '#cccccc', rough if rough is not None else 0.6))
        if color: col = color
        if rough is not None: r = rough
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (*hex_lin(col), 1)
        b.inputs['Roughness'].default_value = r
        b.inputs['Metallic'].default_value = metal
        if emit:
            for key in ('Emission Color', 'Emission'):
                if key in b.inputs:
                    b.inputs[key].default_value = (*hex_lin(emit), 1)
                    break
            if 'Emission Strength' in b.inputs:
                b.inputs['Emission Strength'].default_value = 4.0
        m.diffuse_color = (*hex_lin(col), 1)
    return m


def _keep(o, m, smooth=True):
    o.data.materials.append(mat(m) if isinstance(m, str) else m)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    PARTS.append(o)
    return o


def ball(r, at, m, sx=1, sy=1, sz=1, seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(8, seg // 2), radius=r, location=at)
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    return _keep(o, m)


def limb(p1, p2, r1, r2, m, seg=16, caps=True):
    """p1→p2 사이 둥근 원뿔대(끝은 공 모양) — 팔·다리."""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r2, depth=d.length, location=(p1 + p2) / 2)
    o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    # 원뿔대 아래(-Z)가 p1 쪽이 되게: cone은 radius1이 -Z 끝
    _keep(o, m)
    if caps:
        ball(r1, p1, m, seg=seg)
        ball(r2, p2, m, seg=seg)
    return o


def box(size, at, m, rot=(0, 0, 0), bevel=0.0, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    if bevel > 0:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        md = o.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = 3
        bpy.ops.object.modifier_apply(modifier=md.name)
    return _keep(o, m, smooth)


def cyl(r, depth, at, m, rot=(0, 0, 0), seg=24, r2=None, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=depth, location=at, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r2, depth=depth, location=at, rotation=rot)
    o = bpy.context.active_object
    o = _keep(o, m, smooth)
    if smooth:   # 원기둥 위아래 면은 각지게 두어 이상한 그림자를 막는다
        for p in o.data.polygons:
            if abs(p.normal.z) > 0.99 and r2 is None and rot == (0, 0, 0):
                p.use_smooth = False
    return o


def join(name, pivot):
    """PARTS를 하나로 합치고 원점을 관절 자리로."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in PARTS:
        o.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    if len(PARTS) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.name = o.data.name = name
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)
    PARTS.clear()
    return o


# ---------------- 선수(관절 인형) ----------------
# 관절 자리(서 있는 기본 자세)
J = {
    'pelvis': (0, 0, 0.98), 'torso': (0, 0, 1.06), 'head': (0, 0, 1.56),
    'upper_arm_r': (-0.215, 0, 1.44), 'forearm_r': (-0.225, 0, 1.17), 'bat': (-0.228, -0.02, 0.92),
    'upper_arm_l': (0.215, 0, 1.44), 'forearm_l': (0.225, 0, 1.17), 'glove': (0.228, -0.01, 0.93),
    'thigh_r': (-0.1, 0, 0.94), 'shin_r': (-0.105, 0, 0.51),
    'thigh_l': (0.1, 0, 0.94), 'shin_l': (0.105, 0, 0.51),
}
PARENT = {
    'torso': 'pelvis', 'head': 'torso', 'upper_arm_r': 'torso', 'upper_arm_l': 'torso',
    'forearm_r': 'upper_arm_r', 'forearm_l': 'upper_arm_l', 'bat': 'forearm_r', 'glove': 'forearm_l',
    'thigh_r': 'pelvis', 'thigh_l': 'pelvis', 'shin_r': 'thigh_r', 'shin_l': 'thigh_l',
}


def part_pelvis():
    # 엉덩이: 몸통과 같은 둥근 타원 기둥(위는 허리 굵기, 아래로 조금 넓게) + 아래를 둥글게 마감
    # (사용자 지적 2026-11-20: 네모 상자 벨트·엉덩이가 판자처럼 부자연스러움 → 모두 타원으로)
    cyl(0.168, 0.2, (0, 0, 0.955), 'bb_pants', seg=32, r2=0.165)
    PARTS[-1].scale = (1, 0.68, 1)
    ball(0.15, (0, 0, 0.885), 'bb_pants', sx=0.95, sy=0.66, sz=0.3, seg=32)
    # 벨트: 허리를 감싸는 납작한 타원 고리(바지보다 아주 조금 굵게)
    cyl(0.172, 0.05, (0, 0, 1.05), 'bb_belt', seg=32)
    PARTS[-1].scale = (1, 0.69, 1)
    box((0.045, 0.012, 0.036), (0, -0.118, 1.05), 'bb_sole', bevel=0.006, smooth=True)   # 버클
    for s in (-1, 1):                                                                    # 벨트 고리(앞쪽 곡면을 따라)
        box((0.022, 0.01, 0.058), (s * 0.095, -0.1, 1.05), 'bb_pants', rot=(0, 0, -s * 0.55))


def part_torso():
    cyl(0.165, 0.42, (0, 0, 1.27), 'bb_jersey', seg=28, r2=0.205)
    o = PARTS[-1]; o.scale = (1, 0.63, 1)
    # 허리 덩어리: 허리 관절(1.06) 한가운데 둥근 유니폼 — 몸을 숙이거나 비틀어도 벨트 위 틈을 막는다
    ball(0.164, (0, 0, 1.08), 'bb_jersey', sx=1.0, sy=0.65, sz=0.6, seg=32)
    box((0.42, 0.2, 0.12), (0, 0, 1.42), 'bb_jersey', bevel=0.055, smooth=True)   # 어깨 판
    for s in (-1, 1):
        ball(0.075, (s * 0.2, 0, 1.43), 'bb_jersey')                              # 어깨
    box((0.022, 0.012, 0.36), (0, -0.131, 1.27), 'bb_accent')                     # 단추 줄
    for z in (1.16, 1.24, 1.32, 1.40):
        cyl(0.007, 0.006, (0.0, -0.137, z), 'bb_sole', rot=(math.pi / 2, 0, 0), seg=10)  # 단추
    box((0.1, 0.012, 0.075), (0.085, -0.133, 1.36), 'bb_number')                  # 가슴 로고
    box((0.07, 0.012, 0.02), (0.085, -0.135, 1.33), 'bb_accent')
    # 등번호 "1"·"7" 모양(굵은 막대로)
    box((0.03, 0.012, 0.15), (-0.045, 0.133, 1.28), 'bb_number')
    box((0.02, 0.012, 0.03), (-0.06, 0.133, 1.34), 'bb_number', rot=(0, 0.6, 0))
    box((0.09, 0.012, 0.03), (0.05, 0.133, 1.34), 'bb_number')
    box((0.03, 0.012, 0.13), (0.06, 0.133, 1.27), 'bb_number', rot=(0, -0.35, 0))
    cyl(0.062, 0.03, (0, 0, 1.49), 'bb_accent', seg=20)                           # 깃
    # 목 아래 절반(몸통에 붙음) + 관절 공: 고개를 어느 쪽으로 돌려도 공이 틈을 메운다(사용자 지적 2026-11-20)
    ball(0.06, (0, 0.005, 1.49), 'bb_skin', sx=1.0, sy=0.95, sz=0.45, seg=20)
    cyl(0.056, 0.12, (0, 0.003, 1.505), 'bb_skin', seg=24)
    ball(0.055, (0, 0.0, 1.56), 'bb_skin', seg=24)    # 목 뿌리(깃 안쪽, 머리가 돌아도 틈이 안 보이게)


def part_head():
    # 목은 머리와 같이 돈다(사용자 지적 2026-11-20: 목·얼굴 연결이 부자연스러움). 아래는 굵고 위는 턱 안으로 파고듦
    limb((0, 0.0, 1.56), (0, 0.0, 1.66), 0.054, 0.052, 'bb_skin', seg=24, caps=False)   # 목 위 절반(머리와 같이 돎)
    ball(0.105, (0, 0, 1.685), 'bb_skin', sx=0.88, sy=0.98, sz=1.14)              # 머리(아래로 살짝 길게 = 턱선)
    for s in (-1, 1):
        ball(0.026, (s * 0.094, 0.0, 1.69), 'bb_skin', sx=0.5, sy=1, sz=1.3)       # 귀
        ball(0.011, (s * 0.034, -0.094, 1.71), 'bb_eye')                           # 눈
        box((0.03, 0.006, 0.006), (s * 0.034, -0.098, 1.728), 'bb_hair', rot=(0, s * 0.15, 0))  # 눈썹
    ball(0.016, (0, -0.104, 1.685), 'bb_skin', sx=0.8, sy=1, sz=1.2)               # 코
    box((0.035, 0.005, 0.006), (0, -0.098, 1.645), 'bb_eye')                       # 입
    ball(0.103, (0, 0.012, 1.705), 'bb_hair', sx=0.92, sy=1.0, sz=0.85)            # 뒷머리
    # 모자: 반구 + 챙 + 단추 + 앞 로고
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=14, radius=0.112, location=(0, 0.005, 1.725))
    cap = bpy.context.active_object
    cap.scale = (0.94, 1.02, 0.78)
    _keep(cap, 'bb_cap')
    bpy.ops.object.mode_set(mode='EDIT')
    import bmesh
    bm = bmesh.from_edit_mesh(cap.data)
    for v in [v for v in bm.verts if v.co.z < -0.002]:
        bm.verts.remove(v)
    bmesh.update_edit_mesh(cap.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    cyl(0.112 * 0.95, 0.012, (0, 0.005, 1.725), 'bb_cap', seg=28)                 # 모자 아래 테
    PARTS[-1].scale = (0.94, 1.02, 1)
    cyl(0.085, 0.01, (0, -0.105, 1.725), 'bb_cap', seg=24)                         # 챙
    PARTS[-1].scale = (1.0, 0.85, 1); PARTS[-1].rotation_euler = (-0.12, 0, 0)
    ball(0.012, (0, 0.005, 1.815), 'bb_cap')                                       # 꼭지 단추
    box((0.05, 0.01, 0.04), (0, -0.098, 1.765), 'bb_accent', rot=(-0.35, 0, 0))    # 모자 로고


def part_upper_arm(s):
    x = s * 0.215
    limb((x, 0, 1.44), (x * 1.03, 0, 1.29), 0.064, 0.056, 'bb_jersey')            # 반소매
    cyl(0.059, 0.022, (x * 1.03, 0, 1.3), 'bb_accent', seg=20)                       # 소매 끝 줄(고리)
    limb((x * 1.03, 0, 1.29), (x * 1.045, 0, 1.17), 0.046, 0.042, 'bb_skin')


def part_forearm(s):
    x = s * 0.225
    limb((x, 0, 1.17), (x * 1.01, -0.005, 0.965), 0.041, 0.033, 'bb_skin')
    ball(0.042, (x * 1.013, -0.01, 0.925), 'bb_skin', sx=0.75, sy=1.1, sz=1.15)    # 손
    for k in range(4):                                                             # 손가락(쥔 주먹)
        ball(0.012, (x * 1.013, -0.045, 0.95 - k * 0.017), 'bb_skin')


def part_glove():
    x = 0.228
    ball(0.075, (x + 0.01, -0.03, 0.88), 'bb_glove', sx=0.55, sy=1.05, sz=1.3)
    for k in range(4):                                                             # 손가락 부분
        limb((x + 0.012, -0.06 + k * 0.03, 0.9), (x + 0.012, -0.065 + k * 0.032, 0.78), 0.02, 0.017, 'bb_glove', seg=10)
    limb((x + 0.01, -0.09, 0.93), (x + 0.005, -0.12, 0.86), 0.022, 0.018, 'bb_glove', seg=10)  # 엄지
    box((0.01, 0.1, 0.1), (x - 0.03, -0.03, 0.86), 'bb_lace', rot=(0.2, 0, 0))     # 망(웹)
    cyl(0.04, 0.03, (x + 0.005, -0.005, 0.96), 'bb_lace', seg=14)                 # 손목 끈


def part_bat():
    # 오른손에서 앞(-Y)으로 뻗은 배트: 손잡이 → 몸통 → 끝(굵어짐)
    x, z = -0.228, 0.92
    cyl(0.024, 0.02, (x, 0.07, z), 'bb_batgrip', rot=(math.pi / 2, 0, 0), seg=16)  # 손잡이 끝 마개
    cyl(0.013, 0.24, (x, -0.05, z), 'bb_batgrip', rot=(math.pi / 2, 0, 0), seg=14)  # 그립 테이프
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.014, radius2=0.033, depth=0.42, location=(x, -0.38, z), rotation=(math.pi / 2, 0, 0))
    _keep(bpy.context.active_object, 'bb_bat')
    cyl(0.033, 0.2, (x, -0.69, z), 'bb_bat', rot=(math.pi / 2, 0, 0), seg=20)
    ball(0.033, (x, -0.79, z), 'bb_bat', sy=0.5)
    box((0.004, 0.08, 0.02), (x - 0.03, -0.62, z), 'bb_batgrip')                    # 상표 자국


def part_thigh(s):
    x = s * 0.1
    limb((x, 0, 0.94), (x * 1.05, 0, 0.52), 0.082, 0.062, 'bb_pants')


def part_shin(s):
    x = s * 0.105
    limb((x, 0, 0.51), (x, 0.0, 0.42), 0.06, 0.055, 'bb_pants')                    # 무릎 아래 바지
    limb((x, 0, 0.42), (x, 0.012, 0.12), 0.05, 0.036, 'bb_sock')                   # 스타킹
    box((0.1, 0.27, 0.075), (x, -0.045, 0.06), 'bb_shoe', bevel=0.03, smooth=True) # 신발
    box((0.104, 0.274, 0.022), (x, -0.045, 0.015), 'bb_sole', bevel=0.008, smooth=True)  # 밑창
    box((0.004, 0.12, 0.03), (x - s * 0.051, -0.03, 0.07), 'bb_accent')             # 신발 옆 줄
    for k in range(3):                                                               # 스파이크
        cyl(0.008, 0.012, (x, -0.13 + k * 0.08, 0.0), 'bb_lace', seg=6, smooth=False)


BUILDERS = {
    'pelvis': part_pelvis, 'torso': part_torso, 'head': part_head,
    'upper_arm_r': lambda: part_upper_arm(-1), 'forearm_r': lambda: part_forearm(-1),
    'upper_arm_l': lambda: part_upper_arm(1), 'forearm_l': lambda: part_forearm(1),
    'thigh_r': lambda: part_thigh(-1), 'shin_r': lambda: part_shin(-1),
    'thigh_l': lambda: part_thigh(1), 'shin_l': lambda: part_shin(1),
    'glove': part_glove, 'bat': part_bat,
}


def remove_tree(name):
    o = bpy.data.objects.get(name)
    if o is None:
        return
    for c in list(o.children_recursive):
        bpy.data.objects.remove(c, do_unlink=True)
    bpy.data.objects.remove(o, do_unlink=True)


def build_player(at=(0, 0, 0)):
    scene()
    remove_tree('bb_player')
    objs = {}
    for name, fn in BUILDERS.items():
        PARTS.clear()
        fn()
        objs[name] = join('bb_player__' + name, J[name])
    root = bpy.data.objects.new('bb_player', None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.3
    bpy.context.scene.collection.objects.link(root)
    for name, o in objs.items():
        par = objs.get(PARENT.get(name)) or root
        o.parent = par
        o.matrix_parent_inverse.identity()
        pv = Vector(J[name]) - (Vector(J[PARENT[name]]) if name in PARENT else Vector((0, 0, 0)))
        o.location = pv
        o.rotation_mode = 'XYZ'
    root.location = at
    return objs


# ---------------- 동작(키프레임) ----------------
# 자세 = { 관절: (x, y, z) 도 } + 'drop': 골반 내리기(m), 'shift': 골반 옆·앞 이동 (x, y)
# 회전 방향 메모: 팔·다리(아래로 늘어진 부품) X -값 = 앞으로 들기, 몸통·골반·머리(위로 솟은 부품) X +값 = 앞으로 숙이기, 오른팔 Y +값 = 옆으로 벌리기(왼팔은 -값), Z +값 = 왼쪽으로 돌기
STAND = {k: (0, 0, 0) for k in J}

POSES = {
    'stand': {},
    'idle_a': {'upper_arm_r': (0, 4, 0), 'upper_arm_l': (0, -4, 0), 'forearm_r': (-12, 0, 0), 'forearm_l': (-12, 0, 0)},
    'idle_b': {'torso': (2, 0, 0), 'head': (-2, 0, 4), 'upper_arm_r': (-3, 5, 0), 'upper_arm_l': (-3, -5, 0), 'forearm_r': (-15, 0, 0), 'forearm_l': (-15, 0, 0)},
    'ready': {'drop': 0.14, 'pelvis': (28, 0, 0), 'torso': (10, 0, 0), 'head': (-25, 0, 0),
              'thigh_r': (-25, 0, 12), 'thigh_l': (-25, 0, -12), 'shin_r': (55, 0, 0), 'shin_l': (55, 0, 0),
              'upper_arm_r': (-35, 12, 0), 'upper_arm_l': (-35, -12, 0), 'forearm_r': (-40, 0, 0), 'forearm_l': (-40, 0, 0)},
    'crouch': {'drop': 0.5, 'pelvis': (15, 0, 0), 'torso': (5, 0, 0), 'head': (-10, 0, 0),
               'thigh_r': (-100, 0, 22), 'thigh_l': (-100, 0, -22), 'shin_r': (135, 0, 0), 'shin_l': (135, 0, 0),
               'upper_arm_r': (-30, 25, 0), 'upper_arm_l': (-55, -10, 0), 'forearm_r': (-60, 0, 0), 'forearm_l': (-50, 0, 0)},
    # 달리기(한 걸음씩)
    'run_a': {'drop': 0.03, 'pelvis': (8, 0, 0), 'torso': (8, 0, 6), 'thigh_r': (-55, 0, 0), 'shin_r': (40, 0, 0), 'thigh_l': (30, 0, 0), 'shin_l': (85, 0, 0),
              'upper_arm_r': (45, 8, 0), 'forearm_r': (-80, 0, 0), 'upper_arm_l': (-55, -8, 0), 'forearm_l': (-90, 0, 0)},
    'run_m1': {'drop': -0.04, 'pelvis': (8, 0, 0), 'torso': (8, 0, 0), 'thigh_r': (-15, 0, 0), 'shin_r': (20, 0, 0), 'thigh_l': (-5, 0, 0), 'shin_l': (100, 0, 0),
               'upper_arm_r': (10, 8, 0), 'forearm_r': (-85, 0, 0), 'upper_arm_l': (-15, -8, 0), 'forearm_l': (-85, 0, 0)},
    'run_b': {'drop': 0.03, 'pelvis': (8, 0, 0), 'torso': (8, 0, -6), 'thigh_l': (-55, 0, 0), 'shin_l': (40, 0, 0), 'thigh_r': (30, 0, 0), 'shin_r': (85, 0, 0),
              'upper_arm_l': (45, -8, 0), 'forearm_l': (-80, 0, 0), 'upper_arm_r': (-55, 8, 0), 'forearm_r': (-90, 0, 0)},
    'run_m2': {'drop': -0.04, 'pelvis': (8, 0, 0), 'torso': (8, 0, 0), 'thigh_l': (-15, 0, 0), 'shin_l': (20, 0, 0), 'thigh_r': (-5, 0, 0), 'shin_r': (100, 0, 0),
               'upper_arm_l': (10, -8, 0), 'forearm_l': (-85, 0, 0), 'upper_arm_r': (-15, 8, 0), 'forearm_r': (-85, 0, 0)},
    # 투구(오른손 투수, 홈플레이트 = 앞 -Y). 와인드업 → 다리 들기 → 내딛기 → 팔 뒤로 → 던지기 → 마무리
    'p_set': {'upper_arm_r': (-35, 18, 0), 'forearm_r': (-95, 0, -20), 'upper_arm_l': (-35, -18, 0), 'forearm_l': (-95, 0, 20), 'head': (-0, 0, 0)},
    'p_turn': {'pelvis': (-0, 0, 70), 'torso': (-0, 0, 10), 'head': (-0, 0, -75), 'upper_arm_r': (-40, 15, 0), 'forearm_r': (-100, 0, -25), 'upper_arm_l': (-40, -15, 0), 'forearm_l': (-100, 0, 25)},
    'p_lift': {'pelvis': (-0, 0, 80), 'torso': (-6, 0, 10), 'head': (-0, 0, -85), 'thigh_l': (-95, 0, -10), 'shin_l': (95, 0, 0), 'thigh_r': (0, 0, 0), 'shin_r': (8, 0, 0),
               'upper_arm_r': (-45, 15, 0), 'forearm_r': (-100, 0, -25), 'upper_arm_l': (-45, -15, 0), 'forearm_l': (-100, 0, 25)},
    'p_stride': {'drop': 0.14, 'shift': (0, -0.35), 'pelvis': (-0, 0, 60), 'torso': (-5, -8, 20), 'head': (-0, 0, -80),
                 'thigh_l': (-60, -25, 0), 'shin_l': (35, 0, 0), 'thigh_r': (25, 10, 0), 'shin_r': (40, 0, 0),
                 'upper_arm_r': (30, 70, 0), 'forearm_r': (-20, 0, 0), 'upper_arm_l': (-60, -70, 0), 'forearm_l': (-20, 0, 0)},
    'p_cock': {'drop': 0.22, 'shift': (0, -0.7), 'pelvis': (4, 0, 15), 'torso': (-0, -10, 35), 'head': (-0, 0, -40),
               'thigh_l': (-70, 0, 0), 'shin_l': (25, 0, 0), 'thigh_r': (40, 10, 0), 'shin_r': (55, 0, 0),
               'upper_arm_r': (10, 90, 0), 'forearm_r': (-95, 0, 0), 'upper_arm_l': (-80, -40, 0), 'forearm_l': (-60, 0, 0)},
    'p_release': {'drop': 0.24, 'shift': (0, -0.95), 'pelvis': (6, 0, -20), 'torso': (40, 5, -35), 'head': (-5, 0, 20),
                  'thigh_l': (-55, 0, 0), 'shin_l': (10, 0, 0), 'thigh_r': (55, 0, 0), 'shin_r': (75, 0, 0),
                  'upper_arm_r': (-150, 25, 0), 'forearm_r': (-25, 0, 0), 'upper_arm_l': (20, -30, 0), 'forearm_l': (-90, 0, 0)},
    'p_follow': {'drop': 0.2, 'shift': (0, -1.05), 'pelvis': (8, 0, -35), 'torso': (50, 0, -25), 'head': (-15, 0, 25),
                 'thigh_l': (-50, 0, 0), 'shin_l': (20, 0, 0), 'thigh_r': (-10, 0, 0), 'shin_r': (95, 0, 0),
                 'upper_arm_r': (-40, -40, 0), 'forearm_r': (-50, 0, 0), 'upper_arm_l': (10, -25, 0), 'forearm_l': (-100, 0, 0)},
    # 타격(오른손 타자, 투수는 왼쪽 +X). 자세 → 앞발 들기 → 스윙 → 마무리
    'b_stance': {'drop': 0.07, 'pelvis': (12, 0, 0), 'torso': (6, 0, -12), 'head': (-6, 0, 75),
                 'thigh_r': (-12, 6, 0), 'shin_r': (20, 0, 0), 'thigh_l': (-12, -6, 0), 'shin_l': (20, 0, 0),
                 'upper_arm_r': (-40, 55, 0), 'forearm_r': (-120, 0, 30), 'upper_arm_l': (-70, 20, 0), 'forearm_l': (-90, 0, 40), 'bat': (0, 0, 0)},
    'b_load': {'drop': 0.08, 'pelvis': (12, 0, -15), 'torso': (6, 0, -25), 'head': (-6, 0, 85), 'thigh_l': (-30, 0, 0), 'shin_l': (45, 0, 0),
               'thigh_r': (-12, 6, 0), 'shin_r': (25, 0, 0),
               'upper_arm_r': (-35, 60, 0), 'forearm_r': (-125, 0, 35), 'upper_arm_l': (-75, 30, 0), 'forearm_l': (-95, 0, 45), 'bat': (0, 0, 0)},
    'b_contact': {'drop': 0.12, 'shift': (0.12, 0), 'pelvis': (10, 0, 60), 'torso': (8, 0, 40), 'head': (-6, 0, -10),
                  'thigh_l': (-20, -12, 0), 'shin_l': (5, 0, 0), 'thigh_r': (0, 15, 0), 'shin_r': (40, 0, 0),
                  'upper_arm_r': (-75, 25, 0), 'forearm_r': (-20, 0, 0), 'upper_arm_l': (-80, -25, 0), 'forearm_l': (-10, 0, 0), 'bat': (-85, 0, 0)},
    'b_follow': {'drop': 0.1, 'shift': (0.15, 0), 'pelvis': (6, 0, 95), 'torso': (4, 0, 70), 'head': (-0, 0, -20),
                 'thigh_l': (-10, -10, 0), 'shin_l': (5, 0, 0), 'thigh_r': (10, 20, 0), 'shin_r': (50, 0, 0),
                 'upper_arm_r': (-100, -40, 0), 'forearm_r': (-70, 0, 0), 'upper_arm_l': (-110, -10, 0), 'forearm_l': (-80, 0, 0), 'bat': (-60, 0, 0)},
    # 야수 송구
    't_reach': {'pelvis': (-0, 0, 60), 'torso': (-5, -8, 25), 'head': (-0, 0, -60), 'thigh_l': (-30, -15, 0), 'shin_l': (20, 0, 0), 'thigh_r': (15, 10, 0), 'shin_r': (30, 0, 0),
                'upper_arm_r': (15, 90, 0), 'forearm_r': (-100, 0, 0), 'upper_arm_l': (-80, -30, 0), 'forearm_l': (-40, 0, 0)},
    't_throw': {'drop': 0.08, 'shift': (0, -0.3), 'pelvis': (5, 0, -15), 'torso': (35, 0, -30), 'head': (-5, 0, 15),
                'thigh_l': (-45, 0, 0), 'shin_l': (15, 0, 0), 'thigh_r': (35, 0, 0), 'shin_r': (60, 0, 0),
                'upper_arm_r': (-140, 20, 0), 'forearm_r': (-20, 0, 0), 'upper_arm_l': (20, -30, 0), 'forearm_l': (-90, 0, 0)},
    't_after': {'drop': 0.05, 'shift': (0, -0.4), 'pelvis': (5, 0, -25), 'torso': (35, 0, -15), 'head': (-10, 0, 10),
                'thigh_l': (-35, 0, 0), 'shin_l': (20, 0, 0), 'thigh_r': (-5, 0, 0), 'shin_r': (70, 0, 0),
                'upper_arm_r': (-40, -30, 0), 'forearm_r': (-40, 0, 0), 'upper_arm_l': (0, -20, 0), 'forearm_l': (-90, 0, 0)},
    # 심판 스트라이크 선언(오른팔 주먹 올리기)
    'u_call': {'upper_arm_r': (-20, 80, 0), 'forearm_r': (0, 0, -110), 'head': (-0, 0, 0), 'torso': (5, 0, 0)},
}

# 타격 3자세는 pose_search.py가 찾은 값(손·배트 끝이 목표에 맞고 팔·배트가 몸을 뚫지 않음)을 쓴다
def _load_swing():
    import json, os
    here = os.path.dirname(globals().get('__file__', '') or '')
    path = os.path.join(here, 'swing_poses.json') if here else None
    if not path or not os.path.exists(path):
        path = r'C:\Users\kmath\Desktop\클로드 코드\R01-바이브코더(Vibe Coder)\D01-프로젝트개발(Project Development)\P06-모둠게임모음(Group Game Collection)\tools\baseball\swing_poses.json'
    if not os.path.exists(path):
        return
    found = json.load(open(path, encoding='utf-8'))
    for name, pose in found.items():
        POSES[name] = {k: tuple(v) if isinstance(v, list) else v for k, v in pose.items()}
    # 앞발 들기(load) = 준비 자세의 팔 그대로 + 앞다리만 들고 허리를 조금 더 뒤로
    load = dict(POSES['b_stance'])
    load.update({'thigh_l': (-30, 0, 0), 'shin_l': (45, 0, 0), 'drop': POSES['b_stance'].get('drop', 0.07) + 0.01})
    px, py, pz = POSES['b_stance']['pelvis']
    load['pelvis'] = (px, py, pz - 15)
    POSES['b_load'] = load


_load_swing()

# 동작 = [(칸, 자세 이름)] — 30칸 = 1초. 마지막 칸 자세가 첫 칸과 같으면 반복 동작
ANIMS = {
    'idle': [(0, 'idle_a'), (24, 'idle_b'), (48, 'idle_a')],
    'ready': [(0, 'ready'), (1, 'ready')],
    'crouch': [(0, 'crouch'), (1, 'crouch')],
    'run': [(0, 'run_a'), (5, 'run_m1'), (10, 'run_b'), (15, 'run_m2'), (20, 'run_a')],
    'pitch': [(0, 'p_set'), (10, 'p_set'), (18, 'p_turn'), (30, 'p_lift'), (38, 'p_lift'), (46, 'p_stride'), (51, 'p_cock'), (54, 'p_release'), (66, 'p_follow'), (75, 'p_follow')],
    'stance': [(0, 'b_stance'), (1, 'b_stance')],
    'swing': [(0, 'b_stance'), (6, 'b_load'), (12, 'b_contact'), (15, 'b_follow'), (24, 'b_follow')],
    'throw': [(0, 'ready'), (6, 't_reach'), (12, 't_throw'), (21, 't_after')],
    'call': [(0, 'stand'), (6, 'u_call'), (24, 'u_call'), (30, 'stand')],
}
# 투구: 54칸(1.8초)에 공을 놓는다 / 스윙: 12칸(0.4초)에 맞는다 — 게임 규칙 파일과 같은 숫자
EVENTS = {'pitch_release': 54 / FPS, 'swing_contact': 12 / FPS, 'throw_release': 12 / FPS}


# 발 고정(사용자 지적 2026-11-20: 상체만 돌고 하체는 그대로) — 엉덩이(골반)가 Z로 돈 만큼 허벅지를 반대로 돌려
# 하체도 함께 비틀리되 발은 땅에 붙은 방향 그대로 있게 한다. 숫자 = 얼마나 붙어 있나(1 = 완전히, 0.6 = 뒤꿈치가 조금 돎)
PLANT = {
    'b_stance': {'thigh_l': 1, 'thigh_r': 1}, 'b_load': {'thigh_r': 1}, 'b_contact': {'thigh_l': 1, 'thigh_r': 0.55},
    'b_follow': {'thigh_l': 1, 'thigh_r': 0.4},
    'p_stride': {'thigh_r': 1}, 'p_cock': {'thigh_l': 1, 'thigh_r': 1}, 'p_release': {'thigh_l': 1, 'thigh_r': 0.6},
    'p_follow': {'thigh_l': 1}, 't_reach': {'thigh_l': 1, 'thigh_r': 1}, 't_throw': {'thigh_l': 1, 'thigh_r': 0.6},
    't_after': {'thigh_l': 1},
}


def pose_values(pose):
    p = dict(STAND)
    p.update({k: v for k, v in POSES[pose].items() if k in J})
    pz = p['pelvis'][2]
    for thigh, k in PLANT.get(pose, {}).items():
        x, y, z = p[thigh]
        p[thigh] = (x, y, z - pz * k)
    return p, POSES[pose].get('drop', 0.0), POSES[pose].get('shift', (0, 0))


def apply_pose(objs, pose):
    rots, drop, shift = pose_values(pose)
    for name, o in objs.items():
        x, y, z = rots[name]
        o.rotation_euler = (math.radians(x), math.radians(y), math.radians(z))
    pel = objs['pelvis']
    pel.location = (J['pelvis'][0] + shift[0], J['pelvis'][1] + shift[1], J['pelvis'][2] - drop)


def clear_anim(objs):
    for o in objs.values():
        o.animation_data_clear()


AIRBORNE = {'run_m1', 'run_m2'}   # 달리기 중간 자세는 두 발이 잠깐 떠도 된다


def ground_feet(objs):
    """가장 낮은 발이 땅(뿌리 높이)에 딱 닿게 골반 높이를 맞춘다 — 공중에 뜨거나 땅에 박히지 않게."""
    bpy.context.view_layer.update()
    base = objs['pelvis'].parent.matrix_world.translation.z
    low = min((o.matrix_world @ v.co).z for n in ('shin_l', 'shin_r') for o in [objs[n]] for v in o.data.vertices)
    objs['pelvis'].location.z -= (low - base)


def key_anim(objs, anim, start):
    """start 칸부터 동작 하나를 키프레임으로 찍는다."""
    for (f, pose) in ANIMS[anim]:
        apply_pose(objs, pose)
        if pose not in AIRBORNE:
            ground_feet(objs)
        for name, o in objs.items():
            o.keyframe_insert('rotation_euler', frame=start + f)
        objs['pelvis'].keyframe_insert('location', frame=start + f)
    return start + ANIMS[anim][-1][0]


def key_anim_mesh_free(objs, anim, real):
    """모양을 작은 삼각형으로 바꿔 둔 상태에서 키프레임 찍기(발 높이는 잠깐 진짜 모양으로 재기)."""
    tiny = objs['pelvis'].data
    for (f, pose) in ANIMS[anim]:
        apply_pose(objs, pose)
        if pose not in AIRBORNE:
            for n in ('shin_l', 'shin_r'):
                objs[n].data = real[n]
            ground_feet(objs)
            for n in ('shin_l', 'shin_r'):
                objs[n].data = tiny
        for name, o in objs.items():
            o.keyframe_insert('rotation_euler', frame=1 + f)
        objs['pelvis'].keyframe_insert('location', frame=1 + f)
    return ANIMS[anim][-1][0]


def player_parts():
    root = bpy.data.objects.get('bb_player')
    return {c.name.split('__')[1]: c for c in root.children_recursive}


# ---------------- 경기장 소품 ----------------
def build_props():
    scene()
    out = {}
    def make(name, fn, at):
        remove_tree('bb_' + name)
        PARTS.clear()
        fn()
        o = join('bb_' + name, (0, 0, 0))
        o.location = at
        out[name] = o
    make('base', prop_base, (4, 0, 0))
    make('home_plate', prop_home, (5, 0, 0))
    make('rubber', prop_rubber, (6, 0, 0))
    make('light_tower', prop_light_tower, (12, 6, 0))
    make('scoreboard', prop_scoreboard, (40, 10, 0))
    make('foul_pole', prop_foul_pole, (20, 6, 0))
    make('dugout', prop_dugout, (25, -6, 0))
    make('stand_block', prop_stand_block, (-14, 4, 0))
    make('crowd', prop_crowd, (-6, 0, 0))
    make('bullpen_bench', prop_bench, (4, -4, 0))
    return list(out)


def prop_base():
    box((0.381, 0.381, 0.07), (0, 0, 0.035), mat('bb_white', '#f2f2ee', 0.7), bevel=0.02, smooth=True)
    box((0.39, 0.39, 0.012), (0, 0, 0.006), mat('bb_rubberdark', '#3b3b3b', 0.9))


def prop_home():
    v = [(-0.216, 0, 0), (0.216, 0, 0), (0.216, 0.216, 0), (0, 0.432, 0), (-0.216, 0.216, 0)]
    me = bpy.data.meshes.new('home')
    top = [(x, y, 0.025) for x, y, _ in v]
    me.from_pydata(v + top, [], [(4, 3, 2, 1, 0), (5, 6, 7, 8, 9)] + [(i, (i + 1) % 5, (i + 1) % 5 + 5, i + 5) for i in range(5)])
    me.update()
    o = bpy.data.objects.new('home', me)
    bpy.context.scene.collection.objects.link(o)
    _keep(o, mat('bb_white', '#f2f2ee', 0.7), smooth=False)


def prop_rubber():
    box((0.61, 0.152, 0.03), (0, 0, 0.015), mat('bb_white', '#f2f2ee', 0.7), bevel=0.01, smooth=True)


def prop_light_tower():
    steel = mat('bb_steel', '#9aa3ad', 0.4, metal=0.8)
    cyl(0.45, 32, (0, 0, 16), steel, seg=16, r2=0.3)
    for z in range(2, 32, 3):                                              # 사다리 발판
        box((0.5, 0.05, 0.04), (0, 0.45, z), steel)
    box((8.4, 1.0, 5.4), (0, 0, 34.6), steel)                               # 등 판 틀
    panel = mat('bb_lamp', '#fff8e0', 0.2, emit='#fff4d6')
    for ix in range(6):
        for iz in range(4):
            cyl(0.5, 0.25, (-3.4 + ix * 1.36, -0.55, 32.8 + iz * 1.25), panel, rot=(math.pi / 2, 0, 0), seg=16)
    box((8.8, 0.3, 0.2), (0, -0.2, 37.4), steel)
    box((2, 2, 0.3), (0, 0, 0.15), mat('bb_concrete', '#b7b2a8', 0.9))


def prop_scoreboard():
    dark = mat('bb_frame', '#1c2733', 0.5, metal=0.4)
    for x in (-10, 10):
        box((1.2, 1.2, 10), (x, 0.5, 5), mat('bb_concrete', '#b7b2a8', 0.9))
    box((28, 1.2, 12), (0, 0, 16), dark, bevel=0.2)
    box((26, 0.1, 10), (0, -0.62, 16), mat('bb_screen', '#05080c', 0.25, emit='#000000'))  # 화면(게임에서 그림을 붙임)
    box((29, 1.6, 0.6), (0, 0, 22.3), mat('bb_accentdark', '#0f5132', 0.5))
    for x in (-12, -4, 4, 12):                                               # 위 조명
        cyl(0.35, 0.4, (x, -0.4, 22.8), mat('bb_lamp', '#fff8e0', 0.2, emit='#fff4d6'), rot=(math.pi / 2, 0, 0), seg=12)


def prop_foul_pole():
    yel = mat('bb_pole', '#ffd60a', 0.4, metal=0.2)
    cyl(0.18, 26, (0, 0, 13), yel, seg=12)
    box((0.04, 1.2, 14), (0, 0.65, 15), mat('bb_polemesh', '#ffe14d', 0.6))
    box((0.8, 0.8, 0.3), (0, 0, 0.15), mat('bb_concrete', '#b7b2a8', 0.9))


def prop_dugout():
    con = mat('bb_concrete', '#b7b2a8', 0.9)
    navy = mat('bb_dugoutroof', '#203a5c', 0.5)
    box((16, 4, 0.3), (0, 0, -1.05), con)                       # 바닥(땅보다 낮음)
    box((16, 0.3, 3.4), (0, 2.0, 0.3), con)                     # 뒷벽
    for x in (-8, 8):
        box((0.3, 4, 3.4), (x, 0, 0.3), con)                    # 옆벽
    box((16.6, 4.6, 0.25), (0, 0.1, 2.1), navy, bevel=0.05)     # 지붕
    box((16.6, 0.1, 0.5), (0, -2.2, 1.8), mat('bb_white', '#f2f2ee', 0.7))  # 지붕 앞 띠
    box((15.4, 0.6, 0.45), (0, 1.4, -0.65), mat('bb_wood', '#9c6b3f', 0.6))  # 벤치
    steel = mat('bb_steel', '#9aa3ad', 0.4, metal=0.8)
    box((16, 0.06, 0.06), (0, -1.9, 0.95), steel)               # 난간
    for x in range(-7, 8, 2):
        box((0.06, 0.06, 1.0), (x, -1.9, 0.45), steel)


def prop_stand_block():
    # 관중석 한 조각: 폭 4m, 계단 16줄(줄마다 0.85m 뒤로, 0.42m 위로), 좌석 줄당 8개. 앞(-Y)이 경기장 쪽
    con = mat('bb_concrete', '#b7b2a8', 0.9)
    seat = mat('bb_seat', '#2f6fe0', 0.45)
    seat2 = mat('bb_seat2', '#1d4fb8', 0.45)
    rows, depth, rise, width = 16, 0.85, 0.42, 4.0
    box((width, 1.0, 1.2), (0, -0.5, 0.6), con)                                  # 앞 벽
    box((width, 0.08, 0.9), (0, -1.0, 1.65), mat('bb_glass', '#bcd7e6', 0.05))   # 앞 유리 난간
    for r in range(rows):
        y, z = r * depth, 1.2 + r * rise
        box((width, depth, z), (0, y + depth / 2, z / 2), con)                   # 계단 덩어리
        for s in range(7):
            x = -width / 2 + 0.25 + 0.5 * s
            m = seat if (r + s) % 5 else seat2
            box((0.42, 0.38, 0.06), (x, y + 0.45, z + 0.4), m)      # 앉는 판
            box((0.42, 0.06, 0.38), (x, y + 0.66, z + 0.62), m, rot=(-0.15, 0, 0))  # 등받이
            box((0.06, 0.06, 0.4), (x, y + 0.5, z + 0.2), mat('bb_steel', '#9aa3ad', 0.4, metal=0.8))
        box((0.5, depth, 0.05), (width / 2 - 0.25, y + depth / 2, z + 0.02), mat('bb_stairs', '#d8d3c8', 0.85))  # 통로 계단
    box((width, 0.4, 2.0), (0, rows * depth + 0.2, 1.2 + rows * rise), con)     # 뒷벽


def prop_crowd():
    # 앉은 관중 한 명(게임에서 옷 색을 사람마다 다르게 칠함). 'crowd' 몸 = 흰색(색 입히기용)
    shirt = mat('bb_crowdshirt', '#ffffff', 0.8)
    skin = mat('bb_crowdskin', '#e2b08f', 0.6)
    pants = mat('bb_crowdpants', '#3a4250', 0.8)
    box((0.36, 0.22, 0.42), (0, 0, 0.62), shirt, bevel=0.06, smooth=True)
    for s in (-1, 1):
        limb((s * 0.19, 0, 0.8), (s * 0.21, -0.12, 0.6), 0.05, 0.045, shirt, seg=8)
        limb((s * 0.09, -0.02, 0.42), (s * 0.09, -0.32, 0.42), 0.065, 0.06, pants, seg=8)
        limb((s * 0.09, -0.32, 0.42), (s * 0.09, -0.34, 0.05), 0.055, 0.045, pants, seg=8)
    ball(0.1, (0, 0, 0.95), skin, seg=12, sz=1.1)
    ball(0.1, (0, 0.015, 0.99), mat('bb_hair', '#2a1d15', 0.8), seg=12, sz=0.8)


def prop_bench():
    box((3, 0.45, 0.08), (0, 0, 0.45), mat('bb_wood', '#9c6b3f', 0.6), bevel=0.02, smooth=True)
    for x in (-1.3, 1.3):
        box((0.08, 0.4, 0.45), (x, 0, 0.22), mat('bb_steel', '#9aa3ad', 0.4, metal=0.8))


# ---------------- 내보내기 ----------------
def export_glb(objs, path, animate=False, frames=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    sc = bpy.context.scene
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_materials='EXPORT', export_animations=animate)
    if animate:
        sc.frame_start, sc.frame_end = frames
        kw.update(export_animation_mode='SCENE', export_force_sampling=True, export_frame_range=True)
        # 안 움직이는 관절·자세도 지우지 않는다(가만히 있는 자세 파일이 비거나, 동작을 바꿀 때 관절이 굳지 않게)
        for opt in ('export_optimize_animation_size', 'export_optimize_animation_keep_anim_armature', 'export_optimize_animation_keep_anim_object'):
            kw[opt] = opt != 'export_optimize_animation_size'
    kw['use_active_scene'] = True       # 지금 장면만(다른 장면에서 선택된 물체가 딸려 들어가지 않게)
    while True:
        try:
            bpy.ops.export_scene.gltf(**kw)
            break
        except TypeError as e:          # 이 블렌더에 없는 설정 이름은 빼고 다시
            bad = [k for k in list(kw) if k in str(e)]
            if not bad:
                raise
            for k in bad:
                kw.pop(k)
            print('설정 뺌:', bad)


def export_all(folder):
    import os
    os.makedirs(folder, exist_ok=True)
    out = []
    # 선수: 모양 파일 1개 + 동작마다 파일 1개(같은 관절 이름이라 게임에서 동작만 골라 붙인다)
    root = bpy.data.objects.get('bb_player')
    objs = player_parts()
    keep = root.location.copy()
    root.location = (0, 0, 0)
    tree = [root] + list(root.children_recursive)
    clear_anim(objs)
    apply_pose(objs, 'stand')
    export_glb(tree, os.path.join(folder, 'player.glb'))
    out.append('player')
    # 동작 파일에는 모양이 필요 없다: 잠깐 부품 모양을 아주 작은 삼각형으로 바꿔치기해 동작만 담는다(파일 크기 ↓)
    tiny = bpy.data.meshes.get('bb_tiny') or bpy.data.meshes.new('bb_tiny')
    if not tiny.vertices:
        tiny.from_pydata([(0, 0, 0), (0.001, 0, 0), (0, 0.001, 0)], [], [(0, 1, 2)])
    real = {n: o.data for n, o in objs.items()}
    for o in objs.values():
        o.data = tiny
    try:
        for anim in ANIMS:
            clear_anim(objs)
            end = key_anim_mesh_free(objs, anim, real)
            export_glb(tree, os.path.join(folder, 'anim_' + anim + '.glb'), animate=True, frames=(1, 1 + end))
            out.append('anim_' + anim)
    finally:
        for n, o in objs.items():
            o.data = real[n]
    clear_anim(objs)
    apply_pose(objs, 'stand')
    root.location = keep
    for name in ('base', 'home_plate', 'rubber', 'light_tower', 'scoreboard', 'foul_pole', 'dugout', 'stand_block', 'crowd', 'bullpen_bench'):
        o = bpy.data.objects.get('bb_' + name)
        if o is None:
            continue
        at = o.location.copy()
        o.location = (0, 0, 0)
        export_glb([o], os.path.join(folder, name + '.glb'))
        o.location = at
        out.append(name)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 250
    return ['%s %.0fKB' % (n, os.path.getsize(os.path.join(folder, n + '.glb')) / 1024) for n in out]


def preview_anim(anim):
    """블렌더 화면에서 동작 하나를 재생해 보기."""
    objs = player_parts()
    clear_anim(objs)
    end = key_anim(objs, anim, 1)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, 1 + end
    return end
