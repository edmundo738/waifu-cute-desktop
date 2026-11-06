#!/usr/bin/env python3
"""v0.6 Stage 1 prep: continuous anatomical sheet + lower-body sprite.

Builds (pose space 1264x843):
  rig/body_sheet.png  crop [470,0,790,384]: ONE continuous head+neck+upper-torso
                      structure: body_base art + reconstructed HIDDEN art
                      (skull-base disc + neck cylinder extension behind the jaw,
                      invisible at rest because the head covers it) + neck_patch
                      + head_base_nm (no-mouth variant, mouth comes from overlay).
  rig/body_lower.png  body_base with rows < 384 erased (waist cut; the mesh's
                      Root-weighted bottom edge meets it exactly at row 384).
Manifest gains a "rigv06" block (mesh box, step, bone pivots, blend bands).

No canon art is redrawn: hidden art is sampled from the existing proven neck
art and only occupies zones opaque head art covers at rest.
"""
import json
import numpy as np
from PIL import Image

RIG = "app/public/rig/"
body = np.asarray(Image.open(RIG + "body_base.png").convert("RGBA")).astype(np.float64)
nm = np.asarray(Image.open(RIG + "head_base_nm.png").convert("RGBA")).astype(np.float64)
neck = np.asarray(Image.open(RIG + "neck_patch.png").convert("RGBA")).astype(np.float64)
H, W = body.shape[0], body.shape[1]

SHEET_BOX = (470, 0, 790, 384)
NECK_BOX = (585, 160, 678, 245)
HEAD_BOX = (512, 0, 752, 212)
WAIST_Y = 384

sheet = np.zeros((H, W, 4), dtype=np.float64)


def over(dst, src, x0, y0):
    h, w = src.shape[0], src.shape[1]
    a = src[..., 3:4] / 255.0
    region = dst[y0:y0 + h, x0:x0 + w]
    region[..., :3] = region[..., :3] * (1 - a) + src[..., :3] * a
    region[..., 3:4] = np.maximum(region[..., 3:4], src[..., 3:4])


# 1) torso/arms art (rows <= waist)
over(sheet, body[:WAIST_Y], 0, 0)

# 2) hidden skull-base disc (skin tone sampled from proven neck art)
neck_vis = neck[8:40, 20:70]
skin = neck_vis[..., :3][neck_vis[..., 3] > 200]
skin_mean = skin.mean(axis=0) if len(skin) else np.array([90.0, 50.0, 36.0])
yy, xx = np.mgrid[0:H, 0:W]
ell = ((xx - 631) / 44.0) ** 2 + ((yy - 172) / 40.0) ** 2
disc = np.zeros((H, W, 4))
disc[..., 0], disc[..., 1], disc[..., 2] = skin_mean[0] * 0.82, skin_mean[1] * 0.82, skin_mean[2] * 0.82
disc[..., 3] = np.clip(1.6 - ell, 0, 1) * 255
# the disc must never widen the visible neck at rest: clip it to the proven
# neck-patch silhouette (3px dilation) below row 158; above that it stays
# hidden behind opaque head art (safety net under head tilt)
pa = np.zeros((H, W), dtype=np.float64)
pa[NECK_BOX[1]:NECK_BOX[3], NECK_BOX[0]:NECK_BOX[2]] = neck[..., 3] / 255.0
for _ in range(3):  # binary dilation ~3px
    pad = np.pad(pa, 1)
    pa = np.max(np.stack([pa, pad[1:-1, :-2], pad[1:-1, 2:], pad[:-2, 1:-1], pad[2:, 1:-1]]), axis=0)
mask = np.where(yy >= 158, pa, 1.0)
disc[..., 3] *= mask
over(sheet, disc, 0, 0)

# 3) hidden neck cylinder extension rows 118..170 (tapered, shaded upward)
src_band = neck[10:22, 15:78]  # proven neck art strip (local rows 10-22, cols 15-78)
band_mean = src_band.mean(axis=0)  # (63, 4) average proven neck column colours
NC = src_band.shape[1]
for r in range(118, 170):
    t = (170 - r) / 52.0                     # 0 at bottom -> 1 at top
    half = 31.0 - 9.0 * t                    # taper (pose px)
    shade = 0.86 - 0.10 * t                  # skull shadow
    n_out = int(2 * half)
    # map each output column to a proven neck column (centre-aligned resample)
    frac = np.linspace(0.5 - half / 63.0 * 0.5 - 0.0, 1.0, n_out) if False else np.linspace(0.5 - half / 63.0, 0.5 + half / 63.0, n_out)
    idx = np.clip(np.round(frac * (NC - 1)).astype(int), 0, NC - 1)
    row = band_mean[idx].copy()
    row[..., :3] *= shade
    row[..., 3] = 255
    x0 = 631 - n_out // 2
    sheet[r, x0:x0 + n_out] = row  # hidden zone: replace

# 4) visible neck patch art
over(sheet, neck, NECK_BOX[0], NECK_BOX[1])

# 5) head art (no-mouth variant) on top
over(sheet, nm, HEAD_BOX[0], HEAD_BOX[1])

crop = sheet[SHEET_BOX[1]:SHEET_BOX[3], SHEET_BOX[0]:SHEET_BOX[2]]
Image.fromarray(crop.astype(np.uint8), "RGBA").save(RIG + "body_sheet.png")

lower = body.copy()
lower[:WAIST_Y, :, 3] = 0
Image.fromarray(lower.astype(np.uint8), "RGBA").save(RIG + "body_lower.png")

man = json.load(open(RIG + "manifest.json"))
man["rigv06"] = {
    "sheet_box": list(SHEET_BOX),
    "waist_y": WAIST_Y,
    "step": 8,
    "bones": {
        "root": [632, 368],
        "torso": [632, 300],
        "neck": [630, 210],
        "head": [630, 198],
    },
    "bands": [
        {"rows": [190, 215], "from": "head", "to": "neck"},
        {"rows": [215, 255], "from": "neck", "to": "torso"},
        {"rows": [336, 384], "from": "torso", "to": "root"},
    ],
    "neck_comp": 0.35,
}
json.dump(man, open(RIG + "manifest.json", "w"), indent=2)
opaque = (crop[..., 3] > 128).mean()
print("sheet", crop.shape, "opaque frac", round(float(opaque), 3))
print("lower rows kept", WAIST_Y, H)
print("rigv06 manifest block written")
