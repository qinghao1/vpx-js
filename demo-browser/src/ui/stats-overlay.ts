// @ts-nocheck
function setText(el, v) {
	if (el.textContent !== v) el.textContent = v
}

function setClass(el, v) {
	if (el.className !== v) el.className = v
}

// renderStats runs 2x/s on the live HUD: rebuild the subtree once per
// container, then only touch textContent/className when values change, so
// steady values cost no createElement, no container wipe, no restyle.
const statsCache = new WeakMap()

const STAT_KEYS = ['Draws', 'Tris', 'Balls', 'Time', 'Emu', 'WASM']

function buildStats() {
	const head = document.createElement('div')
	head.className = 'stats-head'
	const badge = document.createElement('span')
	const sep1 = document.createElement('span')
	sep1.className = 'sep'
	sep1.textContent = '·'
	const backend = document.createElement('span')
	const sep2 = document.createElement('span')
	sep2.className = 'sep'
	sep2.textContent = '·'
	const fps = document.createElement('span')
	const fpsText = document.createTextNode('')
	const threaded = document.createElement('span')
	threaded.textContent = ' · threaded'
	fps.append(fpsText, threaded)
	head.append(badge, sep1, backend, sep2, fps)
	const grid = document.createElement('div')
	grid.className = 'stats-grid'
	const values = []
	for (let i = 0; i < STAT_KEYS.length; i++) {
		const item = document.createElement('div')
		item.className = 'stats-item'
		const kEl = document.createElement('span')
		kEl.className = 'k'
		kEl.textContent = STAT_KEYS[i]
		const vEl = document.createElement('span')
		item.append(kEl, vEl)
		grid.append(item)
		values.push({ kEl, vEl })
	}
	return { head, badge, backend, fps, fpsText, grid, values }
}

export function renderStats(container, data) {
	if (!container) return
	const { fps, draws, trisFmt, balls, tFmt, tHasValue, emuLabel, emuRaw, wasmLabel, wasmReady, backend, mode } = data
	const modeCls = mode.includes('PAUSED') ? 'badge--paused' : mode === 'PLAY' ? 'badge--play' : 'badge--viewer'
	const modeLabel = mode === 'PLAY PAUSED' ? 'PAUSED' : mode
	const fpsCls = fps >= 55 ? 'fps--good' : fps >= 30 ? 'fps--mid' : fps > 0 ? 'fps--low' : ''
	let c = statsCache.get(container)
	if (!c?.head.isConnected) {
		c = buildStats()
		container.textContent = ''
		container.append(c.head, c.grid)
		statsCache.set(container, c)
	}
	setClass(c.badge, `badge ${modeCls}`)
	setText(c.badge, modeLabel)
	setText(c.backend, backend)
	setClass(c.fps, `fps ${fpsCls}`.trim())
	setText(c.fpsText, `${fps} fps`)
	const rows = [
		[String(draws), false],
		[trisFmt, false],
		[String(balls), false],
		[tFmt, !tHasValue],
		[emuLabel, emuRaw === '—'],
		[wasmLabel, !wasmReady],
	]
	for (let i = 0; i < rows.length; i++) {
		const [v, muted] = rows[i]
		const { vEl } = c.values[i]
		setText(vEl, v)
		setClass(vEl, muted ? 'v v--muted' : 'v')
	}
}

function createText(txt) {
	const s = document.createElement('span')
	s.textContent = txt
	return s
}

export function renderModeHint(hintEl, isPlay) {
	if (!hintEl) return
	hintEl.textContent = ''
	const dot = document.createElement('span')
	dot.className = 'dot'
	hintEl.append(dot)
	const b = document.createElement('b')
	b.textContent = isPlay ? 'Play' : 'Viewer'
	hintEl.append(
		b,
		textWithClass(' — ', 'sep-muted'),
		createText(isPlay ? 'Esc to exit' : 'drag to orbit'),
		textWithClass(' · ', 'sep-muted'),
		isPlay ? createPlayHintFragment() : createViewerHintFragment(),
	)
}

function textWithClass(txt, cls) {
	const s = document.createElement('span')
	if (cls) s.className = cls
	s.textContent = txt
	return s
}

function createPlayHintFragment() {
	const frag = document.createDocumentFragment()
	frag.append(createText('P pause'), textWithClass(' · ', 'sep-muted'), createText('? help'))
	return frag
}

function createViewerHintFragment() {
	const frag = document.createDocumentFragment()
	frag.append(createText('click cabinet to '))
	const b = document.createElement('b')
	b.textContent = 'Play'
	frag.append(b)
	return frag
}
