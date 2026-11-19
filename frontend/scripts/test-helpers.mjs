import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'recap-format-tests-'));
try {
  await build({
    entryPoints: ['src/utils/pluralRu.ts', 'src/utils/phone.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: directory,
    outExtension: { '.js': '.mjs' },
    logLevel: 'silent',
  });
  const { pluralRu } = await import(pathToFileURL(join(directory, 'pluralRu.mjs')).href);
  const { normalizePhoneNumber } = await import(pathToFileURL(join(directory, 'phone.mjs')).href);
  const words = ['день', 'дня', 'дней'];
  for (const [count, expected] of [
    [0, 'дней'], [1, 'день'], [2, 'дня'], [4, 'дня'], [5, 'дней'],
    [11, 'дней'], [12, 'дней'], [14, 'дней'], [21, 'день'],
    [22, 'дня'], [25, 'дней'], [101, 'день'], [111, 'дней'],
  ]) assert.equal(pluralRu(count, words), expected, String(count));
  assert.equal(pluralRu(1, ['кружок','кружка','кружков']), 'кружок');
  assert.equal(pluralRu(3, ['кружок','кружка','кружков']), 'кружка');
  assert.equal(pluralRu(11, ['кружок','кружка','кружков']), 'кружков');
  assert.equal(normalizePhoneNumber('79991234567'), '+79991234567');
  assert.equal(normalizePhoneNumber('+7 (999) 123-45-67'), '+79991234567');
  assert.equal(normalizePhoneNumber('7 999 123-45-67'), '+79991234567');
  assert.equal(normalizePhoneNumber('n/a'), 'n/a');
  console.log('Russian pluralization and Telegram phone normalization: passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}
