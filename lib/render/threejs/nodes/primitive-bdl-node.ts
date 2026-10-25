import {
	AddEquation,
	AdditiveBlending,
	BackSide,
	Color,
	CustomBlending,
	DoubleSide,
	OneFactor,
	OneMinusSrcAlphaFactor,
	SrcAlphaFactor,
	type Texture as ThreeTexture,
	Vector2,
} from 'three'
import { Fn, float, positionWorld, sqrt, step, texture, uniform, uv, vec2, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import { getTransmissionTexture, TRANSMISSION_OPAQUE_CUTOFF } from '../transmission-buffer.js'

export const PRIMITIVE_BDL_KIND = 'bdl'
export const PRIMITIVE_ADDITIVE_KIND = 'additive'

// Scaled playfield extents for the bulb-light buffer lookup, shared by every BDL
// fork. Native (fs_basic.sc) samples its bulb buffer per-pixel in screen space;
// the table-space analog is the fragment's own playfield UV, so each pixel reads
// the light that actually falls on it instead of one anchor texel per primitive.
// The scene root maps table units to world via translate(-w/2,-h/2,0) * rotX(90)
// * scale(s) (see ThreeRenderApi.transformScene; translates apply in the rotated
// frame, so x centers about 0 and table-y lands on world-z centered about 0).
// Hence u = x/(w*s)+0.5 and v = 0.5-z/(h*s) with the scaled extents stored here.
export const uTransArea = uniform(new Vector2(1, 1))

export function setPrimitiveTransmissionArea(width: number, height: number, scale = 1): void {
	const safeWidth = Number.isFinite(width) && width > 0 ? width : 1
	const safeHeight = Number.isFinite(height) && height > 0 ? height : 1
	const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
	uTransArea.value.set(safeWidth * safeScale, safeHeight * safeScale)
}

export interface PrimitiveBdlOptions {
	map?: ThreeTexture
	mapName?: string
	albedo?: number
	opacity?: number
	bdl?: number
	below?: number
	alphaTestValue?: number
	doubleSided?: boolean
	depthBias?: number
}

export interface PrimitiveAdditiveOptions {
	map?: ThreeTexture
	mapName?: string
	tint?: number
	intensity?: number
	alphaTestValue?: number
	doubleSided?: boolean
	depthBias?: number
}

function sideFor(doubleSided?: boolean): typeof DoubleSide | typeof BackSide {
	return doubleSided !== false ? DoubleSide : BackSide
}

export function bdlDiffuseFactor(bdl: number): number {
	return bdl >= 1 ? 0 : 1
}

export function bdlEmissiveCarry(bdl: number): number {
	if (bdl < 1) return 0
	return bdl === 1 ? 2 : bdl
}

export function belowFactor(below: number): number {
	return Math.max(0, 1 - below)
}

export function createPrimitiveBdlMaterial(opts: PrimitiveBdlOptions): MeshStandardNodeMaterial {
	const mat = new MeshStandardNodeMaterial()
	const uAlbedo = uniform(new Color(opts.albedo ?? 0xffffff))
	const uBDL = uniform(opts.bdl ?? 0)
	const uLitF = uniform(bdlDiffuseFactor(opts.bdl ?? 0))
	const uCarry = uniform(bdlEmissiveCarry(opts.bdl ?? 0))
	const uAlpha = uniform(opts.opacity ?? 1)
	const uBelowF = uniform(belowFactor(opts.below ?? 0))
	const uTransTex = getTransmissionTexture()
	const userData = mat.userData as Record<string, unknown>
	userData.__primitiveKind = PRIMITIVE_BDL_KIND
	userData.__uAlbedo = uAlbedo
	userData.__uBDL = uBDL
	userData.__uDim = uLitF
	userData.__uLitF = uLitF
	userData.__uCarry = uCarry
	userData.__uAlpha = uAlpha
	userData.__uBelowF = uBelowF
	userData.__below = opts.below ?? 0
	userData.__mapName = opts.mapName
	userData.__depthBias = opts.depthBias ?? 0
	userData.__alphaTestValue = opts.alphaTestValue ?? 0
	userData.__doubleSided = opts.doubleSided !== false
	const rebuild = (map: ThreeTexture | null): void => {
		// Native (material.sh DoPointLight tail + lightLoop): each light returns
		// mix(litResult, diffuse, BDL), and BDL == 1.0 swaps the point lights for the
		// kept-for-compat 2x diffuse bug. BDL < 1 (including fractional values) takes
		// the lit path with no dimming, so the diffuse factor is boolean, never a
		// (1-BDL) ramp. For BDL >> 1 (TWD drives 130..8500) the mix evaluates to
		// ~BDL x diffuse tonemapped, carried here on emissive so the composite can
		// never subtract scene light and go black. Matches native at BDL 0 (fully
		// lit) and BDL 1 (2x fullbright).
		// Keep one texture node per slot: sharing a single texture node across
		// color/opacity/emissive slots breaks the TSL graph on some drivers, while
		// separate fetches stay correct.
		// Native (fs_basic.sc transmission tail): sqrt(diffuse) * bulbBuffer * alpha
		// is mixed in by (1 - below): script fades below from -1 (2x lift, lamp off)
		// to +1 (none, lamp on), and only lands on non-opaque pixels (color.a < 1).
		// The buffer lives in playfield-UV space and is sampled per-pixel from the
		// fragment's own table location, mirroring the native per-pixel lookup.
		if (map) {
			const texColor = texture(map, uv())
			const texAlpha = texture(map, uv())
			const texDiffuse = texture(map, uv())
			const texTransmission = texture(map, uv())
			mat.colorNode = Fn(() => texColor.rgb.mul(uAlbedo).mul(uLitF))()
			mat.opacityNode = Fn(() => texAlpha.a.mul(uAlpha))()
			mat.emissiveNode = Fn(() => {
				const diffuse = texDiffuse.rgb.mul(uAlbedo)
				const carry = diffuse.mul(uCarry)
				// Native (fs_basic.sc) adds the bulb buffer only to non-opaque
				// pixels (color.a < 1.0), scaled by the pixel alpha; opaque lens
				// pixels carry the lamp purely through the BDL term above.
				const alphaBelow = texTransmission.a.mul(uAlpha)
				const gate = step(alphaBelow, TRANSMISSION_OPAQUE_CUTOFF)
				const pfUv = vec2(
					positionWorld.x.div(uTransArea.x).add(float(0.5)),
					float(0.5).sub(positionWorld.z.div(uTransArea.y)),
				)
				const lift = sqrt(diffuse).mul(texture(uTransTex, pfUv).rgb).mul(uBelowF).mul(alphaBelow).mul(gate)
				return carry.add(lift)
			})()
			mat.outputNode = null
		} else if (userData.__mapName != null) {
			mat.colorNode = Fn(() => float(0))()
			mat.opacityNode = Fn(() => float(0))()
			mat.emissiveNode = Fn(() => float(0))()
			mat.outputNode = null
		} else {
			mat.colorNode = Fn(() => uAlbedo.mul(uLitF))()
			mat.opacityNode = Fn(() => uAlpha)()
			mat.emissiveNode = Fn(() => uAlbedo.mul(uCarry))()
			mat.outputNode = null
		}
	}
	userData.__rebuild = rebuild
	const map = opts.map ?? null
	userData.__map = map
	rebuild(map)
	mat.metalness = 0
	mat.roughness = 0.4
	mat.side = sideFor(opts.doubleSided)
	mat.alphaTest = opts.alphaTestValue && opts.alphaTestValue > 0 && opts.alphaTestValue <= 1 ? opts.alphaTestValue : 0
	mat.blending = CustomBlending
	mat.blendSrc = SrcAlphaFactor
	mat.blendDst = OneMinusSrcAlphaFactor
	mat.blendEquation = AddEquation
	mat.blendSrcAlpha = OneFactor
	mat.blendDstAlpha = OneMinusSrcAlphaFactor
	mat.blendEquationAlpha = AddEquation
	mat.toneMapped = true
	return mat
}

export function createPrimitiveAdditiveMaterial(opts: PrimitiveAdditiveOptions): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const uTint = uniform(new Color(opts.tint ?? 0xffffff))
	const uIntensity = uniform(opts.intensity ?? 1)
	const uFlat = uniform(new Color(opts.tint ?? 0xffffff).multiplyScalar(opts.intensity ?? 1))
	const userData = mat.userData as Record<string, unknown>
	userData.__primitiveKind = PRIMITIVE_ADDITIVE_KIND
	userData.__addBlend = true
	userData.__uTint = uTint
	userData.__uTintColor = uTint
	userData.__uIntensity = uIntensity
	userData.__uFlat = uFlat
	userData.__mapName = opts.mapName
	userData.__depthBias = opts.depthBias ?? 0
	userData.__alphaTestValue = opts.alphaTestValue ?? 0
	userData.__doubleSided = opts.doubleSided !== false
	const rebuild = (map: ThreeTexture | null): void => {
		if (map) {
			const tex = texture(map, uv())
			// Native (primitive.cpp additive path + fs_unshaded.sc): staticColor is
			// premultiplied (rgb = tint * alpha), result = staticColor * tex, blended
			// SRC_ALPHA,ONE, so the framebuffer receives tint * tex * alpha^2. The rgb
			// term carries intensity to reproduce the native quadratic falloff.
			mat.colorNode = Fn(() => {
				const base = tex
				const rgb = base.rgb.mul(uTint).mul(uIntensity)
				return vec4(rgb, base.a.mul(uIntensity))
			})()
		} else if (userData.__mapName != null) {
			// The file references a texture that has not streamed in yet. Native loads
			// textures synchronously so it has no placeholder state; emitting nothing
			// until arrival avoids a full-strength flat quad flashing in its place.
			// Overlays with no texture by design (mapName unset) keep the flat color.
			mat.colorNode = Fn(() => vec4(0, 0, 0, 0))()
		} else {
			mat.colorNode = uFlat
		}
	}
	userData.__rebuild = rebuild
	const map = opts.map ?? null
	userData.__map = map
	rebuild(map)
	mat.blending = AdditiveBlending
	mat.transparent = true
	mat.depthWrite = false
	mat.depthTest = true
	mat.toneMapped = true
	mat.side = sideFor(opts.doubleSided)
	// Compat: legacy readers probe emissiveIntensity on overlays (VLM.Bake lightmaps).
	Object.defineProperty(mat, 'emissiveIntensity', {
		get() {
			return (this.userData as { __uIntensity?: { value?: number } })?.__uIntensity?.value ?? 1
		},
		set(intensityValue: number) {
			const uniformRef = (this.userData as { __uIntensity?: { value?: number } })?.__uIntensity
			if (uniformRef) uniformRef.value = intensityValue
		},
		configurable: true,
		enumerable: false,
	})
	;(mat as unknown as { emissiveIntensity: number }).emissiveIntensity = opts.intensity ?? 1
	return mat
}

export function isPrimitiveNodeMaterial(mat: unknown): boolean {
	const kind = (mat as { userData?: { __primitiveKind?: string } })?.userData?.__primitiveKind
	return kind === PRIMITIVE_BDL_KIND || kind === PRIMITIVE_ADDITIVE_KIND
}

export function getPrimitiveKind(mat: unknown): string | undefined {
	return (mat as { userData?: { __primitiveKind?: string } })?.userData?.__primitiveKind
}

export function setPrimitiveMap(mat: unknown, map: ThreeTexture | null, name?: string): boolean {
	const targetMaterial = mat as { userData?: Record<string, unknown>; needsUpdate?: boolean } | null | undefined
	if (!targetMaterial || !isPrimitiveNodeMaterial(targetMaterial)) return false
	const userData = targetMaterial.userData as Record<string, unknown>
	const nextMap = map ?? null
	const sameMap = userData.__map === nextMap
	const sameName = name === undefined || userData.__mapName === name
	if (sameMap && sameName) return false
	userData.__map = nextMap
	if (name !== undefined) userData.__mapName = name
	if (typeof userData.__rebuild === 'function') (userData.__rebuild as (next: ThreeTexture | null) => void)(nextMap)
	targetMaterial.needsUpdate = true
	return true
}

export function updatePrimitiveBdl(
	mat: unknown,
	opts: {
		albedo?: number
		opacity?: number
		bdl?: number
		below?: number
	},
): void {
	const targetMaterial = mat as { userData?: Record<string, unknown> } | null | undefined
	if (!targetMaterial || targetMaterial.userData?.__primitiveKind !== PRIMITIVE_BDL_KIND) return
	const userData = targetMaterial.userData as Record<string, unknown>
	if (opts.albedo !== undefined) (userData.__uAlbedo as { value: Color }).value.set(opts.albedo)
	if (opts.opacity !== undefined) (userData.__uAlpha as { value: number }).value = opts.opacity
	if (opts.bdl !== undefined) {
		;(userData.__uBDL as { value: number }).value = opts.bdl
		;(userData.__uDim as { value: number }).value = bdlDiffuseFactor(opts.bdl)
		;(userData.__uLitF as { value: number }).value = bdlDiffuseFactor(opts.bdl)
		;(userData.__uCarry as { value: number }).value = bdlEmissiveCarry(opts.bdl)
	}
	if (opts.below !== undefined && userData.__uBelowF) {
		;(userData.__uBelowF as { value: number }).value = belowFactor(opts.below)
		userData.__below = opts.below
	}
}

export function updatePrimitiveAdditive(mat: unknown, opts: { tint?: number; intensity?: number }): void {
	const targetMaterial = mat as { userData?: Record<string, unknown> } | null | undefined
	if (!targetMaterial || targetMaterial.userData?.__primitiveKind !== PRIMITIVE_ADDITIVE_KIND) return
	const userData = targetMaterial.userData as Record<string, unknown>
	if (opts.tint !== undefined) (userData.__uTint as { value: Color }).value.set(opts.tint)
	if (opts.intensity !== undefined) (userData.__uIntensity as { value: number }).value = opts.intensity
	if (opts.tint !== undefined || opts.intensity !== undefined) {
		const tint = ((userData.__uTint as { value: Color }).value.getHex?.() ?? 0xffffff) as number
		const intensity = (userData.__uIntensity as { value: number }).value as number
		;((userData.__uFlat as { value: Color }).value as Color).set(tint).multiplyScalar(intensity)
	}
}

function uniformHex(value: unknown, fallback: number): number {
	const colorCandidate = value as { getHex?: () => number; r?: number; g?: number; b?: number } | null | undefined
	if (colorCandidate?.getHex) return colorCandidate.getHex()
	// Recovery for uniforms flattened by a classic three.js clone() (userData JSON round-trip).
	if (
		colorCandidate &&
		typeof colorCandidate.r === 'number' &&
		typeof colorCandidate.g === 'number' &&
		typeof colorCandidate.b === 'number'
	) {
		try {
			return new Color().setRGB(colorCandidate.r, colorCandidate.g, colorCandidate.b).getHex()
		} catch {
			return fallback
		}
	}
	return fallback
}

function uniformNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function clonePrimitiveNodeMaterial<T>(mat: T): T {
	const sourceMaterial = mat as unknown as (MeshStandardNodeMaterial | MeshBasicNodeMaterial) & {
		userData: Record<string, unknown>
		normalMap?: ThreeTexture | null
		envMap?: ThreeTexture | null
	}
	if (!sourceMaterial || !isPrimitiveNodeMaterial(sourceMaterial)) {
		return typeof (sourceMaterial as { clone?: () => unknown })?.clone === 'function'
			? ((sourceMaterial as { clone: () => unknown }).clone() as T)
			: mat
	}
	const userData = sourceMaterial.userData
	if (userData.__primitiveKind === PRIMITIVE_BDL_KIND) {
		const cloned = createPrimitiveBdlMaterial({
			map: (userData.__map as ThreeTexture | null) ?? undefined,
			mapName: (userData.__mapName as string) ?? undefined,
			albedo: uniformHex((userData.__uAlbedo as { value: unknown })?.value, 0xffffff),
			opacity: uniformNumber((userData.__uAlpha as { value: unknown })?.value, 1),
			bdl: uniformNumber((userData.__uBDL as { value: unknown })?.value, 0),
			below: uniformNumber(userData.__below, 0),
			alphaTestValue: uniformNumber(userData.__alphaTestValue ?? sourceMaterial.alphaTest, 0),
			doubleSided: (userData.__doubleSided as boolean) !== false,
			depthBias: uniformNumber(userData.__depthBias, 0),
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
		for (const slot of ['normalMap', 'envMap'] as const) {
			if (sourceMaterial[slot]) cloned[slot] = sourceMaterial[slot]
		}
		return cloned as unknown as T
	}
	const cloned = createPrimitiveAdditiveMaterial({
		map: (userData.__map as ThreeTexture | null) ?? undefined,
		mapName: (userData.__mapName as string) ?? undefined,
		tint: uniformHex((userData.__uTint as { value: unknown })?.value, 0xffffff),
		intensity: uniformNumber((userData.__uIntensity as { value: unknown })?.value, 1),
		alphaTestValue: uniformNumber(userData.__alphaTestValue ?? sourceMaterial.alphaTest, 0),
		doubleSided: (userData.__doubleSided as boolean) !== false,
		depthBias: uniformNumber(userData.__depthBias, 0),
	})
	cloned.name = sourceMaterial.name
	copyPendingKeys(userData, cloned.userData as Record<string, unknown>)
	cloned.transparent = sourceMaterial.transparent
	cloned.depthWrite = sourceMaterial.depthWrite
	cloned.depthTest = sourceMaterial.depthTest
	cloned.blending = sourceMaterial.blending
	cloned.toneMapped = sourceMaterial.toneMapped
	cloned.side = sourceMaterial.side
	;(cloned.userData as Record<string, unknown>).__addBlend = true
	for (const slot of ['normalMap', 'envMap'] as const) {
		if (sourceMaterial[slot]) (cloned as unknown as Record<string, unknown>)[slot] = sourceMaterial[slot]
	}
	return cloned as unknown as T
}

/**
 * Fork-safe clone must carry the streaming keys: the texture may arrive after the
 * first script write forks the material, and the streamer/arrival paths match on
 * these names. Dropping them strands the fork mapless forever.
 */
function copyPendingKeys(from: Record<string, unknown>, to: Record<string, unknown>): void {
	for (const key of ['pendingMap', 'pendingNormalMap', 'pendingEnvMap', 'pendingEmissiveMap'] as const) {
		const value = from[key]
		if (typeof value === 'string' && value.length > 0) to[key] = value
	}
}
