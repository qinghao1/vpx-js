import {
	AddEquation,
	BackSide,
	Color,
	CustomBlending,
	DoubleSide,
	OneFactor,
	OneMinusSrcAlphaFactor,
	SrcAlphaFactor,
	type Texture as ThreeTexture,
} from "three";
import {
	Fn,
	float,
	positionWorld,
	sqrt,
	step,
	texture,
	uniform,
	uv,
	vec2,
	vec4,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { copyPendingKeys, setNodeMapSlot } from "../material-shared.js";
import {
	getLightBufferTexture,
	getTransmissionTexture,
	TRANSMISSION_OPAQUE_CUTOFF,
} from "../transmission-buffer.js";
import { inPlayfieldBounds, uTransArea } from "./primitive-bdl-node.js";

// Pending-texture placeholder alpha: 0 so the quad emits nothing under the
// SrcAlpha blend state below. WebGPU applies CustomBlending even with
// transparent=false, so 1 would render an opaque black quad until the texture
// streams in. Must stay 0.
export const BAKED_PLACEHOLDER_ALPHA = 0;

export interface BakedNodeMaterialOptions {
	map?: ThreeTexture;
	mapName?: string;
	tint?: number;
	emissionScale?: number;
	alphaTestValue?: number;
	doubleSided?: boolean;
	polygonOffset?: boolean;
	polygonOffsetFactor?: number;
	polygonOffsetUnits?: number;
	transmission?: boolean;
}

export function createUnshadedBakedNodeMaterial(
	options: BakedNodeMaterialOptions,
): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial();
	const uTintColor = uniform(new Color(options.tint ?? 0xffffff));
	const uEmissionScale = uniform(
		typeof options.emissionScale === "number" &&
			Number.isFinite(options.emissionScale)
			? Math.max(0.15, Math.min(1, options.emissionScale))
			: 1,
	);
	const useTransmission = options.transmission !== false;
	const transTex = useTransmission ? getTransmissionTexture() : null;
	const lightTex = useTransmission ? getLightBufferTexture() : null;
	// Playfield-UV lookup shared by the bulb-field multiply and the lift.
	const lightUv = () =>
		vec2(
			positionWorld.x.div(uTransArea.x).add(float(0.5)),
			float(0.5).sub(positionWorld.z.div(uTransArea.y)),
		);
	const rebuild = (map: ThreeTexture | null): void => {
		if (map) {
			const texNode = texture(map, uv());
			mat.colorNode = Fn(() => {
				const texColor = texNode;
				const baseRgb = texColor.rgb.mul(uTintColor).mul(uEmissionScale);
				// Upstream `lightLoop` multiplies the diffuse by the live bulb
				// field; without it the bake stays at its (dark) authored albedo
				// no matter how many lamps are on. The +1 floor keeps unlit
				// tables exactly as before. Both terms stay inside the
				// playfield: out-of-range room fragments must not sample the
				// clamped edge texel.
				const bulbUv = lightUv();
				const inBounds = inPlayfieldBounds(bulbUv);
				const finalRgb = lightTex
					? baseRgb.mul(
							texture(lightTex, bulbUv).rgb.mul(inBounds).add(float(1)),
						)
					: baseRgb;
				if (transTex) {
					const gate = step(texColor.a, TRANSMISSION_OPAQUE_CUTOFF);
					const lift = sqrt(finalRgb)
						.mul(texture(transTex, bulbUv).rgb)
						.mul(texColor.a)
						.mul(gate)
						.mul(inBounds);
					return vec4(finalRgb.add(lift), texColor.a);
				}
				return vec4(finalRgb, texColor.a);
			})();
		} else if ((mat.userData as Record<string, unknown>).__mapName != null) {
			// The file references a texture that has not streamed in yet. Native
			// loads synchronously so it has no placeholder state; emit nothing
			// until arrival to avoid a full-strength flat quad flashing in place.
			mat.colorNode = Fn(() => vec4(0, 0, 0, BAKED_PLACEHOLDER_ALPHA))();
		} else {
			// No texture by design (untextured solid): render the tint directly.
			mat.colorNode = Fn(() => vec4(uTintColor.mul(uEmissionScale), 1))();
		}
	};
	const userData = mat.userData as Record<string, unknown>;
	userData.__rebuild = rebuild;
	if (useTransmission) userData.__transmission = true;
	userData.__mapName =
		options.mapName ?? (options.map as { name?: string })?.name;
	const map = options.map ?? null;
	userData.__map = map;
	rebuild(map);

	userData.__isBaked = true;
	userData.__bakedNode = true;
	mat.side = options.doubleSided !== false ? DoubleSide : BackSide;
	mat.depthWrite = true;
	mat.transparent = false;
	mat.blending = CustomBlending;
	mat.blendSrc = SrcAlphaFactor;
	mat.blendDst = OneMinusSrcAlphaFactor;
	mat.blendEquation = AddEquation;
	mat.blendSrcAlpha = OneFactor;
	mat.blendDstAlpha = OneMinusSrcAlphaFactor;
	mat.blendEquationAlpha = AddEquation;
	mat.alphaTest =
		options.alphaTestValue &&
		options.alphaTestValue > 0 &&
		options.alphaTestValue <= 1
			? options.alphaTestValue
			: 0;
	mat.toneMapped = false;

	if (options.polygonOffset) {
		mat.polygonOffset = true;
		mat.polygonOffsetFactor = options.polygonOffsetFactor ?? -1;
		mat.polygonOffsetUnits = options.polygonOffsetUnits ?? -1;
	}

	userData.__uTint = uTintColor;
	userData.__uTintColor = uTintColor;
	userData.__uEmissionScale = uEmissionScale;
	return mat;
}

export function isBakedNodeMaterial(mat: unknown): boolean {
	return !!(mat as { userData?: { __bakedNode?: boolean } })?.userData
		?.__bakedNode;
}

export function setBakedMap(
	mat: unknown,
	map: ThreeTexture | null,
	name?: string,
): boolean {
	return setNodeMapSlot(mat, map, name, isBakedNodeMaterial);
}

export function cloneBakedNodeMaterial<T>(mat: T): T {
	const sourceMaterial = mat as unknown as MeshBasicNodeMaterial & {
		userData: Record<string, unknown>;
	};
	if (
		!sourceMaterial?.userData?.__bakedNode ||
		typeof sourceMaterial.clone !== "function"
	)
		return mat;
	const userData = sourceMaterial.userData;
	const tint =
		(
			userData.__uTintColor as { value?: { getHex?: () => number } }
		)?.value?.getHex?.() ??
		(
			userData.__uTint as { value?: { getHex?: () => number } }
		)?.value?.getHex?.() ??
		0xffffff;
	const emissionScale =
		typeof (userData.__uEmissionScale as { value?: number })?.value === "number"
			? (userData.__uEmissionScale as { value: number }).value
			: 1;
	const cloned = createUnshadedBakedNodeMaterial({
		map:
			(userData.__map as ThreeTexture | null) ??
			(sourceMaterial.map as ThreeTexture | undefined) ??
			undefined,
		mapName: (userData.__mapName as string) ?? undefined,
		tint,
		emissionScale,
		alphaTestValue:
			(userData.__alphaTestValue as number) ?? sourceMaterial.alphaTest ?? 0,
		doubleSided: sourceMaterial.side === DoubleSide,
		polygonOffset: !!sourceMaterial.polygonOffset,
		polygonOffsetFactor: sourceMaterial.polygonOffsetFactor ?? -1,
		polygonOffsetUnits: sourceMaterial.polygonOffsetUnits ?? -1,
		transmission: userData.__transmission === true,
	});
	cloned.name = sourceMaterial.name;
	cloned.transparent = sourceMaterial.transparent;
	cloned.opacity = sourceMaterial.opacity;
	cloned.depthWrite = sourceMaterial.depthWrite;
	cloned.depthTest = sourceMaterial.depthTest;
	cloned.blending = sourceMaterial.blending;
	cloned.blendSrc = sourceMaterial.blendSrc;
	cloned.blendDst = sourceMaterial.blendDst;
	cloned.blendEquation = sourceMaterial.blendEquation;
	cloned.blendSrcAlpha = sourceMaterial.blendSrcAlpha;
	cloned.blendDstAlpha = sourceMaterial.blendDstAlpha;
	cloned.blendEquationAlpha = sourceMaterial.blendEquationAlpha;
	cloned.alphaTest = sourceMaterial.alphaTest;
	cloned.side = sourceMaterial.side;
	copyPendingKeys(userData, cloned.userData as Record<string, unknown>);
	return cloned as unknown as T;
}
