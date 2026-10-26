// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex3D } from '../../math/vector.js'
import { ItemState } from '../item-state.js'

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
	/** Sequencer lock. @see Primitive::m_lockedByLS in src/parts/primitive.h */
	public lockedByLS = false
	/** Sequencer-driven on/off; script Visible keeps flowing to isVisible. @see Primitive::m_inPlayState in src/parts/primitive.h */
	public inPlayState = true
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
		state.inPlayState = isVisible
		return state
	}
}
