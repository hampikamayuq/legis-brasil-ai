import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArticle } from '../src/article-extractor.ts';

test('extracts real upstream bold Markdown article format without next article', () => {
  const markdown = '# Lei nº 14.792\n\n**Art. 1º** Fica instituído o Dia Nacional da Saúde Única.\n\n**Art. 2º** Esta Lei entra em vigor na publicação.\n';
  const first = extractArticle(markdown, '1');
  assert.match(first.excerpt, /Dia Nacional da Saúde Única/);
  assert.doesNotMatch(first.excerpt, /Art\. 2º/);
  assert.match(extractArticle(markdown,'2').excerpt, /Esta Lei entra em vigor/);
});

test('does not confuse article 1 with article 10 or mentions in a paragraph', () => {
  const markdown = 'Conforme o Art. 1º, observam-se regras.\nArt. 10. Regra dez.\nArt. 1º Regra um.\n';
  assert.match(extractArticle(markdown,'1').excerpt,/Regra um/);
  assert.match(extractArticle(markdown,'10').excerpt,/Regra dez/);
  assert.equal(extractArticle(markdown,'3'),null);
});
