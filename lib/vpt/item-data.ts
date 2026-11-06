// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import type { Storage } from '../io/ole-doc.js'

/** Base for VPX item data parsed from OLE storage. */
export abstract class ItemData extends BiffParser {
	public timer = new TimerDataRoot()
	public name!: string

	public constructor(public readonly itemName: string) {
		super()
	}

	public getName(): string {
		return this.name
	}

	protected async getData(storage: Storage, itemName: string, offset: number, len: number): Promise<Uint8Array> {
		return storage.read(itemName, offset, len)
	}

	protected getCommonBlock(buffer: Uint8Array, tag: string, _len: number): void {
		switch (tag) {
			case 'NAME':
				this.name = this.getWideString(buffer, _len)
				break
			case 'TMON':
				this.timer.enabled = this.getBool(buffer)
				break
			case 'TMIN':
				this.timer.interval = this.getInt(buffer)
				break
			default:
				break
		}
	}
}

export class TimerDataRoot {
	public interval = 100
	public enabled = true
}
