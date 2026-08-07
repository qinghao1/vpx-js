// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import type { Texture } from './texture.js'

/**
 * VPinball's material definition.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/Material.h
 */
export class Material {
	public name!: string
	/**
	 *  Wrap/rim lighting factor (0(off)..1(full))
	 */
	public wrapLighting?: number

	/** Roughness (0..1, maps to 2..2048 exponent). */
	public roughness: number = 0.0
	/** Glossy image lerp (0..1). */
	public glossyImageLerp: number = 1.0
	/** Thickness (0..1). */
	public thickness: number = 0.05
	/** Edge weight (0..1). */
	public edge: number = 1.0
	public edgeAlpha: number = 1.0
	public opacity: number = 1.0
	/** Base color (overridable by texture). */
	public baseColor: number = 0xb469ff
	/** Glossiness. */
	public glossiness: number = 0.0
	/** Clearcoat. */
	public clearCoat: number = 0.0
	/** Is metal. */
	public isMetal: boolean = false
	public isOpacityActive: boolean = false

	// these are a additional props
	public emissiveColor?: number
	public emissiveIntensity: number = 0
	public emissiveMap?: Texture

	// physics
	public elasticity: number = 0.0
	public elasticityFalloff: number = 0.0
	public friction: number = 0.0
	public scatterAngle: number = 0.0

	public static fromSaved(saveMaterial: SaveMaterial): Material {
		const material = new Material()
		material.name = saveMaterial.szName
		material.baseColor = BiffParser.bgrToRgb(saveMaterial.baseColor)
		material.glossiness = BiffParser.bgrToRgb(saveMaterial.glossiness)
		material.clearCoat = BiffParser.bgrToRgb(saveMaterial.clearCoat)
		material.wrapLighting = saveMaterial.wrapLighting
		material.roughness = saveMaterial.roughness
		material.glossyImageLerp = 0 //1.0f - dequantizeUnsigned<8>(mats[i].fGlossyImageLerp); //!! '1.0f -' to be compatible with previous table versions
		material.thickness = 0 //(mats[i].fThickness == 0) ? 0.05f : dequantizeUnsigned<8>(mats[i].fThickness); //!! 0 -> 0.05f to be compatible with previous table versions
		material.edge = saveMaterial.edge
		material.opacity = saveMaterial.opacity
		material.isMetal = saveMaterial.isMetal
		material.isOpacityActive = !!(saveMaterial.opacityActiveEdgeAlpha & 1)
		material.edgeAlpha = 0 //dequantizeUnsigned<7>(mats[i].bOpacityActiveEdgeAlpha >> 1);
		return material
	}

	public static fromSerialized(blob: { [key: string]: any }): Material {
		const material = new Material()

		// primitives
		for (const key of Object.keys(blob)) {
			;(material as any)[key] = blob[key]
		}

		return material
	}

	public physUpdate(savePhysMat: SavePhysicsMaterial) {
		this.elasticity = savePhysMat.elasticity
		this.elasticityFalloff = savePhysMat.elasticityFallOff
		this.friction = savePhysMat.friction
		this.scatterAngle = savePhysMat.scatterAngle
	}
}

/** SaveMaterial. */
export class SaveMaterial {
	public static size = 76

	public szName: string
	public baseColor: number // can be overriden by texture on object itself
	public glossiness: number // specular of glossy layer
	public clearCoat: number // specular of clearcoat layer
	public wrapLighting: number // wrap/rim lighting factor (0(off)..1(full))
	public isMetal: boolean // is a metal material or not
	public roughness: number // roughness of glossy layer (0(diffuse)..1(specular))
	public glossyImageLerp: number // use image also for the glossy layer (0(no tinting at all)..1(use image)), stupid quantization because of legacy loading/saving
	public edge: number // edge weight/brightness for glossy and clearcoat (0(dark edges)..1(full fresnel))
	public thickness: number // thickness for transparent materials (0(paper thin)..1(maximum)), stupid quantization because of legacy loading/saving
	public opacity: number // opacity (0..1)
	public opacityActiveEdgeAlpha: number

	constructor(buffer: Uint8Array, i = 0) {
		const offset = i * SaveMaterial.size
		this.szName = BiffParser.parseNullTerminatedString(buffer.subarray(offset, offset + 32))
		this.baseColor = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt32(offset + 32, true)
		this.glossiness = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt32(offset + 36, true)
		this.clearCoat = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt32(offset + 40, true)
		this.wrapLighting = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 44, true)
		this.isMetal = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt8(offset + 48) > 0
		this.roughness = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 52, true)
		this.glossyImageLerp = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt32(offset + 56, true)
		this.edge = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 60, true)
		this.thickness = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt32(offset + 64, true)
		this.opacity = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 68, true)
		this.opacityActiveEdgeAlpha = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt32(
			offset + 72,
			true,
		)
	}
}

/** SavePhysicsMaterial. */
export class SavePhysicsMaterial {
	public static size = 48

	public name: string
	public elasticity: number
	public elasticityFallOff: number
	public friction: number
	public scatterAngle: number

	constructor(buffer: Uint8Array, i = 0) {
		const offset = i * SavePhysicsMaterial.size
		this.name = BiffParser.parseNullTerminatedString(buffer.subarray(offset, offset + 32))
		this.elasticity = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 32, true)
		this.elasticityFallOff = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(
			offset + 36,
			true,
		)
		this.friction = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 40, true)
		this.scatterAngle = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset + 44, true)
	}
}
