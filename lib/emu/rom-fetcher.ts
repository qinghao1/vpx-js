// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { GamelistDB } from 'wpc-emu'
import { logger } from '../util/logger.js'

/** Fetches a WPC ROM from VPDB.io. */
export async function downloadGameEntry(pinmameGameName: string): Promise<LoadedGameEntry> {
	const entry = GamelistDB.getByPinmameName(pinmameGameName)
	if (!entry) throw new Error('GAME_ENTRY_NOT_FOUND_' + pinmameGameName)
	const url = `https://api.vpdb.io/v1/games/${entry.pinmame.vpdbId || entry.pinmame.id}/roms/`
	const sets = await fetchJson<VpdbGameEntry[]>(url)
	if (!Array.isArray(sets)) {
		logger().error('VPDB Fetch failed for url', url)
		throw new Error('VPDB_INVALID_ANSWER_FOR_' + pinmameGameName)
	}
	if (!sets.find((e) => e.id === pinmameGameName)) throw new Error('VPDB_GAME_ENTRY_NOT_FOUND_' + pinmameGameName)
	const romSet = sets.find((e) => e.id === pinmameGameName)
	if (!romSet) throw new Error('VPDB_ROMSET_ENTRY_NOT_FOUND_' + pinmameGameName)
	const romName = romSet.rom_files.find((e) => e.type === 'main')?.filename ?? ''
	if (!romName) throw new Error('VPDB_ROM_TYPE_NOT_FOUND_' + pinmameGameName)
	const romUrl = `${romSet.file.url}/${romName}`
	logger().debug('load rom from', romUrl, ', # downloads', romSet.file.counter.downloads)
	const romFile = await fetchBytes(romUrl)
	return { wpcDbEntry: entry, romFile }
}

async function fetchJson<T>(url: string): Promise<T> {
	const r = await fetch(url)
	if (!r.ok) {
		logger().error('VPDB Fetch JSON failed for url', url)
		throw new Error('VPDB_FETCH_FAILED_WITH_ERROR_' + r.status)
	}
	return r.json()
}

async function fetchBytes(url: string): Promise<Uint8Array> {
	const r = await fetch(url)
	if (!r.ok) {
		logger().error('VPDB Fetch ROM failed for url', url)
		throw new Error('VPDB_FETCH_FAILED_WITH_ERROR_' + r.status)
	}
	return new Uint8Array(await r.arrayBuffer())
}

export interface LoadedGameEntry {
	wpcDbEntry: GamelistDB.ClientGameEntry
	romFile: Uint8Array
}

interface VpdbGameEntry {
	id: string
	version: string
	notes?: string
	file: VpdbFileEntry
	rom_files: VpdbGameRomEntry[]
}
interface VpdbFileEntry {
	id: string
	bytes: number
	counter: VpdbCounter
	is_protected: boolean
	mime_type: string
	name: string
	url: string
}
interface VpdbGameRomEntry {
	bytes: number
	crc: number
	filename: string
	system: string
	type: string
}
interface VpdbCounter {
	downloads: number
}
