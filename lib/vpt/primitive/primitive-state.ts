// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex3D } from '../../util/math.js'
import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Primitive state. @see https://github.com/vpinball/vpinball/blob/master/primitive.cpp */
export class PrimitiveState extends ItemState {
	public position: Vertex3D = Vertex3D.claim()
	public size: Vertex3D = Vertex3D.claim()
	public rotation: Vertex3D = Vertex3D.claim() // rotAndTra[0,1,2]
	public translation: Vertex3D = Vertex3D.claim() // rotAndTra[3,4,5]
	public objectRotation: Vertex3D = Vertex3D.claim() // rotAndTra[6,7,8]
	public material?: string
	public map?: string
	public normalMap?: string

	public static claimFrom(
		name: string,
		position: Vertex3D,
		size: Vertex3D,
		rotAndTra: number[],
		material: string | undefined,
		map: string | undefined,
		normalMap: string | undefined,
		isVisible: boolean,
	) {
		return PrimitiveState.claim(
			name,
			position,
			size,
			Vertex3D.claim(rotAndTra[0], rotAndTra[1], rotAndTra[2]),
			Vertex3D.claim(rotAndTra[3], rotAndTra[4], rotAndTra[5]),
			Vertex3D.claim(rotAndTra[6], rotAndTra[7], rotAndTra[8]),
			material,
			map,
			normalMap,
			isVisible,
		)
	}

	public static claim(
		name: string,
		position: Vertex3D,
		size: Vertex3D,
		rotation: Vertex3D,
		translation: Vertex3D,
		objectRotation: Vertex3D,
		material: string | undefined,
		map: string | undefined,
		_normalMap: string | undefined,
		isVisible: boolean,
	): PrimitiveState {
		const state = new PrimitiveState()
		state.name = name
		state.position = position
		state.size = size
		state.rotation = rotation
		state.translation = translation
		state.objectRotation = objectRotation
		state.material = material
		state.map = map
		state.normalMap = map
		state.isVisible = isVisible
		return state
	}

	public clone(): PrimitiveState {
		return PrimitiveState.claim(
			this.name,
			this.position.clone(true),
			this.size.clone(true),
			this.rotation.clone(true),
			this.translation.clone(true),
			this.objectRotation.clone(true),
			this.material,
			this.map,
			this.normalMap,
			this.isVisible,
		)
	}

	public diff(state: PrimitiveState): PrimitiveState {
		const diff = this.clone()
		if (diff.position.equals(state.position)) {
			Vertex3D.release(diff.position)
			delete diff.position
		}
		if (diff.size.equals(state.size)) {
			Vertex3D.release(diff.size)
			delete diff.size
		}
		if (diff.rotation.equals(state.rotation)) {
			Vertex3D.release(diff.rotation)
			delete diff.rotation
		}
		if (diff.translation.equals(state.translation)) {
			Vertex3D.release(diff.translation)
			delete diff.translation
		}
		if (diff.objectRotation.equals(state.objectRotation)) {
			Vertex3D.release(diff.objectRotation)
			delete diff.objectRotation
		}
		omitEqual(diff, state, 'material')
		omitEqual(diff, state, 'map')
		omitEqual(diff, state, 'normalMap')
		omitEqual(diff, state, 'isVisible')
		return diff
	}

	public release(): void {
		if (!this.position) this.position = Vertex3D.claim()
		if (!this.size) this.size = Vertex3D.claim()
		if (!this.rotation) this.rotation = Vertex3D.claim()
		if (!this.translation) this.translation = Vertex3D.claim()
		if (!this.objectRotation) this.objectRotation = Vertex3D.claim()
	}

	public equals(state: PrimitiveState): boolean {
		if (!state) return false
		return (
			state.position.equals(this.position) &&
			state.size.equals(this.size) &&
			state.rotation.equals(this.rotation) &&
			state.translation.equals(this.translation) &&
			state.objectRotation.equals(this.objectRotation) &&
			state.material === this.material &&
			state.map === this.map &&
			state.normalMap === this.normalMap &&
			state.isVisible === this.isVisible
		)
	}
}
