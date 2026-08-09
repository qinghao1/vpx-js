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
			try {
				if (db.objectStoreNames.contains('textures')) db.deleteObjectStore('textures')
			} catch {}
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

export async function idbGet(key: string): Promise<any | undefined> {
	try {
		const db = await openDB()
		return await new Promise((resolve, reject) => {
			const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
			req.onsuccess = () => resolve(req.result as any)
			req.onerror = () => reject(req.error)
		})
	} catch {
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
	return `vbs5:${(h >>> 0).toString(36)}:${vbs.length}`
}
