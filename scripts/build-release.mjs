import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const manifestPath = path.join(root, 'manifest.json');
const packagePath = path.join(root, 'package.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

if (manifest.version !== pkg.version) {
  throw new Error(`Version mismatch: manifest=${manifest.version}, package=${pkg.version}`);
}

const version = manifest.version;
const releaseName = `workday-timesheet-helper-${version}`;
const distDir = path.join(root, 'dist');
const releaseDir = path.join(distDir, releaseName);
const zipPath = path.join(distDir, `${releaseName}.zip`);

const filesToCopy = [
  'LICENSE',
  'README.md',
  'chrome-web-store-listing.txt',
  'content.css',
  'content.js',
  'manifest.json',
  'popup.html',
  'popup.js',
  'privacy-policy.html',
];

const directoriesToCopy = [
  'icons',
];

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

for (const file of filesToCopy) {
  fs.copyFileSync(path.join(root, file), path.join(releaseDir, file));
}

for (const directory of directoriesToCopy) {
  fs.cpSync(path.join(root, directory), path.join(releaseDir, directory), { recursive: true });
}

if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath, { force: true });
}

const zipResult = spawnSync('zip', ['-rq', zipPath, '.'], {
  cwd: releaseDir,
  stdio: 'inherit',
});

if (zipResult.status !== 0) {
  throw new Error('zip command failed');
}

console.log(zipPath);