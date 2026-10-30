// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { VbsApi } from '../vbs-api.js'

export class VbsMath extends VbsApi {
	public pow(x: number, y: number) {
		return x ** y
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(VbsMath.prototype)
	}
}
