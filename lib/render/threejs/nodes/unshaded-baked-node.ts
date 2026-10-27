import {
	AddEquation,
	BackSide,
	Color,
	CustomBlending,
	DoubleSide,
	OneFactor,
	OneMinusSrcAlphaFactor,
	SrcAlphaFactor,
	type Texture as ThreeTexture,
} from 'three'
import { Fn, float, positionWorld, sqrt, step, texture, uniform, uv, vec2, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { copyPendingKeys, setNodeMapSlot } from '../material-shared.js'
import { getTransmissionTexture, TRANSMISSION_OPAQUE_CUTOFF } from '../transmission-buffer.js'
import { inLiftVolume, uTransArea } from './primitive-bdl-node.js'

// Pending-texture placeholder alpha: 0 so the quad emits nothing under the
// SrcAlpha blend state below. WebGPU applies CustomBlending even with
// transparent=false, so 1 would render an opaque black quad until the texture
// streams in. Must stay 0.
export const BAKED_PLACEHOLDER_ALPHA = 0

export interface BakedNodeMaterialOptions {
	map?: ThreeTexture
	mapName?: string
	tint?: number
	alphaTestValue?: number
	doubleSided?: boolean
	polygonOffset?: boolean
	polygonOffsetFactor?: number
	polygonOffsetUnits?: number
	transmission?: boolean
}

export function createUnshadedBakedNodeMaterial(options: BakedNodeMaterialOptions): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const uTintColor = uniform(new Color(options.tint ?? 0xffffff))
	const useTransmission = options.transmission !== false
	const transTex = useTransmission ? getTransmissionTexture() : null
	// Playfield-UV lookup for the bulb lift below.
	const lightUv = () =>
		vec2(positionWorld.x.div(uTransArea.x).add(float(0.5)), float(0.5).sub(positionWorld.z.div(uTransArea.y)))
	const rebuild = (map: ThreeTexture | null): void => {
		if (map) {
			const texNode = texture(map, uv())
			mat.colorNode = Fn(() => {
				const texColor = texNode
				// Upstream never dims the diffuse albedo: the global emission
				// scale only weights the light terms (Renderer.cpp SetupShaders
				// scales fenvEmissionScale/cAmbient_LightRange/point-light
				// emission; fs_basic.sc lightLoop and fs_unshaded.sc multiply
				// the unscaled diffuse). Dimming the albedo here starved every
				// lamp-free baked area (e.g. the TWD apron at scale 0.25) and
				// halved the sqrt transmission lift below with it.
				const baseRgb = texColor.rgb.mul(uTintColor)
				// Upstream consumes the bulb buffer exactly once, as an additive
				// tail (fs_basic.sc: color.rgb += sqrt(diffuse) * bulb * color.a
				// with diffuse = the unlit texel, gated on color.a < 1.0 and
				// mixed by the below flag fDisableLighting_top_below.y). The
				// unlit diffuse is never scaled by the bulb field: lightLoop
				// only sums the scene point lights and env (material.sh), while
				// the buffer itself is filled by the LIGHT_BUFFER pass
				// (light.cpp: bulb halo intensity x transmissionScale). The lift
				// stays inside the lift volume (playfield footprint plus height
				// gate): out-of-range room fragments must not sample the clamped
				// edge texel, and below-table geometry sharing the footprint
				// must stay dark. With the buffer black (lamps off) the lift is
				// zero and the bake renders its albedo unchanged.
				if (transTex) {
					const bulbUv = lightUv()
					const inBounds = inLiftVolume(bulbUv, positionWorld.y)
					const gate = step(texColor.a, TRANSMISSION_OPAQUE_CUTOFF)
					const lift = sqrt(baseRgb)
						.mul(texture(transTex, bulbUv).rgb)
						.mul(texColor.a)
						.mul(gate)
						.mul(inBounds)
					return vec4(baseRgb.add(lift), texColor.a)
				}
				return vec4(baseRgb, texColor.a)
			})()
		} else if ((mat.userData as Record<string, unknown>).__mapName != null) {
			// The file references a texture that has not streamed in yet. Native
			// loads synchronously so it has no placeholder state; emit nothing
			// until arrival to avoid a full-strength flat quad flashing in place.
			mat.colorNode = Fn(() => vec4(0, 0, 0, BAKED_PLACEHOLDER_ALPHA))()
		} else {
			// No texture by design (untextured solid): render the tint directly.
			mat.colorNode = Fn(() => vec4(uTintColor, 1))()
		}
	}
	const userData = mat.userData as Record<string, unknown>
	userData.__rebuild = rebuild
	if (useTransmission) userData.__transmission = true
	userData.__mapName = options.mapName ?? (options.map as { name?: string })?.name
	const map = options.map ?? null
	userData.__map = map
	rebuild(map)

	userData.__isBaked = true
	userData.__bakedNode = true
	mat.side = options.doubleSided !== false ? DoubleSide : BackSide
	mat.depthWrite = true
	mat.transparent = false
	mat.blending = CustomBlending
	mat.blendSrc = SrcAlphaFactor
	mat.blendDst = OneMinusSrcAlphaFactor
	mat.blendEquation = AddEquation
	mat.blendSrcAlpha = OneFactor
	mat.blendDstAlpha = OneMinusSrcAlphaFactor
	mat.blendEquationAlpha = AddEquation
	mat.alphaTest =
		options.alphaTestValue && options.alphaTestValue > 0 && options.alphaTestValue <= 1 ? options.alphaTestValue : 0
	mat.toneMapped = false

	if (options.polygonOffset) {
		mat.polygonOffset = true
		mat.polygonOffsetFactor = options.polygonOffsetFactor ?? -1
		mat.polygonOffsetUnits = options.polygonOffsetUnits ?? -1
	}

	userData.__uTint = uTintColor
	return mat
}

export function isBakedNodeMaterial(mat: unknown): boolean {
	return !!(mat as { userData?: { __bakedNode?: boolean } })?.userData?.__bakedNode
}

export function setBakedMap(mat: unknown, map: ThreeTexture | null, name?: string): boolean {
	return setNodeMapSlot(mat, map, name, isBakedNodeMaterial)
}

export function cloneBakedNodeMaterial<T>(mat: T): T {
	const sourceMaterial = mat as unknown as MeshBasicNodeMaterial & { userData: Record<string, unknown> }
	if (!sourceMaterial?.userData?.__bakedNode || typeof sourceMaterial.clone !== 'function') return mat
	const userData = sourceMaterial.userData
	const tint = (userData.__uTint as { value?: { getHex?: () => number } })?.value?.getHex?.() ?? 0xffffff
	const cloned = createUnshadedBakedNodeMaterial({
		map: (userData.__map as ThreeTexture | null) ?? (sourceMaterial.map as ThreeTexture | undefined) ?? undefined,
		mapName: (userData.__mapName as string) ?? undefined,
		tint,
		alphaTestValue: (userData.__alphaTestValue as number) ?? sourceMaterial.alphaTest ?? 0,
		doubleSided: sourceMaterial.side === DoubleSide,
		polygonOffset: !!sourceMaterial.polygonOffset,
		polygonOffsetFactor: sourceMaterial.polygonOffsetFactor ?? -1,
		polygonOffsetUnits: sourceMaterial.polygonOffsetUnits ?? -1,
		transmission: userData.__transmission === true,
	})
	cloned.name = sourceMaterial.name
	cloned.transparent = sourceMaterial.transparent
	cloned.opacity = sourceMaterial.opacity
	cloned.depthWrite = sourceMaterial.depthWrite
	cloned.depthTest = sourceMaterial.depthTest
	cloned.blending = sourceMaterial.blending
	cloned.blendSrc = sourceMaterial.blendSrc
	cloned.blendDst = sourceMaterial.blendDst
	cloned.blendEquation = sourceMaterial.blendEquation
	cloned.blendSrcAlpha = sourceMaterial.blendSrcAlpha
	cloned.blendDstAlpha = sourceMaterial.blendDstAlpha
	cloned.blendEquationAlpha = sourceMaterial.blendEquationAlpha
	cloned.alphaTest = sourceMaterial.alphaTest
	cloned.side = sourceMaterial.side
	copyPendingKeys(userData, cloned.userData as Record<string, unknown>)
	return cloned as unknown as T
}
