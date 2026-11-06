// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Shared contract for viewer overlays: each overlay owns
// its dirty state, so the viewer loop stays overlay-agnostic.
export interface DirtyOverlay {
	/** True when the overlay visibly changed and the viewer should present. */
	update(): boolean
	/** Rebuilds the overlay for the newly mounted table, if it needs one. */
	syncTable?(table: any): Promise<void> | void
}
