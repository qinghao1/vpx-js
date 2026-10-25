// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { Color, MathUtils } from 'three'

import type { IRenderApi } from '../../render/irender-api.js'
import { cloneMaterialForWrite, getGlobalEmissionScale } from '../../render/threejs/material-shared.js'
import {
	getPrimitiveKind,
	isPrimitiveNodeMaterial,
	PRIMITIVE_ADDITIVE_KIND,
	PRIMITIVE_BDL_KIND,
	updatePrimitiveAdditive,
	updatePrimitiveBdl,
} from '../../render/threejs/nodes/primitive-bdl-node.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { ItemUpdater } from '../item-updater.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'
import type { PrimitiveState } from './primitive-state.js'

// vpinball: src/parts/primitive.cpp:107/1171 convertColor(c, alpha*(1/100)) — alpha 0..100 maps 0..1,
// 250 => 2.5 HDR, 3000 => 30 HDR (TWD inserts). ALPHA_SCALE 0.01 is the 1/100 factor, not a hand-tuned 0.3.
const ALPHA_SCALE = 0.01
// vpinball: src/shaders/bgfx/fs_pp_tonemap.sc:71 MAX_BURST 1000.0 clamps HDR before nan/inf.
// Generic clamp well above typical primitive HDR (30) so tonemapper (AgX/Reinhard) compresses, not blown white.
// Earlier 4 was TWD-specific clamp that dimmed inserts; 1000 is engine-faithful (effectively unclamped).
const MAX_EMISSIVE = 1000

/** Primitive updater — syncs state to render node. */
export class PrimitiveUpdater extends ItemUpdater<PrimitiveState> {
	private animMesh?: Mesh

	constructor(
		private readonly data: PrimitiveData,
		state: PrimitiveState,
	) {
		super(state)
	}

	public setMesh(mesh: Mesh): void {
		this.animMesh = mesh
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
		Object.assign(this.state, state)
		this.applyVisibility(obj, state, renderApi)
		const needsClone =
			state.material !== undefined ||
			state.map !== undefined ||
			state.color !== undefined ||
			state.alpha !== undefined ||
			state.disableLightingTop !== undefined ||
			state.disableLightingBelow !== undefined
		if (needsClone) this.ensureCloned(obj)
		if (state.material !== undefined || state.map !== undefined || state.normalMap !== undefined) {
			this.applyMaterial(obj, state.material, state.map, renderApi, table)
		}
		const needsColor =
			state.color !== undefined ||
			state.alpha !== undefined ||
			state.disableLightingTop !== undefined ||
			state.disableLightingBelow !== undefined ||
			state.material !== undefined ||
			!!this.data.szLightmap
		if (needsColor) this.applyColor(obj, table)
		if (needsColor || state.alpha !== undefined) this.applyAlpha(obj)
		if (state.position || state.size || state.rotation || state.translation || state.objectRotation) {
			this.applyTransformation(obj, renderApi, table)
		}
		if (state.currentFrame !== undefined) this.applyAnimationFrame(obj, state, renderApi)
	}

	private ensureCloned<NODE>(obj: NODE): void {
		for (const mesh of this.meshes(obj)) {
			const mat = mesh.material as unknown as
				| { userData: Record<string, unknown>; clone: () => unknown }
				| undefined
			if (!mat?.clone || mat.userData.__primitiveCloned) continue
			// Node materials stash TSL uniforms in userData, which three.js clone() would
			// reduce to plain JSON; rebuild them so per-primitive script state (color/BDL)
			// never leaks between inserts nor dies on first write.
			const cloned = cloneMaterialForWrite(mat) as typeof mat
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
		const frames = mesh.animationFrames
		const num = frames.length
		if (num === 0) return
		const clamped = Math.max(0, Math.min(frame, num - 1))
		const iFrame = Math.floor(clamped)
		const fract = clamped - iFrame
		const interp = new Mesh(mesh.name)
		interp.indices = mesh.indices.slice()
		interp.vertices = mesh.vertices.map((base, idx) => {
			let x: number, y: number, z: number, nx: number, ny: number, nz: number
			if (iFrame + 1 < num) {
				const v0 = frames[iFrame]!.frameVerts[idx]!
				const v1 = frames[iFrame + 1]!.frameVerts[idx]!
				x = v0.x + (v1.x - v0.x) * fract
				y = v0.y + (v1.y - v0.y) * fract
				z = v0.z + (v1.z - v0.z) * fract
				nx = v0.nx + (v1.nx - v0.nx) * fract
				ny = v0.ny + (v1.ny - v0.ny) * fract
				nz = v0.nz + (v1.nz - v0.nz) * fract
			} else {
				const v0 = frames[iFrame]!.frameVerts[idx]!
				x = v0.x
				y = v0.y
				z = v0.z
				nx = v0.nx
				ny = v0.ny
				nz = v0.nz
			}
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
		const target = this.findMeshNode(obj) as unknown as NODE | undefined
		if (target) renderApi.applyMeshToNode(interp, target)
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
		// Native (primitive.cpp + material.sh): albedo = map * material.base * primitive.color,
		// out = mix(lit, albedo, BlendDisableLighting) * alpha-state; addBlend renders the unlit
		// albedo additively with intensity alpha/100. All inputs are file/script flags — names,
		// depthBias windows, and on/off substrings play no role.
		const prim = this.state.color ?? this.data.color
		const dlTop = this.state.disableLightingTop ?? this.data.disableLightingTop
		const rawAlpha = this.state.alpha ?? this.data.alpha
		const matObj = table.getMaterial(this.state.material ?? this.data.szMaterial ?? '')
		const base = matObj?.baseColor ?? 0xffffff
		const matOpacity = matObj?.isOpacityActive ? Math.min(1, Math.max(0, matObj.opacity)) : 1
		const hex = new Color(base).multiply(new Color(prim)).getHex()
		const lightFactor = this.lightmapAlphaFactor(table)
		const effectiveAlpha = Math.max(0, rawAlpha) * lightFactor
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
				mat.depthTest = true
				mat.blending = 2
				mat.toneMapped = true
				// Native (primitive.cpp:1037,1088): visible=false skips the draw, and
				// additive is also skipped when there is nothing to add.
				const scriptVisible = this.state.isVisible ?? this.data.isVisible ?? true
				;(mesh as any).visible = !!scriptVisible && prim !== 0 && effectiveAlpha > 0
				continue
			}
			if (kind === PRIMITIVE_BDL_KIND) {
				const opacity = Math.min(1, Math.max(0, effectiveAlpha * ALPHA_SCALE * matOpacity))
				const below = this.state.disableLightingBelow ?? this.data.disableLightingBelow ?? 0
				// The bulb buffer is sampled per-pixel from the fragment's own
				// playfield UV (see primitive-bdl-node.ts), mirroring the native
				// per-pixel lookup (fs_basic.sc) with no per-primitive anchor.
				updatePrimitiveBdl(mat, {
					albedo: hex,
					opacity,
					bdl,
					below,
				})
				const transparent = opacity < 0.999
				if (mat.transparent !== transparent || mat.depthWrite === transparent) {
					mat.transparent = transparent
					mat.depthWrite = !transparent
					mat.needsUpdate = true
				}
				// Native (primitive.cpp:1037): script visible=false skips the draw.
				// Visibility is owned by applyVisibility; never force it here or
				// script-hidden wells (e.g. insert flare when the lamp is off) cover
				// the playfield with dark sockets.
				continue
			}
			if (mat.userData?.__uTintColor?.value?.set) mat.userData.__uTintColor.value.set(hex)
			if (mat.userData?.__uTint?.value?.set) mat.userData.__uTint.value.set(hex)
		}
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
			let rawFactor: number
			if (denom !== 0) {
				rawFactor = currentIntensity / denom
				if (currentIntensity >= 0 && currentIntensity <= 1 && denom > 1) rawFactor = currentIntensity
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
			const opacity = Math.min(1, Math.max(0, rawAlpha * ALPHA_SCALE))
			mat.opacity = opacity
			mat.transparent = opacity < 0.999
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
		const oldRot = {
			x: primitiveData.rotAndTra[0]!,
			y: primitiveData.rotAndTra[1]!,
			z: primitiveData.rotAndTra[2]!,
		}
		const oldTrans = {
			x: primitiveData.rotAndTra[3]!,
			y: primitiveData.rotAndTra[4]!,
			z: primitiveData.rotAndTra[5]!,
		}
		const oldObj = {
			x: primitiveData.rotAndTra[6]!,
			y: primitiveData.rotAndTra[7]!,
			z: primitiveData.rotAndTra[8]!,
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
		const buildFull = (
			pos: { x: number; y: number; z: number },
			sz: { x: number; y: number; z: number },
			rot: { x: number; y: number; z: number },
			trans: { x: number; y: number; z: number },
			obj: { x: number; y: number; z: number },
		): Matrix3D => {
			const rt = Matrix3D.claim().setTranslation(trans.x, trans.y, trans.z)
			const tmp = Matrix3D.claim()
			tmp.rotateZMatrix(MathUtils.degToRad(rot.z))
			rt.multiply(tmp)
			tmp.rotateYMatrix(MathUtils.degToRad(rot.y))
			rt.multiply(tmp)
			tmp.rotateXMatrix(MathUtils.degToRad(rot.x))
			rt.multiply(tmp)
			tmp.rotateZMatrix(MathUtils.degToRad(obj.z))
			rt.multiply(tmp)
			tmp.rotateYMatrix(MathUtils.degToRad(obj.y))
			rt.multiply(tmp)
			tmp.rotateXMatrix(MathUtils.degToRad(obj.x))
			rt.multiply(tmp)
			const scale = Matrix3D.claim().setScaling(sz.x, sz.y, sz.z)
			const tpos = Matrix3D.claim().setTranslation(pos.x, pos.y, pos.z)
			const full = scale.clone().multiply(rt).multiply(tpos)
			if (scaleZ !== 1) {
				const zs = Matrix3D.claim().setScaling(1, 1, scaleZ)
				full.multiply(zs)
				Matrix3D.release(zs)
			}
			Matrix3D.release(rt, tmp, scale, tpos)
			return full
		}
		const oldFull = buildFull(oldPos, oldSize, oldRot, oldTrans, oldObj)
		const newFull = buildFull(newPos, newSize, newRot, newTrans, newObj)
		const rh = Matrix3D.claim().setScaling(1, 1, -1)
		const oldRH = oldFull.clone().multiply(rh)
		const newRH = newFull.clone().multiply(rh)
		const invOldRH = oldRH.clone().transpose().invert().transpose()
		const delta = invOldRH.clone().multiply(newRH)
		renderApi.applyMatrixToNode(delta, obj)
		Matrix3D.release(oldFull, newFull, rh, oldRH, newRH, invOldRH, delta)
	}
}
