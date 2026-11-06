// @ts-nocheck

import { initHelp } from './ui/help-dialog.js'
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

const options = parseViewerOptions(location.search)
const viewer = new Viewer(options)
const _isDev = (() => {
	if (import.meta.env?.DEV) return true
	const h = location.hostname
	return h === 'localhost' || h === '127.0.0.1' || h === '' || h === '0.0.0.0'
})()
if (_isDev) window.viewer = viewer
initHelp(viewer)

if (options.vpx) {
	viewer.load().catch(e => console.error('[app] load failed', e))
	if (options.rom) viewer.preloadRom(options.rom).catch(e => console.error('[app] rom load failed', e))
} else {
	viewer.startLoop()
}

const syncParam = (key, value) => {
	const u = new URL(location.href)
	u.searchParams.set(key, value)
	history.replaceState(null, '', u.pathname + u.search)
}

function handleFile(f) {
	if (!f) return
	if (f.name.toLowerCase().endsWith('.vpx')) {
		viewer.loadFromFile(f)
		syncParam('vpx', f.name)
	} else if (f.name.toLowerCase().endsWith('.zip')) {
		viewer.loadRomFile(f)
		syncParam('rom', f.name)
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
