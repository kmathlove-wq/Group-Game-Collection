# ===== tools/gulp-hole/models.py =====
# 꿀꺽 구멍(/gulp-hole/)의 3D 모형을 블렌더로 직접 만드는 설계도.
# 블렌더 안에서 exec(open(이 파일).read()) 한 뒤 build('car_red') 처럼 하나씩 만들고,
# export_all(폴더) 로 public/gulp-hole/models/<이름>.glb 를 내보낸다.
# 단위는 미터(1 = 1m), 블렌더는 Z가 위, 앞쪽은 -Y, 탈것은 +X 방향으로 달린다(게임에서 +X).
# 모든 부품은 색깔 재료로 만든 뒤 하나로 합치고, 재료 색을 "꼭짓점 색"(Color Attribute)으로 옮겨
# 모형 하나 = 재료 하나가 되게 한다(게임에서 한 번에 그리기 좋게).
import bpy
import math

SCENE_NAME = '꿀꺽구멍_모형'
PARTS = []
# 움직이는 모형(사람·탈것)은 부품을 "무리"(group)로 나눠 따로 합친다.
# 무리마다 관절 자리(pivot)가 원점이 되고, 블렌더 키프레임 동작이 그 관절을 돌린다.
GROUPS = {}      # 무리 이름 -> 부품 목록
PIVOTS = {}      # 무리 이름 -> 관절 자리
CUR = [None]     # 지금 부품을 넣는 무리(None = 무리 없음)
ANIM_FRAMES = 24  # 동작 한 바퀴 = 24칸(1초)


def grp(name, pivot=(0, 0, 0)):
    """지금부터 만드는 부품을 name 무리에 넣는다(관절 자리 pivot)."""
    CUR[0] = name
    if name is not None:
        GROUPS.setdefault(name, [])
        PIVOTS[name] = pivot


def scene():
    sc = bpy.data.scenes.get(SCENE_NAME)
    if sc is None:
        sc = bpy.data.scenes.new(SCENE_NAME)
        sc.unit_settings.system = 'METRIC'
    if bpy.context.window is not None:
        bpy.context.window.scene = sc
    return sc


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mat(h):
    name = 'gh_' + h.lstrip('#').lower()
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        rgb = hex_rgb(h)
        m.diffuse_color = (*[srgb_to_linear(c) for c in rgb], 1)
        m['srgb'] = rgb
    return m


def _keep(o, col):
    o.data.materials.append(mat(col))
    (GROUPS[CUR[0]] if CUR[0] is not None else PARTS).append(o)
    return o


def box(sx, sy, sz, x=0, y=0, z=0, col='#ffffff', rx=0, ry=0, rz=0):
    """z = 바닥 높이(회전이 없을 때). 크기 sx×sy×sz."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2), rotation=(rx, ry, rz))
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    return _keep(o, col)


def boxc(sx, sy, sz, x=0, y=0, z=0, col='#ffffff', rx=0, ry=0, rz=0):
    """z = 가운데 높이(기울인 부품용)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z), rotation=(rx, ry, rz))
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    return _keep(o, col)


def cyl(r, h, x=0, y=0, z=0, col='#ffffff', n=12, r2=None):
    """세운 원기둥(r2를 주면 원뿔대). z = 바닥."""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=h, location=(x, y, z + h / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r2, depth=h, location=(x, y, z + h / 2))
    return _keep(bpy.context.active_object, col)


def cylc(r, h, x, y, z, col, n=12, rx=0, ry=0, rz=0):
    """가운데 기준 원기둥(바퀴·가로 막대)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=h, location=(x, y, z), rotation=(rx, ry, rz))
    return _keep(bpy.context.active_object, col)


def ball(r, x, y, z, col, sub=1, sx=1, sy=1, sz=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=(x, y, z))
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    return _keep(o, col)


def poly(verts, faces, col):
    me = bpy.data.meshes.new('gh_part')
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new('gh_part', me)
    bpy.context.scene.collection.objects.link(o)
    return _keep(o, col)


def gable_roof(sx, sy, z, h, col, over=0.35):
    """박공지붕(삼각 지붕): X 방향으로 길게, 용마루가 X축."""
    ax, ay = sx / 2 + over, sy / 2 + over
    v = [(-ax, -ay, z), (ax, -ay, z), (ax, ay, z), (-ax, ay, z), (-ax, 0, z + h), (ax, 0, z + h)]
    f = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]
    return poly(v, f, col)


def wheel(x, y, z, r=0.34, w=0.24):
    """바퀴 하나 = 따로 도는 무리 wheelN(관절 = 바퀴 가운데). 끝나면 다시 body 무리로."""
    k = sum(1 for g in GROUPS if g.startswith('wheel'))
    grp('wheel%d' % k, (x, y, z))
    cylc(r, w, x, y, z, '#1d1f24', n=14, rx=math.pi / 2)
    cylc(r * 0.55, w + 0.02, x, y, z, '#b9bec7', n=10, rx=math.pi / 2)
    cylc(r * 0.18, w + 0.04, x, y, z, '#55595f', n=6, rx=math.pi / 2)
    box(r * 0.9, w + 0.05, 0.06, x, y, z - 0.03, '#e9ecef')   # 굴러가는 게 보이게 휠에 흰 막대
    grp('body', (0, 0, 0))


def window(x, y, z, w, h, face, frame='#f4f1ea', glass='#7fb6d9', depth=0.06):
    """face: 'front'(-Y) 'back'(+Y) 'left'(-X) 'right'(+X) 벽 위 창문(틀 + 유리 + 가운데 창살)."""
    t = depth
    if face in ('front', 'back'):
        s = -1 if face == 'front' else 1
        box(w + 0.12, t, h + 0.12, x, y + s * t / 2, z - 0.06, frame)
        box(w, t, h, x, y + s * t, z, glass)
        box(0.05, t, h, x, y + s * t * 1.5, z, frame)
        box(w, t, 0.05, x, y + s * t * 1.5, z + h / 2 - 0.025, frame)
    else:
        s = -1 if face == 'left' else 1
        box(t, w + 0.12, h + 0.12, x + s * t / 2, y, z - 0.06, frame)
        box(t, w, h, x + s * t, y, z, glass)
        box(t, 0.05, h, x + s * t * 1.5, y, z, frame)
        box(t, w, 0.05, x + s * t * 1.5, y, z + h / 2 - 0.025, frame)


# ---------- 작은 것들 ----------

def m_person(shirt, pants, hair, skin='#f2c7a5', shoe='#2b2b33'):
    for side, sx in (('l', -0.1), ('r', 0.1)):
        grp('leg_' + side, (sx, 0, 0.88))                  # 관절 = 엉덩이
        box(0.16, 0.18, 0.8, sx, 0, 0.08, pants)          # 다리
        box(0.18, 0.27, 0.09, sx, -0.04, 0, shoe)          # 신발
    for side, sx in (('l', -0.27), ('r', 0.27)):
        grp('arm_' + side, (sx, 0, 1.44))                  # 관절 = 어깨
        box(0.12, 0.14, 0.5, sx, 0, 0.98, shirt)           # 팔
        box(0.1, 0.12, 0.12, sx, 0, 0.86, skin)            # 손
    grp('body', (0, 0, 0.88))
    box(0.42, 0.24, 0.62, 0, 0, 0.86, shirt)               # 몸통
    box(0.44, 0.26, 0.08, 0, 0, 0.84, pants)               # 허리띠 자리
    box(0.12, 0.12, 0.08, 0, 0, 1.48, skin)                # 목
    box(0.3, 0.28, 0.3, 0, 0, 1.54, skin)                  # 머리
    box(0.05, 0.02, 0.06, -0.07, -0.145, 1.66, '#1b1b1f')  # 눈
    box(0.05, 0.02, 0.06, 0.07, -0.145, 1.66, '#1b1b1f')
    box(0.08, 0.02, 0.025, 0, -0.145, 1.59, '#c96f6f')     # 입
    box(0.32, 0.3, 0.09, 0, 0.005, 1.8, hair)              # 머리카락 윗부분
    box(0.32, 0.08, 0.22, 0, 0.12, 1.6, hair)              # 뒷머리


def m_cone():
    box(0.46, 0.46, 0.04, 0, 0, 0, '#d9480f')
    cyl(0.18, 0.7, 0, 0, 0.04, '#ff6b1a', n=14, r2=0.035)
    cyl(0.142, 0.1, 0, 0, 0.3, '#ffffff', n=14, r2=0.125)
    cyl(0.1, 0.08, 0, 0, 0.5, '#ffffff', n=14, r2=0.088)


def m_hydrant():
    cyl(0.2, 0.08, 0, 0, 0, '#9a1d1d', n=12)
    cyl(0.14, 0.62, 0, 0, 0.08, '#d62828', n=12)
    cyl(0.165, 0.06, 0, 0, 0.52, '#b51f1f', n=12)
    ball(0.15, 0, 0, 0.7, '#d62828', sub=2, sz=0.75)
    cyl(0.05, 0.08, 0, 0, 0.78, '#c0c4cc', n=6)
    for a in (0, math.pi):
        cylc(0.06, 0.16, math.cos(a) * 0.17, 0, 0.45, '#d62828', n=10, ry=math.pi / 2)
        cylc(0.07, 0.04, math.cos(a) * 0.26, 0, 0.45, '#c0c4cc', n=6, ry=math.pi / 2)
    cylc(0.08, 0.14, 0, -0.17, 0.32, '#d62828', n=10, rx=math.pi / 2)
    cylc(0.09, 0.04, 0, -0.25, 0.32, '#c0c4cc', n=6, rx=math.pi / 2)
    box(0.3, 0.02, 0.06, 0, -0.142, 0.62, '#ffffff')       # 흰 띠


def m_trashcan():
    cyl(0.27, 0.86, 0, 0, 0, '#3f6d4e', n=16)
    for z in (0.15, 0.6):
        cyl(0.285, 0.06, 0, 0, z, '#2f5440', n=16)
    cyl(0.3, 0.07, 0, 0, 0.86, '#2a3b33', n=16)
    cyl(0.22, 0.08, 0, 0, 0.93, '#2a3b33', n=16, r2=0.12)
    box(0.24, 0.03, 0.08, 0, -0.27, 0.72, '#14201a')      # 넣는 구멍
    box(0.16, 0.02, 0.16, 0, -0.275, 0.36, '#e9f5ec')     # 재활용 표시 판
    box(0.08, 0.025, 0.08, 0, -0.282, 0.4, '#3f6d4e')


def m_mailbox():
    for sx in (-0.17, 0.17):
        box(0.07, 0.07, 0.3, sx, 0, 0, '#2b2b33')         # 다리
    box(0.5, 0.42, 0.85, 0, 0, 0.3, '#e03131')            # 몸통
    cylc(0.21, 0.5, 0, 0, 1.15, '#e03131', n=16, ry=math.pi / 2)   # 둥근 지붕
    box(0.52, 0.44, 0.04, 0, 0, 0.3, '#b02525')
    box(0.3, 0.03, 0.04, 0, -0.215, 0.98, '#1b1b1f')      # 편지 넣는 곳
    box(0.34, 0.025, 0.2, 0, -0.215, 0.55, '#ffffff')     # 흰 안내판
    box(0.26, 0.03, 0.04, 0, -0.222, 0.67, '#e03131')     # 안내판 무늬
    box(0.06, 0.03, 0.1, 0, -0.222, 0.58, '#e03131')


def m_bench():
    wood, iron = '#b7793f', '#33363d'
    for sx in (-0.75, 0.75):
        box(0.06, 0.55, 0.06, sx, 0, 0.4, iron)            # 앉는 판 받침
        box(0.06, 0.06, 0.42, sx, -0.22, 0, iron)          # 앞다리
        box(0.06, 0.06, 0.88, sx, 0.24, 0, iron)           # 뒷다리(등받이까지)
        box(0.06, 0.4, 0.06, sx, 0, 0.08, iron)            # 다리 사이 가로대
    for i, y in enumerate((-0.2, -0.05, 0.1)):
        box(1.8, 0.13, 0.05, 0, y, 0.46, '#c4864a' if i % 2 else wood)
    for z in (0.62, 0.78):
        boxc(1.8, 0.04, 0.12, 0, 0.27, z, wood, rx=-0.18)
    box(0.06, 0.4, 0.05, -0.75, -0.03, 0.62, iron)         # 팔걸이
    box(0.06, 0.4, 0.05, 0.75, -0.03, 0.62, iron)


def m_lamp():
    dark = '#2d3138'
    cyl(0.2, 0.3, 0, 0, 0, dark, n=10, r2=0.13)
    cyl(0.075, 4.2, 0, 0, 0.3, '#3a3f47', n=10, r2=0.055)
    cyl(0.09, 0.12, 0, 0, 1.2, dark, n=10)                # 장식 띠
    box(1.0, 0.08, 0.08, 0.45, 0, 4.35, dark)              # 팔
    boxc(0.5, 0.05, 0.05, 0.25, 0, 4.18, dark, ry=0.7)     # 받침대
    box(0.5, 0.28, 0.12, 0.95, 0, 4.3, dark)               # 등 머리
    box(0.42, 0.22, 0.03, 0.95, 0, 4.28, '#fff3b0')       # 불빛
    box(0.36, 0.02, 0.5, 0, -0.07, 2.4, '#3d7bd9')        # 깃발 현수막
    box(0.36, 0.02, 0.1, 0, -0.072, 2.6, '#ffffff')


def m_tree_round():
    cyl(0.26, 2.0, 0, 0, 0, '#7a4e2d', n=8, r2=0.16)
    boxc(0.1, 0.1, 0.8, 0.25, 0, 1.8, '#7a4e2d', ry=0.7)   # 가지
    ball(1.25, 0, 0, 3.3, '#4c9a3d', sub=1, sz=0.9)
    ball(0.9, 0.85, 0.3, 2.9, '#5bb048', sub=1)
    ball(0.85, -0.75, -0.35, 3.0, '#438a35', sub=1)
    ball(0.8, 0.1, 0.6, 4.2, '#62bd4f', sub=1)
    ball(0.7, -0.3, -0.7, 3.9, '#56a845', sub=1)
    ball(0.12, 0.7, -0.75, 3.3, '#e03131', sub=1)          # 열매
    ball(0.12, -0.9, 0.4, 3.6, '#e03131', sub=1)
    ball(0.12, 0.3, -0.9, 4.1, '#e03131', sub=1)


def m_tree_pine():
    cyl(0.22, 1.2, 0, 0, 0, '#6b4226', n=8, r2=0.16)
    cyl(1.5, 1.9, 0, 0, 1.0, '#2f7d4a', n=9, r2=0.45)
    cyl(1.2, 1.7, 0, 0, 2.3, '#38905a', n=9, r2=0.35)
    cyl(0.9, 1.5, 0, 0, 3.5, '#2f7d4a', n=9, r2=0.22)
    cyl(0.55, 1.4, 0, 0, 4.6, '#43a166', n=9, r2=0.02)
    cyl(1.55, 0.12, 0, 0, 1.0, '#256b3c', n=9, r2=1.45)    # 아래 가지 끝(살짝 어둡게)
    for a in range(5):                                     # 솔방울
        t = a * 2 * math.pi / 5 + 0.3
        ball(0.11, math.cos(t) * 1.0, math.sin(t) * 1.0, 1.6 + (a % 2) * 1.1, '#8a5a2b', sub=1, sz=1.4)


def m_fountain():
    stone, water = '#c9c3b8', '#5fb4e8'
    cyl(2.3, 0.15, 0, 0, 0, stone, n=8)                    # 바닥 돌판
    cyl(2.1, 0.32, 0, 0, 0.1, water, n=8)                  # 물(테두리보다 살짝 낮게)
    for i in range(8):                                     # 팔각 돌 테두리(가운데가 보이게 벽만)
        a = i * math.pi / 4 + math.pi / 8
        boxc(1.85, 0.3, 0.55, math.cos(a) * 2.1, math.sin(a) * 2.1, 0.3, '#ddd8ce', rz=a + math.pi / 2)
    cyl(0.35, 1.3, 0, 0, 0.5, stone, n=8)
    cyl(1.0, 0.25, 0, 0, 1.5, stone, n=12, r2=0.75)
    cyl(0.9, 0.12, 0, 0, 1.68, water, n=12)
    cyl(0.18, 0.6, 0, 0, 1.75, stone, n=8)
    cyl(0.3, 0.9, 0, 0, 2.2, '#9fd6f5', n=8, r2=0.05)      # 솟는 물줄기
    for i in range(8):
        a = i * math.pi / 4
        ball(0.12, math.cos(a) * 0.95, math.sin(a) * 0.95, 1.2, '#9fd6f5', sub=1, sz=2.2)  # 떨어지는 물


# ---------- 탈것 ----------

def m_car(body, dark=None):
    dark = dark or body
    glass = '#2c3e55'
    box(4.2, 1.82, 0.62, 0, 0, 0.32, body)                 # 아래 몸체
    box(4.26, 1.86, 0.18, 0, 0, 0.26, '#3a3d44')           # 범퍼 띠
    box(1.2, 1.78, 0.08, 1.3, 0, 0.94, body)               # 보닛 윗면 살짝
    # 실내(유리) + 지붕 + 기둥
    box(2.1, 1.62, 0.56, -0.35, 0, 0.94, glass)
    box(2.0, 1.66, 0.08, -0.4, 0, 1.5, dark)
    for x in (-1.35, 0.6):
        for y in (-0.79, 0.79):
            box(0.1, 0.06, 0.56, x, y, 0.94, dark)
    box(0.08, 1.64, 0.5, 0.72, 0, 0.94, glass)             # 앞 유리
    for y in (-0.84, 0.84):                                # 문 손잡이·사이드미러
        box(0.18, 0.05, 0.04, -0.2, y * 1.08, 0.82, '#c7ccd4')
        box(0.12, 0.2, 0.1, 0.55, y * 1.12, 1.0, dark)
    box(0.04, 1.86, 0.02, -0.25, 0, 0.62, '#2a2c31')        # 문틈
    # 앞: 전조등·그릴·번호판
    for y in (-0.62, 0.62):
        box(0.06, 0.38, 0.16, 2.1, y, 0.72, '#fff8d6')
        box(0.06, 0.34, 0.12, -2.1, y, 0.72, '#e03131')     # 뒤 미등
    box(0.06, 0.7, 0.18, 2.1, 0, 0.54, '#1e2025')
    box(0.05, 0.48, 0.13, 2.14, 0, 0.3, '#f5f5f5')
    box(0.05, 0.48, 0.13, -2.14, 0, 0.42, '#f5f5f5')
    for x in (1.3, -1.3):
        for y in (-0.86, 0.86):
            wheel(x, y, 0.34)


def m_truck():
    cab, box_col = '#2f6fd6', '#f4f4f0'
    box(6.6, 2.1, 0.35, 0, 0, 0.45, '#2b2d33')             # 차대
    box(1.9, 2.3, 1.55, 2.25, 0, 0.75, cab)                # 운전석
    box(1.6, 2.2, 0.08, 2.15, 0, 2.3, '#255bb0')
    box(0.08, 2.0, 0.7, 3.21, 0, 1.45, '#2c3e55')          # 앞 유리
    for y in (-1.16, 1.16):
        box(0.9, 0.06, 0.6, 2.35, y, 1.5, '#2c3e55')       # 옆 유리
        box(0.12, 0.25, 0.35, 2.9, y * 1.12, 1.55, '#2b2d33')
    box(0.08, 1.2, 0.35, 3.21, 0, 0.85, '#1e2025')         # 그릴
    for y in (-0.82, 0.82):
        box(0.06, 0.35, 0.2, 3.22, y, 0.95, '#fff8d6')
        box(0.06, 0.3, 0.16, -3.32, y, 0.7, '#e03131')
    box(4.5, 2.4, 2.45, -0.95, 0, 0.8, box_col)            # 짐칸
    box(4.52, 2.42, 0.35, -0.95, 0, 1.75, '#ffb000')       # 회사 띠
    box(1.4, 2.43, 0.25, -0.2, 0, 2.05, '#2f6fd6')         # 로고 블록
    box(0.06, 2.2, 2.2, -3.22, 0, 0.9, '#d9d9d4')          # 뒷문
    box(0.04, 0.05, 2.2, -3.26, 0, 0.9, '#9aa0a8')
    for x in (2.2, -1.6, -2.6):
        for y in (-1.02, 1.02):
            wheel(x, y, 0.45, r=0.45, w=0.3)


def m_bus():
    body, glass = '#2fa04d', '#24384f'
    box(10.0, 2.5, 0.9, 0, 0, 0.35, body)
    box(10.0, 2.5, 1.0, 0, 0, 1.25, glass)                 # 창문 띠
    box(10.0, 2.5, 0.75, 0, 0, 2.25, body)
    box(10.04, 2.54, 0.12, 0, 0, 1.13, '#f5f5f0')          # 흰 줄
    for x in [-4.0 + i * 1.33 for i in range(7)]:
        for y in (-1.26, 1.26):
            box(0.1, 0.04, 1.0, x, y, 1.25, body)          # 창틀
    box(0.08, 2.3, 1.5, 5.0, 0, 0.95, glass)               # 큰 앞 유리
    box(0.1, 1.9, 0.3, 5.02, 0, 2.6, '#1a1a1a')            # 행선지 판
    box(0.1, 1.5, 0.16, 5.06, 0, 2.67, '#ffa94d')
    for y in (-0.95, 0.95):
        box(0.08, 0.32, 0.18, 5.02, y, 0.55, '#fff8d6')
        box(0.08, 0.3, 0.2, -5.02, y, 0.65, '#e03131')
    box(1.0, 0.06, 2.0, 3.6, -1.27, 0.35, '#3a4a5a')       # 앞문
    box(1.0, 0.06, 2.0, -0.6, -1.27, 0.35, '#3a4a5a')      # 뒷문
    box(0.04, 0.07, 2.0, 3.6, -1.29, 0.35, '#9aa0a8')
    box(0.04, 0.07, 2.0, -0.6, -1.29, 0.35, '#9aa0a8')
    box(2.4, 1.6, 0.35, -1.5, 0, 3.0, '#d8dde3')           # 지붕 에어컨
    box(1.0, 0.04, 0.3, -2.8, -1.27, 2.35, '#ffffff')      # 번호 표시
    for x in (3.4, -3.3):
        for y in (-1.12, 1.12):
            wheel(x, y, 0.5, r=0.5, w=0.32)


# ---------- 건물 ----------

def m_house(wall='#f3e3c3', roof='#b5432f'):
    box(6.2, 6.0, 0.25, 0, 0, 0, '#a8a29a')                # 기초
    box(6.0, 5.8, 3.2, 0, 0, 0.25, wall)
    gable_roof(6.0, 5.8, 3.45, 2.3, roof)
    box(0.7, 0.7, 1.9, 1.7, 1.2, 3.8, '#8c5a3c')           # 굴뚝
    box(0.85, 0.85, 0.15, 1.7, 1.2, 5.7, '#6e4630')
    # 앞(-Y): 문, 창 2개, 계단, 차양
    box(1.1, 0.08, 2.0, 0, -2.92, 0.25, '#7a4a2b')
    box(0.08, 0.04, 0.08, 0.35, -2.98, 1.2, '#f2c94c')
    box(1.6, 0.8, 0.2, 0, -3.3, 0, '#b8b2a8')
    boxc(1.7, 0.9, 0.08, 0, -3.25, 2.45, roof, rx=0.25)
    window(-1.9, -2.9, 1.2, 1.1, 1.1, 'front')
    window(1.9, -2.9, 1.2, 1.1, 1.1, 'front')
    window(-1.5, 2.9, 1.2, 1.1, 1.1, 'back')
    window(1.5, 2.9, 1.2, 1.1, 1.1, 'back')
    window(-3.0, 0, 1.2, 1.4, 1.1, 'left')
    window(3.0, 0, 1.2, 1.4, 1.1, 'right')
    for x in (-1.9, 1.9):                                  # 화분
        box(1.1, 0.3, 0.25, x, -3.1, 0.95, '#8c5a3c')
        box(1.0, 0.25, 0.15, x, -3.1, 1.2, '#e64980')
    # 다락 창(지붕 옆면 삼각형 쪽)
    window(-3.0, 0, 3.9, 0.7, 0.7, 'left')
    window(3.0, 0, 3.9, 0.7, 0.7, 'right')


def m_shop(wall='#e9ecef', awn='#e03131', sign='#1971c2'):
    box(9.0, 7.0, 4.4, 0, 0, 0, wall)
    box(9.2, 7.2, 0.3, 0, 0, 4.4, '#ced4da')               # 지붕 테두리
    box(8.4, 0.1, 2.4, 0, -3.5, 0.3, '#3c4a5c')            # 쇼윈도 틀
    for x in (-2.9, 0.9, 2.9):
        box(1.8, 0.12, 2.2, x, -3.52, 0.4, '#8ec5e8')       # 큰 유리
    box(1.4, 0.12, 2.3, -1.0, -3.53, 0.3, '#5c7a99')       # 유리문
    box(0.06, 0.16, 0.5, -0.5, -3.58, 1.2, '#dee2e6')
    # 줄무늬 차양
    n = 10
    for i in range(n):
        x = -4.3 + (i + 0.5) * 8.6 / n
        boxc(8.6 / n, 1.3, 0.08, x, -4.05, 2.95, awn if i % 2 == 0 else '#ffffff', rx=0.38)
    box(8.6, 0.1, 0.25, 0, -4.68, 2.6, awn)
    # 간판(글자 모양 블록)
    box(6.0, 0.25, 1.0, 0, -3.62, 3.25, sign)
    for i, w in enumerate((0.5, 0.7, 0.5, 0.6, 0.5)):
        box(w, 0.06, 0.55, -2.0 + i * 1.0, -3.77, 3.47, '#ffffff')
    # 지붕 위
    box(1.6, 1.2, 0.9, 2.5, 1.5, 4.7, '#adb5bd')
    box(1.2, 0.05, 0.6, 2.5, 0.88, 4.85, '#868e96')
    box(1.0, 1.0, 0.5, -2.8, 1.8, 4.7, '#adb5bd')
    for y in (-1.5, 1.5):
        window(-4.5, y, 1.5, 1.2, 1.3, 'left')
        window(4.5, y, 1.5, 1.2, 1.3, 'right')
    window(-2.5, 3.5, 1.5, 1.4, 1.3, 'back')
    window(2.5, 3.5, 1.5, 1.4, 1.3, 'back')


def m_apartment(wall='#f1ede4', accent='#d9822b'):
    floors, fh = 6, 3.0
    box(10.0, 10.0, 0.4, 0, 0, 0, '#9c968c')
    box(9.6, 9.6, floors * fh, 0, 0, 0.4, wall)
    box(10.0, 10.0, 0.6, 0, 0, 0.4 + floors * fh, '#d6d0c4')   # 옥상 난간
    box(9.0, 9.0, 0.1, 0, 0, 0.45 + floors * fh, '#8d8a85')    # 옥상 바닥
    box(2.4, 2.0, 2.2, 2.6, 2.6, 0.4 + floors * fh, '#c9c3b8') # 계단실
    cyl(0.9, 1.6, -2.8, 2.6, 0.5 + floors * fh, '#4dabf7', n=12)  # 물탱크
    cyl(0.95, 0.12, -2.8, 2.6, 2.1 + floors * fh, '#339af0', n=12)
    box(1.6, 0.2, 2.6, 0, -4.9, 0.4, '#5c4033')                # 1층 현관
    box(2.4, 1.2, 0.15, 0, -5.2, 3.0, accent)                  # 현관 지붕
    box(1.5, 0.05, 0.5, 0, -5.22, 3.2, '#ffffff')              # 동 번호판
    box(0.6, 0.03, 0.3, 0, -5.26, 3.3, accent)
    for f in range(floors):
        z = 0.4 + f * fh
        box(9.66, 9.66, 0.12, 0, 0, z, '#d8d2c6')              # 층 구분선
        for x in (-3.3, 0, 3.3):
            if f == 0 and x == 0:
                continue
            window(x, -4.8, z + 0.9, 1.6, 1.4, 'front')
            window(x, 4.8, z + 0.9, 1.6, 1.4, 'back')
            window(-4.8, x, z + 0.9, 1.6, 1.4, 'left')
            window(4.8, x, z + 0.9, 1.6, 1.4, 'right')
        if f > 0:                                              # 앞 발코니
            for x in (-3.3, 3.3):
                box(2.6, 1.0, 0.15, x, -5.3, z + 0.15, '#cfc8bb')
                box(2.6, 0.06, 0.9, x, -5.77, z + 0.3, accent)
                box(0.06, 1.0, 0.9, x - 1.27, -5.3, z + 0.3, accent)
                box(0.06, 1.0, 0.9, x + 1.27, -5.3, z + 0.3, accent)
    box(0.5, 9.7, floors * fh, -4.9, 0, 0.4, accent)           # 옆 세로 장식
    box(0.5, 9.7, floors * fh, 4.9, 0, 0.4, accent)


def m_tower(glass='#3d6e9e', frame='#c8d3de'):
    H, base = 32.0, 6.0
    box(12.0, 12.0, base, 0, 0, 0, '#8a8f99')                  # 1·2층 돌 로비
    box(4.0, 0.3, 3.6, 0, -6.05, 0, '#2c3e55')                 # 유리 입구
    box(5.0, 1.8, 0.25, 0, -6.6, 3.8, '#5c636e')               # 입구 지붕
    for x in (-2.3, 2.3):
        cyl(0.18, 3.8, x, -7.3, 0, '#c9cdd3', n=8)             # 기둥
    for x in (-4.4, 4.4):
        window(x, -6.0, 1.5, 2.2, 3.0, 'front', frame='#5c636e', glass='#2c3e55')
    box(11.4, 11.4, H - base, 0, 0, base, glass)
    n_floor = int((H - base) / 3.25)
    for f in range(n_floor + 1):                               # 가로 띠
        box(11.6, 11.6, 0.22, 0, 0, base + f * 3.25 - 0.1, frame)
    for i in range(7):                                         # 세로 창살
        p = -5.7 + i * 1.9
        for (sx, sy, x, y) in ((0.16, 0.1, p, -5.72), (0.16, 0.1, p, 5.72), (0.1, 0.16, -5.72, p), (0.1, 0.16, 5.72, p)):
            box(sx, sy, H - base, x, y, base, frame)
    box(12.2, 12.2, 0.8, 0, 0, H, '#9aa3ad')                   # 옥상 테두리
    box(5.0, 5.0, 2.6, -2.0, -2.0, H, '#b0b7c0')               # 기계실
    cyl(0.12, 6.0, -2.0, -2.0, H + 2.6, '#d0d4da', n=6)        # 안테나
    ball(0.25, -2.0, -2.0, H + 8.7, '#ff4040', sub=1)
    cyl(2.6, 0.12, 2.6, 2.6, H + 0.1, '#4a4f57', n=16)        # 헬기장
    box(0.3, 1.8, 0.03, 1.95, 2.6, H + 0.22, '#ffd43b')
    box(0.3, 1.8, 0.03, 3.25, 2.6, H + 0.22, '#ffd43b')
    box(1.0, 0.3, 0.03, 2.6, 2.6, H + 0.22, '#ffd43b')


# ---------- 모형 목록(게임 rules.js의 TYPES 이름과 같아야 한다) ----------
MODELS = {
    'person_a': lambda: m_person('#ff6b6b', '#2f4a7a', '#2b1d14'),
    'person_b': lambda: m_person('#ffd43b', '#3b3b3b', '#5a3a1e'),
    'person_c': lambda: m_person('#4dabf7', '#7a4b2f', '#111111', skin='#d9a27c'),
    'cone': m_cone,
    'hydrant': m_hydrant,
    'trashcan': m_trashcan,
    'mailbox': m_mailbox,
    'bench': m_bench,
    'lamp': m_lamp,
    'tree_round': m_tree_round,
    'tree_pine': m_tree_pine,
    'fountain': m_fountain,
    'car_red': lambda: m_car('#e03131', '#b02525'),
    'car_blue': lambda: m_car('#1c7ed6', '#1864ab'),
    'car_yellow': lambda: m_car('#fcc419', '#e8a800'),
    'truck': m_truck,
    'bus': m_bus,
    'house': m_house,
    'house_blue': lambda: m_house('#dbe8f5', '#2f5d8a'),
    'shop': m_shop,
    'shop_green': lambda: m_shop('#f8f4ea', '#2b8a3e', '#e8590c'),
    'apartment': m_apartment,
    'tower': m_tower,
}

# 진열(블렌더 화면에서 보기 좋게 늘어놓는 자리)
SHOW = {}


# 움직이는 모형: 이름 -> 동작 종류('walk' 걷기, ('drive', 바퀴 반지름) 굴러가기)
ANIMATED = {
    'person_a': 'walk', 'person_b': 'walk', 'person_c': 'walk',
    'car_red': ('drive', 0.34), 'car_blue': ('drive', 0.34), 'car_yellow': ('drive', 0.34),
    'truck': ('drive', 0.45), 'bus': ('drive', 0.5),
}


def _key(o, path, frame, value, index=-1):
    if path == 'rotation_euler':
        o.rotation_euler[index] = value
    elif path == 'location':
        o.location[index] = value
    o.keyframe_insert(data_path=path, index=index, frame=frame)


def _linear(o):
    """키프레임 사이를 일정한 빠르기(직선)로 잇는다 — 바퀴가 덜컹대지 않고 고르게 돈다."""
    ad = o.animation_data
    if ad is None or ad.action is None:
        return
    curves = []
    try:
        curves = list(ad.action.fcurves)
    except AttributeError:   # 블렌더 5: 층(layer)·띠(strip)·자리(slot) 안에 곡선이 있다
        for layer in ad.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves.extend(bag.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'


def _animate(kind, parts):
    """블렌더 키프레임으로 동작 한 바퀴(1~25칸, 25칸 = 1칸과 같은 자세)를 만든다."""
    F = ANIM_FRAMES
    if kind == 'walk':
        swing = math.radians(32)
        for f, s in ((1, 1), (7, 0), (13, -1), (19, 0), (25, 1)):
            _key(parts['leg_l'], 'rotation_euler', f, s * swing, 0)       # X축으로 앞뒤 흔들기
            _key(parts['leg_r'], 'rotation_euler', f, -s * swing, 0)
            _key(parts['arm_l'], 'rotation_euler', f, -s * swing * 0.85, 0)  # 팔은 다리와 반대
            _key(parts['arm_r'], 'rotation_euler', f, s * swing * 0.85, 0)
        base = parts['body'].location.z
        for f, up in ((1, 0), (4, 0.045), (7, 0.02), (10, 0.045), (13, 0), (16, 0.045), (19, 0.02), (22, 0.045), (25, 0)):
            _key(parts['body'], 'location', f, base + up, 2)               # 걸음마다 통통
            for leg in ('leg_l', 'leg_r', 'arm_l', 'arm_r'):
                p = parts[leg]
                if f == 1:
                    p['_z'] = p.location.z
                _key(p, 'location', f, p['_z'] + (up if leg.startswith('arm') else up * 0.6), 2)
        for f, tw in ((1, 0.06), (13, -0.06), (25, 0.06)):
            _key(parts['body'], 'rotation_euler', f, tw, 2)                # 어깨를 살짝 비틀기
    else:
        for name, p in parts.items():
            if name.startswith('wheel'):
                _key(p, 'rotation_euler', 1, 0.0, 1)
                _key(p, 'rotation_euler', F + 1, 2 * math.pi, 1)           # 한 바퀴 = +X로 굴러감
                _linear(p)
        body = parts['body']
        for f, up, tilt in ((1, 0, 0), (7, 0.025, 0.006), (13, 0, 0), (19, 0.02, -0.006), (25, 0, 0)):
            _key(body, 'location', f, up, 2)                                # 길 위의 작은 흔들림
            _key(body, 'rotation_euler', f, tilt, 0)


def _join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.name = o.data.name = name
    _vertex_colors(o)
    return o


def _finish_grouped(name):
    """무리마다 따로 합치고 관절 자리를 원점으로 옮긴 뒤, 빈 뿌리(root) 아래에 붙인다."""
    root = bpy.data.objects.new('gh_' + name, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.3
    bpy.context.scene.collection.objects.link(root)
    parts = {}
    for g, objs in GROUPS.items():
        if not objs:
            continue
        o = _join(objs, 'gh_%s__%s' % (name, g))
        bpy.context.scene.cursor.location = PIVOTS[g]
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        o.parent = root
        parts[g] = o
    bpy.context.scene.cursor.location = (0, 0, 0)
    GROUPS.clear()
    PIVOTS.clear()
    CUR[0] = None
    _animate('walk' if ANIMATED[name] == 'walk' else 'drive', parts)
    return root


def _finish(name):
    """부품을 하나로 합치고 재료 색을 꼭짓점 색으로 옮긴다."""
    o = _join(PARTS, 'gh_' + name)
    PARTS.clear()
    return o


def _vertex_colors(o):
    me = o.data
    ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for p in me.polygons:
        rgb = me.materials[p.material_index]['srgb']
        p.use_smooth = False
        for li in p.loop_indices:
            ca.data[li].color_srgb = (rgb[0], rgb[1], rgb[2], 1.0)
    me.materials.clear()
    me.materials.append(_vertex_material())


def _vertex_material():
    m = bpy.data.materials.get('gh_vertex')
    if m is None:
        m = bpy.data.materials.new('gh_vertex')
        m.use_nodes = True
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        nt.links.new(vc.outputs[0], bsdf.inputs[0])
        bsdf.inputs['Roughness'].default_value = 0.75
    return m


def remove(name):
    old = bpy.data.objects.get('gh_' + name)
    if old is None:
        return
    for c in list(old.children):
        bpy.data.objects.remove(c, do_unlink=True)
    bpy.data.objects.remove(old, do_unlink=True)


def build(name, at=(0, 0, 0)):
    sc = scene()
    sc.frame_start, sc.frame_end = 1, ANIM_FRAMES
    sc.render.fps = ANIM_FRAMES
    remove(name)
    PARTS.clear()
    GROUPS.clear()
    CUR[0] = None
    if name in ANIMATED:
        grp('body', (0, 0, 0))
        MODELS[name]()
        o = _finish_grouped(name)
        o.location = at
        SHOW[name] = at
        faces = sum(len(c.data.polygons) for c in o.children)
        return '%s: 움직이는 부품 %d개(%s), 면 %d개' % (name, len(o.children), ', '.join(sorted(c.name.split('__')[1] for c in o.children)), faces)
    MODELS[name]()
    o = _finish(name)
    o.location = at
    SHOW[name] = at
    d = o.dimensions
    return '%s: 가로 %.2f × 세로 %.2f × 높이 %.2f m, 면 %d개' % (name, d.x, d.y, d.z, len(o.data.polygons))


def export_all(folder):
    import os
    os.makedirs(folder, exist_ok=True)
    out = []
    for name in MODELS:
        o = bpy.data.objects.get('gh_' + name)
        if o is None:
            continue
        keep = o.location.copy()
        o.location = (0, 0, 0)
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        for c in o.children:
            c.select_set(True)
        bpy.context.view_layer.objects.active = o
        path = os.path.join(folder, name + '.glb')
        moving = name in ANIMATED
        kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                  export_yup=True, export_materials='EXPORT', export_animations=moving)
        if moving:
            # 장면 전체 동작을 하나로(1~24칸 + 마지막 25칸 = 처음 자세) 내보낸다
            bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, ANIM_FRAMES + 1
            kw.update(export_animation_mode='SCENE', export_force_sampling=True, export_frame_range=True)
        try:
            bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
        except TypeError:
            bpy.ops.export_scene.gltf(**kw)
        bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, ANIM_FRAMES
        o.location = keep
        out.append('%s %.1fKB' % (name, os.path.getsize(path) / 1024))
    return out
