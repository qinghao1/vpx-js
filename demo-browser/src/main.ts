// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// @ts-nocheck

import { crossOriginIsolate } from './cross-origin-isolation.js'
import { isDev } from './env.js'
import { createTestApi } from './test-api.js'
import { initHelp } from './ui/help-dialog.js'
import { initTableBrowser } from './ui/table-browser.js'
import { Viewer } from './viewer.js'

function parseViewerOptions(search) {
	const params = new URLSearchParams(search)
	return {
		vpx: params.get('vpx') || params.get('table'),
		rom: params.get('rom'),
		viewerMode: params.get('mode') === 'play' ? 'play' : 'viewer',
		antialias: !params.has('noaa'),
		batched: !params.has('nobatched'),
		forceWebGL: params.has('webgl'),
	}
}

if (import.meta.env.VITE_COI_SW) await crossOriginIsolate()

const options = parseViewerOptions(location.search)
const viewer = new Viewer(options)
// Dev-only handles for humans and e2e: the viewer for scene inspection,
// `vpx` for the typed test surface. Never present in production builds.
if (isDev) {
	window.viewer = viewer
	window.vpx = createTestApi(viewer)
}
initHelp(viewer)

if (options.vpx) {
	viewer.load(options.vpx).catch(e => console.error('[app] load failed', e))
	if (options.rom) viewer.preloadRom(options.rom).catch(e => console.error('[app] rom load failed', e))
} else {
	viewer.startLoop()
}

// Sync only URLs the server can fetch on reload; dropped local files have no URL.
const syncParam = (key, value) => {
	const u = new URL(location.href)
	u.searchParams.set(key, value)
	history.replaceState(history.state, '', u.pathname + u.search)
}
initTableBrowser(viewer, syncParam)

function handleFile(f) {
	if (!f) return
	if (f.name.toLowerCase().endsWith('.vpx')) {
		viewer.loadFromFile(f).catch(e => console.error('[app] file load failed', e))
	} else if (f.name.toLowerCase().endsWith('.zip')) {
		viewer.loadRomFile(f).catch(e => console.error('[app] rom file load failed', e))
	}
}

for (const id of ['file-vpx', 'file-rom']) {
	document.getElementById(id)?.addEventListener('change', e => {
		const f = e.target.files?.[0]
		if (f) handleFile(f)
		e.target.value = ''
	})
}

const dropzone = document.getElementById('canvas-wrap') || document.body
dropzone.addEventListener('dragover', e => {
	e.preventDefault()
	dropzone.classList.add('drag')
})
dropzone.addEventListener('dragleave', e => {
	if (e.target === dropzone) dropzone.classList.remove('drag')
})
dropzone.addEventListener('drop', e => {
	e.preventDefault()
	dropzone.classList.remove('drag')
	for (const f of e.dataTransfer.files) handleFile(f)
})

const logEl = document.getElementById('log')
const logText = () => Array.from(logEl?.children ?? [], entry => entry.textContent).join('\n')
document.getElementById('dump-log')?.addEventListener('click', () => console.log(logText()))
document.getElementById('copy-log')?.addEventListener('click', () => {
	navigator.clipboard.writeText(logText()).catch(e => console.warn('[app] copy log failed', e))
})
document.getElementById('toggle-log')?.addEventListener('click', () => {
	if (logEl) logEl.hidden = !logEl.hidden
})
