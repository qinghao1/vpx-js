// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Valid `m_modulate_vs_add` window is (0,1). */
export const MODULATE_MIN = 0.0001
export const MODULATE_MAX = 0.9999

/** Native default (`Settings_properties.inl`). */
export const DEFAULT_MODULATE = 0.9

/** Backend-neutral clamp for the flasher modulate-vs-add uniform. */
export function clampModulateVsAdd(value?: number, fallback = DEFAULT_MODULATE): number {
	const v = value ?? fallback
	return Number.isNaN(v) ? MODULATE_MAX : Math.max(MODULATE_MIN, Math.min(MODULATE_MAX, v))
}
