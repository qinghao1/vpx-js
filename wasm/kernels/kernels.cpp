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


inline Hit testPoint(float bx, float by, float bz, float vx, float vy, float vz, float r,
                     float px, float py, float pz, float dTime) {
	Hit h;
	float dx = bx - px, dy = by - py, dz = bz - pz;
	float bcddsq = dx*dx + dy*dy + dz*dz;
	float bcdd = std::sqrt(bcddsq);
	if (bcdd <= 1e-6f) return h;
	float b = dx*vx + dy*vy + dz*vz;
	float bnv = b / bcdd;
	if (bnv > C_CONTACTVEL) return h;
	float bnd = bcdd - r;
	float a = vx*vx + vy*vy + vz*vz;
	float t = 0; int contact = 0;
	if (bnd < PHYS_TOUCH) {
		if (std::fabs(bnv) <= C_CONTACTVEL) contact = 1;
		else t = std::fmax(0.f, -bnd / bnv);
	} else {
		if (a < 1e-8f) return h;
		float disc = 4.f*b*b - 4.f*a*(bcddsq - r*r);
		if (disc < 0) return h;
		float s = std::sqrt(disc), inv = -0.5f / a;
		float t0 = (2.f*b + s) * inv;
		float t1 = (2.f*b - s) * inv;
		t = t0 * t1 < 0 ? std::fmax(t0, t1) : std::fmin(t0, t1);
	}
	if (!std::isfinite(t) || t < 0 || t > dTime) return h;
	float hx = bx + vx*t, hy = by + vy*t, hz = bz + vz*t;
	float nx = hx - px, ny = hy - py, nz = hz - pz;
	float len = std::sqrt(nx*nx + ny*ny + nz*nz);
	if (len > 1e-8f) { nx/=len; ny/=len; nz/=len; } else { nx=0; ny=1; nz=0; }
	h.t = t; h.contact = contact; h.nx = nx; h.ny = ny; h.nz = nz; h.dist = bnd; h.bnv = contact ? bnv : 0;
	return h;
}

inline Hit testTriangle(float bx, float by, float bz, float vx, float vy, float vz, float r,
                        float r0x, float r0y, float r0z, float r1x, float r1y, float r1z, float r2x, float r2y, float r2z,
                        float nx, float ny, float nz, float dTime) {
	Hit h;
	float bnv = nx*vx + ny*vy + nz*vz;
	if (bnv > C_CONTACTVEL) return h;
	float hx = bx - nx*r, hy = by - ny*r, hz = bz - nz*r;
	float bnd = nx*(hx - r0x) + ny*(hy - r0y) + nz*(hz - r0z);
	if (bnd < -r) return h;
	float t = 0; int contact = 0;
	if (bnd <= PHYS_TOUCH) {
		if (std::fabs(bnv) <= C_CONTACTVEL) { t = 0; contact = 1; }
		else if (bnd <= 0) t = 0;
		else t = bnd / -bnv;
	} else if (std::fabs(bnv) > C_LOWNORMVEL) t = bnd / -bnv;
	else return h;
	if (!std::isfinite(t) || t < 0 || t > dTime) return h;
	float hpx = hx + vx*t, hpy = hy + vy*t, hpz = hz + vz*t;
	float v0x = r2x - r0x, v0y = r2y - r0y, v0z = r2z - r0z;
	float v1x = r1x - r0x, v1y = r1y - r0y, v1z = r1z - r0z;
	float v2x = hpx - r0x, v2y = hpy - r0y, v2z = hpz - r0z;
	float dot00 = v0x*v0x + v0y*v0y + v0z*v0z;
	float dot01 = v0x*v1x + v0y*v1y + v0z*v1z;
	float dot02 = v0x*v2x + v0y*v2y + v0z*v2z;
	float dot11 = v1x*v1x + v1y*v1y + v1z*v1z;
	float dot12 = v1x*v2x + v1y*v2y + v1z*v2z;
	float denom = dot00*dot11 - dot01*dot01;
	if (std::fabs(denom) < 1e-8f) return h;
	float invDenom = 1.f / denom;
	float u = (dot11*dot02 - dot01*dot12) * invDenom;
	float v = (dot00*dot12 - dot01*dot02) * invDenom;
	if (u < 0 || v < 0 || u + v > 1) return h;
	h.t = t; h.contact = contact; h.nx = nx; h.ny = ny; h.nz = nz; h.dist = bnd; h.bnv = contact ? bnv : 0;
	return h;
}

inline Hit testLineSeg(float bx, float by, float bz, float vx, float vy, float vz, float r,
                       float v1x, float v1y, float v2x, float v2y, float nx, float ny, float len, float zl, float zh, float dTime) {
	Hit h;
	float bnv = vx*nx + vy*ny;
	if (bnv > C_LOWNORMVEL) return h;
	float bcpd = (bx - v1x)*nx + (by - v1y)*ny;
	float bnd = bcpd - r;
	bool inside = bnd <= 0;
	float t = 0;
	if (bnd < -r || bcpd < 0) return h;
	if (bnd <= PHYS_TOUCH) {
		if (inside || std::fabs(bnv) > C_CONTACTVEL || bnd <= -PHYS_TOUCH) t = 0;
		else t = bnd * (0.5f / PHYS_TOUCH) + 0.5f;
	} else if (std::fabs(bnv) > C_LOWNORMVEL) t = bnd / -bnv;
	else return h;
	if (!std::isfinite(t) || t < 0 || t > dTime) return h;
	float btv = vx*ny - vy*nx;
	float btd = (bx - v1x)*ny - (by - v1y)*nx + btv*t;
	if (btd < 0 || btd > len) return h;
	float hz = bz + vz*t;
	if (hz + r*0.5f < zl || hz - r*0.5f > zh) return h;
	int contact = (std::fabs(bnv) <= C_CONTACTVEL && std::fabs(bnd) <= PHYS_TOUCH) ? 1 : 0;
	h.t = t; h.contact = contact; h.nx = nx; h.ny = ny; h.nz = 0; h.dist = bnd; h.bnv = contact ? bnv : 0;
	return h;
}

inline Hit testLine3D(float bx, float by, float bz, float vx, float vy, float vz, float r,
                      float lx, float ly, float zl, float zh,
                      float m00, float m01, float m02, float m10, float m11, float m12, float m20, float m21, float m22,
                      float dTime) {
	float tbx = m00*bx + m01*by + m02*bz;
	float tby = m10*bx + m11*by + m12*bz;
	float tbz = m20*bx + m21*by + m22*bz;
	float tvx = m00*vx + m01*vy + m02*vz;
	float tvy = m10*vx + m11*vy + m12*vz;
	float tvz = m20*vx + m21*vy + m22*vz;
	Hit h = testLineZ(tbx, tby, tbz, tvx, tvy, tvz, r, lx, ly, zl, zh, dTime);
	if (h.t >= 0) {
		float onx = h.nx, ony = h.ny, onz = h.nz;
		h.nx = m00*onx + m01*ony + m02*onz;
		h.ny = m10*onx + m11*ony + m12*onz;
		h.nz = m20*onx + m21*ony + m22*onz;
	}
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
#ifdef __wasm_simd128__
	int i = 0;
	const v128_t vx4 = wasm_f32x4_splat(vx), vy4 = wasm_f32x4_splat(vy), vz4 = wasm_f32x4_splat(vz);
	const v128_t bx4 = wasm_f32x4_splat(bx), by4 = wasm_f32x4_splat(by), bz4 = wasm_f32x4_splat(bz);
	const v128_t r4 = wasm_f32x4_splat(r), dt4 = wasm_f32x4_splat(dTime);
	const v128_t cv4 = wasm_f32x4_splat(C_CONTACTVEL), touch4 = wasm_f32x4_splat(PHYS_TOUCH);
	const v128_t m2r = wasm_f32x4_splat(r * -2), zero = wasm_f32x4_splat(0), mone = wasm_f32x4_splat(-1);
	const v128_t zeroI = wasm_i32x4_splat(0), oneI = wasm_i32x4_splat(1);
	for (; i + 4 <= n; i += 4) {
		v128_t vnx = wasm_v128_load(nx + i), vny = wasm_v128_load(ny + i), vnz = wasm_v128_load(nz + i), vd = wasm_v128_load(d + i);
		v128_t bnv = wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_mul(vnx, vx4), wasm_f32x4_mul(vny, vy4)), wasm_f32x4_mul(vnz, vz4));
		v128_t bnd = wasm_f32x4_sub(wasm_f32x4_sub(wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_mul(vnx, bx4), wasm_f32x4_mul(vny, by4)), wasm_f32x4_mul(vnz, bz4)), r4), vd);
		v128_t reject = wasm_v128_or(wasm_f32x4_gt(bnv, cv4), wasm_f32x4_lt(bnd, m2r));
		v128_t absBnv = wasm_f32x4_abs(bnv), absBnd = wasm_f32x4_abs(bnd);
		v128_t isContact = wasm_f32x4_le(absBnv, cv4);
		v128_t contactHit = wasm_v128_and(isContact, wasm_f32x4_le(absBnd, touch4));
		contactHit = wasm_v128_and(contactHit, wasm_v128_not(reject));
		v128_t t = wasm_f32x4_div(bnd, wasm_f32x4_neg(bnv));
		t = wasm_f32x4_max(t, zero);
		v128_t tValid = wasm_f32x4_le(t, dt4);
		tValid = wasm_v128_and(tValid, wasm_v128_not(isContact));
		tValid = wasm_v128_and(tValid, wasm_v128_not(reject));
		v128_t hit = wasm_v128_or(contactHit, tValid);
		v128_t outT = wasm_v128_bitselect(wasm_v128_bitselect(zero, t, isContact), mone, hit);
		wasm_v128_store(oT + i, outT);
		wasm_v128_store(oDist + i, wasm_v128_bitselect(bnd, mone, hit));
		wasm_v128_store(oNx + i, wasm_v128_bitselect(vnx, zero, hit));
		wasm_v128_store(oNy + i, wasm_v128_bitselect(vny, zero, hit));
		wasm_v128_store(oNz + i, wasm_v128_bitselect(vnz, zero, hit));
		v128_t bnvOut = wasm_v128_bitselect(bnv, zero, contactHit);
		wasm_v128_store(oBnv + i, wasm_v128_bitselect(bnvOut, zero, hit));
		v128_t contactI = wasm_v128_bitselect(oneI, zeroI, contactHit);
		contactI = wasm_v128_and(contactI, hit);
		wasm_v128_store(oContact + i, contactI);
	}
	for (; i < n; i++) {
		Hit h = testPlane(bx, by, bz, vx, vy, vz, r, nx[i], ny[i], nz[i], d[i], dTime);
		oT[i] = h.t; oContact[i] = h.contact; oNx[i] = h.nx; oNy[i] = h.ny; oNz[i] = h.nz; oDist[i] = h.dist; oBnv[i] = h.bnv;
	}
	return;
#else
	for (int i = 0; i < n; i++) {
		Hit h = testPlane(bx, by, bz, vx, vy, vz, r, nx[i], ny[i], nz[i], d[i], dTime);
		oT[i] = h.t; oContact[i] = h.contact; oNx[i] = h.nx; oNy[i] = h.ny; oNz[i] = h.nz; oDist[i] = h.dist; oBnv[i] = h.bnv;
	}
#endif
}

__attribute__((visibility("default"))) void batchHitTestLineZ(int n, float bx, float by, float bz, float vx, float vy, float vz, float br,
                              float* lx, float* ly, float* zl, float* zh, float dTime,
                              float* oT, int* oContact, float* oNx, float* oNy, float* oNz, float* oDist, float* oBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testLineZ(bx, by, bz, vx, vy, vz, br, lx[i], ly[i], zl[i], zh[i], dTime);
		oT[i] = h.t; oContact[i] = h.contact; oNx[i] = h.nx; oNy[i] = h.ny; oNz[i] = h.nz; oDist[i] = h.dist; oBnv[i] = h.bnv;
	}
}


__attribute__((visibility("default"))) void batchHitTestPoint(int n, float bx, float by, float bz, float vx, float vy, float vz, float r,
                              float* px, float* py, float* pz, float dTime,
                              float* oT, int* oContact, float* oNx, float* oNy, float* oNz, float* oDist, float* oBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testPoint(bx, by, bz, vx, vy, vz, r, px[i], py[i], pz[i], dTime);
		oT[i] = h.t; oContact[i] = h.contact; oNx[i] = h.nx; oNy[i] = h.ny; oNz[i] = h.nz; oDist[i] = h.dist; oBnv[i] = h.bnv;
	}
}

__attribute__((visibility("default"))) void batchHitTestTriangle(int n, float bx, float by, float bz, float vx, float vy, float vz, float r,
                              float* r0x, float* r0y, float* r0z, float* r1x, float* r1y, float* r1z, float* r2x, float* r2y, float* r2z,
                              float* nx, float* ny, float* nz, float dTime,
                              float* oT, int* oContact, float* oNx, float* oNy, float* oNz, float* oDist, float* oBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testTriangle(bx, by, bz, vx, vy, vz, r, r0x[i], r0y[i], r0z[i], r1x[i], r1y[i], r1z[i], r2x[i], r2y[i], r2z[i], nx[i], ny[i], nz[i], dTime);
		oT[i] = h.t; oContact[i] = h.contact; oNx[i] = h.nx; oNy[i] = h.ny; oNz[i] = h.nz; oDist[i] = h.dist; oBnv[i] = h.bnv;
	}
}

__attribute__((visibility("default"))) void batchHitTestLineSeg(int n, float bx, float by, float bz, float vx, float vy, float vz, float r,
                              float* v1x, float* v1y, float* v2x, float* v2y, float* nx, float* ny, float* len, float* zl, float* zh, float dTime,
                              float* oT, int* oContact, float* oNx, float* oNy, float* oNz, float* oDist, float* oBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testLineSeg(bx, by, bz, vx, vy, vz, r, v1x[i], v1y[i], v2x[i], v2y[i], nx[i], ny[i], len[i], zl[i], zh[i], dTime);
		oT[i] = h.t; oContact[i] = h.contact; oNx[i] = h.nx; oNy[i] = h.ny; oNz[i] = h.nz; oDist[i] = h.dist; oBnv[i] = h.bnv;
	}
}

__attribute__((visibility("default"))) void batchHitTestLine3D(int n, float bx, float by, float bz, float vx, float vy, float vz, float r,
                              float* lx, float* ly, float* zl, float* zh,
                              float* m00, float* m01, float* m02, float* m10, float* m11, float* m12, float* m20, float* m21, float* m22, float dTime,
                              float* oT, int* oContact, float* oNx, float* oNy, float* oNz, float* oDist, float* oBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testLine3D(bx, by, bz, vx, vy, vz, r, lx[i], ly[i], zl[i], zh[i], m00[i], m01[i], m02[i], m10[i], m11[i], m12[i], m20[i], m21[i], m22[i], dTime);
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
