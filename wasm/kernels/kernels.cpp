#include <cmath>
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

constexpr float C_CONTACTVEL = 0.099f;
constexpr float C_LOWNORMVEL = 0.0001f;
constexpr float PHYS_TOUCH = 0.05f;

struct Hit {
	float t = -1;
	int contact = 0;
	float nx = 0, ny = 0, nz = 0;
	float dist = 0, bnv = 0;
};

inline float pickTime(float a, float b) {
	return a * b < 0 ? std::fmax(a, b) : std::fmin(a, b);
}

inline Hit testPlane(float bx, float by, float bz, float vx, float vy, float vz, float r,
                     float nx, float ny, float nz, float d, float dTime) {
	Hit h;
	float bnv = nx * vx + ny * vy + nz * vz;
	if (bnv > C_CONTACTVEL) return h;
	float bnd = nx * bx + ny * by + nz * bz - r - d;
	if (bnd < r * -2) return h;
	if (std::fabs(bnv) <= C_CONTACTVEL) {
		if (std::fabs(bnd) > PHYS_TOUCH) return h;
		h.t = 0; h.contact = 1; h.nx = nx; h.ny = ny; h.nz = nz; h.dist = bnd; h.bnv = bnv;
		return h;
	}
	float t = bnd / -bnv;
	if (t < 0) t = 0;
	if (!std::isfinite(t) || t < 0 || t > dTime) return h;
	h.t = t; h.nx = nx; h.ny = ny; h.nz = nz; h.dist = bnd;
	return h;
}

inline Hit testCircle(float bx, float by, float bz, float vx, float vy, float vz, float br,
                      float cx, float cy, float cr, float zl, float zh, float dTime) {
	Hit h;
	float dx = bx - cx, dy = by - cy, d2 = dx * dx + dy * dy, d = std::sqrt(d2);
	if (d <= 1e-6f) return h;
	float b = dx * vx + dy * vy, bnv = b / d;
	if (bnv > C_LOWNORMVEL) return h;
	float bnd = d - (cr + br), a = vx * vx + vy * vy;
	float t = 0; int contact = 0;
	if (bnd < PHYS_TOUCH) {
		if (bnd < -br) return h;
		if (std::fabs(bnv) <= C_CONTACTVEL) contact = 1;
		else t = std::fmax(0, -bnd / bnv);
	} else {
		if (a < 1e-8f) return h;
		float disc = 4 * b * b - 4 * a * (d2 - (cr + br) * (cr + br));
		if (disc < 0) return h;
		float s = std::sqrt(disc), inv = -0.5f / a;
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv);
	}
	if (!std::isfinite(t) || t < 0 || t > dTime) return h;
	float hz = bz + vz * t;
	if (hz + br * 0.5f < zl || hz - br * 0.5f > zh) return h;
	float hx = bx + vx * t, hy = by + vy * t, s2 = (hx - cx) * (hx - cx) + (hy - cy) * (hy - cy);
	float nx, ny;
	if (s2 > 1e-8f) { float inv = 1 / std::sqrt(s2); nx = (hx - cx) * inv; ny = (hy - cy) * inv; }
	else { nx = 0; ny = 1; }
	h.t = t; h.contact = contact; h.nx = nx; h.ny = ny; h.dist = bnd; h.bnv = contact ? bnv : 0;
	return h;
}

inline Hit testLineZ(float bx, float by, float bz, float vx, float vy, float vz, float br,
                     float lx, float ly, float zl, float zh, float dTime) {
	Hit h;
	float dx = bx - lx, dy = by - ly, d2 = dx * dx + dy * dy, d = std::sqrt(d2);
	if (d <= 1e-6f) return h;
	float b = dx * vx + dy * vy, bnv = b / d;
	if (bnv > C_CONTACTVEL) return h;
	float bnd = d - br, a = vx * vx + vy * vy;
	float t = 0; int contact = 0;
	if (bnd < PHYS_TOUCH) {
		if (std::fabs(bnv) <= C_CONTACTVEL) contact = 1;
		else t = -bnd / bnv;
	} else {
		if (a < 1e-8f) return h;
		float disc = 4 * b * b - 4 * a * (d2 - br * br);
		if (disc < 0) return h;
		float s = std::sqrt(disc), inv = -0.5f / a;
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv);
	}
	if (!std::isfinite(t) || t < 0 || t > dTime) return h;
	float hz = bz + vz * t;
	if (hz < zl || hz > zh) return h;
	float hx = bx + vx * t, hy = by + vy * t, nx = hx - lx, ny = hy - ly, len = std::sqrt(nx * nx + ny * ny);
	if (len > 1e-8f) { nx /= len; ny /= len; } else { nx = 0; ny = 1; }
	h.t = t; h.contact = contact; h.nx = nx; h.ny = ny; h.dist = bnd; h.bnv = contact ? bnv : 0;
	return h;
}

extern "C" {

__attribute__((visibility("default"))) void batchHitTestCircle(int n, float bx, float by, float bz, float vx, float vy, float vz, float br,
                               float* cx, float* cy, float* cr, float* zl, float* zh, float dTime,
                               float* oT, int* oContact, float* oNx, float* oNy, float* oNz, float* oDist, float* oBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testCircle(bx, by, bz, vx, vy, vz, br, cx[i], cy[i], cr[i], zl[i], zh[i], dTime);
		oT[i] = h.t; oContact[i] = h.contact; oNx[i] = h.nx; oNy[i] = h.ny; oNz[i] = h.nz; oDist[i] = h.dist; oBnv[i] = h.bnv;
	}
}

__attribute__((visibility("default"))) void batchHitTestPlane(int n, float bx, float by, float bz, float vx, float vy, float vz, float r,
                              float* nx, float* ny, float* nz, float* d, float dTime,
                              float* oT, int* oContact, float* oNx, float* oNy, float* oNz, float* oDist, float* oBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testPlane(bx, by, bz, vx, vy, vz, r, nx[i], ny[i], nz[i], d[i], dTime);
		oT[i] = h.t; oContact[i] = h.contact; oNx[i] = h.nx; oNy[i] = h.ny; oNz[i] = h.nz; oDist[i] = h.dist; oBnv[i] = h.bnv;
	}
}

__attribute__((visibility("default"))) void batchHitTestLineZ(int n, float bx, float by, float bz, float vx, float vy, float vz, float br,
                              float* lx, float* ly, float* zl, float* zh, float dTime,
                              float* oT, int* oContact, float* oNx, float* oNy, float* oNz, float* oDist, float* oBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testLineZ(bx, by, bz, vx, vy, vz, br, lx[i], ly[i], zl[i], zh[i], dTime);
		oT[i] = h.t; oContact[i] = h.contact; oNx[i] = h.nx; oNy[i] = h.ny; oNz[i] = h.nz; oDist[i] = h.dist; oBnv[i] = h.bnv;
	}
}

__attribute__((visibility("default"))) void batchElasticityWithFalloff(int n, float* e, float* f, float* v, float* o) {
#ifdef __wasm_simd128__
	const v128_t k = wasm_f32x4_splat(1.f / 18.53f);
	const v128_t one = wasm_f32x4_splat(1.f), zero = wasm_f32x4_splat(0.f);
	int i = 0;
	for (; i + 4 <= n; i += 4) {
		v128_t ve = wasm_v128_load(e + i), vf = wasm_v128_load(f + i), vv = wasm_v128_load(v + i);
		v128_t denom = wasm_f32x4_add(one, wasm_f32x4_mul(wasm_f32x4_mul(vf, wasm_f32x4_abs(vv)), k));
		wasm_v128_store(o + i, wasm_v128_bitselect(wasm_f32x4_div(ve, denom), ve, wasm_f32x4_gt(vf, zero)));
	}
	for (; i < n; i++) o[i] = f[i] > 0 ? e[i] / (1 + f[i] * std::fabs(v[i]) * (1.f / 18.53f)) : e[i];
#else
	for (int i = 0; i < n; i++) o[i] = f[i] > 0 ? e[i] / (1 + f[i] * std::fabs(v[i]) * (1.f / 18.53f)) : e[i];
#endif
}

} // extern "C"
