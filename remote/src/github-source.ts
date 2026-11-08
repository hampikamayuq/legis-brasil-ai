export const SOURCE_REPO = 'ctresb/leis';
const MAX_BYTES = 750_000;

// Accept only repository-relative Markdown paths; never accept a user URL or host.
export function validateLawPath(path: string): string {
  if (path.length < 3 || path.length > 400 || !/^[\p{L}\p{N}_./ -]+\.md$/u.test(path) ||
      path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '.' || part === '..' || !part))
    throw new Error('Caminho inválido no acervo');
  return path;
}

export function rawGithubUrl(path: string, ref = 'main'): string {
  validateLawPath(path);
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(ref) || ref === '.' || ref === '..') throw new Error('Referência Git inválida');
  return `https://raw.githubusercontent.com/${SOURCE_REPO}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export async function fetchLawMarkdown(path: string, options: { ref?: string; fetcher?: typeof fetch } = {}) {
  const url = rawGithubUrl(path, options.ref);
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { Accept: 'text/plain' }, cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (response.status === 404) throw new Error('Arquivo legislativo não encontrado no GitHub');
  if (!response.ok) throw new Error(`Falha temporária ao consultar o acervo (${response.status})`);
  const reportedSize = Number(response.headers.get('content-length'));
  if (reportedSize > MAX_BYTES) throw new Error('Norma muito extensa para consulta direta');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Resposta de origem vazia');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error('Norma excede limite de leitura');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), url, ref: options.ref ?? 'main' };
}
