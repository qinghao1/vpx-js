// @ts-nocheck
// LogViewer: typed event-based logger, replaces window.__earlyLogs / monkey-patching
const earlyLogs = []
let earlyCaptured = true
const origLog = console.log.bind(console)
const origWarn = console.warn.bind(console)
const origError = console.error.bind(console)

function captureEarly(level, ...args) {
	if (!earlyCaptured) return
	earlyLogs.push({ level, txt: args.map(String).join(' '), ts: Date.now() })
	if (earlyLogs.length > 200) earlyLogs.shift()
}

const patchedLog = (...args) => { captureEarly('info', ...args); origLog(...args) }
const patchedWarn = (...args) => { captureEarly('warn', ...args); origWarn(...args) }
const patchedError = (...args) => { captureEarly('error', ...args); origError(...args) }

// Only patch console, not fetch/XHR
if (typeof window !== 'undefined' && !window.__logViewerPatched) {
	window.__logViewerPatched = true
	window.__earlyLogs = earlyLogs
	// minimal patch, no fetch/XHR monkey-patch
	const origConsoleLog = console.log
	console.log = patchedLog
	console.warn = patchedWarn
	console.error = patchedError
}

export function createLogViewer(logEl) {
	const harnessLog = (msg, level = 'info') => {
		try {
			const d = document.createElement('div')
			d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg
			d.className = `log-entry log-entry--${level}`
			logEl.appendChild(d)
			while (logEl.children.length > 600) logEl.removeChild(logEl.firstChild)
			logEl.scrollTop = logEl.scrollHeight
			// dispatch typed event instead of window pollution
			document.dispatchEvent(new CustomEvent('log:entry', { detail: { msg, level } }))
		} catch {}
	}
	if (typeof window !== 'undefined' && window.__earlyLogs?.length) {
		for (const e of window.__earlyLogs) harnessLog(`[${e.level}] ${e.txt}`, e.level)
		window.__earlyLogs.length = 0
		earlyCaptured = false
	}
	return { harnessLog, earlyLogs }
}

export function createHarness(logEl) {
	return createLogViewer(logEl)
}
