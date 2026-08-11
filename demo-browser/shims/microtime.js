export function now() {
	return Date.now() * 1000
}
export function nowDouble() {
	return Date.now() / 1000
}
export function nowStruct() {
	return [Math.floor(Date.now() / 1000), (Date.now() % 1000) * 1000000]
}
export default { now, nowDouble, nowStruct }
