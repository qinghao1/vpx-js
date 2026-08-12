// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex3D } from '../../util/vector.js'
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
	public color: number = 0xffffff
	public alpha: number = 100
	public disableLightingTop: number = 0
	public disableLightingBelow: number = 1
	public currentFrame: number = -1

	public static claimFrom(
		name: string,
		position: Vertex3D,
		size: Vertex3D,
		rotAndTra: number[],
		material: string | undefined,
		map: string | undefined,
		normalMap: string | undefined,
		isVisible: boolean,
		color: number = 0xffffff,
		disableLightingTop: number = 0,
		disableLightingBelow: number = 1,
		alpha: number = 100,
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
			color,
			disableLightingTop,
			disableLightingBelow,
			alpha,
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
		normalMap: string | undefined,
		isVisible: boolean,
		color: number = 0xffffff,
		disableLightingTop: number = 0,
		disableLightingBelow: number = 1,
		alpha: number = 100,
		currentFrame: number = -1,
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
		state.normalMap = normalMap
		state.isVisible = isVisible
		state.color = color
		state.alpha = alpha
		state.disableLightingTop = disableLightingTop
		state.disableLightingBelow = disableLightingBelow
		state.currentFrame = currentFrame
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
			this.color,
			this.disableLightingTop,
			this.disableLightingBelow,
			this.alpha,
			this.currentFrame,
		)
	}

	public diff(state: PrimitiveState): PrimitiveState {
		const diff = this.clone()
		if (diff.position.equals(state.position)) {
			Vertex3D.release(diff.position)
			// biome-ignore lint/performance/noDelete: partial diff requires deletion
			delete diff.position
		}
		if (diff.size.equals(state.size)) {
			Vertex3D.release(diff.size)
			// biome-ignore lint/performance/noDelete: partial diff requires deletion
			delete diff.size
		}
		if (diff.rotation.equals(state.rotation)) {
			Vertex3D.release(diff.rotation)
			// biome-ignore lint/performance/noDelete: partial diff requires deletion
			delete diff.rotation
		}
		if (diff.translation.equals(state.translation)) {
			Vertex3D.release(diff.translation)
			// biome-ignore lint/performance/noDelete: partial diff requires deletion
			delete diff.translation
		}
		if (diff.objectRotation.equals(state.objectRotation)) {
			Vertex3D.release(diff.objectRotation)
			// biome-ignore lint/performance/noDelete: partial diff requires deletion
			delete diff.objectRotation
		}
		omitEqual(diff, state, 'material')
		omitEqual(diff, state, 'map')
		omitEqual(diff, state, 'normalMap')
		omitEqual(diff, state, 'isVisible')
		omitEqual(diff, state, 'color')
		omitEqual(diff, state, 'alpha')
		omitEqual(diff, state, 'disableLightingTop')
		omitEqual(diff, state, 'disableLightingBelow')
		omitEqual(diff, state, 'currentFrame')
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
			state.isVisible === this.isVisible &&
			state.color === this.color &&
			state.alpha === this.alpha &&
			state.disableLightingTop === this.disableLightingTop &&
			state.disableLightingBelow === this.disableLightingBelow &&
			state.currentFrame === this.currentFrame
		)
	}
}
