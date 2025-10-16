# Stabilize ORM CLI

<!--
<p align="center">
  <a href="https://www.npmjs.com/package/stabilize-cli"><img src="https://img.shields.io/npm/v/stabilize-cli.svg" alt="NPM Version"></a>
  <a href="https://github.com/ElectronSz/stabilize-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/stabilize-cli.svg" alt="License"></a>
  <a href="https://github.com/ElectronSz/stabilize-orm"><img src="https://img.shields.io/badge/ORM-Stabilize-blue.svg" alt="Stabilize ORM"></a>
</p>
-->

**The official command-line interface for the [Stabilize ORM](https://github.com/ElectronSz/stabilize-orm).**

---

`stabilize-cli` is the essential companion tool for Stabilize ORM, providing a powerful set of commands to manage your database schema, generate files, and run development tasks directly from your terminal.

---

## 🚀 Features

- **Code Generation**: Instantly scaffold new models, migrations, and seed files with a single command.
- **Multi-Column/Multi-Row Seeding**: Generate seed files for any combination of columns and rows, with safe rollback logic.
- **Schema Management**: Automatically generate database-specific SQL migrations from your existing models.
- **Lifecycle Hooks Support**: Scaffold models with hooks (`@Hook`) for `beforeCreate`, `afterUpdate`, etc.
- **Soft Deletes & Versioning**: Scaffold models with `@SoftDelete()` and `@Versioned()` for audit, rollback, and time-travel support.
- **Database Tooling**: Run migrations, roll them back, and check their status against the database.
- **Data Seeding with Dependencies**: Populate your database with test data, manage seed history, and respect dependencies between seed files.
- **Workflow Automation**: A powerful `db:reset` command to completely drop, migrate, and seed your database for a clean development slate.

- **TypeScript & Modern Node/Bun/Deno Support**: All files generated are TypeScript-first, and designed for modern runtimes.

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

The Stabilize CLI is designed to work within a project that has `stabilize-orm` installed and configured. It automatically looks for a `config/database.ts` file in your project's root directory to connect to the database.

---

## 💻 Commands

All commands are run using the `stabilize-cli` executable.

| Command                            | Description                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `generate model <Name>`            | Creates a new model file in `models/` with hooks, soft delete, and versioning. |
| `generate migration <ModelName>`   | Generates a new SQL migration from an existing model.                       |
| `generate seed <SeedName>`         | Creates a new seed file in `seeds/` |
| `migrate`                          | Applies all pending migrations to the database.                             |
| `migrate:rollback`                 | Rolls back the most recently applied migration.                             |
| `seed`                             | Runs all pending seed files, respecting dependencies.                       |
| `seed:rollback`                    | Rolls back the most recently applied seed.                                  |
| `status`                           | Shows the status (`APPLIED` or `PENDING`) of all migration and seed files.  |
| `db:drop`                          | Drops the entire database. **Use with caution.**                            |
| `db:reset`                         | Drops, creates, migrates, and seeds the database. For development only.     |

### Command Examples

**Generating a new `Product` model (with hooks, versioning, and soft delete):**
```bash
stabilize-cli generate model Product
# ✔ Success: Model generated: models/Product.ts
```

**Generating a migration from the `Product` model:**
```bash
stabilize-cli generate migration Product
# ✔ Success: Migration generated: migrations/20251015200737_create_product_table.json
```


**Generating a seed from the `Product` model:**
```bash
stabilize-cli generate seed Product
# ✔ Success: Seed generated: seeds/20251015200737_Product.ts
```

**Applying all pending migrations:**
```bash
stabilize-cli migrate
# ✔ Migrations applied successfully.
```

**Applying all pending seeds:**
```bash
stabilize-cli seed
# ✔ Seeds applied successfully.
```
**Checking the status of your database:**
```bash
stabilize-cli status

# Migration Status
# ---------------------------------
# [ APPLIED ] 20251015200737_create_product_table
#
# Seed Status
# ---------------------------------
# [ PENDING ] 20251015200800_InitialProducts
```

---

## 🧑‍💻 Advanced Usage

### Model Generation with Hooks and Soft Delete

By default, generated models include:
- `@SoftDelete()` on a `deleted_at` column.
- `@Versioned()` for audit and time-travel support.
- Lifecycle hooks using the `@Hook` decorator.

```typescript
import 'reflect-metadata';
import { Model, Column, DataTypes, SoftDelete, Versioned, Hook } from 'stabilize-orm';

@Model('products')
@Versioned()
export class Product {
  @Column({ type: DataTypes.INTEGER, name: 'id' })
  id!: number;

  @Column({ type: DataTypes.STRING, length: 150 })
  name!: string;

  @Column({ type: DataTypes.STRING, length: 100 })
  category!: string;

  @Column({ type: DataTypes.NUMERIC, name: 'price' })
  price!: number;

  @Column({ type: DataTypes.DATETIME, name: 'created_at' })
  createdAt!: Date;

  @Column({ type: DataTypes.DATETIME, name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: DataTypes.DATETIME, name: 'deleted_at' })
  @SoftDelete()
  deletedAt?: Date;

  @Hook('beforeCreate')
  setCreatedAt() {
    this.createdAt = new Date();
  }

  @Hook('beforeUpdate')
  setUpdatedAt() {
    this.updatedAt = new Date();
  }

  @Hook('afterCreate')
  logCreate() {
    console.log(\`Product created: \${this.id}\`);
  }
}
```


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
<em>File last updated: 2025-10-16 20:18:00 UTC</em>

</div>