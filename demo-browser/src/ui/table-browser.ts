// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import {
	findGamesByRom,
	isDirectFileUrl,
	loadVpsCatalog,
	searchVpsGames,
	VPS_DB_URL,
} from '../../../dist-esm/lib/emu/vps-catalog.js'
import { romMountFileName } from '../../../dist-esm/lib/wasm/vpinball-wasm.js'
import type { VpsFile, VpsGame } from '../../../lib/emu/vps-catalog.js'
import { fetchWithProgress } from '../utils.js'
import '../styles/table-browser.css'

type Kind = 'vpx' | 'rom'

interface BrowserViewer {
	table?: { tableScript?: string } | null
	load(vpx: string): Promise<unknown>
	preloadRom(url: string): Promise<unknown>
}

/** Hosts answer a CORS probe in well under this, or never; it also keeps the click's popup activation alive. */
const PROBE_TIMEOUT_MS = 4000
const RESULT_LIMIT = 50

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Partial<HTMLElementTagNameMap[K]> = {},
	...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
	const node = Object.assign(document.createElement(tag), props)
	node.append(...children)
	return node
}

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

/** Readable cross-origin and not an HTML page: the viewer can fetch it as-is. */
async function isFetchable(url: string): Promise<boolean> {
	try {
		const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
		return res.ok && !res.headers.get('content-type')?.includes('text/html')
	} catch {
		return false
	}
}

/**
 * Catalog dialog behind `#browse-btn`: search VPS, list a game's VPX tables
 * and ROMs, load direct CORS-readable files through the viewer's `?vpx`/`?rom`
 * path, and otherwise open the source page for a manual download + drop.
 */
export function initTableBrowser(viewer: BrowserViewer, syncParam: (key: Kind, value: string) => void): void {
	const search = el('input', {
		type: 'search',
		placeholder: 'Search tables, manufacturers, years or ROM names',
		ariaLabel: 'Search catalog',
	})
	const status = el('p', { className: 'tb-status' })
	status.setAttribute('aria-live', 'polite')
	const results = el('ul', { className: 'tb-results', ariaLabel: 'Games' })
	const detail = el('section', { className: 'tb-detail', ariaLabel: 'Game files' })
	const close = el('button', { type: 'button', ariaLabel: 'Close catalog', textContent: '×' })
	const dialog = el(
		'dialog',
		{ id: 'table-browser', className: 'table-browser' },
		el('header', { className: 'tb-head' }, el('h3', { textContent: 'Tables & ROMs' }), close),
		search,
		status,
		el('div', { className: 'tb-body' }, results, detail),
		el(
			'footer',
			{ className: 'tb-foot' },
			'Catalog: ',
			el('a', {
				href: 'https://virtualpinballspreadsheet.github.io/',
				target: '_blank',
				rel: 'noopener',
				textContent: 'Virtual Pinball Spreadsheet',
			}),
			'. Most files sit behind a login on their host: the page opens in a new tab — download there, then drop the .zip ROM and the .vpx table onto the viewer.',
		),
	)
	dialog.setAttribute('closedby', 'any')
	document.body.append(dialog)

	let games: VpsGame[] = []
	let catalog: Promise<VpsGame[]> | undefined
	const setStatus = (...parts: (Node | string)[]) => status.replaceChildren(...parts)

	const showDetail = (game: VpsGame) => {
		for (const li of results.querySelectorAll('li')) li.classList.toggle('selected', li.dataset.id === game.id)
		const meta = [game.manufacturer, game.year].filter(Boolean).join(' · ')
		detail.replaceChildren(
			el('h4', { textContent: game.name }),
			el('p', { className: 'tb-meta', textContent: meta }),
			fileSection('ROMs', 'rom', game.roms),
			fileSection('VPX tables', 'vpx', game.tables),
		)
	}

	const fileSection = (title: string, kind: Kind, files: VpsFile[]) =>
		el(
			'div',
			{ className: 'tb-files' },
			el('h5', { textContent: `${title} (${files.length})` }),
			...(files.length
				? files.map(file => fileRow(kind, file))
				: [el('p', { className: 'tb-empty', textContent: 'None listed.' })]),
		)

	const fileRow = (kind: Kind, file: VpsFile) => {
		const authors =
			file.authors.length > 3
				? `${file.authors.slice(0, 3).join(', ')} +${file.authors.length - 3}`
				: file.authors.join(', ')
		const head =
			kind === 'rom'
				? [el('code', { textContent: file.version || '?' }), authors && ` · ${authors}`]
				: [file.version && `v${file.version} · `, authors || 'Unknown author']
		const links = file.urls.map(url => linkFor(kind, file, url))
		return el(
			'div',
			{ className: 'tb-file' },
			el('div', { className: 'tb-file-head' }, ...head.filter(Boolean)),
			...(file.features.length
				? [el('div', { className: 'tb-tags', textContent: file.features.join(' · ') })]
				: []),
			...(file.comment ? [el('div', { className: 'tb-comment', textContent: file.comment })] : []),
			el(
				'div',
				{ className: 'tb-links' },
				...(links.length ? links : [el('span', { className: 'tb-empty', textContent: 'No link' })]),
			),
		)
	}

	const pageLink = (url: string) =>
		el('a', { href: url, target: '_blank', rel: 'noopener', textContent: `${hostOf(url)} ↗` })

	// A dropped or loaded ROM mounts on the running table, so either order works.
	const handOff = (kind: Kind, file: VpsFile, url: string, opened: boolean) => {
		const what = kind === 'rom' ? (file.version ? `${file.version}.zip` : 'the ROM zip') : 'the .vpx'
		setStatus(opened ? 'Opened ' : 'Open ', pageLink(url), ` — download ${what} there and drop it onto the viewer.`)
	}

	const linkFor = (kind: Kind, file: VpsFile, url: string) => {
		if (!isDirectFileUrl(url)) {
			const link = pageLink(url)
			link.addEventListener('click', () => handOff(kind, file, url, true))
			return link
		}
		const button = el('button', { type: 'button', textContent: `Load from ${hostOf(url)}` })
		button.addEventListener('click', async () => {
			setStatus(`Checking ${hostOf(url)}…`)
			if (!(await isFetchable(url))) {
				// Not `noopener`: that makes window.open return null, hiding a blocked popup.
				const popup = window.open(url, '_blank')
				if (popup) popup.opener = null
				handOff(kind, file, url, popup !== null)
				return
			}
			syncParam(kind, url)
			if (kind === 'rom') {
				setStatus(`Downloading ${file.version}.zip…`)
				await viewer.preloadRom(url).then(
					() => setStatus(`ROM ${file.version} ready — it mounts on the running table.`),
					error => setStatus(`ROM download failed: ${error?.message ?? error}`),
				)
			} else {
				dialog.close()
				viewer.load(url).catch(error => console.error('[catalog] table load failed', error))
			}
		})
		return button
	}

	const showGames = (list: VpsGame[]) => {
		results.replaceChildren(
			...list.map(game => {
				const counts = `${game.tables.length} table${game.tables.length === 1 ? '' : 's'} · ${game.roms.length} ROM${game.roms.length === 1 ? '' : 's'}`
				const item = el(
					'li',
					{},
					el('strong', { textContent: game.name }),
					el('span', { textContent: [game.manufacturer, game.year, counts].filter(Boolean).join(' · ') }),
				)
				item.dataset.id = game.id
				item.tabIndex = 0
				item.addEventListener('click', () => showDetail(game))
				item.addEventListener('keydown', e => {
					if (e.key === 'Enter') showDetail(game)
				})
				return item
			}),
		)
		if (list.length) showDetail(list[0])
		else detail.replaceChildren()
	}

	const suggestForLoadedTable = () => {
		const romName = romMountFileName(viewer.table?.tableScript, '').replace(/\.zip$/i, '')
		if (!romName) return false
		const matches = findGamesByRom(games, romName)
		setStatus(
			matches.length
				? `The loaded table runs ROM ${romName} — listed by ${matches.length} game${matches.length === 1 ? '' : 's'}:`
				: `The loaded table runs ROM ${romName}; no catalog entry lists it.`,
		)
		showGames(matches)
		return true
	}

	const runSearch = () => {
		const query = search.value.trim()
		if (!query) {
			if (suggestForLoadedTable()) return
			setStatus(`${games.length.toLocaleString()} games with VPX tables or ROMs. Type to search.`)
			showGames([])
			return
		}
		const hits = searchVpsGames(games, query, RESULT_LIMIT)
		const count = `${hits.length}${hits.length === RESULT_LIMIT ? '+' : ''}`
		setStatus(hits.length ? `${count} match${hits.length === 1 ? '' : 'es'}` : `No match for “${query}”.`)
		showGames(hits)
	}

	const ensureCatalog = async () => {
		setStatus('Loading catalog…')
		catalog ??= loadVpsCatalog({
			download: (url, signal) =>
				fetchWithProgress(
					url,
					url === VPS_DB_URL
						? (p: number) => setStatus(`Downloading catalog… ${Math.round(p * 100)}%`)
						: undefined,
					{ signal },
				),
		})
		try {
			games = await catalog
			runSearch()
		} catch (error) {
			catalog = undefined
			setStatus(`Catalog unavailable: ${(error as Error)?.message ?? error}`)
		}
	}

	search.addEventListener('input', () => {
		if (games.length) runSearch()
	})
	// Keys typed or pressed in the dialog must not reach the table's input handlers.
	dialog.addEventListener('keydown', e => e.stopPropagation())
	close.addEventListener('click', () => dialog.close())
	document.getElementById('browse-btn')?.addEventListener('click', () => {
		dialog.showModal()
		search.focus()
		void ensureCatalog()
	})
}
