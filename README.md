# Stabilize ORM CLI

<p align="left">
  <a href="https://www.npmjs.com/package/stabilize-cli"><img src="https://img.shields.io/npm/v/stabilize-cli.svg?label=version&color=blue" alt="NPM Version"></a>
  <a href="https://github.com/ElectronSz/stabilize-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/stabilize-cli.svg?color=green" alt="License"></a>
  <a href="https://github.com/ElectronSz/stabilize-orm"><img src="https://img.shields.io/badge/ORM-Stabilize%202.1.0-blue.svg" alt="Stabilize ORM"></a>
</p>

**The official command-line interface for the [Stabilize ORM](https://github.com/ElectronSz/stabilize-orm).**

---

`stabilize-cli` is the essential companion tool for Stabilize ORM, providing a powerful set of commands to manage your database schema, generate files, and run development tasks directly from your terminal.

---

## Features

- **Code Generation**: Instantly scaffold new models, migrations, seed files, and REST API routes.
- **Flexible Field Arguments**: Pass column definitions as arguments to `generate model`, e.g. `name:string active:boolean`.
- **Multi-Row Seeding**: Use `--count <number>` with `generate seed` to control seed row count.
- **Schema Management**: Auto-generate database-specific SQL migrations from models.
- **Soft Deletes & Versioning**: Scaffold models with `softDelete` and `versioned` options.
- **Database Backup & Restore**: Backup and restore your database with `db:backup` and `db:restore`.
- **REST API Generation**: Generate full CRUD API scaffolds with `generate:api`.
- **Fresh Migrations**: Drop and re-migrate with `migrate:fresh` (no seed).
- **Database Size Analysis**: View table sizes and row counts with `db:size`.
- **Cross-DB Compatibility**: Works with MySQL, PostgreSQL, and SQLite.
- **TypeScript & Bun Support**: All generated files are TypeScript-first.

---

## Installation

```bash
# Using npm
npm install -g stabilize-cli

# Using Bun
bun add -g stabilize-cli
```

---

## Commands

| Command                             | Description                                     |
| ----------------------------------- | ----------------------------------------------- |
| `generate model <Name> [fields...]` | Create a new model file in `models/`            |
| `generate migration <Name>`         | Generate a migration from a model               |
| `generate seed <Name>`              | Generate a seed file. Use `--count <n>`         |
| `generate api <Name>`               | Generate a REST API scaffold from a model       |
| `migrate`                           | Apply all pending migrations                    |
| `migrate:rollback`                  | Roll back the most recent migration             |
| `migrate:fresh`                     | Drop all tables and re-run migrations           |
| `seed`                              | Run all pending seed files                      |
| `db:drop [--force]`                 | Drop all tables (use `--force` to skip confirm) |
| `db:reset [--force]`                | Drop, migrate, and seed the database            |
| `db:backup`                         | Backup the database to a timestamped file       |
| `db:restore <file>`                 | Restore from a backup file                      |
| `db:tables`                         | List all tables with row counts                 |
| `db:size`                           | Show database and table size statistics         |
| `status`                            | Show migration and seed status                  |
| `health`                            | Check database and cache health                 |
| `query <sql>`                       | Execute a raw SQL query                         |
| `info`                              | Show CLI and environment information            |

### Command Examples

**Generate a User model:**

```bash
stabilize-cli generate model User name:string active:boolean email:string
```

**Generate a REST API scaffold:**

```bash
stabilize-cli generate api User
# Creates api/User.ts with full CRUD routes
```

**Backup the database:**

```bash
stabilize-cli db:backup
# Creates backups/backup_20250101120000.db
```

**Restore from backup:**

```bash
stabilize-cli db:restore backups/backup_20250101120000.db --force
```

**Fresh migration (drop + migrate):**

```bash
stabilize-cli migrate:fresh --force
```

**View database size:**

```bash
stabilize-cli db:size
# Shows file size, table count, and row counts
```

**Check status:**

```bash
stabilize-cli status
```

---

## Project Documentation

- [Changelog](./CHANGELOG.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
- [Support](./SUPPORT.md)
- [Funding](./FUNDING.md)

---

## License

MIT License - see [LICENSE](./LICENSE).

---

<div align="center">
Created by **ElectronSz**
</div>
