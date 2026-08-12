// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IAnimation } from '../../game/ianimatable.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'
import type { PrimitiveState } from './primitive-state.js'

/** Primitive animation — frame morph. @see https://github.com/vpinball/vpinball/blob/master/primitive.cpp#L1287 */
export class PrimitiveAnimation implements IAnimation {
	private currentFrame = -1
	private speed = 0
	private doAnimation = false
	private endless = false
	private timeMsec = 0

	constructor(
		private readonly data: PrimitiveData,
		private readonly state: PrimitiveState,
		private readonly mesh: Mesh,
	) {}

	public init(timeMsec: number): void {
		this.timeMsec = timeMsec
	}

	public updateAnimation(newTimeMsec: number, _table: Table): void {
		if (this.currentFrame === -1 || !this.doAnimation) {
			this.timeMsec = newTimeMsec
			return
		}
		if (this.mesh.animationFrames.length === 0 || this.data.staticRendering) {
			this.timeMsec = newTimeMsec
			return
		}
		const diff = Math.max(0, newTimeMsec - this.timeMsec)
		this.timeMsec = newTimeMsec
		if (diff === 0) return
		const prev = this.currentFrame
		this.currentFrame += this.speed * (diff * (60 / 1000))
		const maxFrame = this.mesh.animationFrames.length - 1
		if (this.currentFrame > maxFrame) {
			if (this.endless) {
				this.currentFrame = Math.min(this.currentFrame - maxFrame, maxFrame)
			} else {
				this.currentFrame = maxFrame
				this.doAnimation = false
			}
		}
		if (this.currentFrame !== prev) this.state.currentFrame = this.currentFrame
	}

	public playAnim(startFrame: number, speed: number): void {
		if (this.mesh.animationFrames.length === 0 || this.data.staticRendering) return
		if (startFrame >= this.mesh.animationFrames.length) startFrame = 0
		if (speed < 0) speed = -speed
		if (this.currentFrame !== startFrame || this.speed !== speed || !this.doAnimation || this.endless) {
			// will trigger regenerate in updater via state diff
		}
		this.currentFrame = startFrame
		this.speed = speed
		this.doAnimation = true
		this.endless = false
		this.state.currentFrame = this.currentFrame
	}

	public playAnimEndless(speed: number): void {
		if (this.mesh.animationFrames.length === 0 || this.data.staticRendering) return
		if (speed < 0) speed = -speed
		this.currentFrame = 0
		this.speed = speed
		this.doAnimation = true
		this.endless = true
		this.state.currentFrame = this.currentFrame
	}

	public stopAnim(): void {
		this.doAnimation = false
	}

	public continueAnim(speed: number): void {
		if (this.currentFrame <= 0 || this.data.staticRendering) return
		if (speed < 0) speed = -speed
		this.speed = speed
		this.doAnimation = true
	}

	public showFrame(frame: number): void {
		if (this.mesh.animationFrames.length === 0 || frame < 0 || this.data.staticRendering) return
		if (frame >= this.mesh.animationFrames.length) frame = this.mesh.animationFrames.length - 1
		this.currentFrame = frame
		this.doAnimation = false
		this.state.currentFrame = this.currentFrame
	}

	public getCurrentFrame(): number {
		return this.currentFrame
	}
}
