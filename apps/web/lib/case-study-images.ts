import type { StaticImageData } from "next/image";
import delucasDashboard from "@/public/case-studies/delucas-dashboard.png";
import l2detailzCalendar from "@/public/case-studies/l2detailz-calendar.png";
import l2detailzFrontend from "@/public/case-studies/l2detailz-frontend.png";

/**
 * Static imports (not string paths) are the mechanism behind two requirements:
 * a deleted PNG becomes an unresolvable module (webpack build error), and a
 * registry `screenshots[].src` with no entry below throws during prerender
 * (also a build failure) via `caseStudyImage`. A plain string `src` passed to
 * next/image is validated at no point in the build — it would 404 into a
 * broken image at runtime instead. Static imports also hand next/image the
 * real intrinsic width/height and a blur placeholder, so no dimensions are
 * hardcoded anywhere in the page.
 *
 * This map can't live in `lib/content.ts` (the registry): the test suite
 * loads that file under `node --experimental-strip-types`, which cannot
 * import a `.png`. It is therefore a hand-synced mirror of every
 * `screenshots[].src` in the registry — the one sync point this feature adds.
 * Adding a screenshot to the registry without adding its import here throws
 * at build/prerender time (by design), so drift fails loud, not silent.
 */
const CASE_STUDY_IMAGES: Record<string, StaticImageData> = {
  "/case-studies/delucas-dashboard.png": delucasDashboard,
  "/case-studies/l2detailz-frontend.png": l2detailzFrontend,
  "/case-studies/l2detailz-calendar.png": l2detailzCalendar,
};

export class CaseStudyImageNotFoundError extends Error {
  constructor(src: string) {
    super(
      `No static import registered for case study screenshot "${src}". Add it to CASE_STUDY_IMAGES in lib/case-study-images.ts.`
    );
    this.name = "CaseStudyImageNotFoundError";
  }
}

export function caseStudyImage(src: string): StaticImageData {
  const image = CASE_STUDY_IMAGES[src];
  if (!image) throw new CaseStudyImageNotFoundError(src);
  return image;
}
