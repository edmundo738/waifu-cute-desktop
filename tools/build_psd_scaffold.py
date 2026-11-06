"""Build the Live2D preparation scaffold from the neutral pose:
 - layers/parts/part_*.png  : rectangular part crops (RGBA) from the flat pose art
 - layers/parts_manifest.json : part boxes (px + fractions of figure bbox)
 - layers/waifu_companion_scaffold.psd : layered PSD, one layer per part group
NOTE: this is a SEPARATION PLAN scaffold, not cut artwork. Layers are rectangular
crops of the flat illustration; hidden-area completion and clean alpha mattes must
be painted by an artist in Photoshop / Clip Studio before Live2D Cubism Editor use.
Usage: python3 tools/build_psd_scaffold.py   (run from repo root)"""
from PIL import Image
import numpy as np, json, os

SRC = "poses/pose_01_neutral.png"
# (name, x, y, w, h) as fractions of the figure bounding box
PARTS = [
    ("hair_back",  0.22, 0.00, 0.56, 0.15),
    ("face_head",  0.32, 0.03, 0.36, 0.13),
    ("hair_front", 0.26, 0.02, 0.48, 0.16),
    ("earring_L",  0.30, 0.09, 0.08, 0.06),
    ("earring_R",  0.62, 0.09, 0.08, 0.06),
    ("neck",       0.44, 0.14, 0.12, 0.04),
    ("necklace",   0.42, 0.16, 0.16, 0.07),
    ("torso_top",  0.32, 0.17, 0.36, 0.25),
    ("jacket_L",   0.00, 0.19, 0.32, 0.36),
    ("jacket_R",   0.68, 0.19, 0.32, 0.36),
    ("hand_L",     0.05, 0.50, 0.15, 0.12),
    ("hand_R",     0.80, 0.50, 0.15, 0.12),
    ("pants",      0.28, 0.40, 0.44, 0.48),
    ("shoes",      0.26, 0.86, 0.48, 0.14),
]

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(int)
m = (np.abs(a - a[0, 0]).sum(axis=2) > 40)
ys, xs = np.where(m)
fx0, fy0, fx1, fy1 = xs.min(), ys.min(), xs.max(), ys.max()
fw, fh = fx1 - fx0, fy1 - fy0
os.makedirs("layers/parts", exist_ok=True)
manifest = {"source": SRC, "figure_bbox_px": [int(fx0), int(fy0), int(fx1), int(fy1)],
            "note": "rectangular scaffold crops of flat art - NOT cut/matted layers",
            "parts": []}
rgba = np.asarray(im.convert("RGBA"))
layers = []
for i, (name, px, py, pw, ph) in enumerate(PARTS, 1):
    x0 = int(fx0 + px * fw); y0 = int(fy0 + py * fh)
    x1 = int(fx0 + (px + pw) * fw); y1 = int(fy0 + (py + ph) * fh)
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(im.width, x1), min(im.height, y1)
    crop = rgba[y0:y1, x0:x1]
    Image.fromarray(crop, "RGBA").save(f"layers/parts/part_{i:02d}_{name}.png")
    manifest["parts"].append({"layer": f"part_{i:02d}_{name}", "box_px": [x0, y0, x1, y1],
                              "box_frac": [px, py, pw, ph]})
    layers.append((f"part_{i:02d}_{name}", crop, y0, x0))
json.dump(manifest, open("layers/parts_manifest.json", "w"), indent=2)

# ---- layered PSD via pytoshop core API ----
try:
    import pytoshop
    from pytoshop import layers as _layers, enums as _enums
    H, W = rgba.shape[:2]
    psd = pytoshop.PsdFile(num_channels=4, height=H, width=W)
    psd.color_mode = _enums.ColorMode.rgb
    psd.depth = 8
    records = []
    for name, crop, top, left in layers:
        h, w = crop.shape[:2]
        rec = _layers.LayerRecord(top=top, left=left, bottom=top+h, right=left+w,
                                  name=name, opacity=255,
                                  color_mode=_enums.ColorMode.rgb)
        comp = _enums.Compression.raw
        rec.set_channel(_enums.ColorChannel.red,   _layers.ChannelImageData(image=crop[..., 0], compression=comp))
        rec.set_channel(_enums.ColorChannel.green, _layers.ChannelImageData(image=crop[..., 1], compression=comp))
        rec.set_channel(_enums.ColorChannel.blue,  _layers.ChannelImageData(image=crop[..., 2], compression=comp))
        alpha = _layers.ChannelImageData(image=crop[..., 3], compression=comp)
        for cand in ("transparency", "alpha", "default"):
            if hasattr(_enums.ColorChannel, cand):
                try:
                    rec.set_channel(getattr(_enums.ColorChannel, cand), alpha)
                    break
                except ValueError:
                    continue
        records.append(rec)
    psd.layer_and_mask_info = _layers.LayerAndMaskInfo(
        layer_info=_layers.LayerInfo(layer_records=records))
    with open("layers/waifu_companion_scaffold.psd", "wb") as f:
        psd.write(f)
    print("PSD scaffold written with", len(records), "layers")
except Exception as e:
    import inspect
    print("PSD write failed (parts PNGs + manifest still valid):", type(e).__name__, e)
    try:
        print("ChannelImageData sig:", inspect.signature(_layers.ChannelImageData.__init__))
        print("set_channel sig:", inspect.signature(_layers.LayerRecord.set_channel))
    except Exception as e2:
        print(e2)

# ---- sampled palette from the neutral pose (region heuristics, medians) ----
def region(x0f, y0f, x1f, y1f):
    x0 = int(fx0 + x0f * fw); x1 = int(fx0 + x1f * fw)
    y0 = int(fy0 + y0f * fh); y1 = int(fy0 + y1f * fh)
    return rgba[y0:y1, x0:x1, :3].reshape(-1, 3).astype(int)

def med(px):
    m = np.median(px, axis=0).astype(int)
    return f"#{m[0]:02x}{m[1]:02x}{m[2]:02x}"

face = region(0.35, 0.08, 0.65, 0.20)
skin_px = face[(face[:, 0] > face[:, 1]) & (face[:, 1] > face[:, 2]) &
               (face[:, 0] > 110) & (face[:, 0] < 230) & ((face[:, 0] - face[:, 2]) > 40)]
hairreg = region(0.30, 0.00, 0.70, 0.12)
hair_px = hairreg[(hairreg.max(axis=1) < 130) & (hairreg[:, 0] >= hairreg[:, 2])]
topreg = region(0.35, 0.28, 0.65, 0.40)
top_px = topreg[topreg.max(axis=1) < 90]
trousreg = region(0.30, 0.55, 0.45, 0.75)
trous_px = trousreg[trousreg.max(axis=1) < 100]
beltreg = region(0.45, 0.42, 0.65, 0.50)
goldness = beltreg[:, 0] + beltreg[:, 1] - 2 * beltreg[:, 2]
gold_px = beltreg[np.argsort(goldness)[-40:]]
shoereg = region(0.28, 0.90, 0.52, 1.00)
sole_px = shoereg[shoereg.min(axis=1) > 140]
palette = {"skin_face": med(skin_px), "hair": med(hair_px), "top_fabric": med(top_px),
           "trousers": med(trous_px), "gold_hardware": med(gold_px),
           "sneaker_sole": med(sole_px), "background": "#eceae8",
           "sample_counts": {"skin": len(skin_px), "hair": len(hair_px), "top": len(top_px),
                             "trousers": len(trous_px), "gold": len(gold_px), "sole": len(sole_px)}}
json.dump(palette, open("layers/color_palette.json", "w"), indent=2)
print("palette:", palette)
print("parts:", len(manifest["parts"]))
