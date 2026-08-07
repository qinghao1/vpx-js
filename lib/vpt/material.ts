// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import { getDataView } from '../io/binary-helpers.js'
import type { Texture } from './texture.js'

/** VPinball material. @see https://github.com/vpinball/vpinball/blob/master/Material.h */
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

	public static fromSaved(s: SaveMaterial): Material {
		const m = new Material()
		m.name = s.szName
		m.baseColor = BiffParser.bgrToRgb(s.baseColor)
		m.glossiness = BiffParser.bgrToRgb(s.glossiness)
		m.clearCoat = BiffParser.bgrToRgb(s.clearCoat)
		m.wrapLighting = s.wrapLighting
		m.roughness = s.roughness
		m.glossyImageLerp = 0
		m.thickness = 0
		m.edge = s.edge
		m.opacity = s.opacity
		m.isMetal = s.isMetal
		m.isOpacityActive = !!(s.opacityActiveEdgeAlpha & 1)
		m.edgeAlpha = 0
		return m
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
		this.glossyImageLerp = dv.getInt32(off + 56, true)
		this.edge = dv.getFloat32(off + 60, true)
		this.thickness = dv.getInt32(off + 64, true)
		this.opacity = dv.getFloat32(off + 68, true)
		this.opacityActiveEdgeAlpha = dv.getInt32(off + 72, true)
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
