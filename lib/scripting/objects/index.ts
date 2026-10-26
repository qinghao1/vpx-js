// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Player } from '../../game/player.js'
import { ERR } from '../stdlib/err.js'
import { VbsProxyHandler } from '../vbs-proxy-handler.js'
import { Dictionary } from './dictionary.js'
import { FileSystemObject } from './file-system-object.js'
import { VpmController } from './vpm-controller.js'
import { WshShell } from './wsh-shell.js'

const factories: Record<string, (player: Player) => object> = {
	'scripting.dictionary': () => new Dictionary(),
	'scripting.filesystemobject': () => new FileSystemObject(),
	'vpinmame.controller': player => new VpmController(player),
	'wscript.shell': () => new WshShell(),
}

/** getObject. */
export function getObject<T>(name: string, player: Player): T | undefined {
	const create = factories[name.toLowerCase()]
	if (!create) {
		return ERR.Raise(429, undefined, "ActiveX component can't create object")
	}
	const obj = create(player)
	return new Proxy(obj, new VbsProxyHandler(obj, Object.getPrototypeOf(obj))) as T
}
