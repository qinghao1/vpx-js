export function renderStats(container, data) {
	if (!container) return
	const { fps, draws, trisFmt, balls, tFmt, tHasValue, emuLabel, emuRaw, wasmLabel, wasmReady, backend, mode, isPaused } = data
	const modeCls = mode.includes('PAUSED') ? 'badge--paused' : mode === 'PLAY' ? 'badge--play' : 'badge--viewer'
	const modeLabel = mode === 'PLAY PAUSED' ? 'PAUSED' : mode
	const fpsCls = fps >= 55 ? 'fps--good' : fps >= 30 ? 'fps--mid' : fps > 0 ? 'fps--low' : ''
	container.textContent = ''
	const head = document.createElement('div')
	head.className = 'stats-head'
	const badge = document.createElement('span')
	badge.className = `badge ${modeCls}`
	badge.textContent = modeLabel
	head.append(badge, createSep(), createText(backend), createSep(), createFps(fps, fpsCls))
	container.append(head)
	const grid = document.createElement('div')
	grid.className = 'stats-grid'
	grid.append(
		createItem('Draws', String(draws)),
		createItem('Tris', trisFmt),
		createItem('Balls', String(balls)),
		createItem('Time', tFmt, !tHasValue),
		createItem('Emu', emuLabel, emuRaw === '—'),
		createItem('WASM', wasmLabel, !wasmReady),
	)
	container.append(grid)
}

function createSep() {
	const s = document.createElement('span')
	s.className = 'sep'
	s.textContent = '·'
	return s
}

function createText(txt) {
	const s = document.createElement('span')
	s.textContent = txt
	return s
}

function createFps(fps, cls) {
	const s = document.createElement('span')
	s.className = `fps ${cls}`.trim()
	s.textContent = `${fps} fps`
	const threaded = document.createElement('span')
	threaded.textContent = ' · threaded'
	s.append(threaded)
	return s
}

function createItem(k, v, muted = false) {
	const item = document.createElement('div')
	item.className = 'stats-item'
	const kEl = document.createElement('span')
	kEl.className = 'k'
	kEl.textContent = k
	const vEl = document.createElement('span')
	vEl.className = muted ? 'v v--muted' : 'v'
	vEl.textContent = v
	item.append(kEl, vEl)
	return item
}

export function renderModeHint(hintEl, isPlay) {
	if (!hintEl) return
	hintEl.textContent = ''
	const dot = document.createElement('span')
	dot.className = 'dot'
	hintEl.append(dot)
	const b = document.createElement('b')
	b.textContent = isPlay ? 'Play' : 'Viewer'
	hintEl.append(b, textWithClass(' — ', 'sep-muted'), createText(isPlay ? 'Esc to exit' : 'drag to orbit'), textWithClass(' · ', 'sep-muted'), isPlay ? createPlayHintFragment() : createViewerHintFragment())
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
