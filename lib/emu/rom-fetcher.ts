// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { GamelistDB } from 'wpc-emu'
import { logger } from '../util/logger.js'

/** Fetches a WPC ROM from VPDB.io. */
export async function downloadGameEntry(pinmameGameName: string): Promise<LoadedGameEntry> {
	const gameEntry = GamelistDB.getByPinmameName(pinmameGameName)
	if (!gameEntry) throw new Error('GAME_ENTRY_NOT_FOUND_' + pinmameGameName)

	const url = buildVpdbGameEntryUrl(gameEntry.pinmame.vpdbId || gameEntry.pinmame.id)
	const jsonData = await downloadFileAsJson(url)
	if (!Array.isArray(jsonData)) {
		logger().error('VPDB Fetch failed for url', url)
		throw new Error('VPDB_INVALID_ANSWER_FOR_' + pinmameGameName)
	}
	if (!jsonData.find((e: VpdbGameEntry) => e.id === pinmameGameName)) {
		throw new Error('VPDB_GAME_ENTRY_NOT_FOUND_' + pinmameGameName)
	}
	const romSet = findRomSet(jsonData, pinmameGameName)
	if (!romSet) throw new Error('VPDB_ROMSET_ENTRY_NOT_FOUND_' + pinmameGameName)
	const romName = findMainRomFilename(romSet)
	if (!romName) throw new Error('VPDB_ROM_TYPE_NOT_FOUND_' + pinmameGameName)

	const romUrl = buildVpdbGameRomUrl(romSet.file.url, romName)
	logger().debug('load rom from', romUrl, ', # downloads', romSet.file.counter.downloads)
	const romFile = await downloadFileAsUint8Array(romUrl)
	return { wpcDbEntry: gameEntry, romFile }
}

function findMainRomFilename(romSet: VpdbGameEntry): string {
	return romSet.rom_files.find((e: VpdbGameRomEntry) => e.type === 'main')?.filename ?? ''
}

function findRomSet(sets: VpdbGameEntry[], name: string): VpdbGameEntry | undefined {
	return sets.find((e: VpdbGameEntry) => e.id === name)
}

function buildVpdbGameRomUrl(parent: string, file: string): string {
	return `${parent}/${file}`
}
function buildVpdbGameEntryUrl(id: string): string {
	return `https://api.vpdb.io/v1/games/${id}/roms/`
}

async function downloadFileAsJson(url: string): Promise<VpdbGameEntry[]> {
	const r = await fetch(url)
	if (!r.ok) {
		logger().error('VPDB Fetch JSON failed for url', url)
		throw new Error('VPDB_FETCH_FAILED_WITH_ERROR_' + r.status)
	}
	return r.json()
}

async function downloadFileAsUint8Array(url: string): Promise<Uint8Array> {
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
