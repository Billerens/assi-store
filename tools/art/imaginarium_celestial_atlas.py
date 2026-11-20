"""Bake the original etched illustrations on the library globe. Requires Pillow."""
from math import cos, sin, pi, exp
from pathlib import Path
from random import Random
from PIL import Image, ImageDraw, ImageFont

W, H = 1536, 768
image = Image.new("RGB", (W, H))
pixel = image.load()
rng = Random(61475)
for x in range(W):
    lon = x * 2*pi/W
    band = H*(.49+.18*sin(lon-.2)+.09*cos(2*lon))
    for y in range(H):
        light = exp(-((y-band)/62)**2) * (.6+.23*sin(5*lon+y*.022)+.17*cos(7*lon-y*.04))
        patina = rng.uniform(-2.3,2.3) + 2*cos(y*.018+2*lon)
        pixel[x,y] = tuple(max(0, int(c + q*light + patina)) for c,q in [(32,34),(61,40),(73,39)])
d = ImageDraw.Draw(image)
grid = (79,105,105)
for x in range(0,W,64):
    d.line((x,0,x,H),fill=grid)
for y in range(64,H,64):
    d.line((0,y,W,y),fill=grid)
for dx in range(0,W,48):
    for yy in (192,384,576):
        d.line((dx,yy-2,dx,yy+2),fill=(145,151,132))
for i in range(11500):
    x = rng.randrange(W)
    y = int(rng.gauss(H*(.49+.18*sin(x*2*pi/W-.2)+.09*cos(x*4*pi/W)), 35))
    if 0<=y<H:
        c=rng.randrange(78,125)
        d.point((x,y),fill=(c-7,c+12,c+13))
for i in range(2100):
    x,y=rng.randrange(W),rng.randrange(H)
    r=rng.random()
    c=(155,162,140) if r<.78 else (232,211,156)
    d.point((x,y),fill=c)
    if r>.92: d.ellipse((x-1,y-1,x+1,y+1),fill=c)

def lettering(fonts, size):
    for name in fonts:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()

font = lettering(["palai.ttf", "DejaVuSerif-Italic.ttf", "Times New Roman Italic.ttf"], 20)
small = lettering(["pala.ttf", "DejaVuSerif.ttf", "Times New Roman.ttf"], 13)
ink=(209,185,130)
shade=(137,150,128)
paper=(237,216,161)

def star(x,y,r):
    d.polygon([(x,y-r),(x+r*.19,y-r*.21),(x+r*.82,y),(x+r*.19,y+r*.2),
               (x,y+r),(x-r*.18,y+r*.2),(x-r*.82,y),(x-r*.18,y-r*.21)],fill=paper)
def engrave(cx,cy,scale):
    def pts(seq): return [(cx+x*scale,cy+y*scale) for x,y in seq]
    def path(seq, color=ink, width=2):
        d.line(pts(seq),fill=color,width=width,joint="curve")
    def oval(box,color=ink,width=1):
        d.ellipse(pts([box[:2],box[2:]]),outline=color,width=width)
    def dot(x,y,r=3): star(cx+x*scale,cy+y*scale,r)
    return path,oval,dot

def bird(cx,cy,s):
    path,oval,dot=engrave(cx,cy,s)
    path([(-79,17),(-42,14),(-59,4),(-82,-17),(-92,-33),(-55,-15),(-80,-50),(-39,-24),(-47,-56),(-22,-30),(-16,-56),(1,-23),(18,-7),(37,-8),(44,-22),(47,-46),(55,-59),(67,-63),(76,-59),(78,-54),(92,-51),(75,-49),(65,-52),(60,-46),(59,-21),(57,-2),(46,13),(29,23),(6,27),(-19,26),(-46,23),(-79,17)])
    path([(-58,11),(-19,16),(0,11),(12,3),(22,0)],shade)
    for x,y in [(-80,-25),(-62,-33),(-46,-36),(-28,-38),(-13,-38)]:
        path([(x,y),(x+21,y+25),(x+30,y+32),(2,13)],shade,1)
    for k in range(7):
        path([(-35+7*k,20),(-31+7*k,23),(-27+7*k,22)],shade,1)
    dot(68,-58,2); dot(-43,-24); dot(5,14); dot(47,-4); dot(-67,13)
def ship(cx,cy,s):
    path,oval,dot=engrave(cx,cy,s)
    path([(-85,18),(-65,21),(-56,28),(36,28),(63,13),(88,7),(69,22),(42,42),(-52,42),(-68,34),(-85,18)])
    for n in range(3): path([(-67+n*6,26+n*4),(-42,34+n*2),(38,32+n*3),(64-n*4,21+n*4)],shade,1)
    for x,top,w in [(-38,-32,20),(2,-61,27),(36,-36,18)]:
        path([(x,27),(x,top-6)]);path([(x-w,top+12),(x+w,top+9)])
        path([(x-w+3,top+12),(x-w-3,top+29),(x-w-6,top+42),(x-1,top+36),(x+w-1,top+37),(x+w+1,top+21),(x+w,top+10)])
        for k in range(-2,3):path([(x+6*k,top+14),(x+6*k-2,top+24),(x+6*k-3,top+33)],shade,1)
        path([(x,top-5),(x+13,top-7),(x+6,top-2),(x,top-2)])
        path([(x,top+2),(-62 if x<0 else 63,25)],shade,1)
    dot(2,-64); dot(-63,25); dot(41,39); dot(64,14);dot(-37,-34)
def fish(cx,cy,s):
    path,oval,dot=engrave(cx,cy,s)
    path([(-82,0),(-63,-15),(-37,-25),(-14,-27),(7,-24),(31,-16),(50,-7),(74,-25),(72,-13),(67,0),(76,23),(61,18),(48,10),(28,16),(12,23),(-18,27),(-44,23),(-69,12),(-82,0)])
    path([(-34,-22),(-25,-11),(-22,2),(-27,15),(-35,23)])
    path([(-21,-27),(-1,-45),(20,-43),(12,-36),(29,-34),(16,-23)])
    path([(-14,24),(0,39),(14,44),(8,27),(22,31),(19,23)])
    path([(-80,2),(-65,5),(-59,4)])
    for row in range(4):
        for col in range(7-row%2):
            x,y=-13+col*7+(row%2)*3,-15+row*8
            path([(x,y),(x+3,y+2),(x+4,y+5),(x+1,y+7)],shade,1)
    oval((-60,-10,-50,0));dot(-55,-5,2);dot(7,-26);dot(50,0);dot(-32,21)
def moth(cx,cy,s):
    path,oval,dot=engrave(cx,cy,s)
    for side in (-1,1):
        def sidepath(points,col=ink,w=2): path([(side*x,y) for x,y in points],col,w)
        sidepath([(5,-8),(24,-34),(59,-53),(88,-59),(80,-34),(70,-13),(52,3),(61,12),(47,25),(34,38),(25,45),(18,41),(19,29),(4,15)])
        for x,y in [(80,-51),(67,-30),(59,-13),(48,-2),(34,32)]:
            sidepath([(5,1),(25+(x-60)*.13,-8),(x,y)],shade,1)
        sidepath([(3,-17),(10,-31),(21,-35),(20,-31)],ink,1)
        a,b=side*51,-25;oval((a-7,b-8,a+7,b+10),shade)
    oval((-5,-13,5,24));dot(0,18);dot(-60,-48);dot(60,-48);dot(24,41)
def lyre(cx,cy,s):
    path,oval,dot=engrave(cx,cy,s)
    for sign in (-1,1):
        pts=[(12,32),(32,25),(48,7),(48,-9),(36,-32),(34,-44),(39,-49),(45,-48),(47,-42),(43,-40),(37,-41),(38,-30),(54,-13),(57,4),(51,23),(38,38),(20,49),(0,50)]
        path([(x*sign,y) for x,y in pts]);dot(sign*42,-48,3)
    path([(-38,-34),(38,-34)],ink,3)
    for x in range(-24,25,8): path([(x,-35),(x*.72,31)],paper,1)
    path([(-32,23),(-17,32),(17,32),(32,23)])
    for dx in range(-22,25,6):path([(dx,36),(dx+3,40)],shade,1)
    dot(0,46)
def dial(cx,cy,s):
    path,oval,dot=engrave(cx,cy,s)
    for n in [40,46,51]:oval((-n,-n,n,n))
    for j in range(32):
        a=j*pi/16
        path([(42*cos(a),42*sin(a)),(48*cos(a),48*sin(a))],shade,1)
    for j in range(8):
        a=j*pi/4
        def point(q,l):return (q*cos(a+l),q*sin(a+l))
        radius=38 if j%2==0 else 24
        path([point(6,-.5),point(radius,0),point(6,.5),(0,0),point(radius,0)],paper,1)
    dot(0,0)
for fn,cx,cy,s,title in [(ship,194,390,1.30,"Navis nocturna"),(bird,472,340,1.16,"Cygnus"),
                        (lyre,753,413,1.12,"Lyra"),(fish,994,333,1.22,"Piscis argenteus"),
                        (moth,1304,396,1.32,"Phalaena"),(dial,358,166,.74,"Polus")]:
    fn(cx,cy,s)
    d.text((cx,cy+64*s),title,font=font,fill=paper,anchor="mt",stroke_width=1,stroke_fill=(43,66,70))
for x,y,title in [(80,175,"OCCIDENS"),(684,168,"BOREAS"),(1086,528,"VIA  LACTEA"),(500,565,"MERIDIES")]:
    d.text((x,y),title,font=small,fill=(169,173,149),anchor="mt")
for off in (0,3):
    d.line([(x,H*(.52+.23*sin(x*2*pi/W+1.05))+off) for x in range(0,W,2)], fill=(151,147,112))
destination = Path(__file__).resolve().parents[2]/'imaginarium/ui/art/celestial-atlas.webp'
destination.parent.mkdir(parents=True,exist_ok=True)
image.save(destination,quality=89,method=6)
