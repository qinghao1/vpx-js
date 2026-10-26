// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import { getDataView } from '../io/binary-helpers.js'
import type { Texture } from './texture.js'

/** Dequantizes a legacy n-bit unsigned value to 0..1. @see upstream src/math/math.h dequantizeUnsigned */
function dequantizeUnsigned(value: number, bits: number): number {
	return Math.min(value / ((1 << bits) - 1), 1)
}

/** VPinball material. @see https://github.com/vpinball/vpinball/blob/master/src/parts/Material.h */
export class Material {
	public name!: string
	public wrapLighting?: number
	public roughness = 0.0
	public glossyImageLerp = 1.0
	public thickness = 0.05
	public edge = 1.0
	public edgeAlpha = 1.0
	public opacity = 1.0
	public baseColor = 0xb469ff
	public glossiness = 0.0
	public clearCoat = 0.0
	public isMetal = false
	public isOpacityActive = false

	public emissiveColor?: number
	public emissiveIntensity = 0
	public emissiveMap?: Texture

	public elasticity = 0.0
	public elasticityFalloff = 0.0
	public friction = 0.0
	public scatterAngle = 0.0

	public static fromSaved(saved: SaveMaterial): Material {
		const material = new Material()
		material.name = saved.szName
		material.baseColor = BiffParser.bgrToRgb(saved.baseColor)
		material.glossiness = BiffParser.bgrToRgb(saved.glossiness)
		material.clearCoat = BiffParser.bgrToRgb(saved.clearCoat)
		material.wrapLighting = saved.wrapLighting
		material.roughness = saved.roughness
		material.glossyImageLerp = 1 - dequantizeUnsigned(saved.glossyImageLerp, 8)
		material.thickness = saved.thickness === 0 ? 0.05 : dequantizeUnsigned(saved.thickness, 8)
		material.edge = saved.edge
		material.opacity = saved.opacity
		material.isMetal = saved.isMetal
		material.isOpacityActive = !!(saved.opacityActiveEdgeAlpha & 1)
		material.edgeAlpha = dequantizeUnsigned(saved.opacityActiveEdgeAlpha >> 1, 7)
		return material
	}

	public static fromSerialized(blob: Record<string, unknown>): Material {
		const m = new Material()
		for (const k of Object.keys(blob)) (m as unknown as Record<string, unknown>)[k] = blob[k]
		return m
	}

	public physUpdate(p: SavePhysicsMaterial): void {
		this.elasticity = p.elasticity
		this.elasticityFalloff = p.elasticityFallOff
		this.friction = p.friction
		this.scatterAngle = p.scatterAngle
	}
}

export class SaveMaterial {
	public static size = 76
	public szName: string
	public baseColor: number
	public glossiness: number
	public clearCoat: number
	public wrapLighting: number
	public isMetal: boolean
	public roughness: number
	public glossyImageLerp: number
	public edge: number
	public thickness: number
	public opacity: number
	public opacityActiveEdgeAlpha: number

	constructor(buf: Uint8Array, i = 0) {
		const off = i * SaveMaterial.size
		const dv = getDataView(buf)
		this.szName = BiffParser.parseNullTerminatedString(buf.subarray(off, off + 32))
		this.baseColor = dv.getInt32(off + 32, true)
		this.glossiness = dv.getInt32(off + 36, true)
		this.clearCoat = dv.getInt32(off + 40, true)
		this.wrapLighting = dv.getFloat32(off + 44, true)
		this.isMetal = dv.getInt8(off + 48) > 0
		this.roughness = dv.getFloat32(off + 52, true)
		this.glossyImageLerp = dv.getUint8(off + 56)
		this.edge = dv.getFloat32(off + 60, true)
		this.thickness = dv.getUint8(off + 64)
		this.opacity = dv.getFloat32(off + 68, true)
		this.opacityActiveEdgeAlpha = dv.getUint8(off + 72)
	}
}

export class SavePhysicsMaterial {
	public static size = 48
	public name: string
	public elasticity: number
	public elasticityFallOff: number
	public friction: number
	public scatterAngle: number

	constructor(buf: Uint8Array, i = 0) {
		const off = i * SavePhysicsMaterial.size
		const dv = getDataView(buf)
		this.name = BiffParser.parseNullTerminatedString(buf.subarray(off, off + 32))
		this.elasticity = dv.getFloat32(off + 32, true)
		this.elasticityFallOff = dv.getFloat32(off + 36, true)
		this.friction = dv.getFloat32(off + 40, true)
		this.scatterAngle = dv.getFloat32(off + 44, true)
	}
}
