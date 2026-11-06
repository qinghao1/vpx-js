// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { CONTROL_SCHEME } from '../config.js'

/** Controls dialog: `#help-btn`, `?`/`h` toggle it; leaving play mode closes it. */
export function initHelp(): void {
	const help = document.getElementById('help') as HTMLDialogElement | null
	if (!help) return
	let section = ''
	help.querySelector('.help-grid')!.innerHTML = CONTROL_SCHEME.map(c => {
		let head = ''
		if (c.section && c.section !== section) {
			section = c.section
			head = `<div class="help-section">${section}</div>`
		}
		return `${head}<div class="help-row"><span class="help-label">${c.label}</span><span class="help-keys">${c.help}</span></div>`
	}).join('')

	const toggle = () => (help.open ? help.close() : help.showModal())
	document.getElementById('help-btn')?.addEventListener('click', toggle)
	help.querySelector('[data-close-help]')?.addEventListener('click', () => help.close())
	help.addEventListener('click', e => {
		if (e.target === help) help.close()
	})
	addEventListener(
		'keydown',
		e => {
			// The dialog closes itself on Escape; the key must not also leave play mode.
			if (e.key === 'Escape' && help.open) {
				e.stopPropagation()
				return
			}
			if (e.key === '?' || (e.key === 'h' && !e.ctrlKey && !e.metaKey && !e.repeat)) {
				const t = e.target
				if (
					t instanceof HTMLElement &&
					(t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
				)
					return
				e.preventDefault()
				toggle()
			}
		},
		true,
	)
	addEventListener('viewer:modechange', e => {
		if ((e as CustomEvent).detail?.mode !== 'play') help.close()
	})
}
