"""Bake the Freeboard surface atlases and cloud opacity. Requires NumPy and Pillow."""
from pathlib import Path
import numpy as np
from PIL import Image

dest = Path(__file__).resolve().parents[2]/'freeboard/ui/orbits'
dest.mkdir(exist_ok=True)
W,H=1024,512
lon,lat=np.meshgrid(np.linspace(-np.pi,np.pi,W,endpoint=False,dtype='f')+np.pi/W,
                    np.linspace(np.pi/2,-np.pi/2,H,endpoint=False,dtype='f')-np.pi/(2*H))
def xyz(lon,lat):
    return np.cos(lon)*np.cos(lat),np.sin(lat),np.sin(lon)*np.cos(lat)
X,Y,Z=xyz(lon,lat)
grid=np.random.default_rng(2031).random((64,64,64),dtype=np.float32)
def noise(x,y,z):
    ix=np.floor(x).astype(np.int16);iy=np.floor(y).astype(np.int16);iz=np.floor(z).astype(np.int16)
    a=x-ix;b=y-iy;c=z-iz
    a=a*a*(3-2*a);b=b*b*(3-2*b);c=c*c*(3-2*c)
    def row(j,k):
        left=grid[ix%64,(iy+j)%64,(iz+k)%64]; right=grid[(ix+1)%64,(iy+j)%64,(iz+k)%64]
        return left+(right-left)*a
    ab=row(0,0)*(1-b)+row(1,0)*b
    cd=row(0,1)*(1-b)+row(1,1)*b
    return ab+(cd-ab)*c
def fractal(x,y,z,f,seed=0,count=5):
    val=0.;amp=.52
    for i in range(count):
        val+=amp*noise(x*f+seed+i*1.7,y*f+seed*.7-i*.9,z*f-seed*.19+i*.54)
        f*=2.13;amp*=.5
    return val
def palette(v, stops):
    return np.stack([np.interp(v,[k for k,_ in stops],[c[ch] for _,c in stops]) for ch in range(3)],axis=2)
def put(name,img):
    Image.fromarray(np.uint8(np.clip(img,0,255))).save(dest/(name+'.webp'),quality=91,method=5)
def twist(u,v,cx,cy,sx,sy,spin):
    dx=np.arctan2(np.sin(u-cx),np.cos(u-cx))/sx
    dy=(v-cy)/sy
    a=spin*np.exp(-1.6*(dx*dx+dy*dy))
    return u+sx*(dx*(np.cos(a)-1)-dy*np.sin(a)),v+sy*(dy*(np.cos(a)-1)+dx*np.sin(a))
def sstep(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)

# Vesper: zonal jet streams interrupted by large elliptic anticyclones.
u,v=lon.copy(),lat.copy()
for cx,cy,sx,sy,swirl in [(-1.65,-.26,.44,.23,4.7),(.16,.42,.33,.17,-4),
                         (1.86,-.37,.30,.12,3.8),(-2.71,.19,.28,.12,-4),(.86,-.66,.32,.13,3.4)]:
    u,v=twist(u,v,cx,cy,sx,sy,swirl)
x,y,z=xyz(u,v)
eddy=fractal(x,y,z,5,3)-.5
v2=v+.038*np.sin(4*u+8*v)*np.cos(v)**2+.103*eddy
fine=fractal(x,y*3.7,z,14,9,5)-.49
streak=.078*np.sin(v2*134+fine*7)+.034*np.sin(v2*324+fine*9)
belts=.54+.21*np.sin(v2*16+.31*np.cos(3*v2))+.16*np.sin(v2*34+1.6)+.07*np.sin(v2*70)+streak+fine*.18
# White collar and ochre eye follow the major vortex.
dx=np.arctan2(np.sin(lon+1.65),np.cos(lon+1.65))/.35;dy=(lat+.26)/.13
radius=(dx*dx+dy*dy)**.5
belts+=.18*np.exp(-((radius-.85)/.18)**2)-.23*np.exp(-radius**2*3)
gas=palette(belts,[(0,(96,49,59)),(.22,(145,70,57)),(.39,(191,106,70)),(.52,(219,151,106)),
                   (.64,(210,178,149)),(.75,(234,207,169)),(.91,(244,225,193)),(1,(247,234,209))])
put('vesper',gas)

# An ocean world with shelf water, broken coastal ridges and polar ice.
qx=X+.22*(fractal(X,Y,Z,2.1,19,3)-.52);qy=Y+.20*(fractal(X,Y,Z,2.2,42,3)-.5)
height=fractal(qx,qy,Z,2.7,27,7)+.040*np.cos(3*lon+.32)*np.cos(lat)**2
hill=fractal(X,Y,Z,13,13,6);arch=1-np.abs(2*hill-1)
rock=palette(height,[(.22,(10,36,62)),(.37,(15,56,81)),(.46,(17,76,88)),(.49,(25,100,106)),
                     (.502,(49,136,131)),(.508,(99,161,145)),(.513,(199,184,133)),(.522,(132,143,98)),
                     (.57,(76,113,85)),(.62,(82,101,74)),(.68,(136,131,99)),(.78,(190,177,150))])
land=sstep(.515,.533,height)
dyd,dxd=np.gradient(height+.12*hill+.035*arch)
relief=(np.clip(-dyd*13-dxd*22,-.38,.41)*land)[...,None]
rock*=1+relief
ice=sstep(1.19,1.49,np.abs(lat)+.28*(hill-.49))
rock=rock*(1-ice[...,None])+np.array([204,224,221])*ice[...,None]
put('pelagos',rock)

# The cloud layer has its own spherical coordinates and angular velocity.
u,v=lon.copy(),lat.copy()
for cx,cy,sx,sy,spin in [(-1.5,.24,.55,.38,-3.6),(.72,-.6,.48,.29,3.8),
                          (2.64,.50,.52,.29,-3.3),(-2.5,-.71,.37,.32,3.3)]:
    u,v=twist(u,v,cx,cy,sx,sy,spin)
x,y,z=xyz(u,v+.10*np.sin(3*u+7*v)*np.cos(v)**2)
weather=fractal(x,y*2,z,4.4,8,7)
wisps=fractal(x,y*3.4,z,15.7,43,4)
breaks=fractal(X,Y,Z,22,53,5)
storm=sstep(.50,.67,weather+.17*(wisps-.48)+.21*(breaks-.51))
eye=np.hypot(np.arctan2(np.sin(lon+1.5),np.cos(lon+1.5))/.55,(lat-.24)/.38)
storm*=.18+.82*sstep(.018,.125,eye)
put('cloud-bands',np.clip(storm*255,0,255))

# Oriole: dry iron plateaux and impact basins. Each crater is mapped on the
# tangent plane at its own latitude to keep high-latitude craters circular.
terrain=fractal(X,Y,Z,4.0,32,7)
ridge=1-np.abs(2*fractal(X,Y,Z,7,12,6)-1)
height=terrain*.63+ridge*.28
ripple=fractal(X,Y,Z,39,7,4)
rimColour=np.zeros_like(X)
random=np.random.default_rng(731)
for i in range(135):
    cx=random.uniform(-np.pi,np.pi);cy=np.arcsin(random.uniform(-.96,.96))
    width=.155 if i<4 else random.uniform(.013,.074)
    dx=np.arctan2(np.sin(lon-cx),np.cos(lon-cx))*np.cos(cy);dy=lat-cy
    r=(dx*dx+dy*dy)**.5/width
    r+=.12*(ripple-.49)
    rim=np.exp(-((r-1.03)/.15)**2)
    bowl=np.maximum(0,1-np.minimum(r,1)**2)
    height+=width*(2.6*rim-3.3*bowl+1.2*np.exp(-r*r*42))
    rimColour+=.077*rim-.056*bowl
red=palette(terrain+rimColour+.05*(ridge-.60),[(.15,(88,62,57)),(.34,(135,89,64)),(.44,(172,118,78)),
              (.52,(181,141,94)),(.61,(201,166,111)),(.72,(214,184,137)),(.89,(235,215,170))])
gy,gx=np.gradient(height)
red*=1+np.clip(-gy*11-gx*14,-.46,.43)[...,None]
put('oriole',red)
print([(p.name,p.stat().st_size) for p in dest.glob('*.webp')])
