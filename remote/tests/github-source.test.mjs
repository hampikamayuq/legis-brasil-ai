import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rawGithubUrl, fetchLawMarkdown } from '../src/github-source.ts';

// TypeScript helper is intentionally tested via a disposable transpiled copy
// in CI (tsc check) and validated here for its key source invariants.
test('metadata-only migration has no body column', () => {
  const migration = readFileSync(new URL('../migrations/0002_catalog.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS law_catalog/);
  assert.doesNotMatch(migration, /\bbody\s+TEXT\b/i);
});

test('only repository-relative Markdown is accepted', () => {
  assert.equal(rawGithubUrl('federal/leis-ordinarias/2020/lei.md'), 'https://raw.githubusercontent.com/ctresb/leis/main/federal/leis-ordinarias/2020/lei.md');
  for (const path of ['../secret.md', '/etc/passwd.md', 'https://evil.example/x.md', 'a/../b.md', 'foo.txt', 'a\\b.md']) {
    assert.throws(() => rawGithubUrl(path));
  }
});

test('fetch on demand rejects oversized responses and redirects', async () => {
  const data = await fetchLawMarkdown('constituicao.md', { fetcher: async (url, options) => {
    assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/ctresb\/leis\//);
    assert.equal(options.redirect, 'manual');
    return new Response('Art. 1º texto legítimo');
  } });
  assert.match(data.text, /Art\. 1º/);
  await assert.rejects(() => fetchLawMarkdown('constituicao.md', { fetcher: async () => new Response('x', { headers: { 'content-length': '999999' } }) }), /extensa/);
  await assert.rejects(() => fetchLawMarkdown('constituicao.md', { fetcher: async () => new Response(null, { status: 302, headers: { Location: 'https://example.com/other' } }) }), /Redirecionamento inesperado/);
});
