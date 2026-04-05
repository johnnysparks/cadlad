/**
 * Perceptual image similarity scoring for eval reference comparison.
 *
 * Uses SSIM (Structural Similarity Index) on 64×64 grayscale thumbnails.
 * Much faster and cheaper than a vision LLM judge — runs in ~20ms per pair.
 *
 * SSIM captures luminance, contrast, and structure — better than pixel MSE
 * for 3D render comparison where small camera/AA differences would inflate MSE.
 *
 * Angle matching: if filenames contain angle keywords (iso/front/right/top),
 * pairs are matched by angle. Otherwise candidate images are compared against
 * the first available reference.
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";

const COMPARE_SIZE = 64;
const ANGLE_NAMES = ["iso", "front", "back", "left", "right", "top", "bottom"] as const;

export interface ImageSimilarityResult {
  /** Composite score 0–100 (average SSIM × 100 across matched pairs). */
  score: number;
  pairs: Array<{ reference: string; candidate: string; ssim: number }>;
}

/**
 * Compute perceptual similarity between reference images and captured screenshots.
 * Returns score 0–100.
 */
export async function scoreImageSimilarity(
  referencePaths: string[],
  candidatePaths: string[],
): Promise<ImageSimilarityResult> {
  const sharpMod = await import("sharp") as any;
  const sharp = sharpMod.default ?? sharpMod;

  const refs = referencePaths.filter(existsSync);
  const cands = candidatePaths.filter(existsSync);

  if (refs.length === 0 || cands.length === 0) {
    return { score: 0, pairs: [] };
  }

  async function toGray(path: string): Promise<Float32Array> {
    const { data } = await sharp(path)
      .resize(COMPARE_SIZE, COMPARE_SIZE, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return new Float32Array(data as Buffer).map((v: number) => v / 255.0);
  }

  function detectAngle(path: string): string | null {
    const name = basename(path).toLowerCase();
    return ANGLE_NAMES.find((a) => name.includes(a)) ?? null;
  }

  // Match candidate images to reference images by detected angle
  const refByAngle = new Map<string | null, string>();
  for (const r of refs) {
    const angle = detectAngle(r);
    if (!refByAngle.has(angle)) refByAngle.set(angle, r);
  }

  const pairs: Array<{ reference: string; candidate: string }> = [];
  for (const c of cands) {
    const angle = detectAngle(c);
    const matchRef = refByAngle.get(angle) ?? refByAngle.get(null) ?? refs[0];
    pairs.push({ reference: matchRef, candidate: c });
  }

  // Compute SSIM for each matched pair (parallelized)
  const ssimResults = await Promise.all(
    pairs.map(async ({ reference, candidate }) => {
      const [refGray, candGray] = await Promise.all([toGray(reference), toGray(candidate)]);
      const ssim = computeSSIM(refGray, candGray);
      return { reference, candidate, ssim };
    }),
  );

  const avgSsim = ssimResults.reduce((s, r) => s + r.ssim, 0) / ssimResults.length;

  return {
    score: Math.max(0, Math.min(100, avgSsim * 100)),
    pairs: ssimResults,
  };
}

/**
 * Global SSIM over the full image (not sliding-window).
 * Suitable for comparing full renders where structural content matters more than local detail.
 * Range: -1 to 1, typically 0 to 1 for natural images.
 */
function computeSSIM(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  // Constants scaled for 0–1 normalized pixel values
  const C1 = 0.0001; // (0.01)²
  const C2 = 0.0009; // (0.03)²

  let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
    sumAB += a[i] * b[i];
  }

  const muA = sumA / n;
  const muB = sumB / n;
  const sigA2 = sumA2 / n - muA * muA;
  const sigB2 = sumB2 / n - muB * muB;
  const sigAB = sumAB / n - muA * muB;

  const numerator = (2 * muA * muB + C1) * (2 * sigAB + C2);
  const denominator = (muA * muA + muB * muB + C1) * (sigA2 + sigB2 + C2);

  return denominator === 0 ? 0 : Math.max(0, numerator / denominator);
}
