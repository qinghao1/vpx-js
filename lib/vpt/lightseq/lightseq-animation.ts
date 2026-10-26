// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { IAnimation } from '../../game/interfaces.js'
import type { Player } from '../../game/player.js'
import { Enums } from '../enums.js'
import type { Flasher } from '../flasher/flasher.js'
import type { Light } from '../light/light.js'
import type { LightAnimation } from '../light/light-physics.js'
import type { Primitive } from '../primitive/primitive.js'
import type { Table } from '../table/table.js'

const GRID_SCALE = 20 // upstream LIGHTSEQGRIDSCALE
const QUEUE_SIZE = 100 // upstream LIGHTSEQQUEUESIZE
const EDITOR_WIDTH = 1000 // upstream EDITOR_BG_WIDTH
const EDITOR_HEIGHT = 2000 // upstream 2 * EDITOR_BG_WIDTH
const BACKGLASS_Y_SCALE = 2.666 // upstream backglass light Y scaling

const TRACER_NULL = 0 // upstream eSeqNull
const TRACER_BLINK = 1 // upstream eSeqBlink
const TRACER_RANDOM = 2 // upstream eSeqRandom
const TRACER_LINE = 3 // upstream eSeqLine
const TRACER_CIRCLE = 4 // upstream eSeqCircle
const TRACER_RADAR = 5 // upstream eSeqRadar

/** Live sequencer settings, satisfied by `LightSeqData`. */
export interface LightSeqSettings {
	collection?: string
	center: { x: number; y: number }
	updateInterval: number
}

/** Upstream `_tracer`. Field names expanded per repo convention (no one-letter vars). */
interface TracerState {
	type: number
	delay: number
	length: number
	frameCount: number
	posX: number
	stepX: number
	processStepX: number
	posY: number
	stepY: number
	processStepY: number
	radius: number
	stepRadius: number
	processRadiusNeg: boolean
	angle: number
	stepAngle: number
}

function nullTracer(): TracerState {
	return {
		type: TRACER_NULL,
		delay: 0,
		length: 0,
		frameCount: 0,
		posX: 0,
		stepX: 0,
		processStepX: 0,
		posY: 0,
		stepY: 0,
		processStepY: 0,
		radius: 0,
		stepRadius: 0,
		processRadiusNeg: false,
		angle: 0,
		stepAngle: 0,
	}
}

/** Upstream `LightSeqQueueData`. */
interface QueueEntry {
	animation: number
	tailLength: number
	repeat: number
	pause: number
	updateRate: number
}

function emptyQueueEntry(): QueueEntry {
	return { animation: 0, tailLength: 0, repeat: 0, pause: 0, updateRate: 0 }
}

/** One sequencer-driven collection member (light, flasher or primitive). */
interface SequencerElement {
	readonly posX: number
	readonly posY: number
	setSequencerState(turnOn: boolean): void
	isSequencerOn(): boolean
	unlockSequencer(): void
}

function lightElement(light: Light, player: Player): SequencerElement | null {
	const animation = light.getAnimation() as LightAnimation
	const api = light.getApi()
	if (!animation || !api) {
		return null
	}
	const posY = light.data.isBackglass ? api.Y * BACKGLASS_Y_SCALE : api.Y
	return {
		posX: api.X,
		posY,
		setSequencerState: (turnOn: boolean): void => {
			animation.lockedByLS = true
			animation.setState(
				turnOn ? Enums.LightStatus.LightStateOn : Enums.LightStatus.LightStateOff,
				player.getPhysics(),
			)
		},
		isSequencerOn: (): boolean => animation.realState !== Enums.LightStatus.LightStateOff,
		unlockSequencer: (): void => {
			const scriptState = api.State
			animation.lockedByLS = false
			api.State = scriptState
		},
	}
}

/**
 * Sequencer element for flashers and primitives.
 * @see LightSeq::SetElementToState in src/parts/lightseq.cpp
 *
 * The sequencer only writes `lockedByLS`/`inPlayState`; script `Visible` writes
 * keep flowing to data/`isVisible` (upstream `put_Visible` never touches the
 * lock), so unlocking needs no snapshot restore and mid-run script writes survive.
 */
function lockableElement(item: Flasher | Primitive, player: Player): SequencerElement | null {
	const api = item.getApi()
	const state = item.getState()
	if (!api || !state) {
		return null
	}
	const name = item.getName()
	return {
		posX: api.X,
		posY: api.Y,
		setSequencerState: (turnOn: boolean): void => {
			state.lockedByLS = true
			state.inPlayState = turnOn
			player.markDirty(name)
		},
		isSequencerOn: (): boolean => state.inPlayState,
		unlockSequencer: (): void => {
			state.lockedByLS = false
			player.markDirty(name)
		},
	}
}

/** Runtime light sequencer engine.
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/lightseq.cpp
 *
 * Faithful port of upstream play logic: parameter validation, tracer setup,
 * per-frame update, collection lock/unlock and `PlayDone`.
 */
export class LightSeqAnimation implements IAnimation {
	private timeNextUpdate = 0
	private gridCenterX = 0
	private gridCenterY = 0
	private gridCenterAdjustX = 0
	private gridCenterAdjustY = 0
	private gridWidth = 0
	private gridHeight = 0
	private headTracer1 = nullTracer()
	private headTracer2 = nullTracer()
	private tailTracer1 = nullTracer()
	private tailTracer2 = nullTracer()
	private grid: (SequencerElement | null)[] | null = null
	private orderedElements: (SequencerElement | null)[] = []
	private gridReady = false
	private readonly queue: QueueEntry[] = Array.from({ length: QUEUE_SIZE }, emptyQueueEntry)
	private queueHead = 0
	private queueTail = 0
	private playAnimation = 0
	private tailLength = 0
	private pauseValue = 0
	private replayCount = 0
	private updateRate = 0
	private playInProgress = false
	private pauseInProgress = false
	private statesChanged = false

	constructor(
		private readonly settings: LightSeqSettings,
		private readonly events: EventProxy,
		private readonly player: Player,
		private readonly table: Table,
	) {}

	public init(_timeMsec: number): void {
		this.stopPlay()
		this.ensureGrid()
	}

	public play(animation: number, tailLength: number, repeat: number, pause: number): void {
		this.ensureGrid()
		if (tailLength < 0) {
			tailLength = 0
		}
		if (repeat <= 0) {
			repeat = 1
		}
		if (pause < 0) {
			pause = 0
		}
		const seq = Enums.SequencerState
		if (animation === seq.SeqAllOn) {
			this.setAllLightsToState(true)
			return
		}
		if (animation === seq.SeqAllOff) {
			this.setAllLightsToState(false)
			return
		}
		let newHead = this.queueHead + 1
		if (newHead >= QUEUE_SIZE) {
			newHead = 0
		}
		if (newHead === this.queueTail) {
			throw new Error('LightSeq queue is full.')
		}
		this.queue[this.queueHead] = {
			animation,
			tailLength,
			repeat,
			pause,
			updateRate: this.currentUpdateRate(),
		}
		this.queueHead = newHead
	}

	public stopPlay(): void {
		this.playInProgress = false
		this.pauseInProgress = false
		this.headTracer1 = nullTracer()
		this.headTracer2 = nullTracer()
		this.tailTracer1 = nullTracer()
		this.tailTracer2 = nullTracer()
		this.queueHead = 0
		this.queueTail = 0
		for (const element of this.orderedElements) {
			element?.unlockSequencer()
		}
	}

	public setCenterX(value: number): void {
		const maxX = this.maxCenterX()
		if (value < 0 || value >= maxX) {
			throw new Error(`LightSeq center X out of range: ${value}`)
		}
		this.settings.center.x = value
		this.updateGridCenter()
	}

	public setCenterY(value: number): void {
		const maxY = this.maxCenterY()
		if (value < 0 || value >= maxY) {
			throw new Error(`LightSeq center Y out of range: ${value}`)
		}
		this.settings.center.y = value
		this.updateGridCenter()
	}

	private maxCenterX(): number {
		const data = this.table.data
		const width = data ? data.right - data.left : 0
		return width > 0 ? width : EDITOR_WIDTH
	}

	private maxCenterY(): number {
		const data = this.table.data
		const height = data ? data.bottom - data.top : 0
		return height > 0 ? height : EDITOR_HEIGHT
	}

	public updateAnimation(timeMsec: number, _table: Table): boolean {
		this.statesChanged = false
		this.ensureGrid()
		if (this.playInProgress) {
			while (timeMsec >= this.timeNextUpdate && this.playInProgress) {
				if (!this.pauseInProgress) {
					this.timeNextUpdate += this.updateRate
					const head1Done = this.processTracer(this.headTracer1, true, timeMsec)
					const head2Done = this.processTracer(this.headTracer2, true, timeMsec)
					const tail1Done = this.processTracer(this.tailTracer1, false, timeMsec)
					const tail2Done = this.processTracer(this.tailTracer2, false, timeMsec)
					if (head1Done && head2Done && tail1Done && tail2Done) {
						this.timeNextUpdate = timeMsec + Math.max(this.updateRate, this.pauseValue)
						this.pauseInProgress = true
					}
				} else {
					this.replayCount--
					if (this.replayCount !== 0) {
						this.setupTracers(
							timeMsec,
							this.playAnimation,
							this.tailLength,
							this.replayCount,
							this.pauseValue,
						)
					} else {
						this.queueTail++
						if (this.queueTail >= QUEUE_SIZE) {
							this.queueTail = 0
						}
						this.playInProgress = false
						if (this.queueHead === this.queueTail) {
							this.stopPlay()
							this.events.fireVoidEvent(Event.LightSeqEventsPlayDone)
						}
					}
				}
			}
		} else if (this.queueHead !== this.queueTail) {
			const entry = this.queue[this.queueTail]
			this.updateRate = entry.updateRate
			this.setupTracers(timeMsec, entry.animation, entry.tailLength, entry.repeat, entry.pause)
		}
		return this.statesChanged
	}

	private currentUpdateRate(): number {
		const rate = Math.trunc(this.settings.updateInterval)
		return rate >= 1 ? rate : 1
	}

	private ensureGrid(): void {
		if (this.gridReady) {
			return
		}
		this.gridReady = true
		const collection = this.table.collections[this.settings.collection ?? '']
		const dims = this.table.data
		if (!collection || !dims) {
			return
		}
		this.gridWidth = Math.trunc((dims.right - dims.left) / GRID_SCALE)
		this.gridHeight = Math.trunc((dims.bottom - dims.top) / GRID_SCALE)
		if (this.gridWidth <= 0 || this.gridHeight <= 0) {
			this.gridWidth = 0
			this.gridHeight = 0
			return
		}
		this.updateGridCenter()
		this.grid = new Array<SequencerElement | null>(this.gridWidth * this.gridHeight).fill(null)
		for (const itemName of collection.getItemNames()) {
			const element = this.resolveElement(itemName)
			this.orderedElements.push(element)
			if (!element) {
				continue
			}
			const cellX = Math.trunc(element.posX / GRID_SCALE)
			const cellY = Math.trunc(element.posY / GRID_SCALE)
			if (cellX >= 0 && cellX < this.gridWidth && cellY >= 0 && cellY < this.gridHeight) {
				this.grid[cellY * this.gridWidth + cellX] = element
			}
		}
	}

	private resolveElement(itemName: string): SequencerElement | null {
		const light = this.table.lights[itemName]
		if (light) {
			return lightElement(light, this.player)
		}
		const flasher = this.table.flashers[itemName]
		if (flasher) {
			return lockableElement(flasher, this.player)
		}
		const primitive = this.table.primitives[itemName]
		if (primitive) {
			return lockableElement(primitive, this.player)
		}
		return null
	}

	private updateGridCenter(): void {
		if (this.gridWidth <= 0 || this.gridHeight <= 0) {
			return
		}
		this.gridCenterX = Math.floor(this.settings.center.x / GRID_SCALE)
		this.gridCenterY = Math.floor(this.settings.center.y / GRID_SCALE)
		this.gridCenterAdjustX = Math.abs(Math.trunc(this.gridWidth / 2) - Math.trunc(this.gridCenterX))
		this.gridCenterAdjustY = Math.abs(Math.trunc(this.gridHeight / 2) - Math.trunc(this.gridCenterY))
	}

	private setupTracers(timeMsec: number, animation: number, tailLength: number, repeat: number, pause: number): void {
		const seq = Enums.SequencerState
		const gridWidth = this.gridWidth
		const gridHeight = this.gridHeight
		const gridCenterX = this.gridCenterX
		const gridCenterY = this.gridCenterY
		const gridAdjustX = this.gridCenterAdjustX
		const gridAdjustY = this.gridCenterAdjustY
		let inverse = false

		this.playInProgress = false
		this.pauseInProgress = false
		this.headTracer1 = nullTracer()
		this.headTracer2 = nullTracer()
		this.tailTracer1 = nullTracer()
		this.tailTracer2 = nullTracer()

		this.playAnimation = animation
		this.tailLength = tailLength
		this.replayCount = repeat
		this.pauseValue = pause

		const tracer1 = this.headTracer1
		const tracer2 = this.headTracer2

		if (animation === seq.SeqBlinking) {
			tracer1.type = TRACER_BLINK
			tracer1.length = tailLength
			tailLength = 0
			tracer1.frameCount = 2
		} else if (animation === seq.SeqRandom) {
			tracer1.type = TRACER_RANDOM
			tracer1.length = tailLength
			tracer1.frameCount = Math.trunc(pause / this.updateRate)
			tailLength = 0
			repeat = 1
			pause = 0
			this.tailLength = tailLength
			this.replayCount = repeat
			this.pauseValue = pause
		} else if (animation >= seq.SeqUpOn && animation <= seq.SeqScrewLeftOff) {
			// Upstream pairs every even `Off` effect with the following odd `On` effect
			// via `inverse = true` fallthrough; normalize to the shared `On` setup.
			inverse = animation % 2 === 0
			const base = inverse ? animation - 1 : animation
			switch (base) {
				case seq.SeqUpOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 0
					tracer1.processStepX = 1
					tracer1.posY = gridHeight - 1
					tracer1.stepY = -1
					tracer1.processStepY = 0
					tracer1.length = gridWidth
					tracer1.frameCount = gridHeight
					break
				case seq.SeqDownOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 0
					tracer1.processStepX = 1
					tracer1.posY = 0
					tracer1.stepY = 1
					tracer1.processStepY = 0
					tracer1.length = gridWidth
					tracer1.frameCount = gridHeight
					break
				case seq.SeqRightOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 1
					tracer1.processStepX = 0
					tracer1.posY = 0
					tracer1.stepY = 0
					tracer1.processStepY = 1
					tracer1.length = gridHeight
					tracer1.frameCount = gridWidth
					tailLength = Math.trunc(tailLength / 2)
					break
				case seq.SeqLeftOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = gridWidth - 1
					tracer1.stepX = -1
					tracer1.processStepX = 0
					tracer1.posY = 0
					tracer1.stepY = 0
					tracer1.processStepY = 1
					tracer1.length = gridHeight
					tracer1.frameCount = gridWidth
					tailLength = Math.trunc(tailLength / 2)
					break
				case seq.SeqDiagUpRightOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 0
					tracer1.processStepX = 0.5
					tracer1.posY = gridHeight - 1
					tracer1.stepY = -1
					tracer1.processStepY = 1
					tracer1.length = gridWidth * 2
					tracer1.frameCount = gridHeight + gridWidth * 2
					break
				case seq.SeqDiagUpLeftOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = gridWidth - 1
					tracer1.stepX = 0
					tracer1.processStepX = -0.5
					tracer1.posY = gridHeight - 1
					tracer1.stepY = -1
					tracer1.processStepY = 1
					tracer1.length = gridWidth * 2
					tracer1.frameCount = gridHeight + gridWidth * 2
					break
				case seq.SeqDiagDownRightOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 0
					tracer1.processStepX = 0.5
					tracer1.posY = 0
					tracer1.stepY = 1
					tracer1.processStepY = -1
					tracer1.length = gridWidth * 2
					tracer1.frameCount = gridHeight + gridWidth * 2
					break
				case seq.SeqDiagDownLeftOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = gridWidth - 1
					tracer1.stepX = 0
					tracer1.processStepX = -0.5
					tracer1.posY = 0
					tracer1.stepY = 1
					tracer1.processStepY = -1
					tracer1.length = gridWidth * 2
					tracer1.frameCount = gridHeight + gridWidth * 2
					break
				case seq.SeqMiddleOutHorizOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = gridCenterX - 1
					tracer1.stepX = -1
					tracer1.processStepX = 0
					tracer1.posY = 0
					tracer1.stepY = 0
					tracer1.processStepY = 1
					tracer1.length = gridHeight
					tracer1.frameCount = Math.trunc(gridWidth / 2) + gridAdjustX
					tracer2.type = TRACER_LINE
					tracer2.posX = gridCenterX
					tracer2.stepX = 1
					tracer2.processStepX = 0
					tracer2.posY = 0
					tracer2.stepY = 0
					tracer2.processStepY = 1
					tracer2.length = gridHeight
					tracer2.frameCount = Math.trunc(gridWidth / 2) + gridAdjustX
					tailLength = Math.trunc(tailLength / 4)
					break
				case seq.SeqMiddleInHorizOn: {
					const effectLength = Math.trunc(gridWidth / 2) + gridAdjustX
					tracer1.type = TRACER_LINE
					tracer1.posX = gridCenterX - effectLength
					tracer1.stepX = 1
					tracer1.processStepX = 0
					tracer1.posY = 0
					tracer1.stepY = 0
					tracer1.processStepY = 1
					tracer1.length = gridHeight
					tracer1.frameCount = effectLength + 1
					tracer2.type = TRACER_LINE
					tracer2.posX = gridCenterX + effectLength
					tracer2.stepX = -1
					tracer2.processStepX = 0
					tracer2.posY = 0
					tracer2.stepY = 0
					tracer2.processStepY = 1
					tracer2.length = gridHeight
					tracer2.frameCount = effectLength
					tailLength = Math.trunc(tailLength / 4)
					break
				}
				case seq.SeqMiddleOutVertOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 0
					tracer1.processStepX = 1
					tracer1.posY = gridCenterY - 1
					tracer1.stepY = -1
					tracer1.processStepY = 0
					tracer1.length = gridWidth
					tracer1.frameCount = Math.trunc(gridHeight / 2) + gridAdjustY
					tracer2.type = TRACER_LINE
					tracer2.posX = 0
					tracer2.stepX = 0
					tracer2.processStepX = 1
					tracer2.posY = gridCenterY
					tracer2.stepY = 1
					tracer2.processStepY = 0
					tracer2.length = gridWidth
					tracer2.frameCount = Math.trunc(gridHeight / 2) + gridAdjustY
					tailLength = Math.trunc(tailLength / 2)
					break
				case seq.SeqMiddleInVertOn: {
					const effectLength = Math.trunc(gridHeight / 2) + gridAdjustY
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 0
					tracer1.processStepX = 1
					tracer1.posY = gridCenterY - effectLength
					tracer1.stepY = 1
					tracer1.processStepY = 0
					tracer1.length = gridWidth
					tracer1.frameCount = effectLength + 1
					tracer2.type = TRACER_LINE
					tracer2.posX = 0
					tracer2.stepX = 0
					tracer2.processStepX = 1
					tracer2.posY = gridCenterY + effectLength
					tracer2.stepY = -1
					tracer2.processStepY = 0
					tracer2.length = gridWidth
					tracer2.frameCount = effectLength
					tailLength = Math.trunc(tailLength / 2)
					break
				}
				case seq.SeqStripe1HorizOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 1
					tracer1.processStepX = 0
					tracer1.posY = gridCenterY - 1
					tracer1.stepY = 0
					tracer1.processStepY = -1
					tracer1.length = Math.trunc(gridHeight / 2) + gridAdjustY
					tracer1.frameCount = gridWidth
					tracer2.type = TRACER_LINE
					tracer2.posX = gridWidth - 1
					tracer2.stepX = -1
					tracer2.processStepX = 0
					tracer2.posY = gridCenterY
					tracer2.stepY = 0
					tracer2.processStepY = 1
					// Upstream uses the X adjust here (asymmetric with tracer1); kept as-is.
					tracer2.length = Math.trunc(gridHeight / 2) + gridAdjustX
					tracer2.frameCount = gridWidth
					tailLength = Math.trunc(tailLength / 2)
					break
				case seq.SeqStripe2HorizOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = gridWidth - 1
					tracer1.stepX = -1
					tracer1.processStepX = 0
					tracer1.posY = gridCenterY - 1
					tracer1.stepY = 0
					tracer1.processStepY = -1
					tracer1.length = Math.trunc(gridHeight / 2) + gridAdjustY
					tracer1.frameCount = gridWidth
					tracer2.type = TRACER_LINE
					tracer2.posX = 0
					tracer2.stepX = 1
					tracer2.processStepX = 0
					tracer2.posY = gridCenterY
					tracer2.stepY = 0
					tracer2.processStepY = 1
					// Upstream uses the X adjust here (asymmetric with tracer1); kept as-is.
					tracer2.length = Math.trunc(gridHeight / 2) + gridAdjustX
					tracer2.frameCount = gridWidth
					tailLength = Math.trunc(tailLength / 2)
					break
				case seq.SeqStripe1VertOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = gridCenterX - 1
					tracer1.stepX = 0
					tracer1.processStepX = -1
					tracer1.posY = gridHeight - 1
					tracer1.stepY = -1
					tracer1.processStepY = 0
					tracer1.length = Math.trunc(gridWidth / 2) + gridAdjustX
					tracer1.frameCount = gridHeight
					tracer2.type = TRACER_LINE
					tracer2.posX = gridCenterX
					tracer2.stepX = 0
					tracer2.processStepX = 1
					tracer2.posY = 0
					tracer2.stepY = 1
					tracer2.processStepY = 0
					tracer2.length = Math.trunc(gridWidth / 2) + gridAdjustX
					tracer2.frameCount = gridHeight
					break
				case seq.SeqStripe2VertOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = gridCenterX - 1
					tracer1.stepX = 0
					tracer1.processStepX = -1
					tracer1.posY = 0
					tracer1.stepY = 1
					tracer1.processStepY = 0
					tracer1.length = Math.trunc(gridWidth / 2) + gridAdjustX
					tracer1.frameCount = gridHeight
					tracer2.type = TRACER_LINE
					tracer2.posX = gridCenterX
					tracer2.stepX = 0
					tracer2.processStepX = 1
					tracer2.posY = gridHeight - 1
					tracer2.stepY = -1
					tracer2.processStepY = 0
					tracer2.length = Math.trunc(gridWidth / 2) + gridAdjustX
					tracer2.frameCount = gridHeight
					break
				case seq.SeqHatch1HorizOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 1
					tracer1.processStepX = 0
					tracer1.posY = 0
					tracer1.stepY = 0
					tracer1.processStepY = 2
					tracer1.length = Math.trunc(gridHeight / 2)
					tracer1.frameCount = gridWidth
					tracer2.type = TRACER_LINE
					tracer2.posX = gridWidth - 1
					tracer2.stepX = -1
					tracer2.processStepX = 0
					tracer2.posY = 1
					tracer2.stepY = 0
					tracer2.processStepY = 2
					tracer2.length = Math.trunc(gridHeight / 2)
					tracer2.frameCount = gridWidth
					tailLength = Math.trunc(tailLength / 2)
					break
				case seq.SeqHatch2HorizOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = gridWidth - 1
					tracer1.stepX = -1
					tracer1.processStepX = 0
					tracer1.posY = 0
					tracer1.stepY = 0
					tracer1.processStepY = 2
					tracer1.length = Math.trunc(gridHeight / 2)
					tracer1.frameCount = gridWidth
					tracer2.type = TRACER_LINE
					tracer2.posX = 0
					tracer2.stepX = 1
					tracer2.processStepX = 0
					tracer2.posY = 1
					tracer2.stepY = 0
					tracer2.processStepY = 2
					tracer2.length = Math.trunc(gridHeight / 2)
					tracer2.frameCount = gridWidth
					tailLength = Math.trunc(tailLength / 2)
					break
				case seq.SeqHatch1VertOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 0
					tracer1.processStepX = 2
					tracer1.posY = gridHeight - 1
					tracer1.stepY = -1
					tracer1.processStepY = 0
					tracer1.length = Math.trunc(gridWidth / 2)
					tracer1.frameCount = gridHeight
					tracer2.type = TRACER_LINE
					tracer2.posX = 1
					tracer2.stepX = 0
					tracer2.processStepX = 2
					tracer2.posY = 0
					tracer2.stepY = 1
					tracer2.processStepY = 0
					tracer2.length = Math.trunc(gridWidth / 2)
					tracer2.frameCount = gridHeight
					break
				case seq.SeqHatch2VertOn:
					tracer1.type = TRACER_LINE
					tracer1.posX = 0
					tracer1.stepX = 0
					tracer1.processStepX = 2
					tracer1.posY = 0
					tracer1.stepY = 1
					tracer1.processStepY = 0
					tracer1.length = Math.trunc(gridWidth / 2)
					tracer1.frameCount = gridHeight
					tracer2.type = TRACER_LINE
					tracer2.posX = 1
					tracer2.stepX = 0
					tracer2.processStepX = 2
					tracer2.posY = gridHeight - 1
					tracer2.stepY = -1
					tracer2.processStepY = 0
					tracer2.length = Math.trunc(gridWidth / 2)
					tracer2.frameCount = gridHeight
					break
				case seq.SeqCircleOutOn:
					tracer1.type = TRACER_CIRCLE
					tracer1.radius = 0
					tracer1.stepRadius = 1
					tracer1.posX = gridCenterX
					tracer1.posY = gridCenterY
					tracer1.frameCount =
						Math.trunc(gridWidth / 2) + gridAdjustX + Math.trunc(gridHeight / 2) + gridAdjustY
					break
				case seq.SeqCircleInOn:
					tracer1.type = TRACER_CIRCLE
					tracer1.radius = Math.trunc(gridWidth / 2) + gridAdjustX + Math.trunc(gridHeight / 2) + gridAdjustY
					tracer1.stepRadius = -1
					tracer1.posX = gridCenterX
					tracer1.posY = gridCenterY
					tracer1.frameCount =
						Math.trunc(gridWidth / 2) + gridAdjustX + Math.trunc(gridHeight / 2) + gridAdjustY
					break
				case seq.SeqClockRightOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 0
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = false
					tracer1.posX = gridCenterX
					tracer1.posY = gridCenterY
					tracer1.length = Math.trunc(gridWidth / 2) + gridAdjustX + Math.trunc(gridHeight / 2) + gridAdjustY
					tracer1.frameCount = 360
					break
				case seq.SeqClockLeftOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 0
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = false
					tracer1.posX = gridCenterX
					tracer1.posY = gridCenterY
					tracer1.length = Math.trunc(gridWidth / 2) + gridAdjustX + Math.trunc(gridHeight / 2) + gridAdjustY
					tracer1.frameCount = 360
					break
				case seq.SeqRadarRightOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 270
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = false
					tracer1.posX = gridCenterX
					tracer1.posY = gridHeight - 1
					tracer1.length = gridHeight + gridWidth + gridAdjustY + gridAdjustX
					tracer1.frameCount = 180
					break
				case seq.SeqRadarLeftOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 90
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = false
					tracer1.posX = gridCenterX
					tracer1.posY = gridHeight - 1
					tracer1.length = gridHeight + gridWidth + gridAdjustY + gridAdjustX
					tracer1.frameCount = 180
					break
				case seq.SeqWiperRightOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 270
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = false
					tracer1.posX = gridCenterX
					tracer1.posY = 0
					tracer1.length = gridHeight + gridWidth + gridAdjustY + gridAdjustX
					tracer1.frameCount = 180
					break
				case seq.SeqWiperLeftOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 90
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = false
					tracer1.posX = gridCenterX
					tracer1.posY = 0
					tracer1.length = gridHeight + gridWidth + gridAdjustY + gridAdjustX
					tracer1.frameCount = 180
					break
				case seq.SeqFanLeftUpOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 180
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = false
					tracer1.posX = 0
					tracer1.posY = gridCenterY
					tracer1.length = gridHeight + gridWidth + gridAdjustY + gridAdjustX
					tracer1.frameCount = 180
					break
				case seq.SeqFanLeftDownOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 0
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = false
					tracer1.posX = 0
					tracer1.posY = gridCenterY
					tracer1.length = gridHeight + gridWidth + gridAdjustY + gridAdjustX
					tracer1.frameCount = 180
					break
				case seq.SeqFanRightUpOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 180
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = true
					tracer1.posX = gridWidth - 1
					tracer1.posY = gridCenterY
					tracer1.length = gridHeight + gridWidth + gridAdjustY + gridAdjustX
					tracer1.frameCount = 180
					break
				case seq.SeqFanRightDownOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 0
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = true
					tracer1.posX = gridWidth - 1
					tracer1.posY = gridCenterY
					tracer1.length = gridHeight + gridWidth + gridAdjustY + gridAdjustX
					tracer1.frameCount = 180
					break
				case seq.SeqArcBottomLeftUpOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 90
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = false
					tracer1.posX = 0
					tracer1.posY = gridHeight - 1
					tracer1.length = gridHeight + gridWidth
					tracer1.frameCount = 90
					break
				case seq.SeqArcBottomLeftDownOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 0
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = false
					tracer1.posX = 0
					tracer1.posY = gridHeight - 1
					tracer1.length = gridHeight + gridWidth
					tracer1.frameCount = 90
					break
				case seq.SeqArcBottomRightUpOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 90
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = true
					tracer1.posX = gridWidth - 1
					tracer1.posY = gridHeight - 1
					tracer1.length = gridHeight + gridWidth
					tracer1.frameCount = 90
					break
				case seq.SeqArcBottomRightDownOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 180
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = true
					tracer1.posX = gridWidth - 1
					tracer1.posY = gridHeight - 1
					tracer1.length = gridHeight + gridWidth
					tracer1.frameCount = 90
					break
				case seq.SeqArcTopLeftUpOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 180
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = false
					tracer1.posX = 0
					tracer1.posY = 0
					tracer1.length = gridHeight + gridWidth
					tracer1.frameCount = 90
					break
				case seq.SeqArcTopLeftDownOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 90
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = false
					tracer1.posX = 0
					tracer1.posY = 0
					tracer1.length = gridHeight + gridWidth
					tracer1.frameCount = 90
					break
				case seq.SeqArcTopRightUpOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 0
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = true
					tracer1.posX = gridWidth - 1
					tracer1.posY = 0
					tracer1.length = gridHeight + gridWidth
					tracer1.frameCount = 90
					break
				case seq.SeqArcTopRightDownOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 90
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = true
					tracer1.posX = gridWidth - 1
					tracer1.posY = 0
					tracer1.length = gridHeight + gridWidth
					tracer1.frameCount = 90
					break
				case seq.SeqScrewRightOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 0
					tracer1.stepAngle = 1
					tracer1.processRadiusNeg = false
					tracer1.posX = gridCenterX
					tracer1.posY = gridCenterY - 1
					tracer1.length = Math.trunc(gridHeight / 2) + gridAdjustY + Math.trunc(gridWidth / 2) + gridAdjustX
					tracer1.frameCount = 180
					tracer2.type = TRACER_RADAR
					tracer2.angle = 179
					tracer2.stepAngle = 1
					tracer2.processRadiusNeg = false
					tracer2.posX = gridCenterX
					tracer2.posY = gridCenterY
					tracer2.length = Math.trunc(gridHeight / 2) + gridAdjustY + Math.trunc(gridWidth / 2) + gridAdjustX
					tracer2.frameCount = 180
					break
				case seq.SeqScrewLeftOn:
					tracer1.type = TRACER_RADAR
					tracer1.angle = 0
					tracer1.stepAngle = -1
					tracer1.processRadiusNeg = false
					tracer1.posX = gridCenterX
					tracer1.posY = gridCenterY - 1
					tracer1.length = Math.trunc(gridHeight / 2) + gridAdjustY + Math.trunc(gridWidth / 2) + gridAdjustX
					tracer1.frameCount = 180
					tracer2.type = TRACER_RADAR
					tracer2.angle = 179
					tracer2.stepAngle = -1
					tracer2.processRadiusNeg = false
					tracer2.posX = gridCenterX
					tracer2.posY = gridCenterY
					tracer2.length = Math.trunc(gridHeight / 2) + gridAdjustY + Math.trunc(gridWidth / 2) + gridAdjustX
					tracer2.frameCount = 180
					break
			}
		} else {
			// Unknown animation: the null tracers expire at once and the queue advances.
			// (Upstream also writes length/frameCount here, but the tracer stays Null
			// so those writes have no effect.)
			tailLength = 0
			repeat = 1
			pause = 0
		}

		this.headTracer1.delay = 0
		this.headTracer2.delay = 0
		this.tailTracer1.delay = 0
		this.tailTracer2.delay = 0

		if (tailLength !== 0) {
			this.tailTracer1 = { ...this.headTracer1, delay: tailLength }
			this.tailTracer2 = { ...this.headTracer2, delay: tailLength }
		}

		if (inverse) {
			const swap1 = this.tailTracer1
			this.tailTracer1 = this.headTracer1
			this.headTracer1 = swap1
			const swap2 = this.tailTracer2
			this.tailTracer2 = this.headTracer2
			this.headTracer2 = swap2
		}

		this.timeNextUpdate = timeMsec + this.updateRate
		this.playInProgress = true
	}

	private processTracer(tracer: TracerState, turnOn: boolean, timeMsec: number): boolean {
		if (tracer.type === TRACER_NULL || this.grid === null) {
			return true
		}
		if (tracer.delay !== 0) {
			tracer.delay -= 1
			return false
		}
		if (tracer.type === TRACER_BLINK) {
			const frame = tracer.frameCount
			tracer.frameCount = frame - 1
			if (frame === 2) {
				this.setAllLightsToState(tracer.length <= 0)
				this.timeNextUpdate = timeMsec + this.pauseValue
			} else if (frame === 1) {
				this.setAllLightsToState(tracer.length > 0)
				this.timeNextUpdate = timeMsec + this.pauseValue
			} else if (frame === 0) {
				return true
			}
			return false
		}
		if (tracer.type === TRACER_RANDOM) {
			const size = this.orderedElements.length
			for (let pick = 0; pick < tracer.length; pick++) {
				const element = this.orderedElements[Math.trunc(size * Math.random())]
				if (element) {
					element.setSequencerState(!element.isSequencerOn())
					this.statesChanged = true
				}
			}
			tracer.frameCount -= 1
			if (tracer.frameCount === 0) {
				tracer.type = TRACER_NULL
				return true
			}
			return false
		}
		if (tracer.type === TRACER_LINE) {
			let cellX = tracer.posX
			let cellY = tracer.posY
			for (let step = 0; step < tracer.length; step++) {
				this.verifyAndSetGridElement(Math.trunc(cellX), Math.trunc(cellY), turnOn)
				cellX += tracer.processStepX
				cellY += tracer.processStepY
			}
			tracer.frameCount -= 1
			if (tracer.frameCount === 0) {
				tracer.type = TRACER_NULL
				return true
			}
			tracer.posX += tracer.stepX
			tracer.posY += tracer.stepY
			return false
		}
		if (tracer.type === TRACER_CIRCLE) {
			for (let halfDegree = 0; halfDegree < 720; halfDegree++) {
				const angle = ((Math.PI * 2.0) / 360.0) * (halfDegree / 2.0)
				const cellX = tracer.posX + Math.sin(angle) * tracer.radius
				const cellY = tracer.posY - Math.cos(angle) * tracer.radius
				this.verifyAndSetGridElement(Math.trunc(cellX), Math.trunc(cellY), turnOn)
			}
			tracer.frameCount -= 1
			if (tracer.frameCount === 0) {
				tracer.type = TRACER_NULL
				return true
			}
			tracer.radius += tracer.stepRadius
			return false
		}
		if (tracer.type === TRACER_RADAR) {
			const toRadians = (degrees: number): number => (degrees * Math.PI * 2.0) / 360.0
			const raySin = Math.sin(toRadians(tracer.angle))
			const rayCos = Math.cos(toRadians(tracer.angle))
			const ray2Sin = Math.sin(toRadians(tracer.angle + tracer.stepAngle * 0.25))
			const ray2Cos = Math.cos(toRadians(tracer.angle + tracer.stepAngle * 0.25))
			const ray3Sin = Math.sin(toRadians(tracer.angle + tracer.stepAngle * 0.5))
			const ray3Cos = Math.cos(toRadians(tracer.angle + tracer.stepAngle * 0.5))
			const ray4Sin = Math.sin(toRadians(tracer.angle + tracer.stepAngle * 0.75))
			const ray4Cos = Math.cos(toRadians(tracer.angle + tracer.stepAngle * 0.75))
			for (let radius = 0; radius < tracer.length; radius++) {
				// Upstream reads the first head tracer's flag here even for the second
				// tracer, but every constructed radar pair shares the flag value, so the
				// tracer's own flag is equivalent.
				const reach = tracer.processRadiusNeg ? -radius : radius
				this.verifyAndSetGridElement(
					Math.trunc(tracer.posX + raySin * reach),
					Math.trunc(tracer.posY - rayCos * reach),
					turnOn,
				)
				this.verifyAndSetGridElement(
					Math.trunc(tracer.posX + ray2Sin * reach),
					Math.trunc(tracer.posY - ray2Cos * reach),
					turnOn,
				)
				this.verifyAndSetGridElement(
					Math.trunc(tracer.posX + ray3Sin * reach),
					Math.trunc(tracer.posY - ray3Cos * reach),
					turnOn,
				)
				this.verifyAndSetGridElement(
					Math.trunc(tracer.posX + ray4Sin * reach),
					Math.trunc(tracer.posY - ray4Cos * reach),
					turnOn,
				)
			}
			tracer.frameCount -= 1
			if (tracer.frameCount === 0) {
				tracer.type = TRACER_NULL
				return true
			}
			tracer.angle += tracer.stepAngle
			if (tracer.angle >= 360) {
				tracer.angle -= 360
			}
			if (tracer.angle < 0) {
				tracer.angle += 360
			}
			return false
		}
		return true
	}

	private setAllLightsToState(turnOn: boolean): void {
		if (this.grid === null) {
			return
		}
		for (const element of this.orderedElements) {
			if (element) {
				element.setSequencerState(turnOn)
				this.statesChanged = true
			}
		}
	}

	private verifyAndSetGridElement(cellX: number, cellY: number, turnOn: boolean): boolean {
		if (cellX < 0 || cellX >= this.gridWidth || cellY < 0 || cellY >= this.gridHeight) {
			return false
		}
		const element = this.grid?.[cellY * this.gridWidth + cellX]
		if (element) {
			element.setSequencerState(turnOn)
			this.statesChanged = true
		}
		return true
	}
}
