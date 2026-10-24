from PIL import Image
import math

def byte(v):return max(0,min(255,round(v)))
def unit(v):
    length=math.sqrt(sum(q*q for q in v)) or 1
    return [q/length for q in v]
def face_normal(vertices):
    a,b,c=vertices;u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
    return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]

def bake_solid(faces,pigment,scale):
    projected=[(v[0]+v[2]*.18,v[1]-v[2]*.26) for vertices,side in faces for v in vertices]
    x0=math.floor(min(v[0] for v in projected)*scale)-1;y0=math.floor(min(v[1] for v in projected)*scale)-1
    x1=math.ceil(max(v[0] for v in projected)*scale)+1;y1=math.ceil(max(v[1] for v in projected)*scale)+1
    w,h=x1-x0+1,y1-y0+1
    depth=[-1e30]*(w*h);color=[(0,0,0,0)]*(w*h);normal=[(0,0,0,0)]*(w*h);detail=[(0,0,0,0)]*(w*h)
    averages={}
    for vertices,side in faces:
        if side:continue
        n=face_normal(vertices)
        if n[2]<0:n=[-q for q in n]
        for vertex in vertices:
            key=tuple(vertex);averages.setdefault(key,[0,0,0])
            for k in range(3):averages[key][k]+=n[k]
    averages={key:unit(v) for key,v in averages.items()}
    visible=0
    for vertices,side in faces:
        a,b,c=vertices;n=face_normal(vertices)
        if not side and n[2]<0:n=[-q for q in n]
        if n[2]-n[0]*.18+n[1]*.26<=0:continue
        length=math.sqrt(sum(q*q for q in n))
        if length<1e-7:continue
        n=unit(n);vertexNormals=[averages.get(tuple(q),n) for q in vertices]
        p=[((q[0]+q[2]*.18)*scale-x0,(q[1]-q[2]*.26)*scale-y0) for q in vertices]
        den=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1])
        if abs(den)<1e-7:continue
        loX=max(0,math.floor(min(q[0] for q in p)));hiX=min(w-1,math.ceil(max(q[0] for q in p)))
        loY=max(0,math.floor(min(q[1] for q in p)));hiY=min(h-1,math.ceil(max(q[1] for q in p)))
        faceDepth=[q[2]-q[0]*.18+q[1]*.26 for q in vertices]
        encoded=tuple(byte((q*.5+.5)*255) for q in n)+(255,)
        rgb=tuple(byte(q*255*(.98 if not side else .90)) for q in pigment)+(255,)
        for y in range(loY,hiY+1):
            for x in range(loX,hiX+1):
                px,py=x+.5,y+.5
                w0=((p[1][1]-p[2][1])*(px-p[2][0])+(p[2][0]-p[1][0])*(py-p[2][1]))/den
                w1=((p[2][1]-p[0][1])*(px-p[2][0])+(p[0][0]-p[2][0])*(py-p[2][1]))/den
                w2=1-w0-w1
                if min(w0,w1,w2)<-1e-5:continue
                index=y*w+x;z=w0*faceDepth[0]+w1*faceDepth[1]+w2*faceDepth[2]
                if z<depth[index]:continue
                depth[index]=z;elevation=w0*a[2]+w1*b[2]+w2*c[2]
                ao=(.74+.25*min(1,max(0,elevation/70)))*(.83 if side else 1)
                color[index]=rgb
                if not side:
                    interpolated=unit([.18*n[k]+.82*(w0*vertexNormals[0][k]+w1*vertexNormals[1][k]+w2*vertexNormals[2][k]) for k in range(3)])
                    encodedPixel=tuple(byte((q*.5+.5)*255) for q in interpolated)+(255,)
                else:encodedPixel=encoded
                normal[index]=encodedPixel;detail[index]=(byte(ao*255),102,byte(elevation/100*255),255)
        visible+=1
    result=[]
    for pixels in [color,normal,detail]:
        im=Image.new('RGBA',(w,h));im.putdata(pixels);result.append(im)
    return x0,y0,result,visible
