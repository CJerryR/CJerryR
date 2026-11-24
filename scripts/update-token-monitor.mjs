import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeUsage, renderCard } from './token-monitor-card.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const argumentsList = process.argv.slice(2);
const repositoryIndex = argumentsList.indexOf('--repo');
const repository = repositoryIndex >= 0 ? argumentsList[repositoryIndex + 1] : 'CJerryR/CJerryR';
const publish = argumentsList.includes('--publish');
const ghPath = process.env.TOKEN_CARD_GH || 'gh';

function github(endpoint, method = 'GET', body) {
  const args = ['api', endpoint, '--method', method];
  if (body !== undefined) args.push('--input', '-');
  try {
    return JSON.parse(execFileSync(ghPath, args, {
      input: body === undefined ? undefined : JSON.stringify(body),
      encoding: 'utf8', windowsHide: true, timeout: 45_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
  } catch (error) {
    // Do not forward child-process arguments or any authenticated API body.
    throw new Error(`GitHub ${method} request failed${error.status ? ` (exit ${error.status})` : ''}`);
  }
}

async function fetchUsage() {
  if (!process.env.APPDATA) throw new Error('This updater needs the Windows Token Monitor host');
  const userData = path.join(process.env.APPDATA, 'Token Monitor');
  const [settings, store] = await Promise.all([
    readFile(path.join(userData, 'settings.json'), 'utf8').then(JSON.parse),
    readFile(path.join(userData, 'credentials.json'), 'utf8').then(JSON.parse),
  ]);
  if (settings.hubMode !== 'host') {
    throw new Error('Token Monitor is not in Host mode; keeping the existing card');
  }
  const port = settings.hubHostPort;
  const secret = store.credentials?.hub?.hostSecret;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof secret !== 'string' || !secret) {
    throw new Error('Local Token Monitor connection is unavailable');
  }
  const get = async (route) => {
    // Keep the host credential on loopback. Never put it in a URL or repository.
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      headers: { authorization: `Bearer ${secret}`, accept: 'application/json' },
      signal: AbortSignal.timeout(20_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Token Monitor returned HTTP ${response.status}`);
    return response.json();
  };
  const [stats, history] = await Promise.all([get('/api/stats'), get('/api/history')]);
  return normalizeUsage(stats, history);
}

const blobSha = (content) => createHash('sha1')
  .update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');

function publishCards(files) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
  const base = `repos/${repository}`;
  const { default_branch: branch } = github(base);
  const ref = `${base}/git/refs/heads/${branch}`;
  const blobs = new Map();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const head = github(`${base}/git/ref/heads/${branch}`).object.sha;
    const treeSha = github(`${base}/git/commits/${head}`).tree.sha;
    const tree = github(`${base}/git/trees/${treeSha}?recursive=1`);
    if (tree.truncated) throw new Error('Repository tree is too large to compare safely');
    const changes = [...files].filter(([file, content]) => (
      tree.tree.find((entry) => entry.path === file)?.sha !== blobSha(content)
    ));
    if (changes.length === 0) {
      console.log('Card is already current; no commit needed.');
      return;
    }
    for (const [file, content] of changes) {
      if (!blobs.has(file)) {
        blobs.set(file, github(`${base}/git/blobs`, 'POST', {
          content: Buffer.from(content).toString('base64'), encoding: 'base64',
        }).sha);
      }
    }
    const newTree = github(`${base}/git/trees`, 'POST', {
      base_tree: treeSha,
      tree: changes.map(([file]) => ({
        path: file, mode: '100644', type: 'blob', sha: blobs.get(file),
      })),
    });
    const commit = github(`${base}/git/commits`, 'POST', {
      message: 'chore: refresh token usage card', tree: newTree.sha, parents: [head],
    });
    try {
      github(ref, 'PATCH', { sha: commit.sha, force: false });
      console.log(`Updated ${repository}: ${commit.sha.slice(0, 7)}`);
      return;
    } catch (error) {
      // Rebase the two generated assets onto the latest tree after a concurrent update.
      if (attempt === 2 || github(`${base}/git/ref/heads/${branch}`).object.sha === head) throw error;
    }
  }
}

try {
  const usage = await fetchUsage();
  const files = new Map(['dark', 'light'].map((theme) => [
    `assets/token-monitor-${theme}.svg`, renderCard(usage, theme),
  ]));
  console.log(`Lifetime tokens: ${usage.totalTokens.toLocaleString('en-US')}; active days: ${usage.activeDays}`);
  console.log(usage.tools.map((tool) => `${tool.label}: ${tool.tokens.toLocaleString('en-US')}`).join('; '));
  if (publish) {
    publishCards(files);
  } else {
    await mkdir(path.join(root, 'assets'), { recursive: true });
    for (const [file, content] of files) {
      await writeFile(path.join(root, file), content, 'utf8');
    }
    console.log('Rendered both card themes locally.');
  }
} catch (error) {
  console.error(`Token card update failed: ${error.message}`);
  process.exitCode = 1;
}
