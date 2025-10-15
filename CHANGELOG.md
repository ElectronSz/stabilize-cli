# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
*File last updated: 2025-10-15 20:08:41 UTC*