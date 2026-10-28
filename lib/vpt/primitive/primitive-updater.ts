// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { Color } from 'three'
import { tryGetFloatState } from '../../emu/res-uri.js'
import type { IEmulator } from '../../game/iemulator.js'
import { Matrix3D } from '../../math/matrix.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { ItemUpdater } from '../item-updater.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'
import {
	getPrimitiveKind,
	isPrimitiveNodeMaterial,
	PRIMITIVE_ADDITIVE_KIND,
	PRIMITIVE_BDL_KIND,
	resolveTransparency,
	updatePrimitiveAdditive,
	updatePrimitiveBdl,
} from './primitive-material-protocol.js'
import { buildPrimitiveMatrix } from './primitive-mesh-generator.js'
import type { PrimitiveState } from './primitive-state.js'

// vpinball: src/parts/primitive.cpp:107/1171 convertColor(c, alpha*(1/100)) — alpha 0..100 maps 0..1,
// 250 => 2.5 HDR, 3000 => 30 HDR (TWD inserts). ALPHA_SCALE 0.01 is the 1/100 factor, not a hand-tuned 0.3.
const ALPHA_SCALE = 0.01
// vpinball: src/shaders/bgfx/fs_pp_tonemap.sc:71 MAX_BURST 1000.0 clamps HDR before nan/inf.
// Generic clamp well above typical primitive HDR (30) so tonemapper (AgX/Reinhard) compresses, not blown white.
// Earlier 4 was TWD-specific clamp that dimmed inserts; 1000 is engine-faithful (effectively unclamped).
const MAX_EMISSIVE = 1000

/** Prebuilt per-frame vertex data: positions/normals plus the frame bounding box. */
export interface PrebuiltAnimationFrame {
	positions: Float32Array
	normals: Float32Array
	/** [minX, minY, minZ, maxX, maxY, maxZ] in raw mesh coords. */
	bounds: Float32Array
}

/** Primitive updater — syncs state to render node. */
export class PrimitiveUpdater extends ItemUpdater<PrimitiveState> {
	private animMesh?: Mesh
	private animFrames: PrebuiltAnimationFrame[] = []
	private animScratch?: { positions: Float32Array; normals: Float32Array; bounds: Float32Array }

	constructor(
		private readonly data: PrimitiveData,
		state: PrimitiveState,
	) {
		super(state)
	}

	private emuProvider?: () => IEmulator | undefined

	/** Controller-state source for SLNK modulation, wired in setupPlayer like the light/flasher animations. */
	public setEmuProvider(provider: () => IEmulator | undefined): void {
		this.emuProvider = provider
	}

	public setMesh(mesh: Mesh): void {
		this.animMesh = mesh
		// Prebuild frames once so ticks lerp into reused scratch.
		const count = mesh.vertices.length
		this.animFrames = mesh.animationFrames.map(frame => {
			const positions = new Float32Array(count * 3)
			const normals = new Float32Array(count * 3)
			const bounds = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity])
			for (let i = 0; i < count; i++) {
				const v = frame.frameVerts[i]
				if (!v) continue
				const o3 = i * 3
				positions[o3] = v.x
				positions[o3 + 1] = v.y
				positions[o3 + 2] = v.z
				normals[o3] = v.nx
				normals[o3 + 1] = v.ny
				normals[o3 + 2] = v.nz
				if (v.x < (bounds[0] as number)) bounds[0] = v.x
				if (v.y < (bounds[1] as number)) bounds[1] = v.y
				if (v.z < (bounds[2] as number)) bounds[2] = v.z
				if (v.x > (bounds[3] as number)) bounds[3] = v.x
				if (v.y > (bounds[4] as number)) bounds[4] = v.y
				if (v.z > (bounds[5] as number)) bounds[5] = v.z
			}
			return { positions, normals, bounds }
		})
		this.animScratch =
			count > 0
				? {
						positions: new Float32Array(count * 3),
						normals: new Float32Array(count * 3),
						bounds: new Float32Array(6),
					}
				: undefined
	}

	public hasMesh(): boolean {
		return !!this.animMesh
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: PrimitiveState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		this.state.mergeFrom(state)
		if (this.state.lockedByLS && !this.state.inPlayState) {
			// Sequencer hide: locked with inPlayState off. @see Primitive::Render in src/parts/primitive.cpp
			renderApi.applyVisibility(false, obj)
		} else if (state.lockedByLS !== undefined || state.inPlayState !== undefined) {
			// Lock-only diff: re-apply the merged script visibility (unlock must reveal again).
			renderApi.applyVisibility(this.state.isVisible, obj)
		} else {
			this.applyVisibility(obj, state, renderApi)
		}
		const needsClone =
			state.material !== undefined ||
			state.map !== undefined ||
			state.color !== undefined ||
			state.alpha !== undefined ||
			state.disableLightingTop !== undefined ||
			state.disableLightingBelow !== undefined
		if (needsClone) this.ensureCloned(obj, renderApi)
		if (state.material !== undefined || state.map !== undefined || state.normalMap !== undefined) {
			this.applyMaterial(obj, state.material, state.map, renderApi, table)
		}
		const needsColor =
			state.color !== undefined ||
			state.alpha !== undefined ||
			state.disableLightingTop !== undefined ||
			state.disableLightingBelow !== undefined ||
			state.material !== undefined ||
			!!this.data.szLightmap ||
			!!this.data.stateSrcLink
		if (needsColor) this.applyColor(obj, table)
		if (needsColor || state.alpha !== undefined) this.applyAlpha(obj)
		if (state.position || state.size || state.rotation || state.translation || state.objectRotation) {
			this.applyTransformation(obj, renderApi, table)
		}
		if (state.currentFrame !== undefined) this.applyAnimationFrame(obj, state, renderApi)
	}

	private ensureCloned<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		for (const mesh of this.meshes(obj)) {
			const mat = mesh.material as unknown as
				| { userData: Record<string, unknown>; clone: () => unknown }
				| undefined
			if (!mat?.clone || mat.userData.__primitiveCloned) continue
			// Node materials stash TSL uniforms in userData, which three.js clone() would
			// reduce to plain JSON; rebuild them so per-primitive script state (color/BDL)
			// never leaks between inserts nor dies on first write. The fork itself is the
			// backend's job (IRenderApi seam); plain .clone() is only the fallback for
			// custom backends that do not provide it.
			const forkClone = renderApi.cloneMaterialForWrite
			const cloned = (forkClone ? forkClone(mat) : mat.clone()) as typeof mat
			;(cloned.userData as Record<string, unknown>).__primitiveCloned = true
			mesh.material = cloned as unknown as typeof mesh.material
		}
	}

	private applyAnimationFrame<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: PrimitiveState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		const mesh = this.animMesh
		if (!mesh || mesh.animationFrames.length === 0) return
		const frame = state.currentFrame
		if (frame === undefined || frame === -1) return
		const target = this.findMeshNode(obj) as unknown as NODE | undefined
		if (!target) return
		const num = mesh.animationFrames.length
		const clamped = Math.max(0, Math.min(frame, num - 1))
		const iFrame = Math.floor(clamped)
		const fract = clamped - iFrame
		// Fast path: lerp prebuilt frames into reused scratch; backend copies in place.
		if (renderApi.applyFrameArrays && this.animFrames.length === num && this.animScratch) {
			const a = this.animFrames[iFrame] as {
				positions: Float32Array
				normals: Float32Array
				bounds: Float32Array
			}
			const b = (iFrame + 1 < num ? this.animFrames[iFrame + 1] : a) as {
				positions: Float32Array
				normals: Float32Array
				bounds: Float32Array
			}
			const { positions, normals, bounds } = this.animScratch
			const pa = a.positions
			const pb = b.positions
			const na = a.normals
			const nb = b.normals
			for (let i = 0; i < positions.length; i++) {
				const pai = pa[i] as number
				const nai = na[i] as number
				positions[i] = pai + ((pb[i] as number) - pai) * fract
				normals[i] = nai + ((nb[i] as number) - nai) * fract
			}
			const ba = a.bounds
			const bb = b.bounds
			bounds[0] = Math.min(ba[0] as number, bb[0] as number)
			bounds[1] = Math.min(ba[1] as number, bb[1] as number)
			bounds[2] = Math.min(ba[2] as number, bb[2] as number)
			bounds[3] = Math.max(ba[3] as number, bb[3] as number)
			bounds[4] = Math.max(ba[4] as number, bb[4] as number)
			bounds[5] = Math.max(ba[5] as number, bb[5] as number)
			renderApi.applyFrameArrays(positions, normals, bounds, target)
			return
		}
		const frames = mesh.animationFrames
		const interp = new Mesh(mesh.name)
		interp.indices = mesh.indices.slice()
		interp.vertices = mesh.vertices.map((base, idx) => {
			const f0 = frames[iFrame] as {
				frameVerts: { x: number; y: number; z: number; nx: number; ny: number; nz: number }[]
			}
			const v0 = f0.frameVerts[idx] as { x: number; y: number; z: number; nx: number; ny: number; nz: number }
			const f1 = iFrame + 1 < num ? frames[iFrame + 1] : undefined
			const v1 = (f1 ? (f1 as { frameVerts: unknown[] }).frameVerts[idx] : undefined) as
				| { x: number; y: number; z: number; nx: number; ny: number; nz: number }
				| undefined
			const vv = v1 ?? v0
			const x = v0.x + (vv.x - v0.x) * fract
			const y = v0.y + (vv.y - v0.y) * fract
			const z = v0.z + (vv.z - v0.z) * fract
			const nx = v0.nx + (vv.nx - v0.nx) * fract
			const ny = v0.ny + (vv.ny - v0.ny) * fract
			const nz = v0.nz + (vv.nz - v0.nz) * fract
			const v = new Vertex3DNoTex2()
			v.x = x
			v.y = y
			v.z = z
			v.nx = nx
			v.ny = ny
			v.nz = nz
			v.tu = base.tu
			v.tv = base.tv
			return v
		})
		interp.animationFrames = []
		renderApi.applyMeshToNode(interp, target)
	}

	private findMeshNode<NODE>(obj: NODE): unknown {
		const anyObj = obj as unknown as { isMesh?: boolean; geometry?: unknown; children?: unknown[] }
		if (anyObj.isMesh && anyObj.geometry) return anyObj
		if (Array.isArray(anyObj.children)) {
			for (const child of anyObj.children as unknown[]) {
				const found = this.findMeshNode(child as unknown as NODE)
				if (found) return found as unknown
			}
		}
		return undefined
	}

	private applyColor<NODE>(obj: NODE, table: Table): void {
		// Native albedo/BDL mix (see primitive-material-protocol.ts for the canonical explanation).
		const prim = this.state.color ?? this.data.color
		const dlTop = this.state.disableLightingTop ?? this.data.disableLightingTop
		const rawAlpha = this.state.alpha ?? this.data.alpha
		const matObj = table.getMaterial(this.state.material ?? this.data.szMaterial ?? '')
		const base = matObj?.baseColor ?? 0xffffff
		const matOpacity = matObj?.isOpacityActive ? Math.min(1, Math.max(0, matObj.opacity)) : 1
		const hex = new Color(base).multiply(new Color(prim)).getHex()
		// Upstream applies the controller link *or* the lightmap, never both
		// (primitive.cpp:932-940): a resolved SLNK link scales the alpha and
		// suppresses the lamp modulation; otherwise the lightmap ratio applies.
		const slnk = this.slnkLinkState()
		const lightFactor = slnk === undefined ? this.lightmapAlphaFactor(table) : 1
		const effectiveAlpha = Math.max(0, rawAlpha) * (slnk ?? 1) * lightFactor
		const bdl = Math.max(0, dlTop)
		for (const mesh of this.meshes(obj)) {
			const mat = mesh.material as any
			if (!mat) continue
			const kind = getPrimitiveKind(mat)
			if (kind === PRIMITIVE_ADDITIVE_KIND) {
				const intensity = Math.min(MAX_EMISSIVE, effectiveAlpha * ALPHA_SCALE)
				updatePrimitiveAdditive(mat, { tint: hex, intensity })
				mat.transparent = true
				mat.depthWrite = false
				// Overlay light splats sit coplanar with the opaque bake below;
				// the offset wins that tie while nearer toys still occlude them
				// (same overlay convention as the classic baked path).
				mat.depthTest = true
				mat.polygonOffset = true
				mat.polygonOffsetFactor = -2
				mat.polygonOffsetUnits = -4
				;(mesh as any).renderOrder = 2
				mat.blending = 2
				mat.toneMapped = true
				// Native (primitive.cpp:1037,1088): visible=false skips the draw, and
				// additive is also skipped when there is nothing to add.
				const scriptVisible = this.state.isVisible ?? this.data.isVisible ?? true
				const sequencerOff = this.state.lockedByLS && !this.state.inPlayState
				;(mesh as any).visible = !!scriptVisible && !sequencerOff && prim !== 0 && effectiveAlpha > 0
				continue
			}
			if (kind === PRIMITIVE_BDL_KIND) {
				const dynamicOpacity = Math.min(1, Math.max(0, effectiveAlpha * ALPHA_SCALE * matOpacity))
				// Native (primitive.cpp:1135): static-marked objects force below to 1.0 — no bulb light in the static prepass.
				const below = this.data.staticRendering
					? 1
					: (this.state.disableLightingBelow ?? this.data.disableLightingBelow ?? 0)
				// The bulb buffer is sampled per-pixel from the fragment's own
				// playfield UV (see primitive-bdl-node.ts), mirroring the native
				// per-pixel lookup (fs_basic.sc) with no per-primitive anchor.
				updatePrimitiveBdl(mat, {
					albedo: hex,
					opacity: dynamicOpacity,
					bdl,
					below,
				})
				// Shared with creation (see resolveTransparency): the file-level rule
				// plus the lamp/slnk-scaled dynamic fade. The bound three.js
				// texture carries no isOpaque flag, so consult the VPT record for
				// the file-level image alpha (upstream blends on `!img->IsOpaque()`).
				const vptMap = table.getTexture(this.data.szImage ?? '')
				const { transparent } = resolveTransparency(
					matObj,
					(vptMap as { isOpaque?: boolean } | undefined) ??
						(mat as { userData?: { __map?: { isOpaque?: boolean } | null } }).userData?.__map ??
						null,
					dynamicOpacity,
				)
				if (mat.transparent !== transparent || mat.depthWrite === transparent) {
					mat.transparent = transparent
					mat.depthWrite = !transparent
					// Render state only: transparent/depthWrite are not part of the
					// program cache key, so no rebuild is needed (see WebGLPrograms).
				}
				// Native (primitive.cpp:1037): script visible=false skips the draw.
				// Visibility is owned by applyVisibility; never force it here or
				// script-hidden wells (e.g. insert flare when the lamp is off) cover
				// the playfield with dark sockets.
				continue
			}
			if (mat.userData?.__uTint?.value?.set) mat.userData.__uTint.value.set(hex)
		}
	}

	/**
	 * Resolved SLNK controller value, or undefined when no link is set, no
	 * emulator is wired, or the link does not resolve (upstream then falls back
	 * to the lightmap). @see Primitive::Render in src/parts/primitive.cpp
	 */
	private slnkLinkState(): number | undefined {
		const link = this.data.stateSrcLink
		if (!link || !this.emuProvider) return undefined
		const linked = tryGetFloatState(this.emuProvider(), link)
		return linked.ok ? linked.value : undefined
	}

	private lightmapAlphaFactor(table: Table): number {
		// Native convolutes lightmap primitives with the lamp shadow (primitive.cpp:1080);
		// the lamp scales the primitive alpha, never its color.
		const lightName = this.data.szLightmap
		if (!lightName) return 1
		try {
			const light = (table as any).lights?.[lightName] ?? (table as any).getLight?.(lightName)
			const lightState = (light as any)?.getState?.() ?? (light as any)?.state
			const dataInt = (light as any)?.data?.intensity ?? (light as any)?.intensity ?? 1
			const scale = (light as any)?.data?.intensityScale ?? (light as any)?.animation?.intensityScale ?? 1
			const currentIntensity = lightState?.intensity ?? dataInt
			const denom = dataInt * scale
			// Upstream divides unconditionally (primitive.cpp:932-940): the live
			// intensity is full-scale (base x scale x state), so a mid-fade lamp
			// scales by current/denom, never by the raw current value.
			let rawFactor: number
			if (denom !== 0) {
				rawFactor = currentIntensity / denom
			} else rawFactor = 0
			return Math.max(0, Math.min(1, Number.isFinite(rawFactor) ? rawFactor : 0))
		} catch {
			return 1
		}
	}

	private applyAlpha<NODE>(obj: NODE): void {
		// Opacity lives in applyColor (albedo/BDL/intensity uniforms); this only keeps the
		// classic-material flags consistent for alpha-only updates.
		for (const mesh of this.meshes(obj)) {
			const mat = mesh.material as any
			if (!mat || isPrimitiveNodeMaterial(mat)) continue
			const rawAlpha = this.state.alpha ?? this.data.alpha
			const dynamicOpacity = Math.min(1, Math.max(0, rawAlpha * ALPHA_SCALE))
			// Same shared rule as creation/BDL (file part is empty here, so this only
			// centralizes the 0.999 cutout with the fade term).
			const { opacity, transparent } = resolveTransparency(undefined, null, dynamicOpacity)
			mat.opacity = opacity
			mat.transparent = transparent
			mat.depthWrite = !mat.transparent
			mat.depthTest = true
			if (mat.blending !== 1 && !mat.userData?.__addBlend) mat.blending = 1
		}
	}

	private meshes<NODE>(obj: NODE): Array<{ material: unknown }> {
		if (!obj) return []
		const anyObj = obj as unknown as { children?: unknown[] }
		if (anyObj.children?.length) return anyObj.children as Array<{ material: unknown }>
		return [anyObj as unknown as { material: unknown }]
	}

	private applyTransformation<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const primitiveData = this.data
		const primitiveState = this.state
		const scaleZ = table.getScaleZ()
		const oldPos = primitiveData.position
		const oldSize = primitiveData.size
		const rotAndTra = primitiveData.rotAndTra as unknown as number[]
		const oldRot = {
			x: rotAndTra[0] as number,
			y: rotAndTra[1] as number,
			z: rotAndTra[2] as number,
		}
		const oldTrans = {
			x: rotAndTra[3] as number,
			y: rotAndTra[4] as number,
			z: rotAndTra[5] as number,
		}
		const oldObj = {
			x: rotAndTra[6] as number,
			y: rotAndTra[7] as number,
			z: rotAndTra[8] as number,
		}
		const newPos = primitiveState.position ?? oldPos
		const newSize = primitiveState.size ?? oldSize
		const newRot = primitiveState.rotation
			? { x: primitiveState.rotation.x, y: primitiveState.rotation.y, z: primitiveState.rotation.z }
			: oldRot
		const newTrans = primitiveState.translation
			? { x: primitiveState.translation.x, y: primitiveState.translation.y, z: primitiveState.translation.z }
			: oldTrans
		const newObj = primitiveState.objectRotation
			? {
					x: primitiveState.objectRotation.x,
					y: primitiveState.objectRotation.y,
					z: primitiveState.objectRotation.z,
				}
			: oldObj
		const oldFull = buildPrimitiveMatrix(oldPos, oldSize, oldRot, oldTrans, oldObj, scaleZ)
		const newFull = buildPrimitiveMatrix(newPos, newSize, newRot, newTrans, newObj, scaleZ)
		const rh = Matrix3D.claim().setScaling(1, 1, -1)
		const oldRH = oldFull.clone().multiply(rh)
		const newRH = newFull.clone().multiply(rh)
		const invOldRH = oldRH.clone().transpose().invert().transpose()
		const delta = invOldRH.clone().multiply(newRH)
		renderApi.applyMatrixToNode(delta, obj)
		Matrix3D.release(oldFull, newFull, rh, oldRH, newRH, invOldRH, delta)
	}
}
