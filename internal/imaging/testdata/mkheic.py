# Builds a minimal HEIC (HEIF container + one HEVC intra frame) so the tests need no heif-enc.
# Usage: ffmpeg -i in.png -frames:v 1 -c:v libx265 -pix_fmt yuv420p -x265-params "log-level=error:keyint=1:no-info=1:repeat-headers=1:aud=0" -f hevc in.hevc
#        python3 -I mkheic.py in.hevc out.heic WIDTH HEIGHT   (min 64 px on each side for x265)
import struct,sys,re
src,dst,W,H=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])
d=open(src,'rb').read()
idx=[m.start() for m in re.finditer(b'\x00\x00\x01',d)]
nals=[]
for i,s in enumerate(idx):
    e=idx[i+1] if i+1<len(idx) else len(d)
    n=d[s+3:e]
    while n.endswith(b'\x00'): n=n[:-1]
    nals.append(n)
typ=lambda n:(n[0]>>1)&63
vps=[n for n in nals if typ(n)==32][0];sps=[n for n in nals if typ(n)==33][0];pps=[n for n in nals if typ(n)==34][0]
sl=[n for n in nals if typ(n) in (19,20)]
assert sl
def box(t,p):return struct.pack('>I4s',8+len(p),t)+p
def fb(t,p,v=0,f=0):return box(t,struct.pack('>I',(v<<24)|f)+p)
ptl=sps[3:15]  # after 2-byte NAL header + 1 byte
hvcc=bytes([1])+ptl[0:1]+ptl[1:5]+ptl[5:11]+ptl[11:12]+b'\xf0\x00'+b'\xfc'+b'\xfd'+b'\xf8'+b'\xf8'+b'\x00\x00'+b'\x0f'+bytes([3])
for t,n in ((32,vps),(33,sps),(34,pps)):
    hvcc+=bytes([0x80|t])+struct.pack('>HH',1,len(n))+n
mdat=b''.join(struct.pack('>I',len(n))+n for n in sl)
ftyp=box(b'ftyp',b'heic'+struct.pack('>I',0)+b'mif1heic')
def meta(off):
    hdlr=fb(b'hdlr',struct.pack('>I4s',0,b'pict')+b'\0'*12+b'\0')
    pitm=fb(b'pitm',struct.pack('>H',1))
    iloc=fb(b'iloc',bytes([0x44,0x00])+struct.pack('>HHHHII',1,1,0,1,off,len(mdat)))
    infe=fb(b'infe',struct.pack('>HH4s',1,0,b'hvc1')+b'\0',v=2)
    iinf=fb(b'iinf',struct.pack('>H',1)+infe)
    ispe=fb(b'ispe',struct.pack('>II',W,H))
    ipco=box(b'ipco',ispe+box(b'hvcC',hvcc))
    ipma=fb(b'ipma',struct.pack('>IHBBB',1,1,2,0x01,0x82))
    return fb(b'meta',hdlr+pitm+iloc+iinf+box(b'iprp',ipco+ipma))
m=meta(0);off=len(ftyp)+len(m)+8
m=meta(off)
open(dst,'wb').write(ftyp+m+box(b'mdat',mdat))
