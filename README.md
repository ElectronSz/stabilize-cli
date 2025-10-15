# Stabilize ORM CLI

<!-- <p align="center">
  <a href="https://www.npmjs.com/package/stabilize-cli"><img src="https://img.shields.io/npm/v/stabilize-cli.svg" alt="NPM Version"></a>
  <a href="https://github.com/ElectronSz/stabilize-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/stabilize-cli.svg" alt="License"></a>
  <a href="https://github.com/ElectronSz/stabilize-orm"><img src="https://img.shields.io/badge/ORM-Stabilize-blue.svg" alt="Stabilize ORM"></a>
</p> -->

**The official command-line interface for the [Stabilize ORM](https://github.com/ElectronSz/stabilize-orm).**

---

`stabilize-cli` is the essential companion tool for the Stabilize ORM, providing a powerful set of commands to manage your database schema, generate files, and run development tasks directly from your terminal.

---

## 🚀 Features

-   **Code Generation**: Instantly scaffold new models, migrations, and seed files with a single command.
-   **Schema Management**: Automatically generate database-specific SQL migrations from your existing models.
-   **Database Tooling**: Run migrations, roll them back, and check their status against the database.
-   **Data Seeding**: Populate your database with test data, manage seed history, and respect dependencies between seed files.
-   **Workflow Automation**: A powerful `db:reset` command to completely drop, migrate, and seed your database for a clean development slate.

---

## 📦 Installation

For the best experience, install the CLI globally using your preferred package manager.

```bash
# Using npm
npm install -g stabilize-cli

# Using Bun
bun add -g stabilize-cli
```

After installation, the `stabilize` command will be available in your terminal.

---

## ✅ Prerequisites

The Stabilize CLI is designed to work within a project that has `stabilize-orm` installed and configured. It automatically looks for a `config/database.ts` file in your project's root directory to connect to the database.

---

## 💻 Commands

All commands are run using the `stabilize` executable.

| Command                            | Description                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `generate model <Name>`            | Creates a new model file in `models/`.                                      |
| `generate migration <ModelName>`   | Generates a new SQL migration from an existing model.                       |
| `generate seed <SeedName>`         | Creates a new seed file in `seeds/`.                                        |
| `migrate`                          | Applies all pending migrations to the database.                             |
| `migrate:rollback`                 | Rolls back the most recently applied migration.                             |
| `seed`                             | Runs all pending seed files, respecting dependencies.                       |
| `seed:rollback`                    | Rolls back the most recently applied seed.                                  |
| `status`                           | Shows the status (`APPLIED` or `PENDING`) of all migration and seed files.  |
| `db:drop`                          | Drops the entire database. **Use with caution.**                            |
| `db:reset`                         | Drops, creates, migrates, and seeds the database. For development only.     |

### Command Examples

**Generating a new `Product` model:**
```bash
stabilize generate model Product
# ✔ Success: Model generated: models/Product.ts
```

**Generating a migration from the `Product` model:**
```bash
stabilize generate migration Product
# ✔ Success: Migration generated: migrations/20251015200737_create_product_table.json
```

**Applying all pending migrations:**
```bash
stabilize migrate
# ✔ Migrations applied successfully.
```

**Checking the status of your database:**
```bash
stabilize status

# Migration Status
# ---------------------------------
# [ APPLIED ] 20251015200737_create_product_table
#
# Seed Status
# ---------------------------------
# [ PENDING ] 20251015200800_InitialProducts
```

---

## 📃 Project Documentation

-   [Changelog](./CHANGELOG.md)
-   [Contributing Guide](./CONTRIBUTING.md)
-   [Code of Conduct](./CODE_OF_CONDUCT.md)
-   [Security Policy](./SECURITY.md)
-   [Support](./SUPPORT.md)
-   [Funding](./FUNDING.md)

---

## 🤝 Contributing

Contributions are welcome! Please read the [Contributing Guide](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

---

## 📑 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

<div align="center">

Created with ❤️ by **ElectronSz**
<br/>
*File last updated: 2025-10-15 20:13:44 UTC*

</div>