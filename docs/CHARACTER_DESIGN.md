# Canonical Character Specification — Stage A

**Character:** the Waifu Cute Desktop companion (working name: *the Companion*).
**Sources of truth (visual canon), in order:** `references/ref_sheet_a.png` (approved
English character sheet), `references/ref_sheet_b.png` (approved Portuguese sheet),
`references/ref_turnaround_clean.png` (approved front/back turnaround).
**Rule:** every future asset must preserve this identity. Improvements refine; they never redesign.
**Prohibited:** national flags or Angolan flag colours as a design theme.

## 1. Identity

| Attribute | Canonical value |
|---|---|
| Species / style | Human, cute anime-inspired rendering with semi-realistic shading |
| Age presentation | Young adult (20s) |
| Ethnicity | Black African woman |
| Skin | Deep warm brown — sampled mid-tone `#974d36` (`layers/color_palette.json`) |
| Eyes | Large, expressive, warm brown; long lashes; soft brow |
| Hair | Voluminous natural African curls, dark brown (`#1b0f0e` shadow tone), high puff with loose curly tendrils framing the face; curled baby-hair edges at the hairline |
| Height | ≈ 168 cm (5'6") — per approved sheets |
| Build | Slim-athletic; ≈ 6.5 heads tall in the pose set |
| Personality | Confident, warm, intelligent, expressive; playful streak |

## 2. Wardrobe (canonical outfit)

| Item | Description |
|---|---|
| Top | Black cropped camisole / bandeau with thin shoulder straps (`#271c1c`) |
| Jacket | Oversized black bomber jacket, worn open and draped off the shoulders over the arms; gold zipper tape |
| Trousers | Black cargo trousers, relaxed fit, cuffed at the ankle; gold buckles, straps, D-rings and zip pulls (`#2f2221`) |
| Belt | Black leather belt with gold square buckle |
| Shoes | Black/white high-top sneakers with gold accents; off-white sole (`#e1d2ca`) |
| Earrings | Gold oval hoop earrings (both ears) |
| Necklace | Delicate gold chain with **small gold Africa-contour pendant** (canonical — `ref_sheet_a` and all v1 generated poses/close-ups) |
| Piercing | Small gold navel piercing |

**Approved variant (wardrobe alternate, not the default):** gold *butterfly* pendant and
black shoulder bag, as seen in `ref_sheet_b` / `ref_turnaround_clean`. Use only when an
asset explicitly calls for the alternate look; default renders use the Africa pendant.

## 3. Colour palette (sampled from `poses/pose_01_neutral.png`)

`skin #974d36 · hair #1b0f0e · top #271c1c · trousers #2f2221 · gold hardware ≈ #b1613a
(warm gold, highlights brighter) · sneaker sole #e1d2ca · sheet background #eceae8`
Machine-readable: `layers/color_palette.json`.

## 4. Expression canon

Approved expression set (from `ref_sheet_a` grid, cropped in `expressions/canon_*.png`):
**happy, curious, surprised, wink, sad, angry.** High-res generated close-ups v1:
**happy, surprised, thinking** (`expressions/expression_*_closeup.png`).
Combined view: `expressions/expression_reference_sheet.png`.

## 5. Pose canon (six animation reference poses)

1. **Neutral** — relaxed confident stand, arms loose, gentle closed-lip smile.
2. **Happy** — warm open smile, one open-palm welcoming gesture.
3. **Thinking** — index finger on cheek near chin, eyes glancing up, contemplative pout.
4. **Waving** — open-hand wave at head height, bright smile.
5. **Surprised** — wide eyes, raised brows, small open mouth, hands lifted near chest.
6. **Playful** — wink, big grin, peace V-sign beside the face, hip tilted.

Files: `poses/pose_01…06_*.png`; combined: `poses/pose_reference_sheet.png`.
All six show the full body including shoes, uncropped hands/feet/hair, on a clean
neutral background. Provenance note: poses 02–04 were isolated from duplicate-figure
generations; the untouched originals are kept in `poses/_raw/`.

## 6. Consistency rules for future assets

1. Same face, skin tone, hairstyle, proportions, outfit and accessories in every image.
2. Default pendant = Africa contour; butterfly = declared alternate only.
3. Keep the curl silhouette: high puff + face-framing tendrils; never straighten.
4. Gold is the only metal accent; no flags, no flag-colour themes.
5. Backgrounds for reference art stay clean neutral; scene art is a separate category.
6. Any new generated asset must be checked against `poses/pose_reference_sheet.png`
   before it is accepted into canon.
