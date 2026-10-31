// Shared contract for viewer overlays: each overlay owns
// its dirty state, so the viewer loop stays overlay-agnostic.
export interface DirtyOverlay {
	/** True when the overlay visibly changed and the viewer should present. */
	update(): boolean
	/** Rebuilds the overlay for the newly mounted table, if it needs one. */
	syncTable?(table: any): Promise<void> | void
	/** Releases overlay resources, if it holds any. */
	dispose?(): void
}
