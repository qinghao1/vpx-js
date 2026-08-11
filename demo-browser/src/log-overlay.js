export function createHarness(logEl) {
	if (typeof window !== 'undefined' && window.__createHarness) return window.__createHarness(logEl);
	const harnessLog = (window.__makeHarnessLog ? window.__makeHarnessLog(logEl) : (msg,level='info') => {
		try {
			const d=document.createElement('div');
			d.textContent='['+new Date().toLocaleTimeString()+'] '+msg;
			d.className=`log-entry log-entry--${level}`;
			logEl.appendChild(d);
			while(logEl.children.length>600) logEl.removeChild(logEl.firstChild);
			logEl.scrollTop=logEl.scrollHeight;
		} catch {}
	});
	if (typeof window !== 'undefined' && window.__earlyLogs?.length) {
		for (const e of window.__earlyLogs) harnessLog(`[${e.level}] ${e.txt}`, e.level);
		window.__earlyLogs.length=0;
	}
	return {harnessLog};
}
