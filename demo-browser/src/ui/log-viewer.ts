// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/** The page log: appends to the debug panel's log element (last 600 entries) and mirrors to the console. */
export function createLog(logEl: HTMLElement) {
	return (msg: string, level = 'info'): void => {
		const entry = document.createElement('div')
		entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
		entry.className = `log-entry log-entry--${level}`
		logEl.appendChild(entry)
		while (logEl.children.length > 600) logEl.firstChild?.remove()
		logEl.scrollTop = logEl.scrollHeight
		if (level === 'error') console.error('[vpx:err]', msg)
		else console.log('[vpx]', msg)
	}
}
