# Parts Inventory & Separation Plan — Stage D

Source art: `poses/pose_01_neutral.png` (1264×843). Figure bbox and all part boxes are
machine-readable in `parts_manifest.json`. Scaffold PSD: `waifu_companion_scaffold.psd`
(14 RGBA layers, read-back verified). Part previews: `parts/part_NN_name.png`.

**Status: SEPARATION PLAN, not cut art.** Each layer is a rectangular crop of the flat
illustration. Before rigging, an artist must: cut true silhouettes with alpha, paint the
hidden areas each part reveals when moved (back of neck under hair, torso under jacket,
eyeball sockets under lids, mouth interior…), and sub-divide groups per
`live2d/LIVE2D_PREPARATION.md` §2.

| # | Layer | Rig-tree node | Pivot hint | Notes |
|---|---|---|---|---|
| 01 | hair_back | hair_back | base of puff | silhouette behind head/shoulders |
| 02 | face_head | head → face_base | neck-top | skin, ears, nose base |
| 03 | hair_front | head → hair_front | puff centre | crown + face-framing tendrils; split into 2–3 curl groups |
| 04 | earring_L | head → earring_L | earlobe | pendulum physics |
| 05 | earring_R | head → earring_R | earlobe | pendulum physics |
| 06 | neck | body → neck | C7 | bridge face↔torso |
| 07 | necklace | torso → necklace | clavicle | follows torso, slight lag |
| 08 | torso_top | body → torso | waist | cropped top + chest/waist skin |
| 09 | jacket_L | body → jacket_L | shoulder L | sleeve deformer chain |
| 10 | jacket_R | body → jacket_R | shoulder R | sleeve deformer chain |
| 11 | hand_L | arm_L → hand_L | wrist | |
| 12 | hand_R | arm_R → hand_R | wrist | peace-sign pose source |
| 13 | pants | body → pants_hip/legs | hip line | split hip / leg_L / leg_R; pockets parent to legs |
| 14 | shoes | legs → shoe_L/R | ankle | split per foot |

Missing from the scaffold (must be authored, not cropped): eyeballs/eyelids/brows/mouth
interior as independent layers, arm upper/fore segments (currently inside jacket sleeves),
curl sub-groups, back-of-head hair under the puff, and all hidden-area completion paint.

Regenerate after editing boxes: `python3 tools/build_psd_scaffold.py`.
