export interface CaveSurfaceBounds { l:number; r:number; t:number; b:number; width:number; height:number; }

/** Crop only discarded room fragments, preserving the original sample grid exactly. */
export function cropCaveSurface(l:number,r:number,t:number,b:number,zoom:number,resolution:number,
    roomX:number,roomY:number,roomWidth:number,roomHeight:number):CaveSurfaceBounds|null {
    const width=Math.ceil((r-l)*zoom*resolution),height=Math.ceil((b-t)*zoom*resolution);
    if(width<=0||height<=0)return null;
    const stepX=(r-l)/width,stepY=(b-t)/height;
    // One full source pixel guards fractional alpha coverage at the silhouette.
    const x0=Math.max(0,Math.floor((roomX-l)/stepX)-1),x1=Math.min(width,Math.ceil((roomX+roomWidth-l)/stepX)+1);
    const y0=Math.max(0,Math.floor((roomY-t)/stepY)-1),y1=Math.min(height,Math.ceil((roomY+roomHeight-t)/stepY)+1);
    if(x1<=x0||y1<=y0)return null;
    return {l:l+x0*stepX,r:l+x1*stepX,t:t+y0*stepY,b:t+y1*stepY,width:x1-x0,height:y1-y0};
}
