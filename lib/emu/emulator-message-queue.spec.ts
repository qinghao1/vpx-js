// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import type { IEmulator } from '../game/iemulator.js'
import type { Vertex2D } from '../math/vertex2d.js'
import { EmulatorMessageQueue, MessageType } from './emulator-message-queue.js'

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
	private messages: object[]
	constructor(cache: object[]) {
		this.messages = cache
	}
	public emuSimulateCycle(dTime: number): void {
		this.messages.push({ dTime })
	}
	public getDmdFrame(): Uint8Array {
		throw new Error('Method not implemented.')
	}
	public getDmdDimensions(): Vertex2D {
		throw new Error('Method not implemented.')
	}
	public setCabinetInput(keyNr: number): void {
		this.messages.push({ keyNr })
	}
	public setSwitchInput(switchNr: number, optionalEnableSwitch?: boolean): void {
		this.messages.push({ switchNr, optionalEnableSwitch })
	}
	public setDipSwitchByte(dipSwitch: number): void {
		this.messages.push({ dipSwitch })
	}
}
