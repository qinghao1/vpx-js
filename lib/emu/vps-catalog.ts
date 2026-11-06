// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { idbGet, idbSet } from '../util/idb-cache.js'

/** Virtual Pinball Spreadsheet database (CORS-enabled, ~8 MB) and its tiny change stamp. */
export const VPS_DB_URL = 'https://virtualpinballspreadsheet.github.io/vps-db/db/vpsdb.json'
export const VPS_UPDATED_URL = 'https://virtualpinballspreadsheet.github.io/vps-db/lastUpdated.json'

/** Budget for the change-stamp probe; on timeout a cached catalog is served as-is. */
const STAMP_TIMEOUT_MS = 10_000

// vps1 versions the trimmed VpsGame shape stored in IDB; bump when it changes.
const CACHE_KEY = 'vps1:catalog'

/** A table or ROM entry. For ROMs `version` is the PinMAME set name (e.g. `twd_160h`). */
export interface VpsFile {
	id: string
	authors: string[]
	version: string
	features: string[]
	comment: string
	/** Source pages (rarely direct files); links VPS flags as broken are dropped. */
	urls: string[]
}

export interface VpsGame {
	id: string
	name: string
	manufacturer: string
	year: number | undefined
	/** VPX tables only — the formats this viewer can load. */
	tables: VpsFile[]
	roms: VpsFile[]
}

export type Download = (url: string, signal?: AbortSignal) => Promise<Uint8Array>

export interface LoadOptions {
	download?: Download
	signal?: AbortSignal
}

interface RawFile {
	id: string
	authors?: string[]
	version?: string
	features?: string[]
	comment?: string
	tableFormat?: string
	urls?: { url: string; broken?: boolean }[]
}

interface RawGame {
	id: string
	name: string
	manufacturer?: string
	year?: number
	tableFiles?: RawFile[]
	romFiles?: RawFile[]
}

function toFile(raw: RawFile): VpsFile {
	return {
		id: raw.id,
		authors: raw.authors ?? [],
		version: raw.version ?? '',
		features: raw.features ?? [],
		comment: raw.comment ?? '',
		urls: (raw.urls ?? []).filter(u => u.url && !u.broken).map(u => u.url),
	}
}

/** Trims raw `vpsdb.json` to games with a VPX table or a ROM, sorted by name. */
export function parseVpsDb(raw: unknown): VpsGame[] {
	if (!Array.isArray(raw)) throw new Error('VPS database is not an array')
	return (raw as RawGame[])
		.map(game => ({
			id: game.id,
			name: game.name,
			manufacturer: game.manufacturer ?? '',
			year: game.year,
			tables: (game.tableFiles ?? []).filter(t => t.tableFormat === 'VPX').map(toFile),
			roms: (game.romFiles ?? []).map(toFile),
		}))
		.filter(game => game.name && (game.tables.length || game.roms.length))
		.sort((a, b) => a.name.localeCompare(b.name))
}

/** Games matching every whitespace-separated term in name, manufacturer, year or ROM name; name-prefix hits rank first, other name hits second. */
export function searchVpsGames(games: VpsGame[], query: string, limit = 50): VpsGame[] {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
	if (!terms.length) return []
	const phrase = terms.join(' ')
	const rank = (game: VpsGame) => {
		const at = game.name.toLowerCase().indexOf(phrase)
		return at === 0 ? 0 : at > 0 ? 1 : 2
	}
	return games
		.filter(game => {
			// A missing year must not stringify to "undefined" and match everything.
			const haystack = [game.name, game.manufacturer, game.year ?? '', ...game.roms.map(r => r.version)]
				.join(' ')
				.toLowerCase()
			return terms.every(term => haystack.includes(term))
		})
		.sort((a, b) => rank(a) - rank(b))
		.slice(0, limit)
}

/** Games listing the PinMAME ROM set `romName` (case-insensitive). */
export function findGamesByRom(games: VpsGame[], romName: string): VpsGame[] {
	const wanted = romName.toLowerCase()
	return games.filter(game => game.roms.some(rom => rom.version.toLowerCase() === wanted))
}

/** True when the URL names a `.vpx`/`.zip` file rather than a download page (it may still lack CORS). */
export function isDirectFileUrl(url: string): boolean {
	try {
		return /\.(vpx|zip)$/i.test(new URL(url).pathname)
	} catch {
		return false
	}
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
	const res = await fetch(url, { signal, cache: 'no-store' })
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
	return new Uint8Array(await res.arrayBuffer())
}

/**
 * The parsed catalog, from IDB while VPS's change stamp is unchanged (or
 * unreachable), else re-downloaded and re-cached.
 */
export async function loadVpsCatalog({ download = fetchBytes, signal }: LoadOptions = {}): Promise<VpsGame[]> {
	const cached = (await idbGet(CACHE_KEY)) as { stamp?: string; games: VpsGame[] } | undefined
	const stampSignal = AbortSignal.any([AbortSignal.timeout(STAMP_TIMEOUT_MS), ...(signal ? [signal] : [])])
	// The stamp only versions the cached payload, so stamp failures fall back
	// to the cache (a caller abort still throws).
	const stampOf = (request: Promise<Uint8Array>): Promise<string | undefined> =>
		request.then(
			bytes => new TextDecoder().decode(bytes).trim(),
			error => {
				if (signal?.aborted) throw error
				return undefined
			},
		)
	if (!cached?.games) {
		// Cold start: the stamp is only stored with the result, so both
		// requests launch together instead of sequentially.
		const [stamp, raw] = await Promise.all([
			stampOf(download(VPS_UPDATED_URL, stampSignal)),
			download(VPS_DB_URL, signal),
		])
		const games = parseVpsDb(JSON.parse(new TextDecoder().decode(raw)))
		await idbSet(CACHE_KEY, { stamp, games })
		return games
	}
	const stamp = await stampOf(download(VPS_UPDATED_URL, stampSignal))
	if (stamp === undefined || stamp === cached.stamp) return cached.games
	try {
		const games = parseVpsDb(JSON.parse(new TextDecoder().decode(await download(VPS_DB_URL, signal))))
		await idbSet(CACHE_KEY, { stamp, games })
		return games
	} catch (error) {
		// A failed refresh (offline, captive portal, bad JSON) must not strand
		// a valid cache; only a caller abort propagates.
		if (signal?.aborted) throw error
		return cached.games
	}
}
