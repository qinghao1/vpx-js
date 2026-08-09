// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { BufferGeometry, Mesh } from '../../refs.node.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

let installed = false;

export function installBvh(): void {
	if (installed) return;
	const gProto = BufferGeometry.prototype as unknown as Record<string, unknown>;
	if (!gProto.computeBoundsTree) gProto.computeBoundsTree = computeBoundsTree as unknown as never;
	if (!gProto.disposeBoundsTree) gProto.disposeBoundsTree = disposeBoundsTree as unknown as never;
	const mProto = Mesh.prototype as unknown as Record<string, unknown>;
	if (mProto.raycast !== acceleratedRaycast) mProto.raycast = acceleratedRaycast as unknown as never;
	installed = true;
}

export function buildBvhForGeometry(geom: BufferGeometry, opts?: Record<string, unknown>): void {
	const g = geom as unknown as { boundsTree?: unknown; computeBoundsTree?: (o?: unknown) => void; index?: { count: number } | null; attributes: { position: { count: number } } };
	if (g.boundsTree) return;
	const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
	if (tris < 200) return;
	try { g.computeBoundsTree?.(opts ?? {}); } catch {}
}

export function buildBvhForNode(root: unknown, opts?: Record<string, unknown>): number {
	let built = 0;
	const node = root as { traverse?: (cb: (o: unknown) => void) => void };
	if (!node?.traverse) return 0;
	node.traverse((o: unknown) => {
		const m = o as { isMesh?: boolean; geometry?: BufferGeometry };
		if (!m.isMesh || !m.geometry) return;
		const g = m.geometry as unknown as { boundsTree?: unknown };
		if (g.boundsTree) return;
		buildBvhForGeometry(m.geometry, opts);
		if ((m.geometry as unknown as { boundsTree?: unknown }).boundsTree) built++;
	});
	return built;
}

export function buildBvhIdle(root: unknown, chunkSize = 30): void {
	const queue: unknown[] = [];
	const node = root as { traverse?: (cb: (o: unknown) => void) => void };
	if (!node?.traverse) return;
	node.traverse((o: unknown) => {
		const m = o as { isMesh?: boolean; geometry?: BufferGeometry };
		if (m.isMesh && m.geometry && !(m.geometry as unknown as { boundsTree?: unknown }).boundsTree) queue.push(m.geometry);
	});
	let idx = 0;
	const step = (deadline?: any) => {
		const start = performance.now();
		while (idx < queue.length) {
			if (deadline && (deadline as any).timeRemaining() <= 1) break;
			if (performance.now() - start > 8) break;
			for (let i = 0; i < chunkSize && idx < queue.length; i++, idx++) {
				buildBvhForGeometry(queue[idx] as BufferGeometry);
			}
		}
		if (idx < queue.length) {
			if (typeof requestIdleCallback !== 'undefined') (requestIdleCallback as unknown as (cb: any, o?: unknown) => number)(step as unknown as any, { timeout: 200 });
			else setTimeout(() => step(), 16);
		}
	};
	if (typeof requestIdleCallback !== 'undefined') (requestIdleCallback as unknown as (cb: any, o?: unknown) => number)(step as unknown as any, { timeout: 200 });
	else setTimeout(() => step(), 16);
}
