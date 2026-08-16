// @ts-nocheck
export class LoadingBar {
	constructor(dom) {
		this.dom = dom
	}
	setBar(pct, txt) {
		if (this.dom.barFill) this.dom.barFill.style.setProperty('--progress', String(Math.max(0, Math.min(100, pct))))
		if (this.dom.barText) this.dom.barText.textContent = txt ?? `${pct.toFixed(0)}%`
	}
	loading(pct, title, detail = '') {
		this.setBar(pct, title)
		if (this.dom.loadTitle) this.dom.loadTitle.textContent = title
		if (this.dom.loadDetail) this.dom.loadDetail.textContent = detail
		document.dispatchEvent(new CustomEvent('loading:progress', { detail: { pct, title, detail } }))
	}
	setStreamProgress(done, total) {
		const pct = total ? Math.round((done / total) * 100) : 0
		if (this.dom.streamFill) this.dom.streamFill.style.setProperty('--progress', String(pct))
		if (this.dom.streamText) this.dom.streamText.textContent = total ? `${done}/${total} · ${pct}%` : `${pct}%`
	}
	showStream() {
		const w = this.dom.streamWrap
		if (!w) return
		w.hidden = false
		requestAnimationFrame(() => w.classList.add('show'))
	}
	hideStream() {
		const w = this.dom.streamWrap
		if (!w) return
		w.classList.remove('show')
		setTimeout(() => { if (!w.classList.contains('show')) w.hidden = true }, 400)
	}
	showCanvas(canvas) {
		if (this.dom.dropzone) this.dom.dropzone.hidden = true
		if (this.dom.wrap) this.dom.wrap.hidden = false
		if (this.dom.loading) this.dom.loading.hidden = true
		canvas?.focus()
	}
	setStatus(msg) {
		if (this.dom.subtitle) this.dom.subtitle.textContent = msg
		if (this.dom.status) this.dom.status.textContent = msg
	}
}
