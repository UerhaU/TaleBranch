// Publish an already tested portable; this workflow never compiles a new executable.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const repository = process.env.GITHUB_REPOSITORY;
const target = process.env.GITHUB_SHA;
const version = require('../package.json').version;
const manifest = JSON.parse(fs.readFileSync(`.github/releases/v${version}.json`, 'utf8'));
const tag = `v${version}`;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const apiHeaders = { Authorization: `Bearer ${process.env.GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' };

async function main() {
  if (repository !== 'UerhaU/TaleBranch' || !/^[a-f0-9]{40}$/.test(target || '') || manifest.tag !== tag || !version.includes('-beta.')) throw new Error('Unexpected release target.');
  if (!/^[a-f0-9]{40}$/.test(manifest.archiveBlob) || !/^[a-f0-9]{64}$/.test(manifest.archiveSha256) || !/^[a-f0-9]{64}$/.test(manifest.exeSha256)) throw new Error('Invalid checksums.');
  const prefix = `TaleBranch-${version}`;
  const archiveName = `${prefix}-portable.zip`;
  const exeName = `${prefix}-portable.exe`;
  const checksumName = `${prefix}-SHA256.txt`;
  const endpoint = `https://api.github.com/repos/${repository}`;
  const existing = await fetch(`${endpoint}/releases/tags/${tag}`, { headers: apiHeaders });
  let release;
  if (existing.ok) {
    release = await existing.json();
    if (!release.draft) throw new Error('This release is already public; refusing to replace it.');
  } else if (existing.status !== 404) throw new Error(`Cannot check existing release: ${existing.status}`);

  const response = await fetch(`${endpoint}/git/blobs/${manifest.archiveBlob}`, { headers: { ...apiHeaders, Accept: 'application/vnd.github.raw+json' } });
  if (!response.ok) throw new Error(`Cannot download staged archive: ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.length !== manifest.archiveBytes || sha256(archive) !== manifest.archiveSha256) throw new Error('Archive checksum mismatch.');
  const output = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || require('node:os').tmpdir(), 'talebranch-release-'));
  const archivePath = path.join(output, archiveName);
  fs.writeFileSync(archivePath, archive);
  const expected = [exeName, 'README_RU.md', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md'].sort();
  const entries = execFileSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' }).trim().split(/\r?\n/).sort();
  if (JSON.stringify(entries) !== JSON.stringify(expected)) throw new Error('Unexpected files in portable archive.');
  execFileSync('unzip', ['-q', archivePath, '-d', output]);
  const exePath = path.join(output, exeName);
  if (sha256(fs.readFileSync(exePath)) !== manifest.exeSha256) throw new Error('Executable differs from the tested file.');
  for (const [packed, source] of [['README_RU.md', 'docs/PORTABLE_RU.md'], ['LICENSE.txt', 'LICENSE'], ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'], ['CHANGELOG.md', 'CHANGELOG.md']]) {
    const normalize = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (normalize(path.join(output, packed)) !== normalize(source)) throw new Error(`Stale packaged document: ${packed}`);
  }
  const checksumPath = path.join(output, checksumName);
  fs.writeFileSync(checksumPath, `${manifest.exeSha256.toUpperCase()}  ${exeName}\n${manifest.archiveSha256.toUpperCase()}  ${archiveName}\n`);
  if (!release) gh('release', 'create', tag, '--repo', repository, '--target', target, '--title', `TaleBranch ${tag} — Первая бета / First beta`, '--notes-file', `docs/releases/${tag}.md`, '--draft', '--prerelease');
  gh('release', 'upload', tag, archivePath, exePath, checksumPath, '--repo', repository, '--clobber');
  release = JSON.parse(gh('api', `repos/${repository}/releases/tags/${tag}`));
  const assets = release.assets;
  const requiredAssets = [[archiveName, archive.length], [exeName, fs.statSync(exePath).size], [checksumName, fs.statSync(checksumPath).size]];
  if (assets.length !== 3 || requiredAssets.some(([name, size]) => !assets.some(asset => asset.name === name && asset.size === size && asset.state === 'uploaded'))) throw new Error('Incomplete release upload; leaving draft.');
  gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--prerelease', '--latest=false', '--notes-file', `docs/releases/${tag}.md`);
  console.log(`Published https://github.com/${repository}/releases/tag/${tag}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
