import {
	AddEquation,
	AdditiveBlending,
	Color,
	CustomBlending,
	DoubleSide,
	FrontSide,
	OneFactor,
	OneMinusSrcAlphaFactor,
	SrcAlphaFactor,
	type Texture as ThreeTexture,
	Vector2,
} from 'three'
import { Fn, float, positionWorld, sqrt, step, texture, uniform, uv, vec2, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import {
	bdlDiffuseFactor,
	bdlEmissiveCarry,
	belowFactor,
	getPrimitiveKind,
	isPrimitiveNodeMaterial,
	PRIMITIVE_ADDITIVE_KIND,
	PRIMITIVE_BDL_KIND,
	type PrimitiveAdditiveUpdate,
	type PrimitiveBdlUpdate,
	type ProtocolColor,
	updatePrimitiveAdditive,
	updatePrimitiveBdl,
} from '../../../vpt/primitive/primitive-material-protocol.js'
import { copyForkedRenderState, defineEmissiveIntensityCompat, setNodeMapSlot } from '../material-shared.js'
import { getTransmissionTexture, TRANSMISSION_OPAQUE_CUTOFF } from '../transmission-buffer.js'

export type { PrimitiveAdditiveUpdate, PrimitiveBdlUpdate, ProtocolColor }
export {
	bdlDiffuseFactor,
	bdlEmissiveCarry,
	belowFactor,
	getPrimitiveKind,
	isPrimitiveNodeMaterial,
	PRIMITIVE_ADDITIVE_KIND,
	PRIMITIVE_BDL_KIND,
	updatePrimitiveAdditive,
	updatePrimitiveBdl,
}

// Scaled playfield extents for the bulb-light buffer lookup, shared by every BDL
// fork. Native (fs_basic.sc) samples its bulb buffer per-pixel in screen space;
// the table-space analog is the fragment's own playfield UV, so each pixel reads
// the light that actually falls on it instead of one anchor texel per primitive.
// The scene root maps table units to world via translate(-w/2,-h/2,0) * rotX(90)
// * scale(s) (see ThreeRenderApi.transformScene; translates apply in the rotated
// frame, so x centers about 0 and table-y lands on world-z centered about 0).
// Hence u = x/(w*s)+0.5 and v = 0.5-z/(h*s) with the scaled extents stored here.
export const uTransArea = uniform(new Vector2(1, 1))

/**
 * World-space height of the playfield surface (the table z=0 plane after the
 * scene-root transform). Fragments below it share the playfield's x/z
 * footprint (cabinet bottom, under-table grates), so the 2D footprint mask
 * alone cannot tell them apart from the playfield itself.
 */
export const uPlayfieldSurfaceY = uniform(0)

/**
 * Enables the playfield-footprint mask on bulb-glow quads. Bulb halos are
 * authored drag-point polygons (`Light::UpdateMeshBuffer`) that routinely
 * extend past the cabinet walls (giant GI discs, flasher sheets); their
 * overhanging fragments are closer to an outside camera than the wall, so
 * they composite additively OVER the side art as red wash and edge-on
 * streak lines. Masking them to the playfield footprint confines the halo to
 * the playfield the lamp actually lights, mirroring the transmission-buffer
 * lookup mask below. Defaults to 0 (unmasked) so glow renders unchanged
 * until the viewer configures the playfield area; setPrimitiveTransmissionArea
 * flips it on alongside the area it gates on.
 */
export const uBulbGlowFootprintClip = uniform(0)

/**
 * How far below the playfield surface the bulb-buffer lift still applies, in
 * world units. Extruded playfield overlays (VLM bakes, additive lightmaps)
 * hang about one unit below the surface, while the cabinet body and the room
 * sit several units down; the cutoff sits between so the playfield keeps its
 * lamp response and below-table geometry stays dark.
 */
export const BULB_LIFT_BELOW_EPS = 1.5

/**
 * Masks bulb-buffer lookups to the playfield itself. Room geometry (VR floor,
 * walls) extends far beyond the playfield, and out-of-range UVs would sample
 * the clamped edge texel (ClampToEdgeWrapping), smearing live lamp energy
 * across the whole floor. Native has no such contribution: its bulb buffer is
 * sampled per-pixel in screen space with projected bounds.
 */
export const inPlayfieldBounds = (playfieldUv: ReturnType<typeof vec2>): ReturnType<typeof float> =>
	step(0, playfieldUv.x)
		.mul(step(playfieldUv.x, 1))
		.mul(step(0, playfieldUv.y))
		.mul(step(playfieldUv.y, 1)) as ReturnType<typeof float>

/**
 * Full bulb-lift volume: the playfield footprint plus a height gate. The 2D
 * mask above still passes fragments BELOW the playfield that share its x/z
 * footprint (cabinet bottom faces, under-table grates and floors), lighting
 * them with live lamp energy that shines through the cabinet bottom onto the
 * floor. Native samples its bulb buffer in screen space
 * (fs_basic.sc transmission tail), which never reaches occluded below-table
 * pixels, so gate the lookup to at/above-surface fragments here.
 */
export const inLiftVolume = (
	playfieldUv: ReturnType<typeof vec2>,
	worldY: (typeof positionWorld)['y'],
): ReturnType<typeof float> =>
	inPlayfieldBounds(playfieldUv).mul(step(uPlayfieldSurfaceY.sub(BULB_LIFT_BELOW_EPS), worldY)) as ReturnType<
		typeof float
	>

export function setPrimitiveTransmissionArea(width: number, height: number, scale = 1, surfaceY = 0): void {
	const safeWidth = Number.isFinite(width) && width > 0 ? width : 1
	const safeHeight = Number.isFinite(height) && height > 0 ? height : 1
	const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
	uTransArea.value.set(safeWidth * safeScale, safeHeight * safeScale)
	uPlayfieldSurfaceY.value = Number.isFinite(surfaceY) ? surfaceY : 0
	uBulbGlowFootprintClip.value = 1
}

export interface PrimitiveBdlOptions {
	map?: ThreeTexture
	mapName?: string
	albedo?: number
	opacity?: number
	bdl?: number
	below?: number
	metalness?: number
	roughness?: number
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

// Single-sided fallback shared by every material path: converted VPX meshes are
// stored winding-reversed (see ThreeMeshGenerator), so their fronts are CCW on
// screen and single-sided rendering takes FrontSide, not BackSide.
export function sideFor(doubleSided?: boolean): typeof DoubleSide | typeof FrontSide {
	return doubleSided !== false ? DoubleSide : FrontSide
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
		// Composite BDL + transmission math: see the canonical explanation in
		// primitive-material-protocol.ts (bdlDiffuseFactor/bdlEmissiveCarry/belowFactor).
		// Keep one texture node per slot: sharing a single texture node across
		// color/opacity/emissive slots breaks the TSL graph on some drivers, while
		// separate fetches stay correct.
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
				const lift = sqrt(diffuse)
					.mul(texture(uTransTex, pfUv).rgb)
					.mul(uBelowF)
					.mul(alphaBelow)
					.mul(gate)
					.mul(inLiftVolume(pfUv, positionWorld.y))
				return carry.add(lift)
			})()
		} else if (userData.__mapName != null) {
			mat.colorNode = Fn(() => float(0))()
			mat.opacityNode = Fn(() => float(0))()
			mat.emissiveNode = Fn(() => float(0))()
		} else {
			mat.colorNode = Fn(() => uAlbedo.mul(uLitF))()
			mat.opacityNode = Fn(() => uAlpha)()
			mat.emissiveNode = Fn(() => uAlbedo.mul(uCarry))()
		}
		mat.outputNode = null
	}
	userData.__rebuild = rebuild
	const map = opts.map ?? null
	userData.__map = map
	rebuild(map)
	mat.metalness = opts.metalness ?? 0
	mat.roughness = opts.roughness ?? 0.4
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

/**
 * Upstream per-draw blend state for AB_ABSORB (flasher.cpp SetupAddBlendState):
 * premultiplied alpha 'over', dst' = src + dst * (1 - srcAlpha). Shared by
 * the material generator (fresh absorb materials) and the flasher updater
 * (stamped per frame onto forked clones rebuilt as plain additive).
 *
 * Note: AB_ADD is still plain AdditiveBlending here, not upstream's
 * reverse-subtract — matching REVSUBTRACT needs golden review.
 */
export function applyAbsorbBlendState(mat: any): void {
	mat.blending = CustomBlending
	mat.blendSrc = OneFactor
	mat.blendDst = OneMinusSrcAlphaFactor
	mat.blendEquation = AddEquation
	mat.blendSrcAlpha = OneFactor
	mat.blendDstAlpha = OneMinusSrcAlphaFactor
	mat.blendEquationAlpha = AddEquation
	;((mat.userData ??= {}) as Record<string, unknown>).__absorbBlend = true
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
				const rgb = tex.rgb.mul(uTint).mul(uIntensity)
				return vec4(rgb, tex.a.mul(uIntensity))
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
	// Coplanar with the opaque bake below; the offset wins that tie while
	// nearer toys still occlude (same overlay convention as the classic path).
	mat.polygonOffset = true
	mat.polygonOffsetFactor = -2
	mat.polygonOffsetUnits = -4
	mat.toneMapped = true
	mat.side = sideFor(opts.doubleSided)
	// Compat: legacy readers probe emissiveIntensity on overlays (VLM.Bake lightmaps).
	defineEmissiveIntensityCompat(mat)
	;(mat as unknown as { emissiveIntensity: number }).emissiveIntensity = opts.intensity ?? 1
	return mat
}

export function setPrimitiveMap(mat: unknown, map: ThreeTexture | null, name?: string): boolean {
	return setNodeMapSlot(mat, map, name, isPrimitiveNodeMaterial)
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

type CloneablePrimitiveMaterial = (MeshStandardNodeMaterial | MeshBasicNodeMaterial) & {
	userData: Record<string, unknown>
	normalMap?: ThreeTexture | null
	envMap?: ThreeTexture | null
	metalness?: number
	roughness?: number
}

function commonCloneOptions(
	userData: Record<string, unknown>,
	sourceMaterial: { alphaTest: number },
): Pick<
	PrimitiveBdlOptions & PrimitiveAdditiveOptions,
	'map' | 'mapName' | 'alphaTestValue' | 'doubleSided' | 'depthBias'
> {
	return {
		map: (userData.__map as ThreeTexture | null) ?? undefined,
		mapName: (userData.__mapName as string) ?? undefined,
		alphaTestValue: uniformNumber(userData.__alphaTestValue ?? sourceMaterial.alphaTest, 0),
		doubleSided: (userData.__doubleSided as boolean) !== false,
		depthBias: uniformNumber(userData.__depthBias, 0),
	}
}

function finishPrimitiveClone(
	sourceMaterial: CloneablePrimitiveMaterial,
	cloned: CloneablePrimitiveMaterial,
	blend: 'custom' | 'simple',
): void {
	copyForkedRenderState(sourceMaterial, cloned)
	if (blend === 'custom') {
		cloned.opacity = sourceMaterial.opacity
		cloned.blendSrc = sourceMaterial.blendSrc
		cloned.blendDst = sourceMaterial.blendDst
		cloned.blendEquation = sourceMaterial.blendEquation
		cloned.blendSrcAlpha = sourceMaterial.blendSrcAlpha
		cloned.blendDstAlpha = sourceMaterial.blendDstAlpha
		cloned.blendEquationAlpha = sourceMaterial.blendEquationAlpha
		cloned.alphaTest = sourceMaterial.alphaTest
	} else {
		cloned.toneMapped = sourceMaterial.toneMapped
	}
	for (const slot of ['normalMap', 'envMap'] as const) {
		if (sourceMaterial[slot]) cloned[slot] = sourceMaterial[slot]
	}
}

export function clonePrimitiveNodeMaterial<T>(mat: T): T {
	const sourceMaterial = mat as unknown as CloneablePrimitiveMaterial
	if (!sourceMaterial || !isPrimitiveNodeMaterial(sourceMaterial)) {
		return typeof (sourceMaterial as { clone?: () => unknown })?.clone === 'function'
			? ((sourceMaterial as { clone: () => unknown }).clone() as T)
			: mat
	}
	const userData = sourceMaterial.userData
	const common = commonCloneOptions(userData, sourceMaterial)
	if (userData.__primitiveKind === PRIMITIVE_BDL_KIND) {
		const cloned = createPrimitiveBdlMaterial({
			...common,
			albedo: uniformHex((userData.__uAlbedo as { value: unknown })?.value, 0xffffff),
			opacity: uniformNumber((userData.__uAlpha as { value: unknown })?.value, 1),
			bdl: uniformNumber((userData.__uBDL as { value: unknown })?.value, 0),
			below: uniformNumber(userData.__below, 0),
			metalness: uniformNumber(sourceMaterial.metalness, 0),
			roughness: uniformNumber(sourceMaterial.roughness, 0.4),
		})
		finishPrimitiveClone(sourceMaterial, cloned as unknown as CloneablePrimitiveMaterial, 'custom')
		return cloned as unknown as T
	}
	const cloned = createPrimitiveAdditiveMaterial({
		...common,
		tint: uniformHex((userData.__uTint as { value: unknown })?.value, 0xffffff),
		intensity: uniformNumber((userData.__uIntensity as { value: unknown })?.value, 1),
	})
	finishPrimitiveClone(sourceMaterial, cloned as unknown as CloneablePrimitiveMaterial, 'simple')
	;(cloned.userData as Record<string, unknown>).__addBlend = true
	return cloned as unknown as T
}
