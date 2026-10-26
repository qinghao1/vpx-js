import { describe, expect, it } from 'vitest'
import { ThreeHelper } from '../../../test/three.helper'
import type { IEmulator } from '../../emu/emulator.js'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Table } from '../table/table.js'
import { FlasherData } from './flasher-data.js'
import type { FlasherState } from './flasher-state.js'

const three = new ThreeHelper()

function stubEmulator(lamps: Record<number, number>): IEmulator {
	return {
		emuSimulateCycle: () => 0,
		setSwitchInput: () => true,
		getLampState: (n: number) => lamps[n] ?? 0,
		getSolenoidState: () => 0,
		getGIState: () => 0,
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

describe('The VPinball flasher controller link', () => {
	let table: Table
	let player: Player
	let lamps: Record<number, number>

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flasher.vpx')))
		player = new Player(table).init()
		lamps = {}
	})

	it('should parse the LINK and SLNK tags', async () => {
		const data = await FlasherData.fromStorage(
			storageFromRecords([
				stringRecord('LINK', 'ctrl://pinmame/display?id=0'),
				stringRecord('SLNK', 'ctrl://pinmame/state?group=10&mapping=11'),
				endRecord(),
			]),
			'Flasher1',
		)
		expect(data.imageSrcLink).toBe('ctrl://pinmame/display?id=0')
		expect(data.stateSrcLink).toBe('ctrl://pinmame/state?group=10&mapping=11')
	})

	it('should modulate opacity from a controller lamp link', () => {
		player.setEmulator(stubEmulator(lamps))
		const flasher = table.flashers.Flasher
		const api = flasher.getApi()
		api.Alpha = 80
		flasher.data.stateSrcLink = 'ctrl://pinmame/state?group=10&mapping=11'

		lamps[11] = 1
		player.simulateTime(20)
		expect(flasher.getState().alpha).toBe(80)

		lamps[11] = 0
		player.simulateTime(40)
		expect(flasher.getState().alpha).toBe(0)
		expect(player.popStates().getState<FlasherState>('Flasher')?.alpha).toBe(0)
	})

	it('should ignore the controller link while locked by a light sequence', () => {
		player.setEmulator(stubEmulator(lamps))
		const flasher = table.flashers.Flasher
		flasher.getApi().Alpha = 70
		flasher.data.stateSrcLink = 'ctrl://pinmame/state?group=10&mapping=11'
		flasher.getState().lockedByLS = true
		flasher.getState().inPlayState = true

		lamps[11] = 1
		expect(flasher.getAnimation().updateAnimation(100, table)).toBe(false)
		expect(flasher.getState().alpha).toBe(70)
	})

	it('should keep script opacity when the link does not resolve', () => {
		const flasher = table.flashers.Flasher
		flasher.getApi().Alpha = 60
		flasher.data.stateSrcLink = 'ctrl://pinmame/state?group=10&mapping=11'

		expect(flasher.getAnimation().updateAnimation(100, table)).toBe(false)
		expect(flasher.getState().alpha).toBe(60)
	})

	it('should leave opacity untouched when no link is set', () => {
		const flasher = table.flashers.Flasher
		flasher.getApi().Alpha = 45
		expect(flasher.data.stateSrcLink).toBeUndefined()
		expect(flasher.getAnimation().updateAnimation(100, table)).toBe(false)
		expect(flasher.getState().alpha).toBe(45)
	})
})
