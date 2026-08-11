export function basename(p, ext) {
	if (!p) return ''
	const parts = p.split(/[\\/]/)
	let b = parts.pop()
	if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length)
	return b
}
export function dirname(p) {
	const i = p.lastIndexOf('/')
	return i >= 0 ? p.slice(0, i) : '.'
}
export function resolve(...args) {
	return args.join('/')
}
export function extname(p) {
	const i = p.lastIndexOf('.')
	return i >= 0 ? p.slice(i) : ''
}
export function join(...args) {
	return args.join('/').replace(/\/\//g, '/')
}
export default { basename, dirname, resolve, extname, join }
