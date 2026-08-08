// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ERR } from '../stdlib/err.js'

/**
 * Object that stores data key/item pairs.
 *
 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/dictionary-object
 */
export class Dictionary<V> {
	private readonly d = new Map<string | number | symbol, V | null>()

	/**
	 * Returns the number of key/item pairs in a Dictionary object.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/count-property-dictionary-object
	 */
	public get Count() {
		return this.d.size
	}

	/**
	 * Sets or returns an item for a specified key in a Dictionary object.
	 * For collections, returns an item based on the specified key. Read/write.
	 *
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/item-property-dictionary-object
	 */
	public Item: { [key: string]: V | null } = new Proxy(this, {
		get: (_target: {}, key: string | number | symbol) => {
			if (this.d.has(key)) {
				return this.d.get(key)
			} else {
				// If key is not found when attempting to return an existing item, a new key is created and its
				// corresponding item is left empty.
				this.d.set(key, null)
				return null
			}
		},
		set: (_target: Dictionary<V>, key: string | number | symbol, value: V) => {
			this.d.set(key, value)
			return true
		},
	})

	/**
	 * Sets a key in a Dictionary object.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/key-property
	 */
	public Key: { [key: string]: V | null } = new Proxy(this, {
		set: (_target: {}, oldKey: string | number | symbol, newKey: string | number | symbol) => {
			if (!this.d.has(oldKey)) {
				ERR.Raise(32811, undefined, 'Element not found')
				return true
			}
			const value = this.d.get(oldKey) as V | null
			this.d.delete(oldKey)
			this.d.set(newKey, value)
			return true
		},
	})

	/**
	 * Adds a key and item pair to a Dictionary object.
	 *
	 * @param key The key associated with the item being added.
	 * @param item The item associated with the key being added.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/add-method-dictionary
	 */
	public Add(key: string | number | symbol, item: V): void {
		if (this.d.has(key)) {
			ERR.Raise(457, undefined, 'This key is already associated with an element of this collection')
		}
		this.d.set(key, item)
	}

	/**
	 * Returns True if a specified key exists in the Dictionary object; False if it does not.
	 *
	 * @param key Key value being searched for in the Dictionary object.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/exists-method
	 */
	public Exists(key: string | number | symbol): boolean {
		return this.d.has(key)
	}

	/**
	 * Returns an array containing all the items in a Dictionary object.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/items-method
	 */
	public Items(): Array<V | null> {
		return Array.from(this.d.values())
	}

	/**
	 * Returns an array containing all existing keys in a Dictionary object.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/keys-method
	 */
	public Keys(): Array<string | number | symbol> {
		return Array.from(this.d.keys())
	}

	/**
	 * Removes a key/item pair from a Dictionary object.
	 * @param key Key associated with the key/item pair that you want to remove from the Dictionary object.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/remove-method-dictionary-object
	 */
	public Remove(key: string | number | symbol) {
		if (!this.d.has(key)) {
			ERR.Raise(32811, undefined, 'Element not found')
		}
		this.d.delete(key)
	}

	/**
	 * The RemoveAll method removes all key, item pairs from a Dictionary object
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/removeall-method
	 */
	public RemoveAll() {
		this.d.clear()
	}
}
