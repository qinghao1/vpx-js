import { MathUtils } from 'three'
import { describe, expect, it } from 'vitest'
import { Matrix2D, Matrix3D } from './matrix.js'
import { Vertex3D } from './vector.js'

type Row4 = number[][]

const rowIdentity = (): Row4 => [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
const rowTranslate = (x:number,y:number,z:number): Row4 => [[1,0,0,0],[0,1,0,0],[0,0,1,0],[x,y,z,1]]
const rowScale = (sx:number,sy:number,sz:number): Row4 => [[sx,0,0,0],[0,sy,0,0],[0,0,sz,0],[0,0,0,1]]
const rowRotateX = (a:number): Row4 => { const c=Math.cos(a),s=Math.sin(a); return [[1,0,0,0],[0,c,s,0],[0,-s,c,0],[0,0,0,1]] }
const rowRotateY = (a:number): Row4 => { const c=Math.cos(a),s=Math.sin(a); return [[c,0,-s,0],[0,1,0,0],[s,0,c,0],[0,0,0,1]] }
const rowRotateZ = (a:number): Row4 => { const c=Math.cos(a),s=Math.sin(a); return [[c,s,0,0],[-s,c,0,0],[0,0,1,0],[0,0,0,1]] }
const rowMul = (A:Row4,B:Row4): Row4 => { const C=rowIdentity(); for(let i=0;i<4;i++) for(let j=0;j<4;j++){let s=0;for(let k=0;k<4;k++) s+=A[i][k]*B[k][j]; C[i][j]=s;} return C }
const toRow = (m:Matrix3D): Row4 => [[m._11,m._12,m._13,m._14],[m._21,m._22,m._23,m._24],[m._31,m._32,m._33,m._34],[m._41,m._42,m._43,m._44]]
const rowClose = (a:Row4,b:Row4,eps=1e-5):boolean => { for(let i=0;i<4;i++) for(let j=0;j<4;j++) if(Math.abs(a[i][j]-b[i][j])>eps) return false; return true }

describe('Matrix3D D3D row semantics', () => {
	it('identity', () => { expect(rowClose(toRow(new Matrix3D().identity()), rowIdentity())).toBe(true) })
	it('translation', () => { expect(rowClose(toRow(new Matrix3D().setTranslation(10,20,30)), rowTranslate(10,20,30))).toBe(true) })
	it('scaling', () => { const m=new Matrix3D().setScaling(2,3,4); expect(rowClose(toRow(m), rowScale(2,3,4))).toBe(true) })
	it('rotateX matches D3D SetRotateX', () => { const a=MathUtils.degToRad(30); expect(rowClose(toRow(new Matrix3D().rotateXMatrix(a)), rowRotateX(a))).toBe(true) })
	it('rotateY matches D3D SetRotateY', () => { const a=MathUtils.degToRad(45); expect(rowClose(toRow(new Matrix3D().rotateYMatrix(a)), rowRotateY(a))).toBe(true) })
	it('rotateZ matches D3D SetRotateZ', () => { const a=MathUtils.degToRad(60); expect(rowClose(toRow(new Matrix3D().rotateZMatrix(a)), rowRotateZ(a))).toBe(true) })

	it('multiply is row A*B (translate*scale scales translation)', () => {
		const tr=new Matrix3D().setTranslation(5,0,0)
		const sc=new Matrix3D().setScaling(2,2,2)
		const c=tr.clone().multiply(sc)
		expect(rowClose(toRow(c), rowMul(rowTranslate(5,0,0), rowScale(2,2,2)))).toBe(true)
		const c2=sc.clone().multiply(tr)
		expect(rowClose(toRow(c2), rowMul(rowScale(2,2,2), rowTranslate(5,0,0)))).toBe(true)
	})

	it('multiply translates correctly with rotation (T*R rotates translation)', () => {
		const tr=new Matrix3D().setTranslation(5,0,0)
		const rot=new Matrix3D().rotateZMatrix(MathUtils.degToRad(90))
		const c=tr.clone().multiply(rot)
		expect(rowClose(toRow(c), rowMul(rowTranslate(5,0,0), rowRotateZ(MathUtils.degToRad(90))))).toBe(true)
	})

	it('preMultiply is row a*this', () => {
		const a=new Matrix3D().setTranslation(1,0,0)
		const b=new Matrix3D().setScaling(2,2,2)
		const r=a.clone().preMultiply(b) // b * a
		expect(rowClose(toRow(r), rowMul(rowScale(2,2,2), rowTranslate(1,0,0)))).toBe(true)
	})

	it('toRightHanded is translate * scale(1,1,-1)', () => {
		const m=new Matrix3D().setTranslation(1,2,3)
		const rh=m.clone().toRightHanded()
		expect(rowClose(toRow(rh), rowMul(rowTranslate(1,2,3), rowScale(1,1,-1)))).toBe(true)
	})

	it('primitive RecalculateMatrices matches upstream', () => {
		const size={x:2,y:3,z:4}
		const pos={x:10,y:20,z:5}
		const a=[10,20,30, 1,2,3, 40,50,60]
		const rotTrans=new Matrix3D().setTranslation(a[3]!,a[4]!,a[5]!)
		rotTrans.multiply(new Matrix3D().rotateZMatrix(MathUtils.degToRad(a[2]!)))
		rotTrans.multiply(new Matrix3D().rotateYMatrix(MathUtils.degToRad(a[1]!)))
		rotTrans.multiply(new Matrix3D().rotateXMatrix(MathUtils.degToRad(a[0]!)))
		rotTrans.multiply(new Matrix3D().rotateZMatrix(MathUtils.degToRad(a[8]!)))
		rotTrans.multiply(new Matrix3D().rotateYMatrix(MathUtils.degToRad(a[7]!)))
		rotTrans.multiply(new Matrix3D().rotateXMatrix(MathUtils.degToRad(a[6]!)))
		const full=new Matrix3D().setScaling(size.x,size.y,size.z).multiply(rotTrans).multiply(new Matrix3D().setTranslation(pos.x,pos.y,pos.z))
		const RT=rowMul(rowMul(rowMul(rowMul(rowMul(rowMul(rowTranslate(a[3]!,a[4]!,a[5]!), rowRotateZ(MathUtils.degToRad(a[2]!))), rowRotateY(MathUtils.degToRad(a[1]!))), rowRotateX(MathUtils.degToRad(a[0]!))), rowRotateZ(MathUtils.degToRad(a[8]!))), rowRotateY(MathUtils.degToRad(a[7]!))), rowRotateX(MathUtils.degToRad(a[6]!)))
		const ref=rowMul(rowMul(rowScale(size.x,size.y,size.z), RT), rowTranslate(pos.x,pos.y,pos.z))
		expect(rowClose(toRow(full), ref)).toBe(true)
	})

	it('Vector multiplyMatrix matches row MultiplyVector', () => {
		const tr=new Matrix3D().setTranslation(10,20,30)
		const v=new Vertex3D(1,2,3).multiplyMatrix(tr)
		expect(v.x).toBeCloseTo(11,5); expect(v.y).toBeCloseTo(22,5); expect(v.z).toBeCloseTo(33,5)
		const rot=new Matrix3D().rotateZMatrix(MathUtils.degToRad(90))
		const p=new Vertex3D(1,0,0).multiplyMatrix(rot)
		expect(p.x).toBeCloseTo(0,5); expect(p.y).toBeCloseTo(1,5)
	})

	it('multiplyMatrixNoTranslate ignores translation', () => {
		const tr=new Matrix3D().setTranslation(10,20,30)
		const v=new Vertex3D(1,2,3).multiplyMatrixNoTranslate(tr)
		expect(v.x).toBeCloseTo(1,5); expect(v.y).toBeCloseTo(2,5); expect(v.z).toBeCloseTo(3,5)
	})
})

describe('Matrix2D row semantics', () => {
	it('skew * orientation left-multiply', () => {
		const skew=new Matrix2D().createSkewSymmetric(new Vertex3D(0,0,1))
		const ori=new Matrix2D().set(1,0,0, 0,1,0, 0,0,1)
		const out=new Matrix2D().multiplyMatrices(skew, ori)
		// reference row skew * identity = skew
		const e=(out as any).elements
		expect(e[0]).toBeCloseTo(0,5); expect(e[1]).toBeCloseTo(1,5) // _21 = 1? skew should be [0 -1 0; 1 0 0; 0 0 0] but mapping?
	})
})
