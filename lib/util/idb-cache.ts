// Minimal IndexedDB cache for textures and transpiled VBS.
const DB_NAME = 'vpx-js-cache'
const DB_VERSION = 3
const STORE = 'cache'

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
			// Clear old cache on version bump
			try { if (db.objectStoreNames.contains('textures')) db.deleteObjectStore('textures') } catch {}
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

function getStore(db: IDBDatabase, mode: IDBTransactionMode) {
	try { return db.transaction(STORE, mode).objectStore(STORE) } catch { return db.transaction('textures', mode).objectStore('textures') }
}

export async function idbGet(key: string): Promise<any | undefined> {
	try {
		const db = await openDB()
		return await new Promise((resolve, reject) => {
			let store: IDBObjectStore
			try { store = getStore(db, 'readonly') } catch { resolve(undefined); return }
			const req = store.get(key)
			req.onsuccess = () => resolve(req.result as any)
			req.onerror = () => reject(req.error)
		})
	} catch { return undefined }
}

export async function idbSet(key: string, val: any): Promise<void> {
	try {
		const db = await openDB()
		await new Promise<void>((resolve, reject) => {
			let store: IDBObjectStore
			try { store = getStore(db, 'readwrite') } catch { resolve(); return }
			store.put(val, key)
			store.transaction.oncomplete = () => resolve()
			store.transaction.onerror = () => reject(store.transaction.error)
		})
	} catch {}
}

export function texCacheKey(name: string, w: number, h: number, mtime = ''): string {
	return `tex:${name.toLowerCase()}:${w}x${h}:${mtime}`
}

export function exrCacheKey(name: string, byteLength: number, kind: string): string {
	return `exr:${name.toLowerCase()}:${kind}:${byteLength}`
}

export function vbsCacheKey(vbs: string): string {
	let h = 5381
	for (let i = 0; i < vbs.length; i++) h = ((h << 5) + h) ^ vbs.charCodeAt(i)
	return `vbs4:${(h >>> 0).toString(36)}:${vbs.length}`
}
