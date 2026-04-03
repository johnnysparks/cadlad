import { describe, expect, it } from 'vitest';

describe('worker ci smoke', () => {
  it('runs tests in CI', () => {
    expect(true).toBe(true);
  });
});
