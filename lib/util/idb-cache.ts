// Minimal IndexedDB cache for textures and transpiled VBS.
//
// NOTE: bumping DB_VERSION wipes the whole cache on upgrade (both stores are
// dropped and recreated below). That is intentional: cached payloads are
// version-sensitive (transpiler output, float texture blobs), so a bump must
// invalidate old entries rather than serve stale bytes.
const DB_NAME = 'vpx-js-cache'
const DB_VERSION = 4
const STORE = 'cache'

let cachedDb: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
	if (!cachedDb) {
		const fresh = new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, DB_VERSION)
			req.onupgradeneeded = () => {
				const db = req.result
				if (db.objectStoreNames.contains('textures')) {
					db.deleteObjectStore('textures')
				}
				if (db.objectStoreNames.contains(STORE)) {
					db.deleteObjectStore(STORE)
				}
				db.createObjectStore(STORE)
			}
			req.onsuccess = () => resolve(req.result)
			req.onerror = () => reject(req.error)
		})
		cachedDb = fresh
		fresh.then(undefined, () => {
			if (cachedDb === fresh) cachedDb = null
		})
	}
	return cachedDb
}

export async function idbGet(key: string): Promise<any | undefined> {
	try {
		const db = await openDB()
		return await new Promise((resolve, reject) => {
			const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
			req.onsuccess = () => resolve(req.result as any)
			req.onerror = () => reject(req.error)
		})
	} catch (error) {
		// IDB may be unavailable (private mode, quota, VersionError) or store missing on first open.
		// Cache is optional — return undefined to indicate miss rather than failing the load.
		// Expected: DOMException (AbortError, NotFoundError, InvalidStateError, QuotaExceededError) or ReferenceError if indexedDB is undefined.
		void error
		return undefined
	}
}

export async function idbSet(key: string, val: any): Promise<void> {
	try {
		const db = await openDB()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite')
			tx.objectStore(STORE).put(val, key)
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	} catch (error) {
		// Same contract as idbGet: the cache is optional, so a write failure
		// (private mode, quota, missing indexedDB) resolves instead of
		// rejecting. Callers must not rely on the write having happened.
		void error
	}
}

function djb2(data: Uint8Array): number {
	let h = 5381
	for (let i = 0; i < data.length; i++) h = ((h << 5) + h) ^ data[i]
	return h >>> 0
}

/** djb2 over a string (char codes); same hash class as djb2 above. */
function hashContent(s: string): number {
	let h = 5381
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
	return h >>> 0
}

export function exrCacheKey(name: string, data: Uint8Array, kind: string, max?: number): string {
	// Content hash: a byteLength-only key collides for same-size textures.
	const base = `exr:${name.toLowerCase()}:${kind}:${djb2(data).toString(36)}:${data.length}`
	return typeof max === 'number' && max > 0 ? `${base}:${max}` : base
}

/** Content-hash key for decoded bitmaps (`img:` ≠ `exr:` namespace). */
export function bitmapCacheKey(name: string, data: Uint8Array, mime: string, max?: number): string {
	const base = `img:${name.toLowerCase()}:${mime}:${djb2(data).toString(36)}:${data.length}`
	return typeof max === 'number' && max > 0 ? `${base}:${max}` : base
}

function contentKey(prefix: string, script: string): string {
	return `${prefix}:${hashContent(script).toString(36)}:${script.length}`
}

export function vbsCacheKey(script: string): string {
	// vbs10 versions the transpiler pipeline; bump when output changes.
	// vbs10: `Dim` emits `var` (procedure scope) instead of block-scoped
	// `let` — the emitted JS differs for identical raw scripts.
	return contentKey('vbs10', script)
}

/** Content-hash key for cached grammar ESTrees (`ast:` ≠ `vbs:` namespace). */
export function astCacheKey(script: string): string {
	// ast1 versions the grammar (parse + post-processors); bump independently of vbs10.
	return contentKey('ast1', script)
}
