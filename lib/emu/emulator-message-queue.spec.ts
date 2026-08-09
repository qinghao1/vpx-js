// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import type { IEmulator } from '../game/iemulator.js'
import type { Vertex2D } from '../util/vector.js'
import { EmulatorMessageQueue, MessageType } from './emulator-message-queue.js'
import { EmulatorState } from './emulator-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The WPC-EMU message queue', () => {
	let messageQueue: EmulatorMessageQueue
	let mockEmulator: IEmulator
	let queue: object[]

	beforeEach(() => {
		messageQueue = new EmulatorMessageQueue()
		queue = []
		mockEmulator = new MockEmulator(queue)
	})

	it('should add switch toggle to queue and replay it', () => {
		const addedToQueue = messageQueue.addMessage(MessageType.ToggleSwitchInput, 42)
		messageQueue.replayMessages(mockEmulator)
		expect(addedToQueue).to.equal(true)
		expect(queue).to.deep.equal([
			{
				optionalEnableSwitch: undefined,
				switchNr: 42,
			},
		])
	})

	it('should add switch set to queue and apply it', () => {
		messageQueue.addMessage(MessageType.SetSwitchInput, 42)
		messageQueue.replayMessages(mockEmulator)
		expect(queue).to.deep.equal([
			{
				optionalEnableSwitch: true,
				switchNr: 42,
			},
		])
	})

	it('should add switch clear to queue and replay it', () => {
		messageQueue.addMessage(MessageType.ClearSwitchInput, 42)
		messageQueue.replayMessages(mockEmulator)
		expect(queue).to.deep.equal([
			{
				optionalEnableSwitch: false,
				switchNr: 42,
			},
		])
	})

	it('should add cabinet input to queue and replay it', () => {
		messageQueue.addMessage(MessageType.CabinetInput, 4)
		messageQueue.replayMessages(mockEmulator)
		expect(queue).to.deep.equal([
			{
				keyNr: 4,
			},
		])
	})

	it('should add execute ticks to queue and replay it', () => {
		messageQueue.addMessage(MessageType.ExecuteTicks, 4)
		messageQueue.replayMessages(mockEmulator)
		expect(queue).to.deep.equal([
			{
				dTime: 4,
			},
		])
	})

	it('should should warn when add entries to queue if already consumed', () => {
		messageQueue.replayMessages(mockEmulator)
		const addedToQueue = messageQueue.addMessage(MessageType.SetSwitchInput, 42)
		expect(addedToQueue).to.equal(false)
	})

	it('should add dipswitch to queue and replay it', () => {
		const addedToQueue = messageQueue.addMessage(MessageType.SetDipByte, 21)
		messageQueue.replayMessages(mockEmulator)
		expect(addedToQueue).to.equal(true)
		expect(queue).to.deep.equal([
			{
				dipSwitch: 21,
			},
		])
	})
})

class MockEmulator implements IEmulator {
	readonly emulatorState = new EmulatorState()
	constructor(private readonly messages: object[]) {}
	isInitialized(): boolean {
		return true
	}
	getVersion(): string {
		return 'mock'
	}
	setPaused(): void {}
	getPaused(): boolean {
		return false
	}
	registerAudioConsumer(): void {}
	emuSimulateCycle(dTime: number): number {
		this.messages.push({ dTime })
		return 0
	}
	getDmdFrame(): Uint8Array {
		return new Uint8Array()
	}
	getDmdDimensions(): Vertex2D {
		return { x: 128, y: 32 } as Vertex2D
	}
	setCabinetInput(keyNr: number): void {
		this.messages.push({ keyNr })
	}
	setSwitchInput(switchNr: number, optionalEnableSwitch?: boolean): boolean {
		this.messages.push({ switchNr, optionalEnableSwitch })
		return true
	}
	getSwitchInput(): number {
		return 0
	}
	getLampState(): number {
		return 0
	}
	getSolenoidState(): number {
		return 0
	}
	getGIState(): number {
		return 0
	}
	setFliptronicsInput(): void {}
	getDipSwitchByte(): number {
		return 0
	}
	setDipSwitchByte(dipSwitch: number): void {
		this.messages.push({ dipSwitch })
	}
}
