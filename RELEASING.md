# Releasing

## Prerequisites

- `manifest.json` and `package.json` must have the same version string.
- A `release-notes/vX.Y.Z.md` file must exist for the version being released.

## Steps

1. Update the version in both `manifest.json` and `package.json`.
2. Create `release-notes/vX.Y.Z.md` with the change notes.
3. Commit and push:

   ```bash
   git add .
   git commit -m "Release vX.Y.Z"
   git push origin main
   ```

4. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

GitHub Actions (`.github/workflows/release.yml`) detects the new tag, builds the zip, and attaches it to a GitHub Release automatically.

The published release appears at:
`https://github.com/RossRichardson/wdtime/releases`

## Re-running for an existing tag

If you need to rebuild and re-publish an existing release:

```bash
gh workflow run release.yml -f tag=vX.Y.Z
```

## Building locally

```bash
npm run release:build
```

The zip is written to `dist/workday-timesheet-helper-X.Y.Z.zip`.
