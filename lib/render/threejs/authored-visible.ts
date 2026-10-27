// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Object3D } from 'three'

/**
 * Single home for the authored-visibility flag.
 *
 * The converter stamps it at build time; the lamp updater and the generic
 * visibility path read it. Unstamped nodes (built before the stamp existed)
 * default to visible.
 */
export function getAuthoredVisible(obj: Object3D): boolean {
	return (obj.userData as { __authoredVisible?: boolean }).__authoredVisible ?? true
}

export function setAuthoredVisible(obj: Object3D, visible: boolean): void {
	;(obj.userData as { __authoredVisible?: boolean }).__authoredVisible = visible
}
