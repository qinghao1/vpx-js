import { describe, it, expect } from 'vitest'
import { Matrix2D } from './matrix.js'
import { Vertex3D } from './vector.js'
import { Vector3 } from 'three'

function vpinballRotation(axis: Vertex3D, s: number, c: number) {
  const { x, y, z } = axis
  const oc = 1 - c
  return {
    m00: x * x + c * (1 - x * x),
    m01: x * y * oc + z * s,
    m02: z * x * oc - y * s,
    m10: x * y * oc - z * s,
    m11: y * y + c * (1 - y * y),
    m12: y * z * oc + x * s,
    m20: z * x * oc + y * s,
    m21: y * z * oc - x * s,
    m22: z * z + c * (1 - z * z),
  }
}

describe('Matrix2D correctly mirrors vpinball', () => {
  it('rotationAroundAxis stores same logical matrix as vpinball m_d', () => {
    const axis = new Vertex3D(0.5, -0.3, 0.2).normalize()
    const s = -0.6, c = 0.8
    const m = new Matrix2D()
    m.rotationAroundAxis(axis, s, c)
    const e = m.elements
    const r = vpinballRotation(axis, s, c)
    expect(e[0]).toBeCloseTo(r.m00, 5)
    expect(e[3]).toBeCloseTo(r.m01, 5)
    expect(e[6]).toBeCloseTo(r.m02, 5)
    expect(e[1]).toBeCloseTo(r.m10, 5)
    expect(e[4]).toBeCloseTo(r.m11, 5)
    expect(e[7]).toBeCloseTo(r.m12, 5)
    expect(e[2]).toBeCloseTo(r.m20, 5)
    expect(e[5]).toBeCloseTo(r.m21, 5)
    expect(e[8]).toBeCloseTo(r.m22, 5)
  })
  it('applyMatrix2D equals THREE Vector3.applyMatrix3 and vpinball operator*', () => {
    const axis = new Vertex3D(0.2, 0.7, -0.4).normalize()
    const m = new Matrix2D()
    m.rotationAroundAxis(axis, -0.5, 0.3)
    const v = new Vertex3D(1, 2, 3)
    const out = v.clone(true).applyMatrix2D(m)
    const three = new Vector3(1, 2, 3).applyMatrix3(m as any)
    expect(out.x).toBeCloseTo(three.x, 5)
    expect(out.y).toBeCloseTo(three.y, 5)
    expect(out.z).toBeCloseTo(three.z, 5)
    const e = m.elements
    const r = { m00: e[0], m01: e[3], m02: e[6], m10: e[1], m11: e[4], m12: e[7], m20: e[2], m21: e[5], m22: e[8] }
    expect(out.x).toBeCloseTo(r.m00 * 1 + r.m01 * 2 + r.m02 * 3, 5)
    expect(out.y).toBeCloseTo(r.m10 * 1 + r.m11 * 2 + r.m12 * 3, 5)
    expect(out.z).toBeCloseTo(r.m20 * 1 + r.m21 * 2 + r.m22 * 3, 5)
  })
  it('multiplyVectorT equals vpinball MulVectorT (transpose)', () => {
    const m = new Matrix2D()
    m.set(1, 2, 3, 4, 5, 6, 7, 8, 9)
    const v = new Vertex3D(10, 20, 30)
    const out = m.multiplyVectorT(v)
    const e = m.elements
    expect(out.x).toBeCloseTo(e[0] * 10 + e[1] * 20 + e[2] * 30, 5)
    expect(out.y).toBeCloseTo(e[3] * 10 + e[4] * 20 + e[5] * 30, 5)
    expect(out.z).toBeCloseTo(e[6] * 10 + e[7] * 20 + e[8] * 30, 5)
    const viaApply = new Vertex3D(10, 20, 30).applyMatrix2D(m)
    expect(out.x).not.toBeCloseTo(viaApply.x, 2)
  })
})
