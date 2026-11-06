// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// @ts-nocheck
/** Single append-to-panel logger; the Viewer owns it as `viewer.log`. */
export function createLog(logEl) {
	return (msg, level = 'info') => {
		if (logEl) {
			const d = document.createElement('div')
			d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
			d.className = `log-entry log-entry--${level}`
			logEl.appendChild(d)
			while (logEl.children.length > 600) logEl.removeChild(logEl.firstChild)
			logEl.scrollTop = logEl.scrollHeight
		}
		if (level === 'error') console.error('[vpx:err]', msg)
		else console.log('[vpx]', msg)
	}
}
