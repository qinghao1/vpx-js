export function open() {}
export function close() {}
export function read() {}
export function readFileSync(path, encoding) {
	try {
		let url = path
		if (typeof path !== 'string') path = String(path)
		if (path.startsWith('/res/')) {
			url = '/@fs/home/qinghao1/projects/vpx-js' + path
		} else if (path.includes('res/meshes')) {
			const m = path.match(/([^/]+\.json)$/)
			if (m) {
				url = '/@fs/home/qinghao1/projects/vpx-js/res/meshes/' + m[1]
			} else {
				url = '/@fs/home/qinghao1/projects/vpx-js/' + path.replace(/^\/+/, '')
			}
		} else if (path.startsWith('/')) {
			url = '/@fs/home/qinghao1/projects/vpx-js' + path
		} else if (path.startsWith('res/')) {
			url = '/@fs/home/qinghao1/projects/vpx-js/' + path
		}
		const xhr = new XMLHttpRequest()
		xhr.open('GET', url, false)
		xhr.send(null)
		if (xhr.status >= 200 && xhr.status < 300) {
			return xhr.responseText
		}
		if (url.startsWith('/@fs')) {
			const fallback = path.startsWith('/') ? path : '/' + path
			const xhr2 = new XMLHttpRequest()
			xhr2.open('GET', fallback, false)
			xhr2.send(null)
			if (xhr2.status >= 200 && xhr2.status < 300) return xhr2.responseText
		}
		console.error('[fs shim] readFileSync failed for', path, '->', url, 'status', xhr.status)
		return ''
	} catch (e) {
		console.error('[fs shim] readFileSync error for', path, e)
		return ''
	}
}
export function readFile(path, encoding) {
	return Promise.resolve(readFileSync(path, encoding))
}
export const promises = { readFile }

export function createReadStream() {
	return null
}
export default { open, close, read, readFileSync, createReadStream }
