export function fileURLToPath(url) {
	try {
		return decodeURIComponent(new URL(url).pathname)
	} catch {
		return url.replace(/^file:\/\//, '')
	}
}
export function pathToFileURL(p) {
	try {
		return new URL('file://' + p).href
	} catch {
		return 'file://' + p
	}
}
export default { fileURLToPath, pathToFileURL }
