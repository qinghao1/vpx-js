// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NullSoundEngine } from '../audio/null-sound-engine.js'
import { Player } from '../game/player.js'
import { BinaryReader } from '../io/binary-reader.js'
import { OleCompoundDoc } from '../io/ole-doc.js'
import { Sound } from './sound.js'
import { Table } from './table/table.js'

const PRIMITIVE_FIXTURE = path.resolve('test/fixtures/table-primitive.vpx')

/** Parses one raw `Sound{i}` stream from the real fixture (no Table.load involved). */
async function loadFixtureSound(index: number): Promise<Sound> {
	const doc = await OleCompoundDoc.load(new BinaryReader(new Uint8Array(readFileSync(PRIMITIVE_FIXTURE))))
	try {
		return await Sound.fromStorage(doc.storage('GameStg'), `Sound${index}`)
	} finally {
		await doc.close()
	}
}

describe('Sound', () => {
	it('parses name, WAV bytes and PCM of a real mono fixture sound', async () => {
		const sound = await loadFixtureSound(0)
		expect(sound.getName()).toBe('ballrelease')
		expect(sound.path).toMatch(/\.wav$/i)
		// Rebuilt file is a playable WAV: 44-byte header + the 46710 cdata bytes.
		expect(sound.data.length).toBe(44 + 46710)
		expect(sound.sampleRate).toBe(44100)
		// 46710 mono 16-bit bytes -> 23355 float samples.
		expect(sound.pcm?.length).toBe(23355)
		expect(sound.pcm![0]).toBeCloseTo(1029 / 32768, 6)
		expect(sound.pcm![1]).toBeCloseTo(1056 / 32768, 6)
	})

	it('downmixes a real stereo fixture sound to mono', async () => {
		const sound = await loadFixtureSound(5)
		expect(sound.getName()).toBe('kicker_enter_center')
		expect(sound.sampleRate).toBe(44100)
		// 56756 stereo 16-bit bytes -> 14189 mono frames.
		expect(sound.pcm?.length).toBe(14189)
		expect(sound.pcm![0]).toBeCloseTo((2243 + 2242) / 2 / 32768, 6)
	})

	it('loads all nine fixture sounds with playable PCM', async () => {
		const table = await Table.load(new BinaryReader(new Uint8Array(readFileSync(PRIMITIVE_FIXTURE))))
		expect(Object.keys(table.sounds).sort()).toEqual(
			[
				'ballrelease',
				'fx_bumper1',
				'fx_bumper2',
				'fx_bumper3',
				'fx_bumper4',
				'kicker_enter_center',
				'knocker',
				'left_slingshot',
				'plunger',
			].sort(),
		)
		for (const sound of Object.values(table.sounds)) expect(sound.isPlayable()).toBe(true)
	})

	it('looks sounds up case-insensitively', async () => {
		const table = await Table.load(new BinaryReader(new Uint8Array(readFileSync(PRIMITIVE_FIXTURE))))
		expect(table.getSound('BallRelease')?.getName()).toBe('ballrelease')
		expect(table.getSound('BALLRELEASE')?.getName()).toBe('ballrelease')
		expect(table.getSound('Flipper_Rubber_7')).toBeUndefined()
		expect(table.getSound()).toBeUndefined()
	})
})

describe('Table sounds in the player', () => {
	it('registers fixture sounds so script PlaySound finds them', async () => {
		const table = await Table.load(new BinaryReader(new Uint8Array(readFileSync(PRIMITIVE_FIXTURE))))
		const player = new Player(table)
		const engine = player.getSoundEngine()
		expect(engine.hasSample('ballrelease')).toBe(true)
		expect(engine.hasSample('BallRelease')).toBe(true)
		expect(engine.hasSample('Flipper_Rubber_7')).toBe(false)
		// The exact symptom: a script PlaySound call resolves instead of warning.
		table.getApi().PlaySound('plunger', 1, 1, 0, 0, 0, false, true, 0)
		expect(engine.isPlaying('plunger')).toBe(true)
		expect(engine.playSound('BallRelease')).toBeGreaterThan(0)
		expect(engine.isPlaying('ballrelease')).toBe(true)
	})

	it('keeps table sounds across sound-engine swaps', async () => {
		const table = await Table.load(new BinaryReader(new Uint8Array(readFileSync(PRIMITIVE_FIXTURE))))
		const player = new Player(table)
		player.setSoundEngine(new NullSoundEngine())
		expect(player.getSoundEngine().hasSample('kicker_enter_center')).toBe(true)
		expect(player.getSoundEngine().playSound('knocker')).toBeGreaterThan(0)
	})
})
