import { describe, it, expect } from 'vitest';
import { GET } from '../route';

describe('GET /api/v1/docs', () => {
  it('returns 200 with application/json', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('returns valid OpenAPI 3.1 JSON', async () => {
    const response = await GET();
    const spec = await response.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe('Estrevia Public API');
    expect(typeof spec.info.version).toBe('string');
    expect(spec.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('declares production server URL', async () => {
    const response = await GET();
    const spec = await response.json();
    expect(spec.servers).toBeDefined();
    expect(spec.servers[0].url).toBe('https://estrevia.app');
  });

  it('documents /api/v1/sidereal/sun-sign GET with all responses', async () => {
    const response = await GET();
    const spec = await response.json();
    const path = spec.paths['/api/v1/sidereal/sun-sign'];
    expect(path).toBeDefined();
    expect(path.get).toBeDefined();
    expect(path.get.responses['200']).toBeDefined();
    expect(path.get.responses['400']).toBeDefined();
    expect(path.get.responses['429']).toBeDefined();
    expect(path.get.responses['500']).toBeDefined();
  });

  it('documents date and ayanamsa query parameters', async () => {
    const response = await GET();
    const spec = await response.json();
    const params = spec.paths['/api/v1/sidereal/sun-sign'].get.parameters;
    const dateParam = params.find((p: { name: string }) => p.name === 'date');
    const ayanamsaParam = params.find((p: { name: string }) => p.name === 'ayanamsa');
    expect(dateParam).toBeDefined();
    expect(dateParam.required).toBe(true);
    expect(dateParam.schema.type).toBe('string');
    expect(dateParam.schema.pattern).toBe('^\\d{4}-\\d{2}-\\d{2}$');
    expect(ayanamsaParam).toBeDefined();
    expect(ayanamsaParam.required).toBe(false);
  });

  it('declares rate limit via x-ratelimit extension', async () => {
    const response = await GET();
    const spec = await response.json();
    const op = spec.paths['/api/v1/sidereal/sun-sign'].get;
    expect(op['x-ratelimit']).toBeDefined();
    expect(op['x-ratelimit'].limit).toBe(10);
    expect(op['x-ratelimit'].window).toBe('1m');
  });

  it('defines SiderealSunSignResponse schema', async () => {
    const response = await GET();
    const spec = await response.json();
    const schema = spec.components.schemas.SiderealSunSignResponse;
    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('sign');
    expect(schema.properties.sign.type).toBe('string');
  });

  it('caches with public, max-age', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toContain('public');
  });
});
