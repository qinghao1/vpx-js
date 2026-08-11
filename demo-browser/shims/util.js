export function inspect(obj, opts) {
	try {
		return JSON.stringify(obj, null, 2).slice(0, 2000)
	} catch (e) {
		return String(obj)
	}
}
export default { inspect }
