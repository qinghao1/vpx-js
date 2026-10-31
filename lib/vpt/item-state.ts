// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix2D } from '../math/matrix.js'
import { Vertex2D, Vertex3D } from '../math/vector.js'

/** Owned pooled value-members: deep-copied by clone/copy/merge, compared by value, pooled by release. */
type PooledMember = Vertex2D | Vertex3D | Matrix2D

function asPooledMember(value: unknown): PooledMember | undefined {
	if (value instanceof Vertex2D || value instanceof Vertex3D || value instanceof Matrix2D) return value
	return undefined
}

function cloneMember(member: PooledMember): PooledMember {
	if (member instanceof Matrix2D) return Matrix2D.claim().set(member)
	return member.clone(true)
}

function setMember(target: PooledMember, source: PooledMember): void {
	if (target instanceof Matrix2D) target.set(source as Matrix2D)
	else if (target instanceof Vertex3D) target.set(source as Vertex3D)
	else target.set((source as Vertex2D).x, (source as Vertex2D).y)
}

function membersEqual(left: PooledMember, right: PooledMember): boolean {
	if (left instanceof Matrix2D) return right instanceof Matrix2D && left.equals(right)
	if (left instanceof Vertex3D) return right instanceof Vertex3D && left.equals(right)
	return right instanceof Vertex2D && left.equals(right)
}

function releaseMember(member: PooledMember): void {
	if (member instanceof Matrix2D) Matrix2D.release(member)
	else if (member instanceof Vertex3D) Vertex3D.release(member)
	else Vertex2D.release(member)
}

/** Per-key shape descriptor: 0 means compared by identity, otherwise a pooled member kind. */
const KIND_PLAIN = 0
const KIND_VERTEX2D = 1
const KIND_VERTEX3D = 2
const KIND_MATRIX2D = 3

function kindOf(value: unknown): number {
	if (value instanceof Matrix2D) return KIND_MATRIX2D
	if (value instanceof Vertex3D) return KIND_VERTEX3D
	if (value instanceof Vertex2D) return KIND_VERTEX2D
	return KIND_PLAIN
}

function isKind(value: unknown, kind: number): boolean {
	switch (kind) {
		case KIND_MATRIX2D:
			return value instanceof Matrix2D
		case KIND_VERTEX3D:
			return value instanceof Vertex3D
		case KIND_VERTEX2D:
			return value instanceof Vertex2D
		default:
			return false
	}
}

/** Uncached single-key copy: the exact historical per-key logic, used whenever values differ. */
function copyKeySlow(target: Record<string, unknown>, source: Record<string, unknown>, key: string): void {
	const sourceMember = asPooledMember(source[key])
	const targetMember = asPooledMember(target[key])
	if (sourceMember && targetMember) {
		setMember(targetMember, sourceMember)
	} else if (sourceMember) {
		target[key] = cloneMember(sourceMember)
	} else {
		if (targetMember) releaseMember(targetMember)
		target[key] = source[key]
	}
}

/**
 * Render state for an item.
 *
 * Vertex/Matrix members are owned: `claim()` must pass fresh copies, `clone()`
 * deep-copies them, `release()` returns them to their pools, and `mergeFrom()`
 * deep-copies them out of (possibly partial) diffs so updaters never alias them.
 */
export abstract class ItemState {
	public name = ''
	public isVisible = true

	/**
	 * Lazily built own-key descriptor. States fix their own-key shape at
	 * construction (all fields assigned in initializers); diff shells are
	 * single-use, so their descriptor costs one build and is never reused.
	 * Every consumer re-verifies the cached kind per key and falls back to
	 * the uncached logic on any deviation, so a shape change can only cost
	 * speed, never correctness.
	 */
	#shape?: { keys: string[]; kinds: number[] }

	private shape(): { keys: string[]; kinds: number[] } {
		let shape = this.#shape
		if (!shape) {
			const self = this as unknown as Record<string, unknown>
			const keys = Object.keys(this)
			shape = { keys, kinds: keys.map(key => kindOf(self[key])) }
			this.#shape = shape
		}
		return shape
	}

	public clone(): this {
		const copy = new (this.constructor as new () => ItemState)() as this
		const source = this as unknown as Record<string, unknown>
		const target = copy as unknown as Record<string, unknown>
		for (const key of Object.keys(this)) {
			const member = asPooledMember(source[key])
			target[key] = member ? cloneMember(member) : source[key]
		}
		return copy
	}

	public copyFrom(state: ItemState): void {
		const source = state as unknown as Record<string, unknown>
		const target = this as unknown as Record<string, unknown>
		const { keys, kinds } = this.shape()
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i] as string
			if (target[key] === source[key]) continue
			const kind = kinds[i] as number
			if (kind !== KIND_PLAIN && isKind(target[key], kind) && isKind(source[key], kind)) {
				setMember(target[key] as PooledMember, source[key] as PooledMember)
			} else {
				copyKeySlow(target, source, key)
			}
		}
	}

	public equals(state: ItemState): boolean {
		if (!state) return false
		const other = state as unknown as Record<string, unknown>
		const self = this as unknown as Record<string, unknown>
		const { keys, kinds } = this.shape()
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i] as string
			if (!ItemState.keysEqual(self, other, key, kinds[i] as number)) return false
		}
		return true
	}

	/**
	 * Single-key equality with a cached-kind fast path. Identity implies
	 * equality for every member type, so differing values always take the
	 * uncached comparison; a shape change can only cost speed.
	 */
	private static keysEqual(
		self: Record<string, unknown>,
		other: Record<string, unknown>,
		key: string,
		kind: number,
	): boolean {
		const mine = self[key]
		const theirs = other[key]
		if (mine === theirs) return true
		if (kind === KIND_PLAIN || !isKind(mine, kind) || !isKind(theirs, kind)) {
			const slowMine = asPooledMember(mine)
			const slowTheirs = asPooledMember(theirs)
			if (slowMine || slowTheirs) return !!slowMine && !!slowTheirs && membersEqual(slowMine, slowTheirs)
			return mine === theirs
		}
		return membersEqual(mine as PooledMember, theirs as PooledMember)
	}

	public diff(state: ItemState): this {
		const self = this as unknown as Record<string, unknown>
		const other = state as unknown as Record<string, unknown>
		// Bare prototype shell: `new` would claim pooled members via field initializers only to overwrite them,
		// and a pooled shell is unreusable since release() keeps keys with undefined values.
		const result = Object.create(Object.getPrototypeOf(this)) as this
		const partial = result as unknown as Record<string, unknown>
		partial['name'] = self['name']
		const { keys, kinds } = this.shape()
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i] as string
			if (key === 'name' || self[key] === other[key]) continue
			const kind = kinds[i] as number
			if (kind !== KIND_PLAIN && isKind(self[key], kind) && isKind(other[key], kind)) {
				if (!membersEqual(self[key] as PooledMember, other[key] as PooledMember)) {
					partial[key] = cloneMember(self[key] as PooledMember)
				}
				continue
			}
			const mine = asPooledMember(self[key])
			const theirs = asPooledMember(other[key])
			const equal = mine || theirs ? !!mine && !!theirs && membersEqual(mine, theirs) : self[key] === other[key]
			if (!equal) partial[key] = mine ? cloneMember(mine) : self[key]
		}
		return result
	}

	/** Merges a (possibly partial) diff into this state, deep-copying pooled members. */
	public mergeFrom(partial: ItemState): void {
		const source = partial as unknown as Record<string, unknown>
		const target = this as unknown as Record<string, unknown>
		for (const key of Object.keys(source)) {
			const sourceMember = asPooledMember(source[key])
			if (sourceMember) {
				const targetMember = asPooledMember(target[key])
				if (targetMember) setMember(targetMember, sourceMember)
				else target[key] = cloneMember(sourceMember)
			} else {
				target[key] = source[key]
			}
		}
	}

	public release(): void {
		const self = this as unknown as Record<string, unknown>
		for (const key of Object.keys(self)) {
			const member = asPooledMember(self[key])
			if (member) {
				releaseMember(member)
				self[key] = undefined
			}
		}
	}

	public getName(): string {
		return this.name
	}
}
