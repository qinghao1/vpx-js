// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
export * from './input/input-manager.js'
export * from './input/nudge-controller.js'

import { attachKeyboardHost, attachPointerHost, makeHost } from './input/input-manager.js'
import { attachNudgeHost, registerPadPoll } from './input/nudge-controller.js'
/** Wire keyboard, pointer/touch, and nudge input through one host and one lifetime. */
export function attachInput(viewer) {
	const host = makeHost(viewer)
	const ctrl = new AbortController()
	attachKeyboardHost(host, ctrl.signal)
	attachPointerHost(host, ctrl.signal)
	attachNudgeHost(host, ctrl.signal)
	const releasePadPoll = registerPadPoll(viewer, host)
	return () => {
		releasePadPoll()
		ctrl.abort()
	}
}
