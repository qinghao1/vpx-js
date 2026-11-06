// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { attachKeyboard, attachPointer, makeHost } from './input/input-manager.js'
import { attachNudge } from './input/nudge-controller.js'

/** Attach every input source to the viewer once, through one host; returns the detach. */
export function attachInput(viewer) {
	const host = makeHost(viewer)
	const ctrl = new AbortController()
	attachKeyboard(host, ctrl.signal)
	attachPointer(host, ctrl.signal)
	attachNudge(viewer, host, ctrl.signal)
	return () => ctrl.abort()
}
