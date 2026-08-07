// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * A proxy handler that provides case-insensitive access to
 * properties and functions.
 */
export class VbsProxyHandler implements ProxyHandler<any> {
	// tslint:disable-next-line:variable-name
	private readonly __names: { [key: string]: string | number | symbol } = {}

	/**
	 * Creates the handler. Pass in prototype and object instance if available.
	 *
	 * Object instance will index all currently set properties, while the
	 * prototype also includes method names.
	 *
	 * @param obj Object instance
	 * @param proto Prototype of object instance
	 */
	constructor(obj?: any, proto?: any) {
		if (proto) {
			for (const name of Object.getOwnPropertyNames(proto)) {
				this.__names[name.toLowerCase()] = name
			}
		}
		if (obj) {
			for (const name of Object.getOwnPropertyNames(obj)) {
				if (!this.__names[name.toLowerCase()]) {
					this.__names[name.toLowerCase()] = name
				}
			}
		}
	}

	public get(target: any, name: string | number | symbol, receiver: any): any {
		const normName = typeof name === 'string' ? name.toLowerCase() : name.toString()
		let realName = name
		if (!this.__names[normName]) {
			this.__names[normName] = realName
		} else {
			realName = this.__names[normName]
		}
		return target[realName]
	}

	public set(target: any, name: string | number | symbol, value: any, receiver: any): boolean {
		const normName = typeof name === 'string' ? name.toLowerCase() : name.toString()
		let realName = name
		if (!this.__names[normName]) {
			this.__names[normName] = realName
		} else {
			realName = this.__names[normName]
		}
		target[realName] = value
		return true
	}
}
