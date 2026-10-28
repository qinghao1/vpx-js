import { describe, expect, it } from 'vitest'
import { ThreeHelper } from '../../../test/three.helper'
import type { IEmulator } from '../../game/iemulator.js'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { LightData } from './light.js'
import type { LightAnimation } from './light-physics.js'

const three = new ThreeHelper()

interface ControllerOutputs {
	lamps: Record<number, number>
	solenoids: Record<number, number>
	gi: Record<number, number>
}

function stubEmulator(outputs: ControllerOutputs): IEmulator {
	return {
		emuSimulateCycle: () => 0,
		setSwitchInput: () => true,
		getLampState: (n: number) => outputs.lamps[n] ?? 0,
		getSolenoidState: (n: number) => outputs.solenoids[n] ?? 0,
		getGIState: (n: number) => outputs.gi[n] ?? 0,
	} as unknown as IEmulator
}

function stringRecord(tag: string, value: string): Uint8Array {
	const text = new TextEncoder().encode(value)
	const payload = new Uint8Array(4 + text.length)
	new DataView(payload.buffer).setInt32(0, text.length, true)
	payload.set(text, 4)
	const record = new Uint8Array(8 + payload.length)
	new DataView(record.buffer).setInt32(0, payload.length + 4, true)
	record.set(new TextEncoder().encode(tag), 4)
	record.set(payload, 8)
	return record
}

function endRecord(): Uint8Array {
	const record = new Uint8Array(8)
	new DataView(record.buffer).setInt32(0, 4, true)
	record.set(new TextEncoder().encode('ENDB'), 4)
	return record
}

function storageFromRecords(records: Uint8Array[]): Storage {
	return {
		streamFiltered: async (_name: string, _offset: number, next: (r: ReadResult) => Promise<number | null>) => {
			for (const data of records) {
				if ((await next({ data, storageOffset: 0 })) === null) break
			}
		},
	} as unknown as Storage
}

describe('The VPinball light controller link', () => {
	let table: Table
	let player: Player
	let outputs: ControllerOutputs

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-light.vpx')))
		player = new Player(table).init()
		outputs = { lamps: {}, solenoids: {}, gi: {} }
	})

	it('should parse the LINK tag into stateSrcLink', async () => {
		const link = 'ctrl://pinmame/state?group=10&mapping=11'
		const data = await LightData.fromStorage(
			storageFromRecords([stringRecord('LINK', link), endRecord()]),
			'Light1',
		)
		expect(data.stateSrcLink).toBe(link)
	})

	it('should drive the light from a controller lamp link', () => {
		player.setEmulator(stubEmulator(outputs))
		const light = table.lights.Surface
		const api = light.getApi()
		api.State = Enums.LightStatus.LightStateOff
		api.Intensity = 1
		light.data.stateSrcLink = 'ctrl://pinmame/state?group=10&mapping=11'

		outputs.lamps[11] = 1
		player.simulateTime(20)
		expect(light.getState().intensity).toBe(1)
		expect(api.State).toBe(1)

		outputs.lamps[11] = 0
		player.simulateTime(200)
		expect(light.getState().intensity).toBe(0)
		expect(api.State).toBe(0)
	})

	it('should drive the light from a controller solenoid link', () => {
		player.setEmulator(stubEmulator(outputs))
		const light = table.lights.Surface
		const api = light.getApi()
		api.State = Enums.LightStatus.LightStateOff
		api.Intensity = 1
		light.data.stateSrcLink = 'ctrl://pinmame/state?group=1&mapping=5'

		outputs.solenoids[5] = 1
		player.simulateTime(20)
		expect(light.getState().intensity).toBe(1)

		outputs.solenoids[5] = 0
		player.simulateTime(200)
		expect(light.getState().intensity).toBe(0)
	})

	it('should let the controller link override the script state every frame', () => {
		player.setEmulator(stubEmulator(outputs))
		const light = table.lights.Surface
		const api = light.getApi()
		api.Intensity = 1
		light.data.stateSrcLink = 'ctrl://pinmame/state?group=10&mapping=11'

		outputs.lamps[11] = 0
		api.State = Enums.LightStatus.LightStateOn
		player.simulateTime(100)
		expect(light.getState().intensity).toBe(0)
	})

	it('should keep script control when the link does not resolve', () => {
		const light = table.lights.Surface
		const api = light.getApi()
		api.State = Enums.LightStatus.LightStateOn
		api.Intensity = 1
		light.data.stateSrcLink = 'ctrl://pinmame/state?group=10&mapping=11'

		player.simulateTime(20)
		expect(light.getState().intensity).toBe(1)
	})

	it('should not drive the light from the link when locked by a light sequence', () => {
		player.setEmulator(stubEmulator(outputs))
		const light = table.lights.Surface
		const api = light.getApi()
		api.State = Enums.LightStatus.LightStateOff
		api.Intensity = 1
		light.data.stateSrcLink = 'ctrl://pinmame/state?group=10&mapping=11'
		;(light.getAnimation() as LightAnimation).lockedByLS = true

		outputs.lamps[11] = 1
		player.simulateTime(100)
		expect(light.getState().intensity).toBe(0)
	})
})
