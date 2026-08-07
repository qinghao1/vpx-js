// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../io/biff-parser.js'
import { logger } from '../util/logger.js'

/** Embedded binary (image data). */
export class Binary extends BiffParser {
	public szName!: string
	public szInternalName!: string
	public szPath!: string
	public cdata!: number
	public pos!: number
	public len!: number
	public async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'NAME':
				this.szName = this.getString(buffer, len)
				break
			case 'INME':
				this.szInternalName = this.getString(buffer, len)
				break
			case 'PATH':
				this.szPath = this.getString(buffer, len)
				break
			case 'SIZE':
				this.cdata = this.getInt(buffer)
				break
			case 'DATA':
				this.pos = offset
				this.len = len
				break
			default:
				logger().warn('[Binary.fromTag] Unknown tag "%s".', tag)
		}
		return 0
	}
}
