import { ItemState } from '../item-state.js'

export class FlasherState extends ItemState {
	public color = 0
	public alpha = 100
	public rotX = 0
	public rotY = 0
	public rotZ = 0
	public height = 50

	public static claim(
		name: string,
		isVisible: boolean,
		color: number,
		alpha: number,
		rotX = 0,
		rotY = 0,
		rotZ = 0,
		height = 50,
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
		return state
	}

	public clone(): FlasherState {
		return FlasherState.claim(
			this.name,
			this.isVisible,
			this.color,
			this.alpha,
			this.rotX,
			this.rotY,
			this.rotZ,
			this.height,
		)
	}
}
