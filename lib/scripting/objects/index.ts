// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Player } from '../../game/player.js'
import { ERR } from '../stdlib/err.js'
import { VbsProxyHandler } from '../vbs-proxy-handler.js'
import { Dictionary } from './dictionary.js'
import { FileSystemObject } from './file-system-object.js'
import { VpmController } from './vpm-controller.js'
import { WshShell } from './wsh-shell.js'

export function getObject<T>(name: string, player: Player): T | void {
	switch (name.toLowerCase()) {
		case 'scripting.dictionary': {
			const dictionary = new Dictionary()
			return new Proxy(dictionary, new VbsProxyHandler(dictionary, Dictionary.prototype))
		}

		case 'scripting.filesystemobject': {
			const fso = new FileSystemObject()
			return new Proxy(fso, new VbsProxyHandler(fso, FileSystemObject.prototype))
		}

		case 'vpinmame.controller': {
			const vpc = new VpmController(player)
			return new Proxy(vpc, new VbsProxyHandler(vpc, VpmController.prototype))
		}

		case 'wscript.shell': {
			const wss = new WshShell()
			return new Proxy(wss, new VbsProxyHandler(wss, WshShell.prototype))
		}
	}
	ERR.Raise(429, undefined, "ActiveX component can't create object")
}
