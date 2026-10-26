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
		for (const key of Object.keys(this)) {
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
	}

	public equals(state: ItemState): boolean {
		if (!state) return false
		const other = state as unknown as Record<string, unknown>
		const self = this as unknown as Record<string, unknown>
		for (const key of Object.keys(this)) {
			const mine = asPooledMember(self[key])
			const theirs = asPooledMember(other[key])
			if (mine || theirs) {
				if (!mine || !theirs || !membersEqual(mine, theirs)) return false
			} else if (self[key] !== other[key]) {
				return false
			}
		}
		return true
	}

	public diff(state: ItemState): this {
		const result = this.clone() as unknown as Record<string, unknown>
		const other = state as unknown as Record<string, unknown>
		for (const key of Object.keys(this)) {
			if (key === 'name') continue
			const mine = asPooledMember(result[key])
			const theirs = asPooledMember(other[key])
			const equal = mine || theirs ? !!mine && !!theirs && membersEqual(mine, theirs) : result[key] === other[key]
			if (equal) {
				if (mine) releaseMember(mine)
				delete result[key]
			}
		}
		return result as this
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
