import { Buffer } from 'buffer'
import * as pako from 'pako'
export function inflate(buf, cb) {
	try {
		const input = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
		const result = pako.inflate(input)
		cb(null, Buffer.from(result))
	} catch (err) {
		cb(err, null)
	}
}
export function inflateSync(buf) {
	const input = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
	const result = pako.inflate(input)
	return Buffer.from(result)
}
export default { inflate, inflateSync }
