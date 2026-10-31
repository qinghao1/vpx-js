import type { Group } from 'three'
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	CustomBlending,
	DoubleSide,
	Matrix4,
	Mesh,
	OneMinusSrcColorFactor,
	ReverseSubtractEquation,
	SrcAlphaFactor,
	Vector2,
} from 'three'
import {
	attribute,
	clamp,
	Fn,
	float,
	length,
	max,
	mix,
	positionLocal,
	positionWorld,
	pow,
	sqrt,
	uniform,
	vec2,
	vec4,
} from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { getAuthoredVisible } from '../authored-visible.js'
import { inPlayfieldBounds, uBulbGlowFootprintClip, uTransArea } from './primitive-bdl-node.js'

export interface BulbGlowOptions {
	color: number
	color2: number
	centerX: number
	centerY: number
	falloff: number
	falloffPower: number
	intensity: number
	/** Native `m_modulate_vs_add` (default 0.9): 0 = pure additive, 1 = pure modulate. */
	modulateVsAdd?: number
}

/**
 * Native `m_modulate_vs_add` clamp (`light.cpp`): avoids 0 (which disables
 * the blend) and 1 (which reads wrong under day/night swings). Insert tables
 * authoring ≈1.0 land on 0.9999, leaving a ~1e-4 additive sliver.
 */
export function clampBulbModulateVsAdd(value?: number): number {
	return Math.max(0.0001, Math.min(0.9999, value ?? 0.9))
}

/**
 * Per-channel native bulb composite (`fs_light.sc` under REVSUBTRACT with
 * SRC_ALPHA/INV_SRC_COLOR): `dst + atten·I·(dst·m·l + (1−m)·l)`.
 */
export function bulbGlowComposite(
	dst: number,
	atten: number,
	intensity: number,
	modulate: number,
	light: number,
): number {
	const m = clampBulbModulateVsAdd(modulate)
	const glow = atten * intensity * light
	return dst * (1 + m * glow) + (1 - m) * glow
}

/** Native bulb src alpha (`fs_light.sc`): `gl_FragColor.a = 1/m − 1`. */
export function bulbGlowSrcAlpha(modulate: number): number {
	return 1 / clampBulbModulateVsAdd(modulate) - 1
}

export function createBulbGlowNodeMaterial(options: BulbGlowOptions): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const uColor = uniform(new Color(options.color))
	const uColor2 = uniform(new Color(options.color2))
	const uCenter = uniform(new Vector2(options.centerX, options.centerY))
	const uInvFalloff = uniform(1 / Math.max(options.falloff, 0.1))
	const uFalloffPower = uniform(options.falloffPower)
	const uIntensity = uniform(options.intensity)
	// Native bulb composite (`light.cpp` REVSUBTRACT with
	// SRC_ALPHA/INV_SRC_COLOR over the post-opaque scene color, fed the
	// negatively-encoded `fs_light.sc` output below) evaluates the full
	// `dst + atten·I·(dst·m·l + (1−m)·l)`. The blend unit samples dst, so the
	// dst-modulated term needs no extra pass or scene buffer: these draws run
	// in the pipeline scene pass's transparent phase (post-opaque dst) and the
	// restored energy feeds the existing pipeline bloom. The szLightmap
	// primitive path is untouched; native runs both draws too. Overlapping
	// halos with different m composite in draw order (three.js transparent
	// sort for per-quad draws, bake order in the merged mesh); native sorts
	// transparent on absolute z + depthBias, so overlap pixels can differ
	// slightly — REVSUBTRACT is order-dependent.
	const uModulate = uniform(clampBulbModulateVsAdd(options.modulateVsAdd))

	mat.colorNode = Fn(() => {
		// Matches fs_light.sc: atten = pow(max(1 - saturate(len), 0.0001),
		// falloff_power) with the color ramp on the unclamped sqrt(len) —
		// the floor keeps a fully covered pixel from going exactly 0 and
		// the ramp extrapolates past the rim instead of clamping. The rgb is
		// negatively encoded (`−m·atten·I·lcolor`) with src alpha `1/m − 1`,
		// exactly the shader outputs REVSUBTRACT composites upstream.
		const len = length(positionLocal.xy.sub(uCenter)).mul(uInvFalloff)
		const atten = pow(max(float(1).sub(clamp(len, float(0), float(1))), float(0.0001)), uFalloffPower)
		const glowColor = mix(uColor2, uColor, sqrt(len))
		// Authored halo polygons routinely extend past the cabinet walls
		// (giant GI discs, flasher sheets); from outside, those overhanging
		// fragments sit in front of the side art and wash it with playfield
		// light. Confine the halo to the playfield footprint (same mask as
		// the transmission lift); disabled until the viewer configures the
		// playfield area, so unconfigured renders are unchanged.
		const pfUv = vec2(
			positionWorld.x.div(uTransArea.x).add(float(0.5)),
			float(0.5).sub(positionWorld.z.div(uTransArea.y)),
		)
		const footprint = mix(float(1), inPlayfieldBounds(pfUv), uBulbGlowFootprintClip)
		const rgb = glowColor.mul(atten).mul(uIntensity).mul(uModulate).mul(float(-1)).mul(footprint)
		return vec4(rgb, float(1).div(uModulate).sub(float(1)))
	})()

	mat.blending = CustomBlending
	mat.blendSrc = SrcAlphaFactor
	mat.blendDst = OneMinusSrcColorFactor
	mat.blendEquation = ReverseSubtractEquation
	mat.blendSrcAlpha = SrcAlphaFactor
	mat.blendDstAlpha = OneMinusSrcColorFactor
	mat.blendEquationAlpha = ReverseSubtractEquation
	mat.transparent = true
	mat.depthWrite = false
	mat.depthTest = true
	mat.toneMapped = true
	mat.side = DoubleSide

	const ud = mat.userData as Record<string, unknown>
	ud.__bulbGlow = true
	ud.__uColor = uColor
	ud.__uColor2 = uColor2
	ud.__uIntensity = uIntensity
	ud.__uModulate = uModulate
	return mat
}

export function isBulbGlowMaterial(mat: unknown): boolean {
	return !!(mat as { userData?: Record<string, unknown> } | null)?.userData?.__bulbGlow
}

export function setBulbGlowState(mat: unknown, state: { intensity?: number; color?: number; color2?: number }): void {
	const ud = (mat as { userData?: Record<string, unknown> } | null)?.userData
	if (!ud?.__bulbGlow) return
	if (
		state.intensity !== undefined &&
		ud.__uIntensity &&
		typeof (ud.__uIntensity as { value: unknown }).value === 'number'
	) {
		;(ud.__uIntensity as { value: number }).value = state.intensity
	}
	if (state.color !== undefined && ud.__uColor) {
		;(ud.__uColor as { value: Color }).value.set(state.color)
	}
	if (state.color2 !== undefined && ud.__uColor2) {
		;(ud.__uColor2 as { value: Color }).value.set(state.color2)
	}
}

/**
 * Merged bulb-glow composite: one draw for every lamp halo.
 *
 * Per-quad materials carry the halo parameters as uniforms, so N lamps cost N
 * draws with N program bindings. The merged mesh bakes the static parameters
 * (center, falloff, color ramp anchors, modulate) into per-vertex attributes
 * and keeps only the live lamp state (intensity, colors) in attributes updated
 * in place — the fragment math is identical to the per-quad material above,
 * only the parameter source changes from uniforms to attributes.
 *
 * Same pattern as InstancedMesh + BufferGeometryUtils merging.
 */

export interface MergedBulbGlowRange {
	start: number
	count: number
}

/** Live handle a merged-away quad keeps so the lamp updater can reach its vertex range. */
export interface MergedBulbGlowRef {
	mesh: Mesh
	ranges: Map<string, MergedBulbGlowRange>
	start: number
	count: number
}

export function createMergedBulbGlowMaterial(): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const aCenter = attribute<'vec2'>('aGlowCenter', 'vec2')
	const aParams = attribute<'vec2'>('aGlowParams', 'vec2')
	const aColor = attribute<'vec3'>('aGlowColor', 'vec3')
	const aColor2 = attribute<'vec3'>('aGlowColor2', 'vec3')
	const aDyn = attribute<'vec2'>('aGlowDyn', 'vec2')
	mat.colorNode = Fn(() => {
		// Same math as the per-quad material; params come from attributes.
		// aDyn.y carries the native modulate m (static per lamp); the rgb is
		// negatively encoded and the alpha is 1/m − 1, as upstream.
		const len = length(positionLocal.xy.sub(aCenter)).mul(aParams.x)
		const atten = pow(max(float(1).sub(clamp(len, float(0), float(1))), float(0.0001)), aParams.y)
		const glowColor = mix(aColor2, aColor, sqrt(len))
		const pfUv = vec2(
			positionWorld.x.div(uTransArea.x).add(float(0.5)),
			float(0.5).sub(positionWorld.z.div(uTransArea.y)),
		)
		const footprint = mix(float(1), inPlayfieldBounds(pfUv), uBulbGlowFootprintClip)
		const rgb = glowColor.mul(atten).mul(aDyn.x).mul(aDyn.y).mul(float(-1)).mul(footprint)
		return vec4(rgb, float(1).div(aDyn.y).sub(float(1)))
	})()
	mat.blending = CustomBlending
	mat.blendSrc = SrcAlphaFactor
	mat.blendDst = OneMinusSrcColorFactor
	mat.blendEquation = ReverseSubtractEquation
	mat.blendSrcAlpha = SrcAlphaFactor
	mat.blendDstAlpha = OneMinusSrcColorFactor
	mat.blendEquationAlpha = ReverseSubtractEquation
	mat.transparent = true
	mat.depthWrite = false
	mat.depthTest = true
	mat.toneMapped = true
	mat.side = DoubleSide
	;(mat.userData as Record<string, unknown>).__bulbGlowMerged = true
	return mat
}

export function isMergedBulbGlowMaterial(mat: unknown): boolean {
	return !!(mat as { userData?: Record<string, unknown> } | null)?.userData?.__bulbGlowMerged
}

interface BulbGlowUniforms {
	color: Color
	color2: Color
	intensity: number
	modulate: number
}

function liveGlowUniforms(mesh: Mesh): BulbGlowUniforms | undefined {
	const ud = (mesh.material as { userData?: Record<string, unknown> } | null)?.userData
	if (!ud?.__bulbGlow) return undefined
	const color = (ud.__uColor as { value?: Color } | undefined)?.value
	const color2 = (ud.__uColor2 as { value?: Color } | undefined)?.value
	const intensity = (ud.__uIntensity as { value?: unknown } | undefined)?.value
	const modulate = (ud.__uModulate as { value?: unknown } | undefined)?.value
	if (!color || !color2 || typeof intensity !== 'number' || typeof modulate !== 'number') return undefined
	return { color, color2, intensity, modulate }
}

interface GlowLightParams {
	centerX: number
	centerY: number
	falloff: number
	falloffPower: number
}

function glowParamsOf(table: unknown, lightName: string): GlowLightParams | undefined {
	const lights = (table as { lights?: Record<string, { data?: Record<string, unknown> }> })?.lights
	const data = lights?.[lightName]?.data
	if (!data) return undefined
	const center = data.center as { x?: number; y?: number } | undefined
	const right = (table as { data?: { right?: number } })?.data?.right || 1
	const bottom = (table as { data?: { bottom?: number } })?.data?.bottom || 1
	return {
		centerX: typeof center?.x === 'number' ? center.x : right / 2,
		centerY: typeof center?.y === 'number' ? center.y : bottom / 2,
		falloff: Math.max(typeof data.falloff === 'number' ? data.falloff : 50, 0.1),
		falloffPower: typeof data.falloffPower === 'number' ? data.falloffPower : 2,
	}
}

// Module-scope scratch: per-tick color writes must not allocate.
const scratchGlowColor = new Color()

/**
 * Writes one lamp's live state into its merged vertex range in place. Colors
 * go through a shared scratch Color (sRGB hex to working space, the same
 * conversion the per-quad `uniform(new Color(hex))` path applies), so a script
 * tick allocates nothing and touches no program state.
 */
export function setMergedBulbGlowRangeState(
	merged: Mesh,
	range: MergedBulbGlowRange,
	state: { intensity?: number; color?: number; color2?: number },
): void {
	const attrs = (merged.geometry as BufferGeometry).attributes as Record<string, BufferAttribute | undefined>
	const dyn = attrs.aGlowDyn
	const colorAttr = attrs.aGlowColor
	const color2Attr = attrs.aGlowColor2
	if (!dyn || !colorAttr || !color2Attr) return
	if (state.intensity !== undefined) {
		const arr = dyn.array as Float32Array
		for (let i = range.start; i < range.start + range.count; i++) arr[i * 2] = state.intensity
		dyn.needsUpdate = true
	}
	if (state.color !== undefined) {
		scratchGlowColor.set(state.color)
		const arr = colorAttr.array as Float32Array
		for (let i = range.start; i < range.start + range.count; i++) {
			arr[i * 3] = scratchGlowColor.r
			arr[i * 3 + 1] = scratchGlowColor.g
			arr[i * 3 + 2] = scratchGlowColor.b
		}
		colorAttr.needsUpdate = true
	}
	if (state.color2 !== undefined) {
		scratchGlowColor.set(state.color2)
		const arr = color2Attr.array as Float32Array
		for (let i = range.start; i < range.start + range.count; i++) {
			arr[i * 3] = scratchGlowColor.r
			arr[i * 3 + 1] = scratchGlowColor.g
			arr[i * 3 + 2] = scratchGlowColor.b
		}
		color2Attr.needsUpdate = true
	}
}

/**
 * Folds every mergeable bulb-glow quad under `root` into one additive mesh
 * (one draw). A quad merges when it has indexed positions, authored-visible
 * state, resolvable lamp params, and a 2D-similarity-plus-z-translate local
 * transform (uniform scale + rotation about z); anything else stays on the
 * legacy per-quad path untouched. Needs at least two mergeable quads.
 *
 * @returns number of quads folded into the merged mesh (0 when nothing merged).
 */
export function mergeBulbGlowQuads(root: Group, table: unknown): number {
	root.updateMatrixWorld(true)
	const invRoot = new Matrix4().copy(root.matrixWorld).invert()
	interface Candidate {
		mesh: Mesh
		lightName: string
		params: GlowLightParams
		live: BulbGlowUniforms
		local: Matrix4
		positions: Float32Array
		index: ArrayLike<number>
	}
	const candidates: Candidate[] = []
	root.traverse((o: unknown) => {
		const mesh = o as Mesh
		if (!mesh || !(mesh as { isMesh?: boolean }).isMesh || !mesh.geometry || !mesh.material) return
		if (!isBulbGlowMaterial(mesh.material)) return
		if (!getAuthoredVisible(mesh as unknown as Parameters<typeof getAuthoredVisible>[0])) return
		const geo = mesh.geometry as BufferGeometry
		const posAttr = geo.getAttribute('position') as BufferAttribute | undefined
		const index = geo.getIndex()
		if (!posAttr || !index) return
		const live = liveGlowUniforms(mesh)
		if (!live) return
		// Light groups are named for their lamp; the params (center/falloff)
		// live in the table record, not in the material uniforms.
		let group: unknown = (mesh as { parent?: unknown }).parent
		let lightName = ''
		while (group && group !== (root as unknown)) {
			const named = group as { name?: string; parent?: unknown }
			if (typeof named.name === 'string' && named.name) {
				lightName = named.name
				break
			}
			group = named.parent
		}
		if (!lightName) return
		const params = glowParamsOf(table, lightName)
		if (!params) return
		mesh.updateWorldMatrix(true, false)
		const local = new Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld)
		candidates.push({
			mesh,
			lightName,
			params,
			live,
			local,
			positions: posAttr.array as Float32Array,
			index: index.array,
		})
	})
	if (candidates.length < 2) return 0
	// 2D similarity (uniform scale + z rotation) plus a z translate keeps the
	// radial halo exact: bake the matrix into positions and the center, scale
	// the inverse falloff by the uniform scale. Anything else stays legacy.
	const baked: Candidate[] = []
	for (const c of candidates) {
		if (isSimilarityZ(c.local)) baked.push(c)
	}
	if (baked.length < 2) return 0
	let totalVerts = 0
	let totalIndices = 0
	for (const c of baked) {
		totalVerts += c.positions.length / 3
		totalIndices += c.index.length
	}
	const positions = new Float32Array(totalVerts * 3)
	const indices = new Uint32Array(totalIndices)
	const aCenter = new Float32Array(totalVerts * 2)
	const aParams = new Float32Array(totalVerts * 2)
	const aColor = new Float32Array(totalVerts * 3)
	const aColor2 = new Float32Array(totalVerts * 3)
	const aDyn = new Float32Array(totalVerts * 2)
	const ranges = new Map<string, MergedBulbGlowRange>()
	let vCursor = 0
	let iCursor = 0
	for (const c of baked) {
		const e = c.local.elements
		const e0 = e[0] as number
		const e1 = e[1] as number
		const e2 = e[2] as number
		const e4 = e[4] as number
		const e5 = e[5] as number
		const e6 = e[6] as number
		const e10 = e[10] as number
		const e12 = e[12] as number
		const e13 = e[13] as number
		const e14 = e[14] as number
		const sx = Math.hypot(e0, e1)
		const count = c.positions.length / 3
		const srcPos = c.positions
		const srcIdx = c.index
		for (let i = 0; i < count; i++) {
			const x = srcPos[i * 3] as number
			const y = srcPos[i * 3 + 1] as number
			const z = srcPos[i * 3 + 2] as number
			positions[(vCursor + i) * 3] = e0 * x + e4 * y + e12
			positions[(vCursor + i) * 3 + 1] = e1 * x + e5 * y + e13
			positions[(vCursor + i) * 3 + 2] = e2 * x + e6 * y + e10 * z + e14
		}
		const ccx = e0 * c.params.centerX + e4 * c.params.centerY + e12
		const ccy = e1 * c.params.centerX + e5 * c.params.centerY + e13
		const invFalloff = 1 / Math.max(c.params.falloff, 0.1) / sx
		for (let i = 0; i < count; i++) {
			const v = vCursor + i
			aCenter[v * 2] = ccx
			aCenter[v * 2 + 1] = ccy
			aParams[v * 2] = invFalloff
			aParams[v * 2 + 1] = c.params.falloffPower
			aColor[v * 3] = c.live.color.r
			aColor[v * 3 + 1] = c.live.color.g
			aColor[v * 3 + 2] = c.live.color.b
			aColor2[v * 3] = c.live.color2.r
			aColor2[v * 3 + 1] = c.live.color2.g
			aColor2[v * 3 + 2] = c.live.color2.b
			aDyn[v * 2] = c.live.intensity
			aDyn[v * 2 + 1] = c.live.modulate
		}
		for (let i = 0; i < srcIdx.length; i++) indices[iCursor + i] = vCursor + (srcIdx[i] as number)
		ranges.set(c.lightName, { start: vCursor, count })
		iCursor += srcIdx.length
		vCursor += count
	}
	const geo = new BufferGeometry()
	geo.setAttribute('position', new BufferAttribute(positions, 3))
	geo.setAttribute('aGlowCenter', new BufferAttribute(aCenter, 2))
	geo.setAttribute('aGlowParams', new BufferAttribute(aParams, 2))
	geo.setAttribute('aGlowColor', new BufferAttribute(aColor, 3))
	geo.setAttribute('aGlowColor2', new BufferAttribute(aColor2, 3))
	geo.setAttribute('aGlowDyn', new BufferAttribute(aDyn, 2))
	geo.setIndex(new BufferAttribute(indices, 1))
	geo.computeBoundingBox()
	geo.computeBoundingSphere()
	const material = createMergedBulbGlowMaterial()
	material.name = 'material:merged.bulb.glow'
	const merged = new Mesh(geo, material)
	merged.name = 'merged:bulb.glow'
	merged.renderOrder = 10
	merged.matrixAutoUpdate = false
	// A light composite, not a pickable solid: the insert hulls underneath stay
	// pickable, the merged halo never intercepts raycasts.
	merged.raycast = () => {}
	root.add(merged)
	merged.updateMatrixWorld(true)
	for (const c of baked) {
		const range = ranges.get(c.lightName) as MergedBulbGlowRange
		const ref: MergedBulbGlowRef = { mesh: merged, ranges, start: range.start, count: range.count }
		;(c.mesh.userData as Record<string, unknown>).__mergedGlow = ref
		c.mesh.visible = false
	}
	return baked.length
}

function isSimilarityZ(local: Matrix4): boolean {
	const e = local.elements
	const e0 = e[0] as number
	const e1 = e[1] as number
	const e2 = e[2] as number
	const e4 = e[4] as number
	const e5 = e[5] as number
	const e6 = e[6] as number
	const e8 = e[8] as number
	const e9 = e[9] as number
	const e10 = e[10] as number
	const eps = 1e-6
	// x/y must not depend on z, z must not depend on x/y. z scale may differ
	// from 1 (uniform parent scale): positions bake it exactly, and a positive
	// z scale preserves winding; a flipped or flat z stays legacy.
	if (Math.abs(e2) > eps || Math.abs(e6) > eps) return false
	if (Math.abs(e8) > eps || Math.abs(e9) > eps) return false
	if (!(e10 > eps)) return false
	// XY columns share one scale and stay perpendicular (uniform scale + rotation).
	const sx = Math.hypot(e0, e1)
	const sy = Math.hypot(e4, e5)
	if (!(sx > eps) || Math.abs(sx - sy) > eps * Math.max(1, sx)) return false
	if (Math.abs(e0 * e4 + e1 * e5) > eps * sx * sx) return false
	return true
}
