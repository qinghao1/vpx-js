// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Ramp state. @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class RampState extends ItemState {
	public type?: number

	public heightBottom!: number
	public heightTop!: number
	public widthBottom!: number
	public widthTop!: number
	public leftWallHeight?: number
	public rightWallHeight?: number
	public leftWallHeightVisible!: number
	public rightWallHeightVisible!: number
	public depthBias?: number

	public material?: string
	public texture?: string
	public textureAlignment?: number
	public hasWallImage?: boolean

	public static claim(
		name: string,
		heightBottom: number,
		heightTop: number,
		widthBottom: number,
		widthTop: number,
		leftWallHeight: number | undefined,
		rightWallHeight: number | undefined,
		leftWallHeightVisible: number,
		rightWallHeightVisible: number,
		type: number | undefined,
		material: string | undefined,
		texture: string | undefined,
		textureAlignment: number | undefined,
		hasWallImage: boolean | undefined,
		depthBias: number | undefined,
		isVisible: boolean,
	): RampState {
		const state = new RampState()
		state.name = name
		state.heightBottom = heightBottom
		state.heightTop = heightTop
		state.widthBottom = widthBottom
		state.widthTop = widthTop
		state.leftWallHeight = leftWallHeight
		state.rightWallHeight = rightWallHeight
		state.leftWallHeightVisible = leftWallHeightVisible
		state.rightWallHeightVisible = rightWallHeightVisible
		state.type = type
		state.material = material
		state.texture = texture
		state.textureAlignment = textureAlignment
		state.hasWallImage = hasWallImage
		state.depthBias = depthBias
		state.isVisible = isVisible
		return state
	}

	public clone(): RampState {
		return RampState.claim(
			this.name,
			this.heightBottom,
			this.heightTop,
			this.widthBottom,
			this.widthTop,
			this.leftWallHeight,
			this.rightWallHeight,
			this.leftWallHeightVisible,
			this.rightWallHeightVisible,
			this.type,
			this.material,
			this.texture,
			this.textureAlignment,
			this.hasWallImage,
			this.depthBias,
			this.isVisible,
		)
	}

	public diff(state: RampState): RampState {
		const diff = this.clone()
		omitEqual(diff, state, 'heightBottom')
		omitEqual(diff, state, 'heightTop')
		omitEqual(diff, state, 'widthBottom')
		omitEqual(diff, state, 'widthTop')
		omitEqual(diff, state, 'leftWallHeight')
		omitEqual(diff, state, 'rightWallHeight')
		omitEqual(diff, state, 'leftWallHeightVisible')
		omitEqual(diff, state, 'rightWallHeightVisible')
		omitEqual(diff, state, 'type')
		omitEqual(diff, state, 'material')
		omitEqual(diff, state, 'texture')
		omitEqual(diff, state, 'textureAlignment')
		omitEqual(diff, state, 'hasWallImage')
		omitEqual(diff, state, 'depthBias')
		omitEqual(diff, state, 'isVisible')
		return diff
	}

	public release(): void {}

	public equals(state: RampState): boolean {
		if (!state) return false
		return (
			state.heightBottom === this.heightBottom &&
			state.heightTop === this.heightTop &&
			state.widthBottom === this.widthBottom &&
			state.widthTop === this.widthTop &&
			state.leftWallHeight === this.leftWallHeight &&
			state.rightWallHeight === this.rightWallHeight &&
			state.leftWallHeightVisible === this.leftWallHeightVisible &&
			state.rightWallHeightVisible === this.rightWallHeightVisible &&
			state.type === this.type &&
			state.material === this.material &&
			state.texture === this.texture &&
			state.textureAlignment === this.textureAlignment &&
			state.hasWallImage === this.hasWallImage &&
			state.depthBias === this.depthBias &&
			state.isVisible === this.isVisible
		)
	}
}
