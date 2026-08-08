// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

const lowerCache = new Map<string, string>()
function lower(s: string): string {
	let r = lowerCache.get(s)
	if (r !== undefined) return r
	r = s.toLowerCase()
	if (lowerCache.size < 4096) lowerCache.set(s, r)
	return r
}

/** Base for VBS-exposed APIs. */
export abstract class VbsApi {
	private propertyMap?: { [key: string]: string }

	protected abstract _getPropertyNames(): string[]

	public _getPropertyName(vbScriptName: string): string {
		if (!this.propertyMap) {
			this.propertyMap = {}
			for (const name of this._getPropertyNames()) {
				this.propertyMap[lower(name)] = name
			}
		}
		return this.propertyMap[lower(vbScriptName)]
	}
}

/** VbsNotImplementedError. */
export class VbsNotImplementedError extends Error {
	constructor() {
		super('This method of the VBScript API has not been implemented.')
	}
}
