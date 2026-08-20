import { Color, DoubleSide, FrontSide, type Texture as ThreeTexture } from 'three'
import { Fn, texture, uniform, uv, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

export interface BakedNodeMaterialOptions {
	map: ThreeTexture
	tint?: number
	emissionScale?: number
	doubleSided?: boolean
	polygonOffset?: boolean
	polygonOffsetFactor?: number
	polygonOffsetUnits?: number
}

export function createUnshadedBakedNodeMaterial(options: BakedNodeMaterialOptions): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const uEmissionScale = uniform(options.emissionScale ?? 1.0)
	const uTintColor = uniform(new Color(options.tint ?? 0xffffff))
	const texNode = texture(options.map, uv())

	mat.colorNode = Fn(() => {
		const texColor = texNode
		const finalRgb = texColor.rgb.mul(uTintColor).mul(uEmissionScale)
		return vec4(finalRgb, texColor.a)
	})()

	mat.side = options.doubleSided ? DoubleSide : FrontSide
	mat.depthWrite = true
	mat.transparent = false
	mat.toneMapped = false

	if (options.polygonOffset) {
		mat.polygonOffset = true
		mat.polygonOffsetFactor = options.polygonOffsetFactor ?? -1
		mat.polygonOffsetUnits = options.polygonOffsetUnits ?? -1
	}

	;(mat.userData as any).__uEmissionScale = uEmissionScale
	return mat
}
