// @ts-nocheck

import { initHelp } from './ui/help-dialog.js'
import { Viewer } from './viewer.js'

void import('../../dist-esm/lib/physics/wasm/kernels.js').then(m => m.getWasmKernels().catch(() => {})).catch(() => {})

const params = new URLSearchParams(location.search)
const viewer = new Viewer({
	queryParam: 'vpx',
	defaultVpx: null,
	viewerMode: params.get('mode') === 'play' ? 'play' : 'viewer',
})
const _isDev = (() => {
	if (import.meta.env?.DEV) return true
	const h = location.hostname
	return h === 'localhost' || h === '127.0.0.1' || h === '' || h === '0.0.0.0'
})()
if (_isDev) window.viewer = viewer
initHelp(viewer)

const vpxParam = params.get('vpx') || params.get('table')
const romParam = params.get('rom')
if (vpxParam) {
	viewer.load().catch(e => console.error('[app] load failed', e))
	if (romParam) viewer.preloadRom?.(romParam)
} else {
	viewer.startLoop()
}

function handleFile(f) {
	if (!f) return
	if (f.name.toLowerCase().endsWith('.vpx')) {
		viewer.loadFromFile(f)
		const u = new URL(location.href)
		u.searchParams.delete('vpx')
		history.replaceState(null, '', u.pathname + u.search)
	} else if (f.name.toLowerCase().endsWith('.zip')) {
		viewer.loadRomFile(f)
	}
}

for (const id of ['file-vpx', 'file-rom']) {
	document.getElementById(id)?.addEventListener('change', e => {
		const f = e.target.files?.[0]
		if (f) handleFile(f)
		e.target.value = ''
	})
}

for (const id of ['picker-vpx', 'picker-rom']) {
	document.getElementById(id)?.addEventListener('click', () => {
		const v = document.getElementById(id === 'picker-vpx' ? 'vpx-input' : 'rom-input')?.value.trim()
		if (!v) return
		const u = new URL(location.href)
		if (id === 'picker-vpx') {
			u.searchParams.set('vpx', v)
			history.replaceState(null, '', u.pathname + u.search)
			viewer.load().catch(console.error)
		} else {
			u.searchParams.set('rom', v)
			history.replaceState(null, '', u.pathname + u.search)
			viewer.preloadRom(v)
		}
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

document.getElementById('dump-log')?.addEventListener('click', () => window.dumpLog?.())
document.getElementById('copy-log')?.addEventListener('click', () => window.copyLog?.())
document.getElementById('toggle-log')?.addEventListener('click', () => {
	const el = document.getElementById('log')
	if (el) el.hidden = !el.hidden
})
