import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesRoot = join(process.cwd(), 'src', 'styles');
const baseCss = readFileSync(join(stylesRoot, 'base.css'), 'utf8');
const tokensCss = readFileSync(join(stylesRoot, 'tokens.css'), 'utf8');

describe('Admin visual and responsive CSS contract', () => {
  it('keeps the page shell free of viewport-wide fixed minimum widths', () => {
    expect(baseCss).toMatch(/html,\s*body\s*\{[\s\S]*?min-width:\s*0;/);
    expect(baseCss).toMatch(/\.admin-shell\s*\{[\s\S]*?min-width:\s*0;/);
    expect(baseCss).not.toMatch(/html,\s*body\s*\{[\s\S]*?min-width:\s*var\(--r3-admin-bp-admin-min\)/);
  });

  it('declares local table overflow and long text wrapping instead of global page scroll', () => {
    expect(baseCss).toMatch(/\.admin-table\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*auto;/);
    expect(baseCss).toMatch(/@media\s*\(max-width:\s*1040px\)\s*\{[\s\S]*?\.admin-table table\s*\{[\s\S]*?min-width:\s*720px;/);
    expect(baseCss).toContain('overflow-wrap: anywhere;');
  });

  it('keeps focus and reduced-motion tokens available for keyboard evidence', () => {
    expect(tokensCss).toContain('--r3-admin-focus-ring-color');
    expect(tokensCss).toContain('--r3-admin-focus-ring-width');
    expect(tokensCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(baseCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.skip-link\s*\{[\s\S]*?transition:\s*none;/);
  });
});
