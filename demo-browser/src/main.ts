// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { crossOriginIsolate, showIsolationNotice } from './cross-origin-isolation.js'
import { isDev, isLowQuality } from './env.js'
import { initTableBrowser } from './ui/table-browser.js'
import { Viewer } from './viewer.js'

function parseViewerOptions(search: string) {
	const params = new URLSearchParams(search)
	// MSAA render targets are the first thing to OOM on phones, so
	// low-quality devices default off; ?aa / ?noaa force it on / off.
	let antialias = !isLowQuality()
	if (params.has('aa')) antialias = true
	else if (params.has('noaa')) antialias = false
	return {
		vpx: params.get('vpx') || params.get('table'),
		rom: params.get('rom'),
		viewerMode: params.get('mode') === 'play' ? 'play' : 'viewer',
		antialias,
		batched: !params.has('nobatched'),
		forceWebGL: params.has('webgl'),
	}
}

if (import.meta.env.VITE_COI_SW) {
	const isolation = await crossOriginIsolate()
	if (isolation !== true) showIsolationNotice(isolation)
}

const options = parseViewerOptions(location.search)
const viewer = new Viewer(options)
// Dev and localhost handles for humans and e2e: the viewer for scene
// inspection, `vpx` for the typed test surface.
if (isDev) {
	// Dynamic import keeps the e2e surface out of the main bundle; the chunk
	// is only fetched on dev/localhost (`isDev`), never on the public site.
	const { createTestApi } = await import('./test-api.js')
	Object.assign(window, { viewer, vpx: createTestApi(viewer) })
}

/** The viewer reports a failed load on its loading card and log; this keeps the rejection handled. */
const reportFailure = (what: string) => (error: unknown) => console.error(`[app] ${what} failed`, error)

if (options.vpx) {
	viewer.load(options.vpx).catch(reportFailure('load'))
	if (options.rom) viewer.preloadRom(options.rom).catch(reportFailure('rom load'))
} else {
	viewer.startLoop()
}

/**
 * Mirror the open table/ROM in the URL so a reload refetches it. Local files
 * sync by file name (page-relative on reload); a new table also drops the ROM.
 */
const syncParam = (key: 'vpx' | 'rom', value?: string) => {
	const url = new URL(location.href)
	if (key === 'vpx') for (const stale of ['table', 'rom']) url.searchParams.delete(stale)
	if (value) url.searchParams.set(key, value)
	else url.searchParams.delete(key)
	history.replaceState(history.state, '', url)
}
initTableBrowser(viewer, syncParam)

// Tables go first: a ROM belongs to the table it arrives with.
function openFiles(files: Iterable<File>) {
	const list = [...files]
	const named = (ext: string) => list.filter(f => f.name.toLowerCase().endsWith(ext))
	for (const f of named('.vpx')) {
		syncParam('vpx', f.name)
		viewer.loadFromFile(f).catch(reportFailure('load'))
	}
	for (const f of named('.zip')) {
		syncParam('rom', f.name)
		viewer.loadRomFile(f).catch(reportFailure('rom load'))
	}
}

for (const id of ['file-vpx', 'file-rom']) {
	const input = document.getElementById(id) as HTMLInputElement | null
	input?.addEventListener('change', () => {
		if (input.files) openFiles(input.files)
		input.value = ''
	})
}

const isFileDrag = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
addEventListener('dragover', e => {
	if (!isFileDrag(e)) return
	e.preventDefault()
	document.body.classList.add('drag')
})
addEventListener('dragleave', e => {
	if (!e.relatedTarget) document.body.classList.remove('drag')
})
addEventListener('drop', e => {
	if (!isFileDrag(e)) return
	e.preventDefault()
	document.body.classList.remove('drag')
	if (e.dataTransfer) openFiles(e.dataTransfer.files)
})
