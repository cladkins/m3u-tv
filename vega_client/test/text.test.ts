import { decodeBase64WhenApplicable, formatDuration, yearOf } from '../src/utils/text';

describe('decodeBase64WhenApplicable', () => {
  it('decodes base64 UTF-8 text', () => {
    // "Café News" in UTF-8, base64-encoded.
    expect(decodeBase64WhenApplicable('Q2Fmw6kgTmV3cw==')).toBe('Café News');
  });

  it('keeps short plain words that only look like base64', () => {
    expect(decodeBase64WhenApplicable('GAME')).toBe('GAME');
    expect(decodeBase64WhenApplicable('News')).toBe('News');
  });

  it('keeps text with spaces or punctuation', () => {
    expect(decodeBase64WhenApplicable('The Evening News')).toBe('The Evening News');
    expect(decodeBase64WhenApplicable('')).toBe('');
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
});

describe('yearOf', () => {
  it('pulls a four-digit year out of dates and numbers', () => {
    expect(yearOf('2021-04-03')).toBe('2021');
    expect(yearOf(1999)).toBe('1999');
    expect(yearOf(undefined)).toBeUndefined();
  });
});
