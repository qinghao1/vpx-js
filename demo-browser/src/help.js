import { CONTROL_SCHEME } from './config.js'

export function initHelp(viewer) {
	const help = document.getElementById('help')
	const btn = document.getElementById('help-btn')
	if (!help) return
	const isDialog = help instanceof HTMLDialogElement
	const closeBtn = help.querySelector('[data-close-help]')

	const grid = help.querySelector('.help-grid')
	if (grid && !grid.dataset.populated) {
		grid.innerHTML = CONTROL_SCHEME.map(
			c =>
				`<div class="help-row"><span class="help-label">${c.label}</span><span class="help-keys">${c.help}</span></div>`,
		).join('')
		grid.dataset.populated = '1'
	}

	const isOpen = () => (isDialog ? help.open : !help.hidden)
	const open = () => {
		if (isDialog) {
			if (!help.open) {
				try {
					help.showModal()
				} catch {
					help.setAttribute('open', '')
				}
			}
		} else {
			help.hidden = false
		}
	}
	const close = () => {
		if (isDialog) {
			if (help.open) help.close()
		} else {
			help.hidden = true
		}
	}
	const toggle = () => (isOpen() ? close() : open())

	btn?.addEventListener('click', toggle)
	closeBtn?.addEventListener('click', close)
	help.addEventListener('click', e => {
		if (e.target === help) close()
	})

	addEventListener(
		'keydown',
		e => {
			if (e.key === 'Escape' && isOpen()) {
				e.stopPropagation()
				if (!isDialog) close()
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

	const sync = mode => {
		if (mode !== 'play') close()
	}
	sync(viewer?.viewerMode ?? 'viewer')
	addEventListener('viewer:modechange', e => sync(e.detail?.mode))
}
