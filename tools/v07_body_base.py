#!/usr/bin/env python3
"""v0.7 CP-001 — BODY_BASE (front) from the user-approved doll sheet `art_v07/base/base_body_gen_d.png`.

Decisions recorded in docs/CHECKPOINTS.md (CP-001):
  * the user approved gen_d ("o base body gen d esta no caminho certo"): one base colour + one shadow,
    no genitals, feminine anatomy, "esboço / massinha de modelar"; proportions MEASURED against the canon
    sheet (shoulders, waist, navel, crotch, hands within a few % at equal chin->sole scale);
  * the user asked for a thin, opaque dark-brown underwear as censorship ("interior castanho escuro fino
    no tecido mas nao transparente") — nothing else covers the body (arms, legs, neck stay skin);
  * skin is mapped to the canon pose_01 palette so face components cut from the canon art blend in;
  * the face is blank: the small nose is extracted to its own component (FACE/Nose), not deleted.

Pipeline (all deterministic, no generation):
  1. isolate the front figure (connected component from a head seed);
  2. known-background matting: alpha by projection onto the nearest solid foreground colour, edge colour =
     that foreground colour (decontaminated, no background bleed => no light halo);
  3. nose -> component layer, base face filled with local skin;
  4. underwear: spline polygons, clipped to the torso (arm/torso line respected), shaded with the body's
     own line-free shading map, original form lines kept at 35 % as fabric folds, new edge outlines;
  5. per-channel affine skin map (base->base, shadow->shadow) to the canon palette;
  6. outputs + evidence + metrics (JSON).

Usage: python3 tools/v07_body_base.py            (writes art_v07/base/*, app/public/rig_v07/*, art_v07/evidence/*)
"""
import hashlib
import json
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art_v07', 'base', 'base_body_gen_d.png')
CANON = os.path.join(ROOT, 'references', 'ref_sheet_a.png')
OUT_BASE = os.path.join(ROOT, 'art_v07', 'base')
OUT_FACE = os.path.join(ROOT, 'art_v07', 'face')
OUT_EVID = os.path.join(ROOT, 'art_v07', 'evidence')
OUT_APP = os.path.join(ROOT, 'app', 'public', 'rig_v07')

HEAD_SEED = (120, 247)            # (y, x) inside the bald head of the FRONT figure
BG = np.array([210.8, 210.7, 210.5], np.float32)  # MEASURED: ring mean, std ~1.1, no gradient
SOLID_L = 110.0                   # interior pixels darker than this count as solid skin (shading map)
CORE_L = 60.0                     # dark line core (MEASURED: lines L~25-60, skin L 62-90, bg L 210)
EDGE_R = 3                        # edge band (px) solved by matting
NOSE_BOX = (234, 148, 258, 172)   # x0, y0, x1, y1 (MEASURED nostril mark at x240-250, y163-166)

# skin palette mapping (MEASURED): gen_d base/shadow -> canon pose_01 base / cel shadow (0.77 x base)
SKIN_SRC = {'base': (137.0, 72.0, 48.0), 'shadow': (108.0, 51.0, 36.0)}
SKIN_DST = {'base': (150.0, 76.0, 52.0), 'shadow': (116.0, 57.0, 40.0)}

UNDER_BASE = np.array([70.0, 40.0, 29.0], np.float32)   # dark brown, opaque
UNDER_LINE = np.array([40.0, 12.0, 8.0], np.float32)    # matches the gen_d lineart family
FOLD_KEEP = 0.35                                        # original form lines kept on fabric
SS = 4                                                  # supersampling for AA shapes

# --- underwear geometry (source pixel coordinates, read on a 10 px grid; see CP-001) ---
# Bandeau = top/bottom splines (AA) x per-row side clip DERIVED FROM THE REAL LINES (CP-001 fix #6/#7).
# MEASURED (core = L<60): left = arm/torso line x 164-169 (y 266-322), then the arm/torso background gap
# (left edge 169->164, y>=324); right = inner edge of the RIGHT ARM (x 312->329->317, y 258-352; the breast
# contour splits off it at y~322 and becomes the under-bust line, the wedge between them is torso), then the
# gap's torso edge (x~306, y>=354). The original side lines are redrawn at 100 % over the fabric edge.
BANDEAU_TOP = [(150, 276), (168, 273), (186, 266), (207, 262), (230, 266), (250, 273), (270, 266),
               (293, 262), (312, 264), (340, 268)]
BANDEAU_BOT = [(340, 362), (318, 362), (293, 362), (272, 359), (250, 354), (228, 359), (205, 362),
               (185, 360), (168, 357), (150, 357)]
SIDE_L = {'rows': (262, 323), 'win': (160, 179), 'gap_win': (150, 200)}
SIDE_R = {'rows': (256, 353), 'win': (295, 332), 'gap_from': 280, 'gap_to': 340}
SIDE_LINE_KEEP_R = 3              # px (per row) around the side boundary where the ORIGINAL line stays 100 %
PELVIS_SEED = (480, 250)          # (y, x); briefs are clipped to the pelvis region (CP-001 fix #2)
PELVIS_ROWS = (440, 548)
BRIEF_WAIST = [(140, 463), (157, 462), (180, 461), (205, 462), (230, 464), (250, 465), (270, 464),
               (295, 462), (320, 461), (343, 462), (360, 463)]
BRIEF_RIGHT = [(360, 494), (348, 492), (320, 497), (292, 504), (273, 515), (258, 528), (250, 538)]
BRIEF_LEFT = [(250, 538), (242, 528), (228, 514), (210, 502), (180, 497), (152, 492), (140, 494)]


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def flood(mask, seed):
    h, w = mask.shape
    seen = np.zeros_like(mask)
    q = deque([seed]); seen[seed] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    return seen


def dilate(m, r=1):
    out = m.copy()
    for _ in range(r):
        n = out.copy()
        n[1:, :] |= out[:-1, :]; n[:-1, :] |= out[1:, :]
        n[:, 1:] |= out[:, :-1]; n[:, :-1] |= out[:, 1:]
        out = n
    return out


def catmull(points, n=12):
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (np.array(pts[j], float) for j in (i - 1, i, i + 1, i + 2))
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(np.array(points[-1], float))
    return [tuple(p) for p in out]


def raster_poly(poly, shape):
    h, w = shape
    im = Image.new('L', (w * SS, h * SS), 0)
    ImageDraw.Draw(im).polygon([(x * SS + SS / 2, y * SS + SS / 2) for x, y in poly], fill=255)
    return np.asarray(im.resize((w, h), Image.BOX)).astype(np.float32) / 255.0


def raster_stroke(path, shape, width=1.4):
    h, w = shape
    im = Image.new('L', (w * SS, h * SS), 0)
    ImageDraw.Draw(im).line([(x * SS + SS / 2, y * SS + SS / 2) for x, y in path], fill=255,
                            width=max(1, int(round(width * SS))), joint='curve')
    return np.asarray(im.resize((w, h), Image.BOX)).astype(np.float32) / 255.0


def nearest_fill(values, known, iters):
    """Propagate `values` (H,W,C) from `known` pixels outward, preferring the DARKEST known neighbour
    (edges of this art are dark outlines; preferring dark can only darken an edge, never lighten it)."""
    v = values.copy(); k = known.copy()
    L = np.where(k, lum(v), 1e9)
    for _ in range(iters):
        best_v = v.copy(); best_L = L.copy(); newk = k.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            sv = np.roll(np.roll(v, dy, 0), dx, 1); sL = np.roll(np.roll(L, dy, 0), dx, 1)
            sk = np.roll(np.roll(k, dy, 0), dx, 1)
            take = (~k) & sk & (sL < best_L)
            best_v[take] = sv[take]; best_L[take] = sL[take]; newk |= take
        v, L, k = best_v, best_L, newk
    return v, k


def side_bounds(L, H):
    """Per-row bandeau side limits from the real line pixels (see SIDE_L / SIDE_R)."""
    core = L < CORE_L; bgm = L > 170
    xl = np.full(H, -1.0); xr = np.full(H, -1.0)
    for y in range(H):
        if SIDE_L['rows'][0] <= y < SIDE_L['rows'][1]:
            xs = np.nonzero(core[y, SIDE_L['win'][0]:SIDE_L['win'][1]])[0]
            if xs.size: xl[y] = xs.min() + SIDE_L['win'][0]
        elif y >= SIDE_L['rows'][1]:
            g = np.nonzero(bgm[y, SIDE_L['gap_win'][0]:SIDE_L['gap_win'][1]])[0]
            if g.size: xl[y] = g.min() + SIDE_L['gap_win'][0]
        if SIDE_R['rows'][0] <= y < SIDE_R['rows'][1]:
            xs = np.nonzero(core[y, SIDE_R['win'][0]:SIDE_R['win'][1]])[0]
            if xs.size: xr[y] = xs.max() + SIDE_R['win'][0]
        elif y >= SIDE_R['rows'][1]:
            g = np.nonzero(bgm[y, SIDE_R['gap_from']:SIDE_R['gap_to']])[0]
            if g.size: xr[y] = g.min() + SIDE_R['gap_from'] - 1
    for arr in (xl, xr):                      # fill rows without a detection, then 5-row median
        idx = np.nonzero(arr >= 0)[0]
        arr[:] = np.interp(np.arange(H), idx, arr[idx])
        pad = np.pad(arr, 2, mode='edge')
        arr[:] = np.median(np.stack([pad[i:i + H] for i in range(5)]), axis=0)
    return xl, xr


def affine_skin(rgb):
    out = rgb.copy()
    for c in range(3):
        s0, s1 = SKIN_SRC['base'][c], SKIN_SRC['shadow'][c]
        d0, d1 = SKIN_DST['base'][c], SKIN_DST['shadow'][c]
        k = (d0 - d1) / (s0 - s1)
        out[..., c] = np.clip(d0 + (rgb[..., c] - s0) * k, 0, 255)
    return out


def md5(path):
    return hashlib.md5(open(path, 'rb').read()).hexdigest()


def main():
    for d in (OUT_BASE, OUT_FACE, OUT_EVID, OUT_APP):
        os.makedirs(d, exist_ok=True)
    src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
    H, W, _ = src.shape
    L = lum(src)

    # 1. isolate the front figure
    comp = flood(L < 170, HEAD_SEED)
    ys, xs = np.nonzero(comp)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    near = dilate(comp, EDGE_R + 1)

    # 2. matting with known background (v3, CP-001 fixes #3 and #4)
    #    v1: alpha solved for every non-solid pixel -> light nose highlight became a see-through hole.
    #    v2: pixels mixing line+background with L<110 were 'solid' -> opaque, background-lightened colour =
    #        light dotted fringe on dark backgrounds (31 % of the outer ring, tools/v07_edge_audit.py).
    #    v3: only the OUTER ring (reachable from transparency without crossing the dark line core) is unmixed;
    #        each ring pixel tests two foreground candidates (line core / interior skin) and keeps the one that
    #        reconstructs the observed colour best: C ~ a*F + (1-a)*B.
    T = ~comp
    core = comp & (L < CORE_L)
    ring = np.zeros_like(T); front = T.copy()
    for _ in range(EDGE_R):
        front = dilate(front, 1) & comp & ~core & ~ring
        ring |= front
    faint = dilate(comp, 1) & T                   # AA pixels lighter than the component threshold
    unmix = ring | faint
    opaque = comp & ~ring
    F_line, h_line = nearest_fill(src, core, EDGE_R + 2)
    F_in, h_in = nearest_fill(src, opaque & ~core, EDGE_R + 2)
    def solve(Fc):
        d = Fc - BG
        a_ = np.clip(((src - BG) * d).sum(-1) / np.maximum((d * d).sum(-1), 1e-6), 0, 1)
        err = np.abs(src - (a_[..., None] * Fc + (1 - a_[..., None]) * BG)).sum(-1)
        return a_, err
    a_l, e_l = solve(F_line); a_i, e_i = solve(F_in)
    e_l = np.where(h_line, e_l, 1e9); e_i = np.where(h_in, e_i, 1e9)
    use_line = e_l <= e_i
    a_u = np.where(use_line, a_l, a_i); F_u = np.where(use_line[..., None], F_line, F_in)
    ok = unmix & (h_line | h_in)
    alpha = np.where(opaque, 1.0, np.where(ok, a_u, 0.0))
    alpha[alpha < 0.02] = 0.0
    F = np.where(opaque[..., None], src, F_u)        # decontaminated edge colour
    F = np.where((alpha > 0)[..., None], F, 0.0)
    solid = core | (opaque & (L < SOLID_L))          # used by later stages (face ring, shading)

    # 3. nose -> component; blank face
    x0, y0, x1, y1 = NOSE_BOX
    ring = np.zeros((H, W), bool); ring[y0 - 4:y1 + 4, x0 - 4:x1 + 4] = True; ring[y0:y1, x0:x1] = False
    skin_face = np.median(F[ring & solid], axis=0)
    box = np.zeros((H, W), bool); box[y0:y1, x0:x1] = True
    dev = np.abs(F - skin_face).sum(-1)
    nose_a = np.clip((dev - 4.0) / 60.0, 0, 1) * box
    nose_rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    nose_rgba[..., :3] = np.clip(affine_skin(F[y0:y1, x0:x1]), 0, 255).astype(np.uint8)
    nose_rgba[..., 3] = (nose_a[y0:y1, x0:x1] * 255).round().astype(np.uint8)
    F = np.where(box[..., None], skin_face, F)

    # 4. underwear
    linefree_known = solid & (L > 55)                 # skin / shading pixels, no lines
    shade_src, _ = nearest_fill(np.where(linefree_known[..., None], src, 0), linefree_known, 6)
    s_map = np.clip(lum(shade_src) / 82.4, 0.62, 1.08)
    top = catmull(BANDEAU_TOP); bot = catmull(BANDEAU_BOT)
    bandeau = raster_poly(top + bot, (H, W))
    xl, xr = side_bounds(L, H)
    cols = np.arange(W)[None, :]
    bandeau *= ((cols >= xl[:, None]) & (cols <= xr[:, None])).astype(np.float32)
    side_zone = (((np.abs(cols - xl[:, None]) <= SIDE_LINE_KEEP_R) | (np.abs(cols - xr[:, None]) <= SIDE_LINE_KEEP_R))
                 & (np.arange(H)[:, None] >= 250) & (np.arange(H)[:, None] <= 370)).astype(np.float32)
    waist = catmull(BRIEF_WAIST); rleg = catmull(BRIEF_RIGHT); lleg = catmull(BRIEF_LEFT)
    brief = raster_poly(waist + rleg + lleg, (H, W))
    rows = np.zeros((H, W), bool); rows[PELVIS_ROWS[0]:PELVIS_ROWS[1]] = True
    pelvis = flood((alpha > 0) & rows, PELVIS_SEED)
    brief *= dilate(pelvis, 1)
    cover = np.clip(bandeau + brief, 0, 1)
    # silhouette lines (dark pixels touching transparency) are never painted over
    sil = dilate(alpha < 0.5, 2) & (L < 80) & comp
    cover = cover * (~sil) * (alpha > 0)
    fabric = UNDER_BASE[None, None, :] * s_map[..., None]
    dark_line = np.clip((70.0 - L) / 45.0, 0, 1)      # 1 on line cores, 0 on skin
    keep = np.maximum(FOLD_KEEP, side_zone)[..., None] * dark_line[..., None]   # side lines stay 100 %
    fabric = fabric * (1 - keep) + UNDER_LINE * keep
    # new outlines on the underwear edges
    edges = np.zeros((H, W), np.float32)
    for path in (top, bot, waist, rleg, lleg):
        edges = np.maximum(edges, raster_stroke(path, (H, W), 1.4))
    edges *= np.clip(cover * 4, 0, 1) * (alpha > 0)

    # 5. skin palette -> canon, then composite underwear + edges
    G = affine_skin(F)
    G = G * (1 - cover[..., None]) + fabric * cover[..., None]
    G = G * (1 - edges[..., None]) + UNDER_LINE * edges[..., None]

    # 6. outputs (crop with margin; origin recorded)
    m = 8
    cx0, cy0, cx1, cy1 = max(bbox[0] - m, 0), max(bbox[1] - m, 0), min(bbox[2] + m + 1, W), min(bbox[3] + m + 1, H)
    rgba = np.zeros((cy1 - cy0, cx1 - cx0, 4), np.uint8)
    rgba[..., :3] = np.clip(G[cy0:cy1, cx0:cx1], 0, 255).round().astype(np.uint8)
    rgba[..., 3] = (alpha[cy0:cy1, cx0:cx1] * 255).round().astype(np.uint8)
    rgba[rgba[..., 3] == 0, :3] = 0
    base_path = os.path.join(OUT_BASE, 'body_base_front_v1.png')
    Image.fromarray(rgba).save(base_path)
    Image.fromarray(rgba).save(os.path.join(OUT_APP, 'body_base_front.png'))
    nose_path = os.path.join(OUT_FACE, 'nose_v1.png')
    Image.fromarray(nose_rgba).save(nose_path)
    Image.fromarray(nose_rgba).save(os.path.join(OUT_APP, 'nose.png'))

    # ---------------- metrics ----------------
    a8 = rgba[..., 3].astype(np.float32) / 255; C = rgba[..., :3].astype(np.float32)
    edge = (a8 > 0.02) & (a8 < 0.98)
    res = {}
    import importlib.util
    spec = importlib.util.spec_from_file_location('edge_audit', os.path.join(ROOT, 'tools', 'v07_edge_audit.py'))
    ea = importlib.util.module_from_spec(spec); spec.loader.exec_module(ea)
    for name, D in (('dark', np.array([24, 24, 28], np.float32)), ('white', np.array([255, 255, 255], np.float32)),
                    ('mid', np.array([128, 128, 128], np.float32))):
        comp_ = C * a8[..., None] + D * (1 - a8[..., None])
        # expected upper bound of a clean edge: max(lum(F), lum(D)); any excess = halo/lift
        lift = lum(comp_) - np.maximum(lum(C), lum(D))
        res[name] = {'edge_px': int(edge.sum()), 'lift_gt_4': int((lift[edge] > 4).sum()),
                     'max_lift': float(lift[edge].max()) if edge.any() else 0.0}
    # naive cut for comparison (F = original contaminated colour, same alpha)
    naive = src[cy0:cy1, cx0:cx1]
    Dk = np.array([24, 24, 28], np.float32)
    comp_n = naive * a8[..., None] + Dk * (1 - a8[..., None])
    comp_c = C * a8[..., None] + Dk * (1 - a8[..., None])
    res['naive_vs_clean_mean_edge_L_on_dark'] = [float(lum(comp_n)[edge].mean()), float(lum(comp_c)[edge].mean())]
    # skin palette check against canon pose_01 (MEASURED bands)
    skin_px = (a8 > 0.99) & (cover[cy0:cy1, cx0:cx1] < 0.01) & (lum(C) > 70) & (lum(C) < 110)
    res['skin_base_median'] = np.median(C[skin_px], axis=0).round(1).tolist()
    res['canon_pose01_mid'] = [150, 76, 52]
    res['underwear_px'] = int((cover > 0.5).sum())
    res['bbox_src'] = bbox
    res['crop_origin_src'] = [cx0, cy0]
    res['size'] = [int(rgba.shape[1]), int(rgba.shape[0])]
    res['source_md5'] = md5(SRC)
    res['nose_box_src'] = list(NOSE_BOX)

    # ---------------- evidence images ----------------
    im = Image.fromarray(rgba)
    tiles = []
    for bgc in ((255, 255, 255), (24, 24, 28), None, (90, 140, 200)):
        if bgc is None:
            t = Image.new('RGB', im.size, (200, 200, 200)); dr = ImageDraw.Draw(t)
            for yy in range(0, im.size[1], 16):
                for xx in range(0, im.size[0], 16):
                    if (xx // 16 + yy // 16) % 2: dr.rectangle([xx, yy, xx + 15, yy + 15], fill=(150, 150, 150))
        else:
            t = Image.new('RGB', im.size, bgc)
        t.paste(im, (0, 0), im); tiles.append(t)
    sheet = Image.new('RGB', (im.size[0] * 4 + 30, im.size[1]), (255, 255, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * (im.size[0] + 10), 0))
    sheet.save(os.path.join(OUT_EVID, 'cp001_backgrounds.png'))

    # zoom crops on dark: head edge, left hand, feet, bandeau side, hip/briefs edge
    zooms = [('head', (247 - 60, 55, 247 + 60, 135)), ('hand_L', (95, 505, 165, 610)),
             ('feet', (180, 960, 320, 1036)), ('bandeau_L', (150, 250, 240, 370)), ('hip_R', (280, 440, 360, 545))]
    zt = []
    for name, (zx0, zy0, zx1, zy1) in zooms:
        c = tiles[1].crop((zx0 - cx0, zy0 - cy0, zx1 - cx0, zy1 - cy0))
        c = c.resize((c.width * 4, c.height * 4), Image.NEAREST); zt.append(c)
    zw = sum(z.width for z in zt) + 10 * (len(zt) - 1); zh = max(z.height for z in zt)
    zs = Image.new('RGB', (zw, zh), (255, 255, 255)); x = 0
    for z in zt:
        zs.paste(z, (x, 0)); x += z.width + 10
    zs.save(os.path.join(OUT_EVID, 'cp001_edges_dark_x4.png'))

    # proportion check vs canon at equal chin->sole scale
    A = Image.open(CANON).convert('RGB')
    def norm(img, box, chin, sole, Hn=1000, pad=260):
        s = Hn / (sole - chin)
        c = img.crop(box); c = c.resize((round(c.width * s), round(c.height * s)), Image.LANCZOS)
        return c, pad - (chin - box[1]) * s
    ca, oya = norm(A, (100, 0, 500, 1295), 247, 1265)
    t_dark = Image.new('RGB', (W, H), (255, 255, 255)); t_dark.paste(im, (cx0, cy0), im)
    cb, oyb = norm(t_dark, (85, 20, 415, 1050), 197, 1035)
    cmp_ = Image.new('RGB', (ca.width + cb.width + 40, 1300), (255, 255, 255))
    cmp_.paste(ca, (0, round(oya))); cmp_.paste(cb, (ca.width + 40, round(oyb)))
    dr = ImageDraw.Draw(cmp_)
    for k in range(0, 11):
        yv = 260 + k * 100
        dr.line([(0, yv), (cmp_.width, yv)], fill=(255, 0, 0) if k in (0, 10) else (0, 140, 255), width=1)
    cmp_.save(os.path.join(OUT_EVID, 'cp001_canon_compare.png'))

    audit, _ = ea.audit(base_path)
    audit['layer'] = os.path.relpath(base_path, ROOT)
    res['edge_audit'] = audit
    with open(os.path.join(OUT_EVID, 'cp001_metrics.json'), 'w') as f:
        json.dump(res, f, indent=2)
    with open(os.path.join(OUT_APP, 'metrics.json'), 'w') as f:
        json.dump(res, f, indent=2)
    small = cmp_.resize((round(cmp_.width * 760 / cmp_.height), 760), Image.LANCZOS)
    small.save(os.path.join(OUT_APP, 'canon_compare.jpg'), quality=88)
    manifest = {
        'component': 'BODY_BASE/front', 'version': 'v1', 'checkpoint': 'CP-001',
        'texture': 'body_base_front.png', 'size': res['size'],
        'space': 'source gen_d pixels; crop origin = crop_origin_src', 'crop_origin_src': res['crop_origin_src'],
        'source': 'art_v07/base/base_body_gen_d.png', 'source_md5': res['source_md5'],
        'landmarks_src': {'chin': [247, 197], 'skull_top': [247, 62], 'sole_y': 1035, 'navel': [257, 418],
                          'crotch': [250, 533], 'shoulder_line_y': 235},
        'skin_palette': SKIN_DST, 'underwear': {'base': UNDER_BASE.tolist(), 'line': UNDER_LINE.tolist(),
                                                'style': 'thin opaque dark-brown strapless bandeau + briefs'},
        'components': {'FACE/Nose': {'texture': 'nose.png', 'origin_src': [x0, y0]}},
        'state': 'IMPLEMENTADO (aguarda APROVADO do utilizador)'}
    with open(os.path.join(OUT_APP, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
