// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

const lowerCache = new Map<string, string>()
function lc(s: string): string {
	let r = lowerCache.get(s)
	if (r !== undefined) return r
	r = s.toLowerCase()
	if (lowerCache.size < 4096) lowerCache.set(s, r)
	return r
}

/**
 * A proxy handler that provides case-insensitive access to
 * properties and functions.
 */
/** Proxy handler for VBS late binding. */
export class VbsProxyHandler implements ProxyHandler<any> {
	private readonly __names: { [key: string]: string | number | symbol } = {}

	constructor(obj?: any, proto?: any) {
		if (proto) {
			for (const name of Object.getOwnPropertyNames(proto)) {
				this.__names[lc(name)] = name
			}
		}
		if (obj) {
			for (const name of Object.getOwnPropertyNames(obj)) {
				const k = lc(name)
				if (!this.__names[k]) this.__names[k] = name
			}
		}
	}

	public get(target: any, name: string | number | symbol, receiver: any): any {
		if (typeof name === 'symbol') return target[name]
		const norm = lc(name as string)
		const real = this.__names[norm] ?? (this.__names[norm] = name)
		return target[real]
	}

	public set(target: any, name: string | number | symbol, value: any, receiver: any): boolean {
		if (typeof name === 'symbol') {
			target[name] = value
			return true
		}
		const norm = lc(name as string)
		const real = this.__names[norm] ?? (this.__names[norm] = name)
		target[real] = value
		return true
	}
}
