// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VPS_FIXTURE from './vps-catalog.fixture.json'
import {
	findGamesByRom,
	isDirectFileUrl,
	loadVpsCatalog,
	parseVpsDb,
	searchVpsGames,
	VPS_DB_URL,
	VPS_UPDATED_URL,
} from './vps-catalog.js'

const store = new Map<string, unknown>()
vi.mock('../util/idb-cache.js', () => ({
	idbGet: async (key: string) => store.get(key),
	idbSet: async (key: string, value: unknown) => void store.set(key, value),
}))

const encode = (text: string) => new TextEncoder().encode(text)

describe('VPS catalog', () => {
	const games = parseVpsDb(VPS_FIXTURE)

	it('keeps games with a VPX table or ROM, sorted by name', () => {
		expect(games.map(g => g.name)).toEqual([
			'Missing in Action',
			'Night Moves',
			'The Walking Dead (Limited Edition)',
			'The Walking Dead (Pro)',
		])
	})

	it('drops non-VPX tables and broken links', () => {
		const le = games.find(g => g.id === 'wasB0RRz')
		expect(le?.tables).toHaveLength(2)
		expect(le?.roms.map(r => r.version)).toEqual(['twd_160h', 'twd_160h'])
		const brokenUrls = VPS_FIXTURE.flatMap(g => g.romFiles ?? [])
			.flatMap(r => r.urls ?? [])
			.filter(u => 'broken' in u && u.broken)
			.map(u => u.url)
		expect(brokenUrls).not.toHaveLength(0)
		const kept = games.flatMap(g => g.roms.flatMap(r => r.urls))
		for (const url of brokenUrls) expect(kept).not.toContain(url)
	})

	it('rejects a non-array database', () => {
		expect(() => parseVpsDb({ foo: 'bar' })).toThrow(/not an array/)
	})

	it('searches name terms in any order, prefix hits first', () => {
		expect(searchVpsGames(games, 'dead walking').map(g => g.id)).toEqual(['wasB0RRz', 'RoHgIHwY6l'])
		expect(searchVpsGames(games, 'walking dead pro').map(g => g.id)).toEqual(['RoHgIHwY6l'])
		expect(searchVpsGames(games, 'night').map(g => g.name)).toEqual(['Night Moves'])
		expect(searchVpsGames(games, '  ')).toEqual([])
	})

	it('searches by manufacturer, year and ROM name', () => {
		expect(searchVpsGames(games, 'stern 2014')).toHaveLength(2)
		expect(searchVpsGames(games, 'twd_160').map(g => g.id)).toEqual(['wasB0RRz'])
	})

	it('finds games by PinMAME ROM name, case-insensitive', () => {
		expect(findGamesByRom(games, 'TWD_160H').map(g => g.id)).toEqual(['wasB0RRz'])
		expect(findGamesByRom(games, 'nope')).toEqual([])
	})

	it('tells direct files from download pages', () => {
		expect(isDirectFileUrl('https://www.ipdb.org/files/3507/nmoves.zip')).toBe(true)
		expect(isDirectFileUrl('https://example.com/a/Table.VPX?dl=1')).toBe(true)
		expect(isDirectFileUrl('https://vpuniverse.com/files/file/25247-walking-dead/')).toBe(false)
		expect(isDirectFileUrl('not a url')).toBe(false)
	})

	describe('loadVpsCatalog', () => {
		beforeEach(() => store.clear())

		const serve = (stamp: string | Error) => {
			const download = vi.fn(async (url: string) => {
				if (url === VPS_UPDATED_URL) {
					if (stamp instanceof Error) throw stamp
					return encode(stamp)
				}
				if (url === VPS_DB_URL) return encode(JSON.stringify(VPS_FIXTURE))
				throw new Error(`unexpected ${url}`)
			})
			return download
		}

		it('downloads, parses and caches on a cold start', async () => {
			const download = serve('100')
			expect(await loadVpsCatalog({ download })).toEqual(games)
			expect(download).toHaveBeenCalledWith(VPS_DB_URL, undefined)
			expect(store.get('vps1:catalog')).toEqual({ stamp: '100', games })
		})

		it('serves the cache while the stamp is unchanged or unreachable', async () => {
			store.set('vps1:catalog', { stamp: '100', games: games.slice(0, 1) })
			for (const stamp of ['100', new Error('offline')]) {
				const download = serve(stamp)
				expect(await loadVpsCatalog({ download })).toHaveLength(1)
				expect(download).not.toHaveBeenCalledWith(VPS_DB_URL, undefined)
			}
		})

		it('refreshes when the stamp moves', async () => {
			store.set('vps1:catalog', { stamp: '100', games: games.slice(0, 1) })
			expect(await loadVpsCatalog({ download: serve('200') })).toEqual(games)
			expect((store.get('vps1:catalog') as { stamp: string }).stamp).toBe('200')
		})

		it('falls back to the cache when the refresh download fails', async () => {
			// Stamp moved but the DB is unreachable (or unparseable): the valid
			// cache still serves instead of throwing.
			store.set('vps1:catalog', { stamp: '100', games: games.slice(0, 1) })
			const failing = async (url: string) => {
				if (url === VPS_UPDATED_URL) return encode('200')
				throw new Error('offline')
			}
			expect(await loadVpsCatalog({ download: failing })).toHaveLength(1)
			expect(store.get('vps1:catalog')).toEqual({ stamp: '100', games: games.slice(0, 1) })
		})

		it('propagates a caller abort instead of falling back', async () => {
			store.set('vps1:catalog', { stamp: '100', games })
			const abort = new AbortController()
			abort.abort()
			const download = vi.fn(async (_url: string, signal?: AbortSignal) => {
				signal?.throwIfAborted()
				return encode('100')
			})
			await expect(loadVpsCatalog({ download, signal: abort.signal })).rejects.toThrow()
		})
	})
})
