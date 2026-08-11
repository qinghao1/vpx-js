// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { Color, MathUtils } from 'three'

import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'
import type { PrimitiveState } from './primitive-state.js'

const DISABLE_THRESHOLD = 0.001
const DISABLE_SCALE = 0.01
const MAX_EMISSIVE = 4

/** Primitive updater — syncs state to render node. */
export class PrimitiveUpdater extends ItemUpdater<PrimitiveState> {
	constructor(
		private readonly data: PrimitiveData,
		state: PrimitiveState,
	) {
		super(state)
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
			state.disableLightingTop !== undefined ||
			state.disableLightingBelow !== undefined
		if (needsClone) this.ensureCloned(obj)
		if (state.material !== undefined || state.map !== undefined || state.normalMap !== undefined) {
			this.applyMaterial(obj, state.material, state.map, renderApi, table)
		}
		const needsColor =
			state.color !== undefined ||
			state.disableLightingTop !== undefined ||
			state.disableLightingBelow !== undefined ||
			state.material !== undefined
		if (needsColor) this.applyColor(obj, table)
		if (state.position || state.size || state.rotation || state.translation || state.objectRotation) {
			this.applyTransformation(obj, renderApi, table)
		}
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

	private applyColor<NODE>(obj: NODE, table: Table): void {
		const prim = this.state.color ?? this.data.color
		const dlTop = this.state.disableLightingTop ?? this.data.disableLightingTop
		const dlBelow = this.state.disableLightingBelow ?? this.data.disableLightingBelow
		const topIntensity = dlTop > DISABLE_THRESHOLD ? dlTop * DISABLE_SCALE : 0
		const belowIntensity = dlBelow < 1 - DISABLE_THRESHOLD ? (1 - dlBelow) * DISABLE_SCALE * 0.5 : 0
		const intensity = Math.min(MAX_EMISSIVE, topIntensity + belowIntensity)
		const emissive = intensity > 0
		const matName = this.state.material ?? this.data.szMaterial
		const base = table.getMaterial(matName)?.baseColor ?? 0xffffff
		const hex = new Color(base).multiply(new Color(prim)).getHex()
		for (const m of this.meshes(obj)) {
			const mat = m.material as unknown as
				| {
						color: { set: (v: number) => void }
						emissive: { set: (v: number) => void }
						emissiveIntensity: number
						needsUpdate: boolean
				  }
				| undefined
			if (!mat?.color || !mat?.emissive) continue
			mat.color.set(hex)
			if (emissive) {
				mat.emissive.set(hex)
				mat.emissiveIntensity = intensity
			} else {
				mat.emissive.set(0x000000)
				mat.emissiveIntensity = 0
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
