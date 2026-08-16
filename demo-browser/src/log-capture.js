// log-capture shim - replaced by src/ui/log-viewer.ts typed events
// Previously monkey-patched fetch/XHR/console, now handled via document CustomEvent
if (typeof window !== 'undefined') {
	window.__earlyLogs = window.__earlyLogs || []
	window.__logViewerPatched = true
}
