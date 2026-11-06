"""Stage E verification: checks every deliverable of the character package and
rewrites docs/VALIDATION_REPORT.md. Run from repo root:
    python3 tools/validate_package.py
Exits non-zero if any required deliverable is missing or unreadable."""
import json, os, sys, datetime

from PIL import Image

REQUIRED_FILES = [
    "references/ref_sheet_a.png", "references/ref_sheet_b.png", "references/ref_turnaround_clean.png",
    "poses/pose_01_neutral.png", "poses/pose_02_happy.png", "poses/pose_03_thinking.png",
    "poses/pose_04_waving.png", "poses/pose_05_surprised.png", "poses/pose_06_playful.png",
    "poses/pose_reference_sheet.png",
    "expressions/canon_happy.png", "expressions/canon_curious.png", "expressions/canon_surprised.png",
    "expressions/canon_wink.png", "expressions/canon_sad.png", "expressions/canon_angry.png",
    "expressions/expression_happy_closeup.png", "expressions/expression_surprised_closeup.png",
    "expressions/expression_thinking_closeup.png", "expressions/expression_wink_closeup.png",
    "expressions/viseme_A.png", "expressions/viseme_I.png", "expressions/viseme_U.png",
    "expressions/viseme_E.png", "expressions/viseme_O.png",
    "expressions/expression_reference_sheet.png", "expressions/viseme_reference_sheet.png",
    "layers/parts_manifest.json", "layers/color_palette.json", "layers/waifu_companion_scaffold.psd",
    "layers/PARTS_INVENTORY.md",
    "animations/ANIMATION_SPEC.md", "animations/animations.json",
    "live2d/LIVE2D_PREPARATION.md", "live2d/LICENSE_REVIEW.md",
    "docs/CHARACTER_DESIGN.md", "docs/TECHNICAL_INSTRUCTIONS.md", "docs/LIMITATIONS.md",
    "app/package.json", "app/src/App.tsx", "app/src/companion/staticRenderer.ts",
    "app/src/companion/stateMachine.ts", "app/src/companion/bridge.ts",
    "app/src/companion/live2dAdapter.ts", "app/src-tauri/tauri.conf.json",
    "app/public/sprites/companion_neutral.png", "app/public/sprites/companion_happy.png",
    "app/public/sprites/companion_thinking.png", "app/public/sprites/companion_waving.png",
    "app/public/sprites/companion_surprised.png", "app/public/sprites/companion_playful.png",
    "README.md",
]
PART_COUNT = 14

rows, failures = [], []

for rel in REQUIRED_FILES:
    if not os.path.isfile(rel) or os.path.getsize(rel) == 0:
        failures.append(rel)
        rows.append((rel, "MISSING/EMPTY", ""))
        continue
    size = os.path.getsize(rel)
    extra = ""
    if rel.endswith((".png",)):
        with Image.open(rel) as im:
            extra = f"{im.size[0]}x{im.size[1]} {im.mode}"
    elif rel.endswith(".json"):
        json.load(open(rel))
        extra = "json ok"
    rows.append((rel, f"{size/1024:.0f} KB", extra))

parts = sorted(f for f in os.listdir("layers/parts") if f.endswith(".png"))
if len(parts) != PART_COUNT:
    failures.append(f"layers/parts (expected {PART_COUNT}, found {len(parts)})")
rows.append((f"layers/parts/*.png", f"{len(parts)} files", "part crops"))

psd_info = "not checked"
try:
    import pytoshop
    with open("layers/waifu_companion_scaffold.psd", "rb") as f:
        psd = pytoshop.read(f)
    n = len(psd.layer_and_mask_info.layer_info.layer_records)
    psd_info = f"{n} layers, canvas {psd.width}x{psd.height}"
    if n != PART_COUNT:
        failures.append("PSD layer count")
except Exception as e:
    failures.append(f"PSD read-back: {e}")
rows.append(("layers/waifu_companion_scaffold.psd read-back", "ok", psd_info))

anim = json.load(open("animations/animations.json"))
n_anim = len(anim["animations"])
rows.append(("animations.json entries", str(n_anim), "spec ids: " + ", ".join(a["id"] for a in anim["animations"])))
if n_anim != 12:
    failures.append("animation count")

report = ["# Validation Report — Stage E", "",
          f"Generated: {datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}  ",
          f"Result: **{'PASS' if not failures else 'FAIL (' + ', '.join(failures) + ')'}**", "",
          "| Deliverable | Size | Detail |", "|---|---|---|"]
report += [f"| {a} | {b} | {c} |" for a, b, c in rows]
report += ["", "Known limitations: see `docs/LIMITATIONS.md`.", ""]
open("docs/VALIDATION_REPORT.md", "w").write("\n".join(report))
print("\n".join(report))
sys.exit(1 if failures else 0)
