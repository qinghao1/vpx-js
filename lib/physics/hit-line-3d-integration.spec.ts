import { describe, it, expect } from 'vitest'
import { Vertex3D } from '../util/math.js'
import { HitLine3D } from './hit-line-3d.js'
import { CollisionEvent } from './collision-event.js'

function vpinballRotation(axis: Vertex3D, s: number, c: number) {
  const { x, y, z } = axis; const oc = 1 - c
  return { m00: x*x + c*(1-x*x), m01: x*y*oc + z*s, m02: z*x*oc - y*s, m10: x*y*oc - z*s, m11: y*y + c*(1-y*y), m12: y*z*oc + x*s, m20: z*x*oc + y*s, m21: y*z*oc - x*s, m22: z*z + c*(1-z*z) }
}
function refHitLineZ(bx:number,by:number,bz:number,vx:number,vy:number,vz:number,r:number,lx:number,ly:number,zl:number,zh:number,dt:number){
  const C_CONTACTVEL=0.099, PHYS_TOUCH=0.05
  let dx=bx-lx, dy=by-ly, d2=dx*dx+dy*dy, d=Math.sqrt(d2)
  if(d<=1e-6) return {t:-1}
  let b=dx*vx+dy*vy, bnv=b/d
  if(bnv> C_CONTACTVEL) return {t:-1}
  let bnd=d-r, a=vx*vx+vy*vy, t=0
  if(bnd < PHYS_TOUCH){ if(Math.abs(bnv)<=C_CONTACTVEL) t=0; else t=-bnd/bnv } else {
    if(a<1e-8) return {t:-1}
    let disc=4*b*b-4*a*(d2-r*r)
    if(disc<0) return {t:-1}
    let s=Math.sqrt(disc), inv=-0.5/a, t0=(2*b+s)*inv, t1=(2*b-s)*inv
    t = t0*t1<0 ? Math.max(t0,t1) : Math.min(t0,t1)
  }
  if(!Number.isFinite(t)||t<0||t>dt) return {t:-1}
  let hz=bz+vz*t; if(hz<zl||hz>zh) return {t:-1}
  let hx=bx+vx*t, hy=by+vy*t, nx=hx-lx, ny=hy-ly, len=Math.hypot(nx,ny)
  if(len>1e-8){nx/=len;ny/=len}else{nx=0;ny=1}
  return {t,nx,ny,nz:0}
}
describe('HitLine3D integration vs independent vpinball reference', () => {
  it('matches upstream for random segments without using HitLine3D matrix', () => {
    for(let iter=0; iter<100; iter++){
      const rand=(a:number,b:number)=> Math.random()*(b-a)+a
      const v1=new Vertex3D(rand(-30,30),rand(-30,30),rand(0,20))
      const v2=new Vertex3D(rand(-30,30),rand(-30,30),rand(0,20))
      if(v1.clone(true).sub(v2).lengthSq()<2) { iter--; continue }
      const vLine=v2.clone(true).sub(v1); vLine.normalize()
      const axis=new Vertex3D(vLine.y, -vLine.x, 0)
      const l=axis.lengthSq()
      if(l<=1e-6) axis.set(1,0,0); else axis.divideScalar(Math.sqrt(l))
      const dot=vLine.z, s=-Math.sqrt(Math.max(0,1-dot*dot)), c=dot
      const m=vpinballRotation(axis,s,c)
      const t1x=m.m00*v1.x+m.m01*v1.y+m.m02*v1.z
      const t1y=m.m10*v1.x+m.m11*v1.y+m.m12*v1.z
      const t1z=m.m20*v1.x+m.m21*v1.y+m.m22*v1.z
      const t2z=m.m20*v2.x+m.m21*v2.y+m.m22*v2.z
      const lx=t1x, ly=t1y, zl=Math.min(t1z,t2z), zh=Math.max(t1z,t2z)
      const hit=new HitLine3D(v1.clone(true), v2.clone(true))
      const e=(hit as any).matrix.elements as number[]
      expect(e[0]).toBeCloseTo(m.m00,4); expect(e[3]).toBeCloseTo(m.m01,4); expect(e[6]).toBeCloseTo(m.m02,4)
      expect(e[1]).toBeCloseTo(m.m10,4); expect(e[4]).toBeCloseTo(m.m11,4); expect(e[7]).toBeCloseTo(m.m12,4)
      expect(e[2]).toBeCloseTo(m.m20,4); expect(e[5]).toBeCloseTo(m.m21,4); expect(e[8]).toBeCloseTo(m.m22,4)
      expect((hit as any).xy.x).toBeCloseTo(lx,3); expect((hit as any).xy.y).toBeCloseTo(ly,3)
      expect((hit as any).zLow).toBeCloseTo(zl,3); expect((hit as any).zHigh).toBeCloseTo(zh,3)
      const bx=rand(-30,30), by=rand(-30,30), bz=rand(0,20), vx=rand(-15,15), vy=rand(-15,15), vz=rand(-8,8), r=5, dt=0.016
      const pos=new Vertex3D(bx,by,bz), vel=new Vertex3D(vx,vy,vz)
      const ball:any={state:{pos}, hit:{vel, hitBBox:{}, rcHitRadiusSqr:1e9}, data:{radius:r}}
      const coll=CollisionEvent.claim(); coll.hitTime=dt
      const t=hit.hitTest(ball,dt,coll)
      const tbx=m.m00*bx+m.m01*by+m.m02*bz, tby=m.m10*bx+m.m11*by+m.m12*bz, tbz=m.m20*bx+m.m21*by+m.m22*bz
      const tvx=m.m00*vx+m.m01*vy+m.m02*vz, tvy=m.m10*vx+m.m11*vy+m.m12*vz, tvz=m.m20*vx+m.m21*vy+m.m22*vz
      const h=refHitLineZ(tbx,tby,tbz,tvx,tvy,tvz,r,lx,ly,zl,zh,dt) as any
      if(h.t>=0){ const onx=h.nx, ony=h.ny, onz=h.nz; h.nx=m.m00*onx+m.m10*ony+m.m20*onz; h.ny=m.m01*onx+m.m11*ony+m.m21*onz; h.nz=m.m02*onx+m.m12*ony+m.m22*onz }
      if(h.t===-1) expect(t).toBe(-1)
      else { expect(t).toBeCloseTo(h.t,3); expect(coll.hitNormal.x).toBeCloseTo(h.nx,2); expect(coll.hitNormal.y).toBeCloseTo(h.ny,2); expect(coll.hitNormal.z).toBeCloseTo(h.nz,2) }
      CollisionEvent.release(coll); Vertex3D.release(v1,v2,axis,vLine,pos,vel)
    }
  })
  it('wasm batch HitLine3D matches scalar (SoA mapping correct)', async () => {
    const { default: createKernels } = await import('../../wasm/kernels/dist/kernels.js')
    const mod:any= await (createKernels as any)({locateFile:(p:string)=>`wasm/kernels/dist/${p}`})
    const v1=new Vertex3D(0,0,0), v2=new Vertex3D(10,0,10)
    const hit=new HitLine3D(v1,v2)
    const e=(hit as any).matrix.elements as number[]
    const lx=(hit as any).xy.x, ly=(hit as any).xy.y, zl=(hit as any).zLow, zh=(hit as any).zHigh
    const m00=e[0]!, m01=e[3]!, m02=e[6]!, m10=e[1]!, m11=e[4]!, m12=e[7]!, m20=e[2]!, m21=e[5]!, m22=e[8]!
    const bx=5,by=2,bz=5, vx=0,vy=-10,vz=0, r=2, dt=0.016
    const pos=new Vertex3D(bx,by,bz), vel=new Vertex3D(vx,vy,vz)
    const ball:any={state:{pos}, hit:{vel, hitBBox:{}, rcHitRadiusSqr:1e9}, data:{radius:r}}
    const coll=CollisionEvent.claim(); coll.hitTime=dt
    const tScalar=hit.hitTest(ball,dt,coll)
    const p=(v:number)=>{const ptr=mod._malloc(4); new Float32Array(mod.HEAPF32.buffer,ptr,1)[0]=v; return ptr}
    const pLx=p(lx),pLy=p(ly),pZl=p(zl),pZh=p(zh), pM00=p(m00),pM01=p(m01),pM02=p(m02),pM10=p(m10),pM11=p(m11),pM12=p(m12),pM20=p(m20),pM21=p(m21),pM22=p(m22)
    const oT=mod._malloc(4),oC=mod._malloc(4),oNx=mod._malloc(4),oNy=mod._malloc(4),oNz=mod._malloc(4),oDist=mod._malloc(4),oBnv=mod._malloc(4)
    mod._batchHitTestLine3D(1,bx,by,bz,vx,vy,vz,r,pLx,pLy,pZl,pZh,pM00,pM01,pM02,pM10,pM11,pM12,pM20,pM21,pM22,dt,oT,oC,oNx,oNy,oNz,oDist,oBnv)
    const wt=new Float32Array(mod.HEAPF32.buffer,oT,1)[0]!
    const wnx=new Float32Array(mod.HEAPF32.buffer,oNx,1)[0]!
    if(tScalar===-1) expect(wt).toBeCloseTo(-1,3)
    else { expect(wt).toBeCloseTo(tScalar,3); expect(wnx).toBeCloseTo(coll.hitNormal.x,2) }
    ;[pLx,pLy,pZl,pZh,pM00,pM01,pM02,pM10,pM11,pM12,pM20,pM21,pM22,oT,oC,oNx,oNy,oNz,oDist,oBnv].forEach((ptr:number)=>mod._free(ptr))
    CollisionEvent.release(coll); Vertex3D.release(v1,v2,pos,vel)
  })
})
