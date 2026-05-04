import { NextResponse } from 'next/server';
import { SITE_URL } from '@/shared/seo/constants';
import packageJson from '../../../../../package.json';

export const runtime = 'nodejs';

/**
 * GET /api/v1/docs
 *
 * Returns the OpenAPI 3.1 specification for Estrevia's public API.
 *
 * Initial coverage (MVP):
 *   - GET /api/v1/sidereal/sun-sign
 *
 * Auth-gated endpoints (Clerk JWT) are intentionally NOT documented here —
 * they are private CRUD endpoints for authenticated users, not a public API.
 *
 * As more public endpoints come online, extend the `paths` object below.
 */
export function GET(): Response {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Estrevia Public API',
      version: packageJson.version,
      description:
        'Public API for Estrevia — sidereal astrology platform. ' +
        'All endpoints use Lahiri ayanamsa. Rate-limited per IP.',
      contact: {
        name: 'Estrevia Support',
        email: 'support@estrevia.app',
        url: SITE_URL,
      },
      license: {
        name: 'AGPL-3.0',
        url: 'https://www.gnu.org/licenses/agpl-3.0.en.html',
      },
    },
    servers: [
      { url: SITE_URL, description: 'Production' },
    ],
    paths: {
      '/api/v1/sidereal/sun-sign': {
        get: {
          summary: 'Get sidereal Sun sign for a given date',
          description:
            'Returns the sidereal Sun sign (Lahiri ayanamsa) for a calendar date. ' +
            'Used by the sun-sign mini-widget on /sidereal-{sign}-dates pages.',
          tags: ['Astrology'],
          parameters: [
            {
              name: 'date',
              in: 'query',
              required: true,
              description: 'Date in YYYY-MM-DD format (Gregorian).',
              schema: {
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                example: '1990-03-15',
              },
            },
            {
              name: 'ayanamsa',
              in: 'query',
              required: false,
              description: 'Ayanamsa system. Only "lahiri" is supported (MVP).',
              schema: {
                type: 'string',
                enum: ['lahiri'],
                default: 'lahiri',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Sidereal Sun sign successfully calculated.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SiderealSunSignSuccess' },
                },
              },
            },
            '400': {
              description: 'Invalid date or ayanamsa parameter.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiError' },
                  examples: {
                    invalidDate: { value: { success: false, data: null, error: 'invalid_date' } },
                    invalidAyanamsa: { value: { success: false, data: null, error: 'invalid_ayanamsa' } },
                  },
                },
              },
            },
            '429': {
              description: 'Rate limit exceeded (10 req/min/IP).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiError' },
                },
              },
            },
            '500': {
              description: 'Computation error (Swiss Ephemeris failure).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiError' },
                },
              },
            },
          },
          'x-ratelimit': { limit: 10, window: '1m', scope: 'ip' },
        },
      },
    },
    components: {
      schemas: {
        SiderealSunSignSuccess: {
          type: 'object',
          required: ['success', 'data', 'error'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { $ref: '#/components/schemas/SiderealSunSignResponse' },
            error: { type: 'null' },
          },
        },
        SiderealSunSignResponse: {
          type: 'object',
          required: ['sign', 'startDate', 'endDate', 'ayanamsa', 'year'],
          properties: {
            sign: {
              type: 'string',
              description: 'Sidereal sign name (English).',
              enum: [
                'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
                'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
              ],
            },
            startDate: { type: 'string', format: 'date-time', description: 'Sign window start (ISO 8601 UTC).' },
            endDate: { type: 'string', format: 'date-time', description: 'Sign window end (ISO 8601 UTC).' },
            ayanamsa: { type: 'string', example: 'lahiri' },
            year: { type: 'integer', example: 1990 },
          },
        },
        ApiError: {
          type: 'object',
          required: ['success', 'data', 'error'],
          properties: {
            success: { type: 'boolean', enum: [false] },
            data: { type: 'null' },
            error: { type: 'string', description: 'Error code or human-readable message.' },
          },
        },
      },
    },
  };

  return new NextResponse(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
