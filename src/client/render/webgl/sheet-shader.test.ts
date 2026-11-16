import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOK } from '../../../shared/render/shading.ts';
import { FRAGMENT_SHADER } from './sheet-shader.ts';

const SOURCE = readFileSync(new URL('./sheet-shader.ts', import.meta.url), 'utf8');

test('every numeric look constant reaches the shader from LOOK, so the two renderers cannot drift', () => {
  for (const [key, value] of Object.entries(LOOK)) {
    if (typeof value === 'number') assert.ok(SOURCE.includes(`f(LOOK.${key})`), `LOOK.${key} is not injected with f()`);
    else if (Array.isArray(value)) assert.ok(SOURCE.includes(`LOOK.${key}.map(f)`), `LOOK.${key} is not injected with f()`);
  }
});

test('the fragment shader is fully resolved', () => {
  assert.doesNotMatch(FRAGMENT_SHADER, /undefined|NaN|\$\{/);
});
