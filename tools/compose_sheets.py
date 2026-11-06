"""Compose the combined pose reference sheet from the six isolated pose PNGs.
Usage: python3 tools/compose_sheets.py   (run from repo root)"""
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

BG=(246,244,241); INK=(43,38,36); ACC=(176,138,74)
poses=[("poses/pose_01_neutral.png","1 NEUTRAL"),("poses/pose_02_happy.png","2 HAPPY"),
       ("poses/pose_03_thinking.png","3 THINKING"),("poses/pose_04_waving.png","4 WAVING"),
       ("poses/pose_05_surprised.png","5 SURPRISED"),("poses/pose_06_playful.png","6 PLAYFUL")]
CW,CH,CAP=620,930,54
cols,rows=3,2
W=cols*CW+(cols+1)*24; H=150+rows*(CH+CAP)+(rows+1)*24
sheet=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(sheet)
d.rectangle([0,0,W,120],fill=(32,28,26))
d.text((36,26),"WAIFU CUTE DESKTOP  -  FULL-BODY POSE REFERENCE SHEET v1",font=get_font(40),fill=(246,244,241))
d.text((36,78),"canonical character - six animation reference poses - same identity in every pose",font=get_font(22),fill=ACC)
for i,(p,label) in enumerate(poses):
    im=Image.open(p).convert("RGB").crop(fig_bbox(Image.open(p)))
    im.thumbnail((CW-16,CH-16))
    cx=24+(i%cols)*(CW+24); cy=150+24+(i//cols)*(CH+CAP+24)
    d.rectangle([cx,cy,cx+CW,cy+CH],fill=(255,255,255),outline=(210,204,198),width=2)
    sheet.paste(im,(cx+(CW-im.width)//2, cy+(CH-im.height)//2))
    d.text((cx+8,cy+CH+12),label,font=get_font(30),fill=INK)
sheet.save("poses/pose_reference_sheet.png")
print("pose sheet rebuilt:", sheet.size)
