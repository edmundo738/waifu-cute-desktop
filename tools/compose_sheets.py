"""Compose the combined reference sheets of the character package.
Usage: python3 tools/compose_sheets.py   (run from repo root)
Builds:
  poses/pose_reference_sheet.png          - six full-body poses, 3x2 grid
  expressions/expression_reference_sheet.png - canon crops + high-res close-ups
  expressions/viseme_reference_sheet.png  - A/I/U/E/O mouth-shape art references
"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np, os

def fig_bbox(im, tol=40, pad=10):
    a = np.asarray(im.convert("RGB")).astype(int)
    m = (np.abs(a - a[0, 0]).sum(axis=2) > tol)
    ys, xs = np.where(m)
    return (max(0, xs.min()-pad), max(0, ys.min()-pad),
            min(im.width, xs.max()+pad), min(im.height, ys.max()+pad))

def get_font(sz):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

BG=(246,244,241); INK=(43,38,36); ACC=(176,138,74); HDR=(32,28,26)

def header(sheet, d, title, subtitle):
    d.rectangle([0, 0, sheet.width, 120], fill=HDR)
    d.text((36, 26), title, font=get_font(40), fill=(246,244,241))
    d.text((36, 78), subtitle, font=get_font(22), fill=ACC)

def place_row(sheet, d, items, cy, CW, CH, label_sz=20):
    for i, (p, label) in enumerate(items):
        im = Image.open(p).convert("RGB")
        if label.startswith(("1 ", "2 ", "3 ", "4 ", "5 ", "6 ")):
            im = im.crop(fig_bbox(im))
        im.thumbnail((CW-16, CH-16))
        cx = 20 + i*(CW+20)
        d.rectangle([cx, cy, cx+CW, cy+CH], fill=(255,255,255), outline=(210,204,198), width=2)
        sheet.paste(im, (cx+(CW-im.width)//2, cy+(CH-im.height)//2))
        d.text((cx+6, cy+CH+8), label, font=get_font(label_sz), fill=INK)

def compose_pose_sheet():
    poses = [("poses/pose_01_neutral.png","1 NEUTRAL"),("poses/pose_02_happy.png","2 HAPPY"),
             ("poses/pose_03_thinking.png","3 THINKING"),("poses/pose_04_waving.png","4 WAVING"),
             ("poses/pose_05_surprised.png","5 SURPRISED"),("poses/pose_06_playful.png","6 PLAYFUL")]
    CW,CH,CAP = 620,930,54
    cols,rows = 3,2
    W = cols*CW+(cols+1)*24; H = 150+rows*(CH+CAP)+(rows+1)*24
    sheet = Image.new("RGB",(W,H),BG); d = ImageDraw.Draw(sheet)
    header(sheet, d, "WAIFU CUTE DESKTOP  -  FULL-BODY POSE REFERENCE SHEET v1",
           "canonical character - six animation reference poses - same identity in every pose")
    for i,(p,label) in enumerate(poses):
        im = Image.open(p).convert("RGB").crop(fig_bbox(Image.open(p)))
        im.thumbnail((CW-16,CH-16))
        cx = 24+(i%cols)*(CW+24); cy = 150+24+(i//cols)*(CH+CAP+24)
        d.rectangle([cx,cy,cx+CW,cy+CH],fill=(255,255,255),outline=(210,204,198),width=2)
        sheet.paste(im,(cx+(CW-im.width)//2, cy+(CH-im.height)//2))
        d.text((cx+8,cy+CH+12),label,font=get_font(30),fill=INK)
    sheet.save("poses/pose_reference_sheet.png"); print("pose sheet:", sheet.size)

def compose_expression_sheet():
    canon = [("expressions/canon_happy.png","HAPPY (canon)"),("expressions/canon_curious.png","CURIOUS (canon)"),
             ("expressions/canon_surprised.png","SURPRISED (canon)"),("expressions/canon_wink.png","WINK (canon)"),
             ("expressions/canon_sad.png","SAD (canon)"),("expressions/canon_angry.png","ANGRY (canon)")]
    close = [("expressions/expression_happy_closeup.png","HAPPY close-up (gen)"),
             ("expressions/expression_surprised_closeup.png","SURPRISED close-up (gen)"),
             ("expressions/expression_thinking_closeup.png","THINKING close-up (gen)"),
             ("expressions/expression_wink_closeup.png","WINK close-up (gen)")]
    EW,EH = 340,360
    W = 6*EW+7*20; H = 150+2*(EH+50)+3*20
    sheet = Image.new("RGB",(W,H),BG); d = ImageDraw.Draw(sheet)
    header(sheet, d, "WAIFU CUTE DESKTOP  -  EXPRESSION REFERENCE SHEET v1",
           "row 1: cropped from approved sheet  |  row 2: generated high-res close-ups")
    place_row(sheet, d, canon, 170, EW, EH)
    place_row(sheet, d, close, 170+(EH+50)+20, EW, EH)
    sheet.save("expressions/expression_reference_sheet.png"); print("expression sheet:", sheet.size)

def compose_viseme_sheet():
    vis = [("expressions/viseme_A.png","A  -  open ah"),("expressions/viseme_I.png","I  -  wide ee"),
           ("expressions/viseme_U.png","U  -  pursed oo"),("expressions/viseme_E.png","E  -  half eh"),
           ("expressions/viseme_O.png","O  -  round oh")]
    EW,EH = 340,360
    W = 5*EW+6*20; H = 150+(EH+50)+60
    sheet = Image.new("RGB",(W,H),BG); d = ImageDraw.Draw(sheet)
    header(sheet, d, "WAIFU CUTE DESKTOP  -  MOUTH SHAPE (VISEME) REFERENCE v1",
           "art guidance for the talk animation - rig visemes are authored in Live2D Cubism Editor")
    place_row(sheet, d, vis, 170, EW, EH)
    sheet.save("expressions/viseme_reference_sheet.png"); print("viseme sheet:", sheet.size)

if __name__ == "__main__":
    compose_pose_sheet()
    compose_expression_sheet()
    compose_viseme_sheet()
