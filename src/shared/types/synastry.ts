/**
 * Per-person summary strip shown above the compatibility score on /synastry.
 *
 * Lives in shared/ because both the API route that builds it and the
 * astro-engine component that renders it need the shape, and `src/modules/`
 * may depend only on `shared/` — never on `src/app/`.
 *
 * Deliberately NOT called `ChartSummary`: that name is already taken in
 * `shared/types/api.ts` for an entry in the saved-charts list, which carries
 * `id`, `createdAt` and `updatedAt` and is a different concept entirely.
 */
export interface SynastryPersonSummary {
  name: string | null;

  /** Sidereal — the app's default frame. Unchanged by the toggle. */
  sunSign: string | null;
  moonSign: string | null;
  ascendant: string | null;

  /**
   * Tropical counterparts, so the client can honour a frame chosen on /chart
   * without a second ephemeris call.
   *
   * Additive: payloads written before SP-B simply lack them, and the UI falls
   * back to the sidereal labels rather than rendering a blank.
   */
  tropicalSunSign: string | null;
  tropicalMoonSign: string | null;
  tropicalAscendant: string | null;
}
