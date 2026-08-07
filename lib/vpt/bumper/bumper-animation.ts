// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IAnimation } from '../../game/ianimatable.js'
import { PlayerPhysics } from '../../game/player-physics.js'
import { Vertex3D } from '../../util/math.js'
import type { Table } from '../table/table.js'
import type { BumperData } from './bumper-data.js'
import type { BumperState } from './bumper-state.js'

/** Bumper animation. @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperAnimation implements IAnimation {
	private timeMsec = 0
	private ringAnimate = false
	private ringDown = false
	private doSkirtAnimation = false
	private skirtCounter = 0

	public enableSkirtAnimation = true
	public hitEvent = false
	public ballHitPosition: Vertex3D = new Vertex3D()

	constructor(
		private readonly data: BumperData,
		private readonly state: BumperState,
	) {}

	public init(timeMsec: number): void {
		this.timeMsec = timeMsec
	}

	public updateAnimation(newTimeMsec: number, table: Table): void {
		const oldTimeMsec = this.timeMsec < newTimeMsec ? this.timeMsec : newTimeMsec
		this.timeMsec = newTimeMsec
		const diffTimeMsec = newTimeMsec - oldTimeMsec
		const state = this.hitEvent ? 1 : 0
		this.updateRingAnimation(state, diffTimeMsec, table)
		this.updateSkirtAnimation(state, diffTimeMsec)
	}

	private updateRingAnimation(state: number, diffTimeMsec: number, table: Table) {
		if (this.data.isRingVisible) {
			const limit = this.data.ringDropOffset + this.data.heightScale * 0.5 * table.getScaleZ()
			if (state === 1) {
				this.ringAnimate = true
				this.ringDown = true
				this.hitEvent = false
			}
			if (this.ringAnimate) {
				let step = this.data.ringSpeed * table.getScaleZ()
				if (this.ringDown) step = -step
				this.state.ringOffset += step * diffTimeMsec
				if (this.ringDown) {
					if (this.state.ringOffset <= -limit) {
						this.state.ringOffset = -limit
						this.ringDown = false
					}
				} else {
					if (this.state.ringOffset >= 0) {
						this.state.ringOffset = 0
						this.ringAnimate = false
					}
				}
			}
		}
	}

	private updateSkirtAnimation(state: number, diffTimeMsec: number) {
		if (this.data.isSkirtVisible) {
			if (this.enableSkirtAnimation) {
				if (state === 1) {
					this.doSkirtAnimation = true
					this.updateSkirtState()
					this.skirtCounter = 0
				}
				if (this.doSkirtAnimation) {
					this.skirtCounter += diffTimeMsec
					if (this.skirtCounter > 160) {
						this.doSkirtAnimation = false
						this.resetSkirtState()
					}
				}
			}
		} else {
			this.resetSkirtState()
		}
	}

	private resetSkirtState() {
		this.state.skirtRotX = 0
		this.state.skirtRotY = 0
	}

	private updateSkirtState(): void {
		const SKIRT_TILT = 5
		const hitX = this.ballHitPosition.x
		const hitY = this.ballHitPosition.y
		let dy = Math.abs(hitY - this.data.center.y)
		if (dy === 0) dy = 0.000001
		const dx = Math.abs(hitX - this.data.center.x)
		const skirtA = Math.tan(dx / dy)
		let rotX = Math.cos(skirtA) * SKIRT_TILT
		let rotY = Math.sin(skirtA) * SKIRT_TILT
		if (this.data.center.y < hitY) rotX = -rotX
		if (this.data.center.x > hitX) rotY = -rotY
		this.state.skirtRotX = rotX
		this.state.skirtRotY = rotY
	}
}
