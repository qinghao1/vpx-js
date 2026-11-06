// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'

export class FlasherState extends ItemState {
	public color = 0
	public alpha = 100
	/** Script-driven overlay image name; rebound by the updater per `Flasher::Render`. */
	public imageA = ''
	public rotX = 0
	public rotY = 0
	public rotZ = 0
	public height = 50
	/** Sequencer lock. @see Flasher::m_lockedByLS in src/parts/flasher.h */
	public lockedByLS = false
	/**
	 * Engine-driven overrides (`FlasherData::m_intensity_scale/m_modulate_vs_add/
	 * m_addBlend/m_addBlendMode`). Absent keeps the authored data; the updater
	 * prefers these when set so the WASM bridge can drive them per frame.
	 */
	public intensityScale?: number = undefined
	public modulateVsAdd?: number = undefined
	public addBlend?: boolean = undefined
	public addBlendMode?: number = undefined
	/** Sequencer-driven on/off; script Visible keeps flowing to isVisible. @see Flasher::m_inPlayState in src/parts/flasher.h */
	public inPlayState = true

	public static claim(
		name: string,
		isVisible: boolean,
		color: number,
		alpha: number,
		rotX = 0,
		rotY = 0,
		rotZ = 0,
		height = 50,
		imageA = '',
	): FlasherState {
		const state = new FlasherState()
		state.name = name
		state.isVisible = isVisible
		state.color = color
		state.alpha = alpha
		state.rotX = rotX
		state.rotY = rotY
		state.rotZ = rotZ
		state.height = height
		state.imageA = imageA
		state.inPlayState = isVisible
		return state
	}
}
