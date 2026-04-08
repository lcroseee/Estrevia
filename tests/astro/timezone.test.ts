import { describe, it, expect } from 'vitest';
import { getUtcOffset } from '../../src/modules/astro-engine/timezone';

describe('getUtcOffset', () => {
  it('Moscow summer 2024 returns UTC+3 (+180 minutes)', () => {
    const date = new Date('2024-07-15T12:00:00Z');
    expect(getUtcOffset('Europe/Moscow', date)).toBe(180);
  });

  it('New York summer 2024 (EDT) returns UTC-4 (-240 minutes)', () => {
    const date = new Date('2024-07-15T12:00:00Z');
    expect(getUtcOffset('America/New_York', date)).toBe(-240);
  });

  it('New York winter 2024 (EST) returns UTC-5 (-300 minutes)', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(getUtcOffset('America/New_York', date)).toBe(-300);
  });

  it('London summer 2024 (BST) returns UTC+1 (+60 minutes)', () => {
    const date = new Date('2024-07-15T12:00:00Z');
    expect(getUtcOffset('Europe/London', date)).toBe(60);
  });

  it('London winter 2024 (GMT) returns UTC+0', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(getUtcOffset('Europe/London', date)).toBe(0);
  });

  it('UTC timezone returns UTC+0 (0 minutes)', () => {
    const date = new Date('2024-07-15T12:00:00Z');
    expect(getUtcOffset('UTC', date)).toBe(0);
  });

  it('Etc/UTC returns UTC+0 (0 minutes)', () => {
    const date = new Date('2024-07-15T12:00:00Z');
    expect(getUtcOffset('Etc/UTC', date)).toBe(0);
  });

  it('Moscow 2014-10-25 (before permanent winter time): UTC+4 in summer', () => {
    // Russia had DST until Oct 26, 2014. Summer 2014 was UTC+4.
    const date = new Date('2014-07-15T12:00:00Z');
    expect(getUtcOffset('Europe/Moscow', date)).toBe(240);
  });

  it('Moscow 2014-10-27 (after permanent winter time switch): UTC+3', () => {
    // From Oct 26, 2014 Russia stayed on UTC+3 permanently (no more DST)
    const date = new Date('2014-11-01T12:00:00Z');
    expect(getUtcOffset('Europe/Moscow', date)).toBe(180);
  });

  it('India Standard Time returns UTC+5:30 (+330 minutes)', () => {
    const date = new Date('2024-07-15T12:00:00Z');
    expect(getUtcOffset('Asia/Kolkata', date)).toBe(330);
  });

  it('Tokyo returns UTC+9 (+540 minutes)', () => {
    const date = new Date('2024-07-15T12:00:00Z');
    expect(getUtcOffset('Asia/Tokyo', date)).toBe(540);
  });

  it('São Paulo winter (no DST in 2024) returns UTC-3 (-180 minutes)', () => {
    // Brazil abolished DST in 2019; America/Sao_Paulo is always UTC-3
    const date = new Date('2024-07-15T12:00:00Z');
    expect(getUtcOffset('America/Sao_Paulo', date)).toBe(-180);
  });
});
