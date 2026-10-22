# Releasing fleeet-server

This document describes the release process for fleeet-server.

## Versioning

fleeet-server follows [Semantic Versioning](https://semver.org/) (SemVer):
- **MAJOR** (X.0.0): Breaking changes to the API, database schema, or event schema
- **MINOR** (0.X.0): New features, backward-compatible
- **PATCH** (0.0.X): Bug fixes, backward-compatible

Starting version: `0.1.0`

## Changelog

All notable changes are documented in `CHANGELOG.md` following the [Keep a Changelog](https://keepachangelog.com/) format.

Maintain an `[Unreleased]` section at the top for changes not yet released. When preparing a release, this section becomes the release notes.

## Release Process

### 1. Prepare the Release (Agent-Assisted)

Agents can prepare a release PR containing:

1. **Version bump** in:
   - `apps/server/package.json`
   - `README.md` (if version is mentioned)
   - Any other files referencing the version

2. **CHANGELOG.md update**:
   - Move the `[Unreleased]` section content to a new dated section: `[X.Y.Z] - YYYY-MM-DD`
   - Add a new empty `[Unreleased]` section at the top
   - Include matching `@fleeet/core` version and event schema version

3. **Validation**:
   - All tests pass
   - Docker image builds successfully
   - No unreleased breaking changes without a major version bump

**Example PR title**: `Release v0.2.0`

### 2. Tag and Release (Ronan Only)

Once the release PR is merged to `main`:

```bash
# Ensure you're on main with the merged release commit
git checkout main
git pull origin main

# Create and push the tag
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

The `v*` tag triggers the automated release workflow.

### 3. Automated Release Workflow

The `.github/workflows/release.yml` workflow automatically:
1. Runs the full test suite
2. Builds multi-arch Docker images (amd64, arm64)
3. Pushes to GitHub Container Registry:
   - `ghcr.io/nan-labs/fleeet-server:X.Y.Z`
   - `ghcr.io/nan-labs/fleeet-server:latest`
4. Creates a GitHub Release with changelog notes

### 4. Release Checklist

Before tagging:
- [ ] All PRs for this milestone are merged
- [ ] CHANGELOG.md has the release section with correct date
- [ ] Version bumped in all files
- [ ] `@fleeet/core` version documented in changelog
- [ ] Event schema version documented in changelog
- [ ] CI is green on main
- [ ] Docker build tested locally
- [ ] Release notes mention roadmap items closed (for reporting to Flo)

After tagging:
- [ ] Verify GHCR images are published
- [ ] Verify GitHub Release is created
- [ ] Test pulling and running the new image
- [ ] Report to Flo: "vX.Y.Z released, closes [roadmap items]"

## Rollback

To roll back a deployment, pin to the previous image tag:

```bash
# In docker-compose.yml or deployment config
image: ghcr.io/nan-labs/fleeet-server:0.1.0  # Previous working version
```

Do not delete tags or images from GHCR. If a release has critical issues, publish a new patch or minor version with the fix.

## Troubleshooting

**Release workflow fails:**
- Check CI logs in GitHub Actions
- Verify GITHUB_TOKEN has `packages: write` permission
- Ensure tag format is `vX.Y.Z` (lowercase v prefix)

**Docker build fails:**
- Test locally: `docker build -t fleeet-server:test .`
- Check for missing dependencies
- Verify multi-arch build with: `docker buildx build --platform linux/amd64,linux/arm64 .`

**Missing changelog entry:**
- Never skip the changelog. If a release needs to go out urgently, write a minimal entry and expand it in a follow-up patch.
