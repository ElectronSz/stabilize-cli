# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-10-18

### Added
- Added `--force` flag to `db:drop` and `db:reset` commands to skip confirmation prompts for non-interactive use.
- Introduced programmatic `defineModel` API for model generation, replacing decorator-based approach.
- Added `figlet` dependency for enhanced banner display in CLI.

### Changed
- Updated model generation to use `defineModel` API, producing models with `ModelConfig`-based hooks and configuration.
- Updated `generate migration` command to use `MetadataStorage` instead of `reflect-metadata` for model metadata.
- Updated `README.md` to reflect `defineModel` API, remove decorator references, and document `--force` flag.
- Updated `package.json` to depend on `stabilize-orm@^1.3.0` for compatibility.
- Improved error messages in `generate` command for invalid models.

### Removed
- Removed dependency on `reflect-metadata` from CLI and generated model files.
- Removed `dotenv` dependency, as it was unused.

### Fixed
- Fixed Windows path handling in `seed` and `seed:rollback` commands using `toImportPath` for POSIX-style imports.
- Fixed TypeScript type for `spinner._timer` to `NodeJS.Timeout | null` for Bun compatibility.

## [1.0.1] - 2025-10-15

### Added
- Standalone `stabilize-cli` package.
- Full-featured CLI with `generate`, `migrate`, `seed`, `status`, and `db:reset` commands.
- Type-safe `@Column` decorator using `DataTypes` enum.

### Changed
- Rewrote `README.md` to reflect new features and CLI.
- Made `Stabilize.client` public for CLI access.

### Fixed
- Corrected `orm.rawQuery` to `orm.client.query` in CLI.
- Fixed transactional client creation in seed commands.

---
*File last updated: 2025-10-18 20:32:00 UTC*