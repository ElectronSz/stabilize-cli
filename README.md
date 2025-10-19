# Stabilize ORM CLI

<p align="center">
  <a href="https://www.npmjs.com/package/stabilize-cli"><img src="https://img.shields.io/npm/v/stabilize-cli.svg?label=version&color=blue" alt="NPM Version"></a>
  <a href="https://github.com/ElectronSz/stabilize-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/stabilize-cli.svg?color=green" alt="License"></a>
  <a href="https://github.com/ElectronSz/stabilize-orm"><img src="https://img.shields.io/badge/ORM-Stabilize%201.3.0-blue.svg" alt="Stabilize ORM"></a>
</p>

**The official command-line interface for the [Stabilize ORM](https://github.com/ElectronSz/stabilize-orm).**

---

`stabilize-cli` is the essential companion tool for Stabilize ORM, providing a powerful set of commands to manage your database schema, generate files, and run development tasks directly from your terminal.

---

## 🚀 Features

- **Code Generation**: Instantly scaffold new models, migrations, and seed files with a single command.
- **Flexible Field Arguments for Models**: Pass column definitions as arguments to `generate model`, e.g., `name:string active:boolean`.
- **Multi-Row Seeding**: Use `--count <number>` (or `-n <number>`) with `generate seed` to control how many seed rows are generated, using the model's schema.
- **Schema Management**: Automatically generate database-specific SQL migrations from your existing models.
- **Lifecycle Hooks Support**: Scaffold models with hooks defined in `ModelConfig` or as class methods for `beforeCreate`, `afterUpdate`, etc.
- **Soft Deletes & Versioning**: Scaffold models with `softDelete` and `versioned` options for audit, rollback, and time-travel support.
- **Database Tooling**: Run migrations, roll them back, and check their status against the database.
- **Data Seeding with Dependencies**: Populate your database with test data, manage seed history, and respect dependencies between seed files.
- **Cross-DB Compatibility**: Seed and migration history tables are now created with auto-increment `id` and proper string/timestamp types for MySQL, Postgres, and SQLite.
- **Workflow Automation**: A powerful `db:reset` command to drop, migrate, and seed your database for a clean development slate, with a `--force` flag for non-interactive use.
- **TypeScript & Modern Bun Support**: All files generated are TypeScript-first, designed for Bun runtimes.

---

## 📦 Installation

For the best experience, install the CLI globally using your preferred package manager.

```bash
# Using npm
npm install -g stabilize-cli

# Using Bun
bun add -g stabilize-cli
```

After installation, the `stabilize-cli` command will be available in your terminal.

---

## ✅ Prerequisites

The Stabilize CLI is designed to work within a project that has `stabilize-orm@^1.3.0` installed and configured. It automatically looks for a `config/database.ts` file in your project's root directory to connect to the database.

---

## 💻 Commands

All commands are run using the `stabilize-cli` executable.

| Command                            | Description                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `generate model <Name> [fields...]`         | Creates a new model file in `models/` with hooks, soft delete, and versioning. Pass column definitions as extra arguments (e.g. `name:string active:boolean`). |
| `generate migration <ModelName>`   | Generates a new SQL migration from an existing model.                       |
| `generate seed <SeedName>`         | Creates a new seed file in `seeds/`, based on the model schema. Use `--count <number>` or `-n <number>` to control number of rows. |
| `migrate`                          | Applies all pending migrations to the database.                             |
| `migrate:rollback`                 | Rolls back the most recently applied migration.                             |
| `seed`                             | Runs all pending seed files, respecting dependencies.                       |
| `seed:rollback`                    | Rolls back the most recently applied seed.                                  |
| `status`                           | Shows the status (`APPLIED` or `PENDING`) of all migration and seed files.  |
| `db:drop [--force]`                | Drops all tables in the database. Use `--force` to skip confirmation. **Use with caution.** |
| `db:reset [--force]`               | Drops, migrates, and seeds the database. Use `--force` to skip confirmation. For development only. |

### Command Examples

**Generating a new `User` model with custom fields:**
```bash
stabilize-cli generate model User name:string active:boolean email:string
# ✔ Success: Model generated: models/User.ts
```

**Generating a seed file for `User` with 10 rows (uses model's schema):**
```bash
stabilize-cli generate seed User --count 10
# ✔ Success: Seed generated: seeds/20251019135400_User.ts
```

**Generating a migration from the `Product` model:**
```bash
stabilize-cli generate migration Product
# ✔ Success: Migration generated: migrations/20251018203000_create_product_table.json
```

**Applying all pending migrations:**
```bash
stabilize-cli migrate
# ✔ All pending migrations applied.
```

**Applying all pending seeds:**
```bash
stabilize-cli seed
# ✔ Successfully applied 1 seed(s).
```

**Resetting the database non-interactively:**
```bash
stabilize-cli db:reset --force
# ✔ Database reset complete.
```

**Checking the status of your database:**
```bash
stabilize-cli status

# Migration Status
# ---------------------------------
# [ APPLIED ] 20251018203000_create_product_table
#
# Seed Status
# ---------------------------------
# [ PENDING ] 20251018203000_Product
```

---

## 🧑‍💻 Advanced Usage

### Model Generation with Hooks and Soft Delete

By default, generated models include:
- `versioned: true` for audit and time-travel support.
- `softDelete: true` with a `deletedAt` column for soft deletes.
- Lifecycle hooks defined in `ModelConfig` and as class methods.
- **Custom columns**: Pass fields as arguments, e.g. `name:string isActive:boolean createdAt:date`.

```bash
stabilize-cli generate model Product name:string category:string price:numeric
```

## 📃 Project Documentation

- [Changelog](./CHANGELOG.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
- [Support](./SUPPORT.md)
- [Funding](./FUNDING.md)

---

## 🤝 Contributing

Contributions are welcome! Please read the [Contributing Guide](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

---

## 📑 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

<div align="center">

Created with ❤️ by **ElectronSz**  
<em>File last updated: 2025-10-19 13:59:00 UTC</em>

</div>