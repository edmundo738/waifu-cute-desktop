#!/usr/bin/env python3
"""v0.6 Stage 2 prep: arm chains as continuous skinned meshes + hidden art.

Runs Stage 1 prep first (regenerates body_sheet/body_lower from canon), then:

  rig/arm_L.png, rig/arm_R.png
      Each arm = ONE continuous texture from the deltoid to the fingertips
      (bare upper arm + jacket side/sleeve + cuff + hand). The off-shoulder
      jacket is carried by the arms, so the jacket side travels with the arm.
      Inner boundary = measured drawn edges (crop-top edge, zipper, jacket
      interior vs skin, jacket near-black vs brown trousers) -> BINARY alpha,
      so the rest composite is exact. Top boundary = WELD segment across the
      shoulder with an 8 px alpha feather; under it the sheet keeps the
      original pixels and both layers ride the clavicle bone -> no seam.

  rig/body_sheet.png, rig/body_lower.png (rewritten)
      Inside the arm polygons the original arm art is REMOVED (no echo when the
      arm moves) and replaced by reconstructed hidden art:
        d <= 9 px from the boundary : horizontal mirror of the adjacent body
                                      (flank skin / crop top / belt / trousers)
        next 8 px (rows >= 268)     : jacket interior lining, alpha ramp
        beyond                      : transparent
      Hidden art only where the original is fully opaque (no halo at rest).

Coordinates: pose space 1264x843. Boundaries measured from colour classes of
body_base (jacket (8..16) near-black, trousers (50,35,34), skin (127,64,46))
and the zipper trace (dull-gold pixels), see docs/IMPLEMENTATION_AND_TEST_REPORT.md.
"""
import json
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

RIG = "app/public/rig/"
subprocess.run([sys.executable, "tools/prep_stage1_sheet.py"], check=True)

SHEET_BOX = (470, 0, 790, 384)
WAIST_Y = 384
FEATHER = 8.0
D_MIRROR = 3   # = INSET: revealed flank contour is exactly the original jacket edge (no invented anatomy)
D_LINING = 8
LINING_FROM_ROW = 268
INSET = 3
# ---- jacket front panel vs sleeve (depth split; measured on the art: gold zipper by
# hue, sleeve medial contour as the per-row luminance valley). The split runs 2 px
# lateral of the zipper (zipper -> panel) and 1-2 px medial of the sleeve's drawn
# contour (contour -> sleeve, the front object). Closed polygons, pose space.
PANEL_POLY = {
    "L": [(541, 303), (543, 314), (549, 320), (555, 325), (560, 330), (569, 340), (570, 350),
          (565, 362), (562, 372), (564, 382), (562, 395), (561, 410), (560, 425), (559, 440),
          (557, 452), (612, 452), (612, 303)],
    "R": [(650, 312), (729, 312), (725, 315), (721, 318), (717, 321), (714, 324), (711, 327),
          (709, 330), (707, 333), (705, 336), (704, 339), (702, 342), (700, 348), (698, 352),
          (698, 360), (702, 368), (706, 372), (709, 376), (712, 380), (716, 388), (721, 396),
          (724, 404), (727, 412), (729, 420), (730, 428), (731, 436), (732, 444), (733, 452),
          (650, 452)],
}
PANEL_EXT = 28     # jacket body continued under the sleeve (2D, distance-based)
PANEL_AA = 1.0     # outer edge of that extension: ~1 px anti-aliased (opaque fabric
                   # when a bent forearm uncovers it — an 8 px fade read as a smear)
SLEEVE_CLEAR = 2   # extension keeps this far inside the sleeve's OUTER silhouette
DEFRINGE_PAD = 2   # outer-silhouette band (px) checked for light cutout contamination


def dilate(mask, r):
    out = mask.copy()
    for _ in range(r):
        p_ = np.pad(out, 1)
        out = out | p_[:-2, 1:-1] | p_[2:, 1:-1] | p_[1:-1, :-2] | p_[1:-1, 2:]
    return out


def chamfer(src, iters):
    """approx. euclidean distance (3-4 chamfer) from True pixels, capped by iters"""
    dist = np.where(src, 0.0, 1e9)
    for _ in range(iters):
        p_ = np.pad(dist, 1, mode="edge")
        n4 = np.minimum.reduce([p_[:-2, 1:-1], p_[2:, 1:-1], p_[1:-1, :-2], p_[1:-1, 2:]]) + 1
        n8 = np.minimum.reduce([p_[:-2, :-2], p_[:-2, 2:], p_[2:, :-2], p_[2:, 2:]]) + 1.414
        dist = np.minimum(dist, np.minimum(n4, n8))
    return dist


def propagate(rgb, known, iters):
    """fill unknown pixels with the mean colour of known neighbours, ring by ring"""
    col = np.where(known[..., None], rgb, 0.0)
    k = known.astype(np.float64)
    for _ in range(iters):
        pc = np.pad(col * k[..., None], ((1, 1), (1, 1), (0, 0)))
        pk = np.pad(k, 1)
        cs = sum(pc[dy:dy + col.shape[0], dx:dx + col.shape[1]] for dy in range(3) for dx in range(3))
        ks = sum(pk[dy:dy + k.shape[0], dx:dx + k.shape[1]] for dy in range(3) for dx in range(3))
        new = (k == 0) & (ks > 0)
        col[new] = cs[new] / ks[new][:, None]
        k = np.where(new, 1.0, k)
    return col, k > 0

lower = np.asarray(Image.open(RIG + "body_lower.png").convert("RGBA")).astype(np.float64)
H, W = lower.shape[:2]
sheet_crop = np.asarray(Image.open(RIG + "body_sheet.png").convert("RGBA")).astype(np.float64)
sheet = np.zeros((H, W, 4))
sheet[SHEET_BOX[1]:SHEET_BOX[3], SHEET_BOX[0]:SHEET_BOX[2]] = sheet_crop
# stage-1 composite = what the viewer sees at rest (sheet rows < 384, lower below)
comp = lower.copy()
comp[:WAIST_Y] = sheet[:WAIST_Y]

# ---- measured boundaries (top -> bottom); first segment = shoulder weld ----
B_L = [(576, 194), (571, 218), (567, 242), (565, 262), (564, 280), (563, 294), (564, 306),
       (568, 314), (572, 322), (575, 330), (577, 333), (593, 334), (594, 342), (596, 346),
       (594, 352), (591, 358), (591, 362), (588, 370), (583, 380), (578, 391), (575, 402),
       (572, 414), (571, 426), (568, 434), (560, 440), (550, 443), (540, 449), (535, 458),
       (533, 525), (520, 545)]
B_R = [(685, 194), (690, 218), (694, 242), (698, 262), (702, 278), (703, 290), (697, 298),
       (696, 306), (700, 314), (700, 324), (697, 329), (688, 331), (680, 333), (682, 338),
       (685, 342), (689, 346), (692, 350), (690, 356), (692, 362), (700, 366), (702, 376),
       (704, 386), (712, 391), (719, 396), (720, 410), (721, 424), (723, 436), (727, 443),
       (734, 448), (737, 456), (737, 525), (750, 545)]
PIVOTS = {
    "L": {"clav": [612, 212], "shoulder": [547, 238], "elbow": [526, 351], "wrist": [508, 452]},
    "R": {"clav": [648, 212], "shoulder": [713, 238], "elbow": [736, 351], "wrist": [757, 452]},
}


def poly_mask(boundary, far_x):
    pts = list(boundary) + [(far_x, boundary[-1][1]), (far_x, boundary[0][1])]
    img = Image.new("L", (W, H), 0)
    ImageDraw.Draw(img).polygon(pts, fill=255)
    return np.asarray(img) > 0


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    vx, vy = bx - ax, by - ay
    t = np.clip(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1)
    return np.hypot(px - (ax + t * vx), py - (ay + t * vy))


yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
ca = comp[..., 3]
lining_rgb = None
arms_meta = {}
MATTE = {}
DEFRINGED = {}
PANEL_EXT_PX = {}
EXT_CONTOUR = {}
KEEP = {}
for side, B, far in (("L", B_L, 430), ("R", B_R, 840)):
    m = poly_mask(B, far)
    # drawn torso contour (outline / rim light) belongs to the covering jacket edge:
    # inset the hard boundary INSET px into the torso below the armpit
    rows_in = slice(int(B[3][1] + FEATHER), 448)
    grown = m[rows_in].copy()
    for k in range(1, INSET + 1):
        if side == "L":
            grown[:, k:] |= m[rows_in][:, :-k]
        else:
            grown[:, :-k] |= m[rows_in][:, k:]
    m = m.copy()
    m[rows_in] = grown
    dw = seg_dist(xx, yy, B[0], B[1])
    # weld segment is the polyline from B[0] to the armpit (index 3)
    for i in range(1, 3):
        dw = np.minimum(dw, seg_dist(xx, yy, B[i], B[i + 1]))
    feather = np.clip(dw / FEATHER, 0, 1)
    armpit_y = B[3][1]
    feather[yy > armpit_y + FEATHER] = 1.0  # hard (binary) boundary below the armpit

    if lining_rgb is None:
        lum0 = comp[..., :3] @ np.array([0.299, 0.587, 0.114])
        k0 = m & (lum0 < 24) & (ca > 250) & (yy > 300) & (yy < 440)
        lining_rgb = np.median(comp[k0][:, :3], axis=0)

    # ---- matting of the inset strip (known-background un-mixing, "no halos"):
    # in skin rows the strip holds skin + the jacket's antialiased edge. Jacket-ness
    # j from luminance vs the row's local skin; arm gets F=(C-(1-j)B)/j with alpha j,
    # base gets the skin B (unshaded, from just inside). Rest: jF+(1-j)B = C.
    m0 = poly_mask(B, far)
    zone = m & ~m0
    J = np.ones((H, W))
    Bmat = np.zeros((H, W, 3))
    has_mat = np.zeros((H, W), bool)
    lumC = comp[..., :3] @ np.array([0.299, 0.587, 0.114])
    Lj = float(np.asarray(lining_rgb) @ np.array([0.299, 0.587, 0.114]))
    for y in range(rows_in.start, rows_in.stop):
        cols_y = np.where(m[y])[0]
        if len(cols_y) == 0:
            continue
        edge_y = cols_y.max() if side == "L" else cols_y.min()
        sl = slice(edge_y + 1, edge_y + 6) if side == "L" else slice(max(0, edge_y - 5), edge_y)
        if comp[y, sl].shape[0] < 5 or (comp[y, sl, 3] < 250).any():
            continue
        Ls = float(np.median(lumC[y, sl]))
        if Ls < 45:      # dark row (crop top / belt / trousers): binary cut is invisible dark-on-dark
            continue
        for x in np.where(zone[y])[0]:
            dd_ = (edge_y - x + 1) if side == "L" else (x - edge_y + 1)
            sx_ = (edge_y + dd_ + 1) if side == "L" else (edge_y - dd_ - 1)
            if not (0 <= sx_ < W) or comp[y, sx_, 3] < 250:
                continue
            C = comp[y, x, :3]
            jl = float(np.clip((Ls - lumC[y, x]) / max(1.0, Ls - Lj), 0, 1))
            if jl < 0.05:                      # pure skin: stays in the base untouched
                J[y, x], Bmat[y, x] = 0.0, C
            else:
                Bm = comp[y, sx_, :3]
                # smallest j keeping F=(C-(1-j)B)/j inside [0,255] per channel -> exact rest parity
                jmin = np.where(Bm > C, (Bm - C) / np.maximum(Bm, 1e-6), (C - Bm) / np.maximum(255 - Bm, 1e-6))
                J[y, x], Bmat[y, x] = max(jl, float(jmin.max())), Bm
            has_mat[y, x] = True
    MATTE[side] = (int(has_mat.sum()), float(J[has_mat].mean()) if has_mat.any() else 0.0)

    # ---- arm layer: exact composite pixels, matted inner edge, feathered weld
    arm = np.zeros((H, W, 4))
    arm[..., :3] = comp[..., :3]
    jj = J[..., None]
    F = (comp[..., :3] - (1 - jj) * Bmat) / np.maximum(jj, 1e-6)
    sel = has_mat & (J > 0)
    arm[sel, :3] = np.clip(F[sel], 0, 255)
    arm[..., 3] = ca * m * feather * J
    # antialiased silhouette rim inside the weld feather stays on the sheet only
    # (same clavicle bone) -> no double-alpha at rest
    arm[..., 3][(feather < 1) & (ca < 255)] = 0
    # ---- defringe the arm group's OUTER silhouette (original cutout edge): light,
    # unsaturated pixels brighter than the propagated interior colour are white-
    # background contamination -> interior colour, alpha kept (shape unchanged).
    # Saturated gold / warm skin rim light are preserved.
    transparent = ca == 0
    sil = (arm[..., 3] > 0) & dilate(transparent, DEFRINGE_PAD)
    interior = (arm[..., 3] >= 250) & ~dilate(transparent, DEFRINGE_PAD + 1)
    icol, _ = propagate(arm[..., :3], interior, DEFRINGE_PAD + 3)
    lum_a = arm[..., :3] @ np.array([0.299, 0.587, 0.114])
    lum_i = icol @ np.array([0.299, 0.587, 0.114])
    mx_ = arm[..., :3].max(axis=2); mn_ = arm[..., :3].min(axis=2)
    sat_ = (mx_ - mn_) / np.maximum(mx_, 1)
    imx, imn = icol.max(axis=2), icol.min(axis=2)
    isat = (imx - imn) / np.maximum(imx, 1)
    rr, gg, bb = arm[..., 0], arm[..., 1], arm[..., 2]
    hue_ = np.where(mx_ > mn_, (60 * (gg - bb) / np.maximum(mx_ - mn_, 1e-6)) % 360, 0)
    gold_ = (rr >= gg) & (hue_ > 18) & (hue_ < 55) & (sat_ > 0.4) & (mx_ > 70)
    # relative to the local interior, per material (measured: jacket fringe sat~0.29
    # vs interior 0.32; skin fringe sat~0.52 vs interior 0.67; mostly opaque, baked in)
    jacket_ = lum_i < 60
    fr_j = jacket_ & (lum_a > lum_i + 10) & (sat_ < 0.45) & ~gold_
    fr_s = ~jacket_ & (lum_a > lum_i + 10) & (sat_ < 0.85 * isat)
    fr = sil & (lum_i > 0) & (fr_j | fr_s)
    # colour decontamination of the whole edge band: semi-transparent silhouette px
    # carry white-background-mixed RGB (the cutout never un-mixed them) -> beaded
    # two-tone contour once the sleeve crosses the body. All of them take the
    # propagated interior colour (gold excepted); alpha (shape) untouched.
    semi = sil & (arm[..., 3] < 255) & (lum_i > 0) & ~gold_
    dec = fr | semi
    arm[dec, :3] = icol[dec]
    # fully transparent px next to the silhouette: no white RGB left to bleed under
    # any non-premultiplied filtering
    tnear = (arm[..., 3] == 0) & dilate(sil, 2) & (lum_i > 0)
    arm[tnear, :3] = icol[tnear]
    DEFRINGED[side] = dec

    # ---- depth split: jacket front panel (behind) | sleeve + hand (front)
    from PIL import ImageDraw
    pm_img = Image.new("L", (W, H), 0)
    ImageDraw.Draw(pm_img).polygon([tuple(p) for p in PANEL_POLY[side]], fill=255)
    pmask = np.asarray(pm_img) > 127
    panel = arm.copy(); panel[~pmask] = 0
    sleeve = arm.copy(); sleeve[pmask] = 0
    # hidden panel art = the jacket body continuing under the sleeve (2D): wherever
    # the sleeve is fully opaque (invisible at rest) within PANEL_EXT px of the
    # panel, down to the hem; upward only 3 px (closes the resampling seam on the
    # panel/sleeve top boundary). Colour propagated from the panel, shaded with
    # distance (side turning away), horizontally low-passed. OPAQUE with a ~1 px
    # anti-aliased outer edge: a bent forearm uncovers it, and it must read as
    # fabric there. It keeps SLEEVE_CLEAR px inside the sleeve's OUTER silhouette
    # (never seen through the sleeve's anti-aliased band at rest); the panel/sleeve
    # split side is not restricted (back layer ≥3 px under the front there).
    pan_opq = panel[..., 3] >= 250
    rows_p = np.where(pan_opq.any(axis=1))[0]
    top_y, hem_y = int(rows_p.min()), int(rows_p.max())
    dist = chamfer(pan_opq, PANEL_EXT + 2)
    outer_sil = dilate((sleeve[..., 3] < 255) & ~pmask, SLEEVE_CLEAR)
    ext_geo = ~pan_opq & (dist <= PANEL_EXT + 0.5) & (yy <= hem_y) & ((yy >= top_y) | (dist <= 3))
    ext = (sleeve[..., 3] >= 255) & ext_geo & ~outer_sil
    pcol, okc = propagate(panel[..., :3], pan_opq, PANEL_EXT + 2)
    ext &= okc
    shade = 1.0 - 0.35 * np.clip(dist / PANEL_EXT, 0, 1)
    ecol = pcol * shade[..., None]
    for _ in range(2):   # kill propagated streaks
        l_ = np.roll(ecol, 1, axis=1); r_ = np.roll(ecol, -1, axis=1)
        ecol = np.where(ext[..., None], (2 * ecol + l_ + r_) / 4, ecol)
    # alpha: ~1 px ramp on the distance contour; other cut boundaries (hem row,
    # silhouette clearance) anti-aliased by a small blur of the UNION panel∪ext
    # (the shared panel/extension boundary is interior to the union → untouched)
    a_dist = np.clip((PANEL_EXT + 0.5 - dist) / PANEL_AA, 0, 1)
    uni = (pan_opq | ext).astype(np.float32)
    k1 = np.array([0.25, 0.5, 0.25], np.float32)
    ub = uni.copy()
    ub = k1[0] * np.roll(ub, 1, 0) + k1[1] * ub + k1[2] * np.roll(ub, -1, 0)
    ub = k1[0] * np.roll(ub, 1, 1) + k1[1] * ub + k1[2] * np.roll(ub, -1, 1)
    a_ext = np.minimum(a_dist, np.where(ub >= 0.999, 1.0, np.clip(2 * ub - 0.5, 0, 1)))
    panel[ext, :3] = ecol[ext]
    panel[ext, 3] = 255 * a_ext[ext]
    PANEL_EXT_PX[side] = int(ext.sum())
    # where does the extension's outer contour come from? (echo audit: the part cut
    # by the sleeve-silhouette clearance would mirror the sleeve outline if exposed)
    bnd = ext & ~(np.roll(ext, 1, 0) & np.roll(ext, -1, 0) & np.roll(ext, 1, 1) & np.roll(ext, -1, 1))
    near_pan = dilate(pan_opq, 1)
    b_sil = bnd & dilate(outer_sil, 1) & ~near_pan
    b_dist = bnd & (dist >= PANEL_EXT - 1.5) & ~near_pan & ~b_sil
    b_hem = bnd & (yy >= hem_y) & ~near_pan & ~b_sil & ~b_dist
    EXT_CONTOUR[side] = {"dist": int(b_dist.sum()), "sleeve_clear": int(b_sil.sum()), "hem": int(b_hem.sum())}
    for nm, lay in (("arm", sleeve), ("panel", panel)):
        ys, xs = np.where(lay[..., 3] > 0)
        bx_ = [int(xs.min()) - 2, int(ys.min()) - 2, int(xs.max()) + 3, int(ys.max()) + 3]
        Image.fromarray(np.clip(lay[bx_[1]:bx_[3], bx_[0]:bx_[2]], 0, 255).astype(np.uint8), "RGBA").save(RIG + f"{nm}_{side}.png")
        if nm == "arm":
            box, crop = bx_, lay[bx_[1]:bx_[3], bx_[0]:bx_[2]]
        else:
            panel_box = bx_

    # ---- hidden art beneath: replace arm content inside the polygon
    hid = np.zeros((H, W, 4))
    for y in range(B[0][1], min(H, B[-1][1] + 1)):
        cols = np.where(m[y])[0]
        if len(cols) == 0:
            continue
        if side == "L":
            edge = cols.max()           # last arm column; torso starts at edge+1
            d = edge - cols + 1
            src = edge + d + 1
        else:
            edge = cols.min()           # first arm column; torso ends at edge-1
            d = cols - edge + 1
            src = edge - d - 1
        # lining only where real body content touches the boundary on this row
        e1 = (edge + 1) if side == "L" else (edge - 1)
        body_adjacent = 0 <= e1 < W and comp[y, e1, 3] >= 250
        for x, dd, sx in zip(cols, d, src):
            if feather[y, x] < 1 or ca[y, x] < 255:
                continue  # weld feather keeps original; antialiased rim stays transparent
            if has_mat[y, x]:
                hid[y, x, :3] = Bmat[y, x]   # matted strip: the torso's own skin, unshaded
                hid[y, x, 3] = 255
                continue
            if dd <= D_MIRROR:
                if 0 <= sx < W and comp[y, sx, 3] >= 250:
                    # flank turning away from the light: progressive shade
                    shade = 1.0 - 0.38 * (dd / D_MIRROR)
                    hid[y, x, :3] = comp[y, sx, :3] * shade
                    hid[y, x, 3] = 255
            elif dd <= D_MIRROR + D_LINING and y >= LINING_FROM_ROW and body_adjacent:
                t = (dd - D_MIRROR) / D_LINING
                hid[y, x, :3] = lining_rgb
                hid[y, x, 3] = 255 * (1 - t * t)
    # low-pass the mirrored texture horizontally (kills copied fine edge features)
    mir = (hid[..., 3] >= 254) & ~has_mat
    rgb = hid[..., :3].copy()
    for _ in range(2):
        l = np.roll(rgb, 1, axis=1); r = np.roll(rgb, -1, axis=1)
        ml = np.roll(mir, 1, axis=1)[..., None]; mr = np.roll(mir, -1, axis=1)[..., None]
        num = 2 * rgb + l * ml + r * mr
        rgb = np.where(mir[..., None], num / (2 + ml + mr), rgb)
    hid[..., :3] = rgb
    # soften stair-steps of the reconstructed edge (alpha only, 3x3 box x2),
    # never exceeding the original silhouette
    ha = hid[..., 3]
    for _ in range(2):
        pad = np.pad(ha, 1, mode="edge")
        ha = sum(pad[dy:dy + H, dx:dx + W] for dy in range(3) for dx in range(3)) / 9.0
    inner = hid[..., 3] >= 254
    hid[..., 3] = np.where(inner, 255, ha)
    hid[..., 3] = np.where(ca >= 255, hid[..., 3], 0)  # never under an antialiased rim
    # colour for newly softened pixels: nearest lining/mirror colour
    newpx = (hid[..., 3] > 0) & (hid[..., :3].sum(axis=2) == 0)
    hid[newpx, :3] = lining_rgb
    keep = m & (feather >= 1)  # pixels whose original content is removed
    KEEP[side] = keep
    for tgt, rows in ((sheet, slice(0, WAIST_Y)), (lower, slice(WAIST_Y, H))):
        reg = keep.copy()
        reg[:rows.start] = False
        reg[rows.stop:] = False
        tgt[reg] = hid[reg]

    pv = PIVOTS[side]
    arms_meta[side] = {
        "box": box,
        "boundary": [list(p) for p in B],
        "weld": [list(p) for p in B[:4]],
        "pivots": pv,
        "panel_box": panel_box,
        "panel_poly": [list(p) for p in PANEL_POLY[side]],
        "side": -1 if side == "L" else 1,
    }
    print(f"arm_{side}: box {box} opaque px {int((crop[..., 3] > 128).sum())}")

Image.fromarray(np.clip(sheet[SHEET_BOX[1]:SHEET_BOX[3], SHEET_BOX[0]:SHEET_BOX[2]], 0, 255).astype(np.uint8),
                "RGBA").save(RIG + "body_sheet.png")
Image.fromarray(np.clip(lower, 0, 255).astype(np.uint8), "RGBA").save(RIG + "body_lower.png")

# ---- asset-level rest parity: lower+sheet+arms must equal the stage-1 composite
def over(dst, src):
    """premultiplied source-over on straight-alpha float RGBA (0..255)"""
    sa = src[..., 3:4] / 255.0
    da = dst[..., 3:4] / 255.0
    oa = sa + da * (1 - sa)
    prem = src[..., :3] * sa + dst[..., :3] * da * (1 - sa)
    out = np.zeros_like(dst)
    out[..., :3] = np.where(oa > 0, prem / np.maximum(oa, 1e-9), 0)
    out[..., 3:4] = oa * 255.0
    return out


new = lower.copy()
new[:WAIST_Y] = sheet[:WAIST_Y]
for side in ("L", "R"):          # draw order: panel (behind) then sleeve
    for nm, key in (("panel", "panel_box"), ("arm", "box")):
        b = arms_meta[side][key]
        layer = np.zeros((H, W, 4))
        layer[b[1]:b[3], b[0]:b[2]] = np.asarray(Image.open(RIG + f"{nm}_{side}.png")).astype(np.float64)
        new = over(new, layer)
vis = ((ca > 0) | (new[..., 3] > 0)) & ~(DEFRINGED["L"] | DEFRINGED["R"])
d_rgb = np.abs(new[..., :3] * new[..., 3:4] / 255 - comp[..., :3] * comp[..., 3:4] / 255).mean(axis=2)
xor = int(((new[..., 3] > 128) != (ca > 128)).sum())
print(f"asset rest parity: mean|dRGB*a| {d_rgb[vis].mean():.3f} max {d_rgb[vis].max():.1f} xor {xor}")

# ---- no-echo audit: opaque base pixels inside the removed-arm region farther
# than the hidden band (2D chamfer distance from the torso side / weld feather)
base = lower.copy()
base[:WAIST_Y] = sheet[:WAIST_Y]
echo = 0
echo_where = []
for side in ("L", "R"):
    keep = KEEP[side]
    dist = np.where(keep, 1e9, 0.0)
    for _ in range(26):
        p_ = np.pad(dist, 1, mode="edge")
        n4 = np.minimum.reduce([p_[:-2, 1:-1], p_[2:, 1:-1], p_[1:-1, :-2], p_[1:-1, 2:]]) + 1
        n8 = np.minimum.reduce([p_[:-2, :-2], p_[:-2, 2:], p_[2:, :-2], p_[2:, 2:]]) + 1.414
        dist = np.minimum(dist, np.minimum(n4, n8))
    bad = keep & (base[..., 3] > 8) & (dist > D_MIRROR + D_LINING + 3)
    echo += int(bad.sum())
    if bad.any():
        ys_, xs_ = np.where(bad)
        echo_where.append((side, int(ys_.min()), int(ys_.max()), int(xs_.min()), int(xs_.max())))
print(f"echo px (2D, beyond hidden band): {echo}", echo_where)
print("matted inset strip px / mean jacket-ness:", MATTE)
print("defringed silhouette px (excluded from parity, deliberate):", {k: int(v.sum()) for k, v in DEFRINGED.items()})
print("panel hidden extension px:", PANEL_EXT_PX)
print("extension outer contour px by origin (dist contour / sleeve-silhouette clearance / hem):", EXT_CONTOUR)

man = json.load(open(RIG + "manifest.json"))
man["rigv06"]["arms"] = {
    "L": arms_meta["L"], "R": arms_meta["R"],
    "feather": FEATHER, "upper_ramp": 24,
    # angular (polar) weights about the joint: f = smoothstep((cos psi + w) / 2w);
    # det J = 1 + theta*f'(psi) >= 1 - theta*0.75/w  ->  fold-free while theta < w/0.75 rad
    "elbow_cone_w": 0.9,   # fold-free to 68.8 deg (limit 60)
    "wrist_cone_w": 0.5,   # fold-free to 38.2 deg (limit 30)
    "limits": {"shrug": [-2, 6], "shoulder": [-4, 18], "elbow": [-5, 60], "wrist": [-30, 30]},
    "hidden": {"mirror_px": D_MIRROR, "lining_px": D_LINING, "lining_rgb": [round(float(c), 1) for c in lining_rgb]},
}
man["rigv06"]["clav_sheet"] = {
    "neck_edge": {"L": 598, "R": 662}, "neck_cols": [588, 598, 662, 672],
    "row_gate": [198, 206], "fall": [262, 300],
}
json.dump(man, open(RIG + "manifest.json", "w"), indent=2)
print("manifest rigv06.arms + clav_sheet written")
