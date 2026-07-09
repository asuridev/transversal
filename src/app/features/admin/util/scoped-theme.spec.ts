import { applyScopedTheme } from './scoped-theme';

describe('applyScopedTheme', () => {
  it('writes the given CSS vars onto the provided host', () => {
    const host = document.createElement('div');
    applyScopedTheme(host, { '--brand-primary': '#00ff00' });
    expect(host.style.getPropertyValue('--brand-primary')).toBe('#00ff00');
  });

  it('never writes to document.documentElement', () => {
    const before = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary');
    const host = document.createElement('div');
    applyScopedTheme(host, { '--brand-primary': '#ff00ff' });
    const after = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary');
    expect(after).toBe(before);
  });
});
