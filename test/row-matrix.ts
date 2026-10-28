// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Matrix3D } from '../lib/math/matrix.js'

export type Row4 = number[][]

export const rowIdentity = (): Row4 => [
	[1, 0, 0, 0],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
	[0, 0, 0, 1],
]

export const rowTranslate = (x: number, y: number, z: number): Row4 => [
	[1, 0, 0, 0],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
	[x, y, z, 1],
]

export const rowScale = (sx: number, sy: number, sz: number): Row4 => [
	[sx, 0, 0, 0],
	[0, sy, 0, 0],
	[0, 0, sz, 0],
	[0, 0, 0, 1],
]

export const rowRotateX = (a: number): Row4 => {
	const c = Math.cos(a)
	const s = Math.sin(a)
	return [
		[1, 0, 0, 0],
		[0, c, s, 0],
		[0, -s, c, 0],
		[0, 0, 0, 1],
	]
}

export const rowRotateY = (a: number): Row4 => {
	const c = Math.cos(a)
	const s = Math.sin(a)
	return [
		[c, 0, -s, 0],
		[0, 1, 0, 0],
		[s, 0, c, 0],
		[0, 0, 0, 1],
	]
}

export const rowRotateZ = (a: number): Row4 => {
	const c = Math.cos(a)
	const s = Math.sin(a)
	return [
		[c, s, 0, 0],
		[-s, c, 0, 0],
		[0, 0, 1, 0],
		[0, 0, 0, 1],
	]
}

export const rowMul = (a: Row4, b: Row4): Row4 => {
	const c = rowIdentity()
	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 4; j++) {
			let s = 0
			for (let k = 0; k < 4; k++) {
				s += (a[i]?.[k] ?? 0) * (b[k]?.[j] ?? 0)
			}
			const row = c[i]
			if (row) {
				row[j] = s
			}
		}
	}
	return c
}

export const toRow = (m: Matrix3D): Row4 => [
	[m._11, m._12, m._13, m._14],
	[m._21, m._22, m._23, m._24],
	[m._31, m._32, m._33, m._34],
	[m._41, m._42, m._43, m._44],
]

export const rowClose = (a: Row4, b: Row4, eps = 1e-5): boolean => {
	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 4; j++) {
			if (Math.abs((a[i]?.[j] ?? 0) - (b[i]?.[j] ?? 0)) > eps) {
				return false
			}
		}
	}
	return true
}
