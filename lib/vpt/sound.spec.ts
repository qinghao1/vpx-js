// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NullSoundEngine } from '../audio/null-sound-engine.js'
import { Player } from '../game/player.js'
import { BinaryReader } from '../io/binary-reader.js'
import type { Storage } from '../io/ole-doc.js'
import { OleCompoundDoc } from '../io/ole-doc.js'
import { Sound, SoundOutType } from './sound.js'
import { Table } from './table/table.js'

const PRIMITIVE_FIXTURE = path.resolve('test/fixtures/table-primitive.vpx')

/** Raw `Sound{i}` stream without Table.load. */
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
		expect(sound.data.length).toBe(44 + 46710)
		expect(sound.sampleRate).toBe(44100)
		expect(sound.pcm?.length).toBe(23355)
		expect(sound.pcm![0]).toBeCloseTo(1029 / 32768, 6)
		expect(sound.pcm![1]).toBeCloseTo(1056 / 32768, 6)
	})

	it('downmixes a real stereo fixture sound to mono', async () => {
		const sound = await loadFixtureSound(5)
		expect(sound.getName()).toBe('kicker_enter_center')
		expect(sound.sampleRate).toBe(44100)
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

	it('reports decoded channel counts', async () => {
		expect((await loadFixtureSound(0)).channels).toBe(1)
		expect((await loadFixtureSound(5)).channels).toBe(2)
	})

	it('rejects corrupt streams (the loader skips these)', async () => {
		const storage = { read: async () => new Uint8Array([0x00, 0x01]) } as Storage
		await expect(Sound.fromStorage(storage, 'Sound0')).rejects.toThrow()
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

	it('routes natural music ends to the script MusicDone event', async () => {
		const table = await Table.load(new BinaryReader(new Uint8Array(readFileSync(PRIMITIVE_FIXTURE))))
		const player = new Player(table)
		let done = 0
		table.getApi().on('MusicDone', () => done++)
		player.getSoundEngine().onMusicEnded?.()
		expect(done).toBe(1)
	})
})

function buildStream(name: string, path: string, body: Uint8Array, tail: Uint8Array): Uint8Array {
	const enc = new TextEncoder()
	const nameBytes = enc.encode(name)
	const pathBytes = enc.encode(path)
	const out = new Uint8Array(4 + nameBytes.length + 4 + pathBytes.length + 4 + 1 + body.length + tail.length)
	const view = new DataView(out.buffer)
	let pos = 0
	view.setInt32(pos, nameBytes.length, true)
	pos += 4
	out.set(nameBytes, pos)
	pos += nameBytes.length
	view.setInt32(pos, pathBytes.length, true)
	pos += 4
	out.set(pathBytes, pos)
	pos += pathBytes.length
	view.setInt32(pos, 1, true)
	pos += 4
	out[pos++] = 0
	out.set(body, pos)
	pos += body.length
	out.set(tail, pos)
	return out
}

function wavBody(samples: number): Uint8Array {
	const body = new Uint8Array(18 + 4 + samples * 2)
	const view = new DataView(body.buffer)
	view.setUint16(0, 1, true)
	view.setUint16(2, 1, true)
	view.setUint32(4, 8000, true)
	view.setUint32(8, 16000, true)
	view.setUint16(12, 2, true)
	view.setUint16(14, 16, true)
	view.setInt32(18, samples * 2, true)
	return body
}

function loadSynthetic(name: string, path: string, body: Uint8Array, tail: Uint8Array): Promise<Sound> {
	const storage = { read: async () => buildStream(name, path, body, tail) } as Storage
	return Sound.fromStorage(storage, 'Sound0')
}

describe('Sound legacy and storage formats', () => {
	it('defaults pre-1031 levels to 100 with a table target', async () => {
		const sound = await loadSynthetic('old', 'C:\\snd\\old.wav', wavBody(2), new Uint8Array([0]))
		expect(sound.volume).toBe(100)
		expect(sound.pan).toBe(100)
		expect(sound.frontRearFade).toBe(100)
		expect(sound.isPlayable()).toBe(true)
		expect(sound.pcm?.length).toBe(2)
	})

	it('detects backglass by case-insensitive bgout_ substring', async () => {
		const sound = await loadSynthetic('xBgOuT_hit', 'C:\\snd\\hit.wav', wavBody(2), new Uint8Array([0]))
		expect(sound.outputTarget).toBe(SoundOutType.BACKGLASS)
	})

	it('detects backglass by legacy path spelling', async () => {
		const sound = await loadSynthetic('old', '* BACKGLASS output *', wavBody(2), new Uint8Array([0]))
		expect(sound.outputTarget).toBe(SoundOutType.BACKGLASS)
	})

	it('sniffs WAV storage on extensionless paths', async () => {
		const sound = await loadSynthetic('kick', 'kick', wavBody(2), new Uint8Array(17))
		expect(sound.sampleRate).toBe(8000)
		expect(sound.pcm?.length).toBe(2)
	})

	it('keeps raw storage for non-WAV paths', async () => {
		const sound = await loadSynthetic(
			'track',
			'track.mp3',
			new Uint8Array([3, 0, 0, 0, 1, 2, 3]),
			new Uint8Array(17),
		)
		expect([...sound.data]).toEqual([1, 2, 3])
		expect(sound.pcm).toBe(null)
	})
})
