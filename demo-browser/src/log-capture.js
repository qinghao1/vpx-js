window.global = window
window.process = window.process || {
	env: {},
	cwd: () => '/',
	on: () => {},
	once: () => {},
	off: () => {},
	nextTick: (cb, ...a) => setTimeout(() => cb(...a), 0),
}
window.Buffer = window.Buffer || { isBuffer: () => false }
// Early harness: capture all errors before module loads so import failures are visible in #log (no manual forwarding needed)
;(() => {
	window.__earlyLogs = []
	const origErr = console.error,
		origWarn = console.warn,
		origLog = console.log,
		origDebug = console.debug || console.log,
		origInfo = console.info || console.log,
		origTrace = console.trace || console.log
	function push(level, args) {
		const txt = args
			.map(a => {
				try {
					if (typeof a === 'string') return a
					if (a && a.stack) return a.stack
					if (a && a.message) return a.message
					return JSON.stringify(a).slice(0, 2000)
				} catch {
					return String(a)
				}
			})
			.join(' ')
		window.__earlyLogs.push({ level, txt, t: new Date().toLocaleTimeString() })
		try {
			const el = document.getElementById('log')
			if (el) {
				const d = document.createElement('div')
				d.textContent = '[' + new Date().toLocaleTimeString() + '] [' + level + '] ' + txt.slice(0, 3000)
				d.style.whiteSpace = 'pre-wrap'
				d.style.wordBreak = 'break-word'
				d.style.fontFamily = 'ui-monospace, SFMono-Regular, monospace'
				if (level === 'error') d.style.color = '#ff6b6b'
				else if (level === 'warn') d.style.color = '#ffcc66'
				else if (level === 'debug') d.style.color = '#8be9fd'
				else d.style.color = '#e6e6e6'
				el.appendChild(d)
				while (el.children.length > 700) el.removeChild(el.firstChild)
				el.scrollTop = el.scrollHeight
			}
		} catch {}
	}
	console.error = function (...a) {
		push('error', a)
		return origErr.apply(this, a)
	}
	console.warn = function (...a) {
		push('warn', a)
		return origWarn.apply(this, a)
	}
	console.log = function (...a) {
		push('info', a)
		return origLog.apply(this, a)
	}
	console.debug = function (...a) {
		push('debug', a)
		return origDebug.apply(this, a)
	}
	try {
		console.info = function (...a) {
			push('info', a)
			return origInfo.apply(this, a)
		}
	} catch {}
	try {
		console.trace = function (...a) {
			push('debug', a)
			return origTrace.apply(this, a)
		}
	} catch {}
	// capture resource and JS errors with capture phase so <script> <link> failures are seen
	window.addEventListener(
		'error',
		e => {
			const msg = e.message || (e.error && e.error.message) || 'unknown'
			const src = e.filename
				? ` at ${e.filename}:${e.lineno}:${e.colno}`
				: e.target && e.target.src
					? ` src=${e.target.src}`
					: ''
			push('error', [`[window.onerror] ${msg}${src}`])
			// also log vite import-analysis failures that appear as error events with no filename
			if (e.target && e.target.tagName)
				push('error', [
					`[resource error] <${e.target.tagName.toLowerCase()} src="${e.target.src || e.target.href || ''}">`,
				])
		},
		true,
	)
	window.addEventListener('unhandledrejection', e => {
		const r = e.reason
		push('error', [`[unhandledrejection] ${(r && (r.stack || r.message)) || String(r)}`])
	})
	window.addEventListener('vite:preloadError', e =>
		push('error', [`[vite:preloadError] ${e.payload || e.message || JSON.stringify(e)}`]),
	)
	window.addEventListener('vite:error', e =>
		push('error', [`[vite:error] ${e.detail || e.message || JSON.stringify(e)}`]),
	)
	// Observe vite error overlay element (#vite-error-overlay) if injected
	try {
		const mo = new MutationObserver(muts => {
			for (const m of muts) {
				for (const n of m.addedNodes) {
					if (
						(n && n.tagName && n.id === 'vite-error-overlay') ||
						(n.shadowRoot &&
							n.shadowRoot.innerHTML &&
							n.shadowRoot.innerHTML.includes('Failed to resolve import'))
					) {
						const txt = n.outerHTML ? n.outerHTML.slice(0, 4000) : (n.textContent || '').slice(0, 4000)
						push('error', [`[vite-overlay] ${txt}`])
					}
					if (n && n.textContent && n.textContent.includes('Failed to resolve import')) {
						push('error', [`[vite-overlay] ${n.textContent.slice(0, 3000)}`])
					}
				}
			}
		})
		mo.observe(document.documentElement, { childList: true, subtree: true })
	} catch {}
	// Patch fetch to log non-ok status and exceptions (so 404s appear in #log without manual forwarding)
	try {
		const origFetch = window.fetch
		window.fetch = async (...args) => {
			try {
				const res = await origFetch(...args)
				if (!res.ok) {
					// clone? don't consume body
					push('error', [`[fetch ${res.status}] ${args[0]} — ${res.statusText}`])
				}
				return res
			} catch (e) {
				push('error', [`[fetch failed] ${args[0]} — ${e.message || e}`])
				throw e
			}
		}
	} catch {}
	// Patch XHR to log HTTP errors (>=400)
	try {
		const origOpen = XMLHttpRequest.prototype.open
		const origSend = XMLHttpRequest.prototype.send
		XMLHttpRequest.prototype.open = function (method, url, ...rest) {
			this.__harnessUrl = url
			this.__harnessMethod = method
			return origOpen.call(this, method, url, ...rest)
		}
		XMLHttpRequest.prototype.send = function (...a) {
			this.addEventListener('loadend', function () {
				try {
					if (this.status >= 400) {
						push('error', [
							`[xhr ${this.status}] ${this.__harnessMethod} ${this.__harnessUrl} — ${this.statusText}`,
						])
					}
				} catch {}
			})
			this.addEventListener('error', function () {
				try {
					push('error', [`[xhr error] ${this.__harnessMethod} ${this.__harnessUrl}`])
				} catch {}
			})
			return origSend.apply(this, a)
		}
	} catch {}
	window.__harnessPush = push
	window.__makeHarnessLog = function(logEl) {
		return function harnessLog(msg, level='info') {
			try {
				const d=document.createElement('div');
				d.textContent='['+new Date().toLocaleTimeString()+'] '+msg;
				d.style.cssText='white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;';
				d.style.color=level==='error'?'#ff6b6b':level==='warn'?'#ffcc66':level==='debug'?'#8be9fd':'#e6e6e6';
				logEl.appendChild(d);
				while(logEl.children.length>600) logEl.removeChild(logEl.firstChild);
				logEl.scrollTop=logEl.scrollHeight;
			} catch {}
		}
	}
	window.__createHarness = function(logEl) {
		const harnessLog=window.__makeHarnessLog(logEl);
		try {
			if(window.__earlyLogs?.length){
				for(const e of window.__earlyLogs) harnessLog(`[${e.level}] ${e.txt}`,e.level);
				window.__earlyLogs.length=0;
			}
		}catch{}
		return {harnessLog};
	}
	// Also expose a helper to dump early logs via console
	window.__dumpHarness = () => window.__earlyLogs.map(e => `[${e.t}] [${e.level}] ${e.txt}`).join('\n')
})()
