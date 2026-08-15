// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { Color, MathUtils } from 'three'

import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { ItemUpdater } from '../item-updater.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'
import type { PrimitiveState } from './primitive-state.js'

const DISABLE_THRESHOLD = 0.001
const DISABLE_SCALE = 0.01
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
		if (state.alpha !== undefined) this.applyAlpha(obj)
		if (state.position || state.size || state.rotation || state.translation || state.objectRotation) {
			this.applyTransformation(obj, renderApi, table)
		}
		if (state.currentFrame !== undefined) this.applyAnimationFrame(obj, state, renderApi)
	}

	private ensureCloned<NODE>(obj: NODE): void {
		for (const m of this.meshes(obj)) {
			const mat = m.material as unknown as { userData: Record<string, unknown>; clone: () => unknown } | undefined
			if (!mat?.clone || mat.userData.__primitiveCloned) continue
			const cloned = mat.clone() as typeof mat
			;(cloned.userData as Record<string, unknown>).__primitiveCloned = true
			m.material = cloned as unknown as typeof m.material
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
		const prim = this.state.color ?? this.data.color
		const dlTop = this.state.disableLightingTop ?? this.data.disableLightingTop
		const dlBelow = this.state.disableLightingBelow ?? this.data.disableLightingBelow
		const topIntensity = dlTop > DISABLE_THRESHOLD ? dlTop * DISABLE_SCALE : 0
		const belowIntensity = dlBelow < 1 - DISABLE_THRESHOLD ? (1 - dlBelow) * DISABLE_SCALE * 0.5 : 0
		const rawAlpha = this.state.alpha ?? this.data.alpha
		const rawAlphaClamped = Math.max(0, rawAlpha)
		const alphaIntensity = this.data.addBlend ? Math.min(MAX_EMISSIVE, rawAlphaClamped * ALPHA_SCALE) : 0
		const nonBakedIntensity = Math.min(MAX_EMISSIVE, topIntensity + belowIntensity + alphaIntensity)
		const nonBakedEmissive = nonBakedIntensity > 0
		const matName = this.state.material ?? this.data.szMaterial
		const mapName = this.state.map ?? this.data.szImage
		const isBakedByName =
			/bake/i.test(matName ?? '') ||
			(/bake|nestmap/i.test(mapName ?? '') && !mapName.toLowerCase().startsWith('vr_'))
		const base = table.getMaterial(matName)?.baseColor ?? 0xffffff
		const hex = new Color(base).multiply(new Color(prim)).getHex() // unlit: emissive = base*prim, intensity = alpha/100
		const lightName = this.data.szLightmap
		let lightFactor = 1
		if (lightName) {
			try {
				const l = (table as any).lights?.[lightName] ?? (table as any).getLight?.(lightName)
				// light state intensity vs data intensity
				const st = (l as any)?.getState?.() ?? (l as any)?.state
				const dataInt = (l as any)?.data?.intensity ?? (l as any)?.intensity ?? 1
				const scale = (l as any)?.data?.intensityScale ?? (l as any)?.animation?.intensityScale ?? 1
				const cur = st?.intensity ?? dataInt
				if (dataInt !== 0 && scale !== 0) lightFactor = cur / (dataInt * scale)
				else lightFactor = 0
				if (!Number.isFinite(lightFactor)) lightFactor = 0
			} catch {
				lightFactor = 1
			}
		}
		const effectiveAlpha = rawAlphaClamped * lightFactor
		const effectiveIntensity = Math.min(MAX_EMISSIVE, effectiveAlpha * ALPHA_SCALE)
		for (const m of this.meshes(obj)) {
			const mat = m.material as unknown as
				| {
						color: { set: (v: number) => void }
						emissive: { set: (v: number) => void }
						emissiveIntensity: number
						emissiveMap?: unknown
						map?: unknown
						userData?: Record<string, unknown>
						needsUpdate: boolean
				  }
				| undefined
			if (!mat?.color || !mat?.emissive) continue
			const isBaked =
				dlTop > 0.5 || isBakedByName || !!(mat as any).userData?.__isBaked || !!(mat as any).emissiveMap
			if (isBaked) {
				const hasMap = !!(mat as any).emissiveMap || !!(mat as any).map
				const pending =
					(mat as any).userData?.pendingMap ||
					(mat as any).userData?.pendingmap ||
					(mat as any).userData?.pendingEmissiveMap
				const isBakedByCache = isBakedByName || !!(mat as any).userData?.__isBaked || !!(mat as any).emissiveMap
				if (!hasMap && pending && isBakedByCache) {
					mat.color.set(0x000000)
					mat.emissive.set(0xffffff)
					mat.emissiveIntensity = 0
					continue
				}
				if (this.data.addBlend) {
					// unlit additive
					mat.color.set(0x000000)
					mat.emissive.set(hex)
					mat.emissiveIntensity = effectiveIntensity
				} else {
					mat.color.set(0x000000)
					if (!mat.emissive) (mat as any).emissive = new Color(hex)
					else mat.emissive.set(hex)
					mat.emissiveIntensity = 1.0
				}
			} else {
				mat.color.set(hex)
				if (nonBakedEmissive) {
					mat.emissive.set(hex)
					mat.emissiveIntensity = nonBakedIntensity
				} else {
					mat.emissive.set(0x000000)
					mat.emissiveIntensity = 0
				}
			}
			mat.needsUpdate = true
		}
	}

	private applyAlpha<NODE>(obj: NODE): void {
		const rawAlpha = this.state.alpha ?? this.data.alpha
		const opacity = Math.min(1, Math.max(0, rawAlpha * ALPHA_SCALE))
		const isAdditive = !!this.data.addBlend
		for (const m of this.meshes(obj)) {
			const mat = m.material as unknown as
				| {
						opacity: number
						transparent: boolean
						depthWrite: boolean
						blending: number
						needsUpdate: boolean
						userData: Record<string, unknown>
						map?: unknown
						emissiveMap?: unknown
				  }
				| undefined
			if (!mat) continue
			const isBakedPending =
				!!(mat as any).userData?.__isBaked &&
				!mat.map &&
				!mat.emissiveMap &&
				((mat as any).userData?.pendingMap || (mat as any).userData?.pendingEmissiveMap)
			if (isBakedPending) {
				mat.opacity = 0
				mat.transparent = true
				mat.depthWrite = false
				mat.needsUpdate = true
				continue
			}
			if (isAdditive) {
				mat.opacity = opacity
				mat.transparent = true
				mat.depthWrite = false
				mat.blending = 2
			} else {
				mat.opacity = opacity
				mat.transparent = opacity < 0.999
				mat.depthWrite = !mat.transparent
			}
			mat.needsUpdate = true
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
		const d = this.data
		const s = this.state
		const toOrigin = Matrix3D.claim().setTranslation(-d.position.x, -d.position.y, d.position.z)
		const fromOrigin = Matrix3D.claim().setTranslation(d.position.x, d.position.y, -d.position.z)
		const scale = Matrix3D.claim().setScaling(
			(s.size?.x ?? d.size.x) / d.size.x,
			(s.size?.y ?? d.size.y) / d.size.y,
			(s.size?.z ?? d.size.z) / d.size.z,
		)
		const scaleZ = Matrix3D.claim().setScaling(1, 1, table.getScaleZ())
		const trans = Matrix3D.claim().setTranslation(
			-(d.position.x - (s.position?.x ?? d.position.x)),
			-(d.position.y - (s.position?.y ?? d.position.y)),
			d.position.z - (s.position?.z ?? d.position.z),
		)
		const rotTrans = Matrix3D.claim().setTranslation(
			-(d.rotAndTra[3] - (s.translation?.x ?? d.rotAndTra[3])),
			-(d.rotAndTra[4] - (s.translation?.y ?? d.rotAndTra[4])),
			d.rotAndTra[5] - (s.translation?.z ?? d.rotAndTra[5]),
		)
		const tmp = Matrix3D.claim()
		tmp.rotateZMatrix(MathUtils.degToRad(-(d.rotAndTra[2] - (s.rotation?.z ?? d.rotAndTra[2]))))
		rotTrans.multiply(tmp)
		tmp.rotateYMatrix(MathUtils.degToRad(d.rotAndTra[1] - (s.rotation?.y ?? d.rotAndTra[1])))
		rotTrans.multiply(tmp)
		tmp.rotateXMatrix(MathUtils.degToRad(d.rotAndTra[0] - (s.rotation?.x ?? d.rotAndTra[0])))
		rotTrans.multiply(tmp)
		tmp.rotateZMatrix(MathUtils.degToRad(-(d.rotAndTra[8] - (s.objectRotation?.z ?? d.rotAndTra[8]))))
		rotTrans.multiply(tmp)
		tmp.rotateYMatrix(MathUtils.degToRad(d.rotAndTra[7] - (s.objectRotation?.y ?? d.rotAndTra[7])))
		rotTrans.multiply(tmp)
		tmp.rotateXMatrix(MathUtils.degToRad(d.rotAndTra[6] - (s.objectRotation?.x ?? d.rotAndTra[6])))
		rotTrans.multiply(tmp)
		const m = toOrigin
			.clone()
			.multiply(scale)
			.multiply(rotTrans)
			.multiply(trans)
			.multiply(scaleZ)
			.multiply(fromOrigin)
		renderApi.applyMatrixToNode(m, obj)
		Matrix3D.release(toOrigin, fromOrigin, scale, trans, rotTrans, tmp, scaleZ, m)
	}
}
