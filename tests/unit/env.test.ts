import { describe, it, expect, afterEach } from 'vitest';
import { envInt } from '../../src/lib/env.js';

const VAR = 'ENV_TEST_VALUE';

afterEach(() => {
  delete process.env[VAR];
});

describe('envInt', () => {
  it('returns the fallback when the var is unset', () => {
    expect(envInt(VAR, 7)).toBe(7);
  });

  it('parses a numeric value', () => {
    process.env[VAR] = '12';
    expect(envInt(VAR, 7)).toBe(12);
  });

  it('returns the fallback for a non-numeric value instead of NaN', () => {
    process.env[VAR] = 'abc';
    expect(envInt(VAR, 7)).toBe(7);
  });

  it('clamps to the minimum', () => {
    process.env[VAR] = '0';
    expect(envInt(VAR, 7)).toBe(1);
    expect(envInt(VAR, 7, 3)).toBe(3);
  });
});
