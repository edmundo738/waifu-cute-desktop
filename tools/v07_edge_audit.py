#!/usr/bin/env python3
"""v0.7 edge audit — independent of how a layer was matted.

Light-fringe gate ("contornos brancos"): composite the RGBA layer on a dark background and look at the OUTER
ring of the silhouette (pixels within R px of transparency that are reachable from transparency without crossing
the dark line core). In this art every silhouette has a dark outline, so on a dark background those ring pixels
must stay dark. A ring pixel brighter than LIGHT_L is a light fringe = background colour baked into the edge.
Also reports interior alpha holes (alpha<0.98 farther than R+1 px from transparency).

Usage: python3 tools/v07_edge_audit.py layer.png [--r 3]
"""
import argparse, json
import numpy as np
from PIL import Image

def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]

def dilate(m, r=1):
    out = m.copy()
    for _ in range(r):
        n = out.copy(); n[1:] |= out[:-1]; n[:-1] |= out[1:]; n[:, 1:] |= out[:, :-1]; n[:, :-1] |= out[:, 1:]
        out = n
    return out

def audit(path, r=3, light_l=60.0, core_l=60.0, dark=(24, 24, 28)):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
    al = a[..., 3] / 255.0; C = a[..., :3]
    D = np.array(dark, np.float32)
    comp = C * al[..., None] + D * (1 - al[..., None])
    Lc = lum(comp)
    T = al < 0.02
    core = (~T) & (lum(C) < core_l) & (al > 0.5)
    ring = np.zeros_like(T); front = T.copy()
    for _ in range(r):
        front = dilate(front, 1) & ~T & ~core & ~ring
        ring |= front
    fringe = ring & (Lc > light_l)
    far = ~dilate(T, r + 1)
    holes = (al < 0.98) & far
    Lr = Lc[ring]
    # gate: no ring pixel may composite brighter than skin-level (L>80) on a dark background; the >60 count
    # (dark-grey anti-aliasing of the line) is reported too so the threshold choice stays visible.
    return {'layer': path, 'ring_px': int(ring.sum()), 'light_fringe_px': int(fringe.sum()),
            'fringe_ratio': round(float(fringe.sum()) / max(int(ring.sum()), 1), 4),
            'ring_L_gt70': int((Lr > 70).sum()), 'ring_L_gt80': int((Lr > 80).sum()),
            'ring_L_gt100': int((Lr > 100).sum()), 'ring_L_max': round(float(Lr.max()), 1) if Lr.size else 0.0,
            'interior_alpha_holes': int(holes.sum()),
            'GATE_no_light_fringe': bool((Lr > 80).sum() == 0), 'GATE_no_holes': bool(holes.sum() == 0)}, fringe

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('layers', nargs='+'); ap.add_argument('--r', type=int, default=3)
    a = ap.parse_args()
    for p in a.layers:
        res, _ = audit(p, a.r); print(json.dumps(res))
