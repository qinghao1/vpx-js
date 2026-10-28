// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { GamelistDB as GamelistDBType } from 'wpc-emu'
import { logger } from '../util/logger.js'
import { resolveWpcEmu } from './wpc-emu-interop.js'

const GamelistDB = resolveWpcEmu<{
	getByPinmameName(name: string): GamelistDBType.ClientGameEntry | undefined
}>('GamelistDB')

// Whole-request budget for VPDB metadata + ROM downloads. Without a signal
// a stalled connection hangs loadGame forever; the signal covers headers
// and body reads alike.
export const FETCH_TIMEOUT_MS = 30_000

/** Fetches a WPC ROM from VPDB.io. */
export async function downloadGameEntry(pinmameGameName: string): Promise<LoadedGameEntry> {
	const entry = GamelistDB.getByPinmameName(pinmameGameName)
	if (!entry) throw new Error(`GAME_ENTRY_NOT_FOUND_${pinmameGameName}`)
	const url = `https://api.vpdb.io/v1/games/${entry.pinmame.vpdbId || entry.pinmame.id}/roms/`
	const sets = await fetchJson<VpdbGameEntry[]>(url)
	if (!Array.isArray(sets)) {
		logger().error('VPDB Fetch failed for url', url)
		throw new Error(`VPDB_INVALID_ANSWER_FOR_${pinmameGameName}`)
	}
	const romSet = sets.find(e => e.id === pinmameGameName)
	if (!romSet) throw new Error(`VPDB_GAME_ENTRY_NOT_FOUND_${pinmameGameName}`)
	const romEntry = romSet.rom_files.find(e => e.type === 'main')
	if (!romEntry?.filename) throw new Error(`VPDB_ROM_TYPE_NOT_FOUND_${pinmameGameName}`)
	const romUrl = `${romSet.file.url}/${romEntry.filename}`
	logger().debug('load rom from', romUrl, ', # downloads', romSet.file.counter.downloads)
	const romFile = await fetchBytes(romUrl)
	// Reject truncated or corrupt downloads before they reach the emulator.
	if (romFile.length !== romEntry.bytes) throw new Error(`VPDB_ROM_SIZE_MISMATCH_${pinmameGameName}`)
	if (crc32(romFile) !== romEntry.crc >>> 0) throw new Error(`VPDB_ROM_CRC_MISMATCH_${pinmameGameName}`)
	return { wpcDbEntry: entry, romFile }
}

/** CRC-32 (ISO 3309, zlib-compatible) over raw bytes — dependency-free for browser use. */
export function crc32(data: Uint8Array): number {
	let crc = 0xff_ff_ff_ff // all-ones seed per the CRC-32 spec
	for (let i = 0; i < data.length; i++) {
		crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
	}
	return (crc ^ 0xff_ff_ff_ff) >>> 0
}

// 256-entry table for polynomial 0xEDB88320 (reversed 0x04C11DB7).
const CRC_TABLE: Uint32Array = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1
		table[n] = c
	}
	return table
})()

/** Fetch with a whole-request timeout; the default budget is FETCH_TIMEOUT_MS. Exported for tests. */
export async function fetchWithTimeout(url: string, what: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
	const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
	if (!r.ok) {
		logger().error(`VPDB Fetch ${what} failed for url`, url)
		throw new Error(`VPDB_FETCH_FAILED_WITH_ERROR_${r.status}`)
	}
	return r
}

async function fetchOk(url: string, what: string): Promise<Response> {
	return fetchWithTimeout(url, what)
}

async function fetchJson<T>(url: string): Promise<T> {
	return (await fetchOk(url, 'JSON')).json()
}

async function fetchBytes(url: string): Promise<Uint8Array> {
	return new Uint8Array(await (await fetchOk(url, 'ROM')).arrayBuffer())
}

export interface LoadedGameEntry {
	wpcDbEntry: GamelistDBType.ClientGameEntry
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
