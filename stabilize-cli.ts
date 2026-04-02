#!/usr/bin/env bun
/**
 * @file stabilize-cli.ts
 * @description The command-line interface for the Stabilize ORM.
 * @author ElectronSz
 */

import { program } from "commander";
import {
  generateMigration,
  runMigrations,
  Stabilize,
  defineModel,
  DBType,
  LogLevel,
  autoMigrate,
  resetDatabase,
  StabilizeError,
  type DBConfig,
  type LoggerConfig,
  type Migration,
} from "../index";
import { MetadataStorage } from "../model";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import readline from "readline";

const version = "2.2.0";

const C = {
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  DIM: "\x1b[2m",
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  MAGENTA: "\x1b[35m",
  CYAN: "\x1b[36m",
  WHITE: "\x1b[37m",
  BG_GREEN: "\x1b[42m\x1b[30m",
  BG_RED: "\x1b[41m\x1b[37m",
  BG_YELLOW: "\x1b[43m\x1b[30m",
};

const CLILogger = {
  info: (msg: string) => console.log(`${C.BLUE}ℹ${C.RESET} ${msg}`),
  success: (msg: string) =>
    console.log(`${C.GREEN}✔${C.RESET} ${C.GREEN}${msg}${C.RESET}`),
  warn: (msg: string) => console.log(`${C.YELLOW}⚠${C.RESET} ${msg}`),
  error: (msg: string, details?: string) => {
    console.error(`\n${C.BG_RED} ERROR ${C.RESET} ${C.RED}${msg}${C.RESET}`);
    if (details) console.error(`${C.DIM}${details}${C.RESET}`);
    console.log();
  },
  panic: (error: Error, command: string) => {
    CLILogger.error(`Fatal error in '${command}' command.`, error.stack);
    process.exit(1);
  },
};

const spinner = {
  chars: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  interval: 80,
  _timer: null as NodeJS.Timeout | null,
  start: (message: string) => {
    let i = 0;
    process.stdout.write("\n");
    spinner._timer = setInterval(() => {
      process.stdout.write(
        `\r${C.CYAN}${spinner.chars[i++ % spinner.chars.length]}${C.RESET} ${message}`,
      );
    }, spinner.interval);
  },
  stop: (success: boolean, message: string) => {
    if (spinner._timer) clearInterval(spinner._timer);
    process.stdout.write(
      `\r${success ? `${C.GREEN}✔` : `${C.RED}✖`} ${message}\n\n`,
    );
  },
};

function displayBanner() {
  console.log(
    `${C.CYAN}╔════════════════════════════════════════════════════╗${C.RESET}`,
  );
  console.log(
    `${C.CYAN}║${C.RESET}  ${C.BRIGHT}Stabilize CLI${C.RESET} ${C.GREEN}v${version}${C.RESET}                              ${C.CYAN}║${C.RESET}`,
  );
  console.log(
    `${C.CYAN}║${C.RESET}  ${C.DIM}Developed by ElectronSz${C.RESET}                         ${C.CYAN}║${C.RESET}`,
  );
  console.log(
    `${C.CYAN}╚════════════════════════════════════════════════════╝${C.RESET}`,
  );
  console.log();
}

async function loadConfig(
  configPath: string,
): Promise<{ config: DBConfig; orm: Stabilize }> {
  const absolutePath = path.resolve(process.cwd(), configPath);
  const configModule = await import(absolutePath);
  const config: DBConfig =
    configModule.dbConfig || configModule.default || configModule;
  const logLevelKey = (program.opts().logLevel ||
    "Info") as keyof typeof LogLevel;
  const loggerConfig: LoggerConfig = {
    level: LogLevel[logLevelKey] ?? LogLevel.Info,
  };
  const orm = new Stabilize(config, { enabled: false, ttl: 60 }, loggerConfig);
  return { config, orm };
}

function formatQuery(query: string, dbType: string): string {
  if (dbType === DBType.Postgres) {
    let idx = 0;
    return query.replace(/\?/g, () => `$${++idx}`);
  }
  return query;
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(
      `${C.YELLOW}⚠${C.RESET} ${question} ${C.DIM}(y/N)${C.RESET} `,
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y");
      },
    );
  });
}

if (
  process.argv.length <= 2 ||
  process.argv.includes("--help") ||
  process.argv.includes("-h")
) {
  displayBanner();
}

// ═══════════════════════════════════════════════════════════════════
// COMMAND: generate model
// ═══════════════════════════════════════════════════════════════════
program
  .command("generate:model <name> [fields...]")
  .alias("g:model")
  .alias("g:m")
  .description("Generate a new model file with defineModel.")
  .option("--no-timestamps", "Disable createdAt/updatedAt timestamps")
  .option("--no-soft-delete", "Disable soft delete")
  .option("--versioned", "Enable version history")
  .action(async (name: string, fields: string[] = [], opts: any) => {
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    const modelDir = path.resolve(process.cwd(), "models");
    await fs.mkdir(modelDir, { recursive: true });
    const filePath = path.join(modelDir, `${name}.ts`);

    const typeMap: Record<string, string> = {
      string: "DataTypes.STRING",
      text: "DataTypes.TEXT",
      int: "DataTypes.INTEGER",
      integer: "DataTypes.INTEGER",
      bigint: "DataTypes.BIGINT",
      float: "DataTypes.FLOAT",
      double: "DataTypes.DOUBLE",
      decimal: "DataTypes.DECIMAL",
      bool: "DataTypes.BOOLEAN",
      boolean: "DataTypes.BOOLEAN",
      date: "DataTypes.DATE",
      datetime: "DataTypes.DATETIME",
      json: "DataTypes.JSON",
      uuid: "DataTypes.UUID",
      blob: "DataTypes.BLOB",
    };

    const columns = [
      `    id: { type: DataTypes.STRING, required: true, unique: true },`,
    ];
    for (const arg of fields) {
      let [field, typeRaw] = arg.split(":");
      if (!field?.trim()) continue;
      const dt =
        typeMap[(typeRaw || "string").toLowerCase()] || "DataTypes.STRING";
      columns.push(`    ${field.trim()}: { type: ${dt} },`);
    }

    if (opts.softDelete) {
      columns.push(
        `    deletedAt: { type: DataTypes.DATETIME, softDelete: true },`,
      );
    }

    const content =
      [
        `import { defineModel, DataTypes } from "stabilize-orm";`,
        ``,
        `const ${cap} = defineModel({`,
        `  tableName: "${name.toLowerCase()}s",`,
        opts.versioned ? `  versioned: true,` : null,
        opts.timestamps
          ? `  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },`
          : null,
        `  columns: {`,
        ...columns,
        `  },`,
        `  relations: [],`,
        `  scopes: {},`,
        `});`,
        ``,
        `export { ${cap} };`,
      ]
        .filter(Boolean)
        .join("\n") + "\n";

    await fs.writeFile(filePath, content);
    CLILogger.success(`Model generated: ${filePath}`);
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: generate migration
// ═══════════════════════════════════════════════════════════════════
program
  .command("generate:migration <name>")
  .alias("g:migration")
  .alias("g:mg")
  .description("Generate a migration file from a model.")
  .option("-m, --model <name>", "Model name")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (name: string, opts: any) => {
    try {
      const modelName = opts.model || name;
      const cap = modelName.charAt(0).toUpperCase() + modelName.slice(1);
      const modelPath = path.resolve(
        process.cwd(),
        "models",
        `${modelName}.ts`,
      );
      const { config } = await loadConfig(opts.config);
      const modelModule = await import(modelPath);
      const modelClass = modelModule[cap];
      if (!modelClass || !MetadataStorage.getModelMetadata(modelClass)) {
        throw new Error(
          `'${cap}' in '${modelPath}' is not a valid defineModel.`,
        );
      }
      const migration = await generateMigration(
        modelClass,
        `create_${name}_table`,
        config.type,
      );
      const migrationDir = path.resolve(process.cwd(), "migrations");
      await fs.mkdir(migrationDir, { recursive: true });
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T.]/g, "")
        .slice(0, 14);
      const fileName = `${timestamp}_create_${name}_table.json`;
      migration.name = path.basename(fileName, ".json");
      const filePath = path.join(migrationDir, fileName);
      await fs.writeFile(filePath, JSON.stringify(migration, null, 2));
      CLILogger.success(`Migration generated: ${filePath}`);
    } catch (err) {
      CLILogger.panic(err as Error, "generate:migration");
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: generate seed
// ═══════════════════════════════════════════════════════════════════
program
  .command("generate:seed <name>")
  .alias("g:seed")
  .alias("g:s")
  .description("Generate a seed file for a model.")
  .option("-n, --count <number>", "How many rows to generate", "5")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (name: string, opts: any) => {
    try {
      const cap = name.charAt(0).toUpperCase() + name.slice(1);
      const seedDir = path.resolve(process.cwd(), "seeds");
      await fs.mkdir(seedDir, { recursive: true });
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T.]/g, "")
        .slice(0, 14);
      const fileName = `${timestamp}_seed_${name}.ts`;
      const filePath = path.join(seedDir, fileName);

      const modelPath = path.resolve(process.cwd(), "models", `${name}.ts`);
      const { config } = await loadConfig(opts.config);
      const modelModule = await import(modelPath);
      const modelClass = modelModule[cap];
      if (!modelClass || !MetadataStorage.getModelMetadata(modelClass)) {
        throw new Error(
          `'${cap}' in '${modelPath}' is not a valid defineModel.`,
        );
      }
      const columns = MetadataStorage.getColumns(modelClass);
      const count = Math.max(1, Number(opts.count) || 5);
      const seedRows = Array.from({ length: count }, (_, i) => {
        const row: Record<string, any> = {};
        for (const [key, col] of Object.entries(columns)) {
          if ((col as any).softDelete) continue;
          if (key === "id") {
            row[key] = crypto.randomUUID();
            continue;
          }
          const t =
            typeof col.type === "string"
              ? col.type
              : DataTypes[col.type]?.toLowerCase();
          if (t === "boolean") row[key] = i % 2 === 0;
          else if (t === "integer" || t === "bigint") row[key] = i + 1;
          else if (t === "string" || t === "text")
            row[key] = (col as any).unique ? `${key}_${i}` : `${key}_data`;
          else if (t === "datetime" || t === "date")
            row[key] = new Date().toISOString();
          else if (t === "float" || t === "double" || t === "decimal")
            row[key] = (i + 1) * 1.5;
          else row[key] = null;
        }
        return row;
      });

      const content =
        [
          `import { Stabilize } from "stabilize-orm";`,
          `import { generateUUID } from "stabilize-orm";`,
          `import { ${cap} } from "../models/${name}";`,
          ``,
          `export async function seed(orm: Stabilize) {`,
          `  const repo = orm.getRepository(${cap});`,
          `  await repo.bulkCreate(${JSON.stringify(seedRows, null, 2)});`,
          `  console.log("Seeded ${seedRows.length} ${name}(s)");`,
          `}`,
        ].join("\n") + "\n";

      await fs.writeFile(filePath, content);
      CLILogger.success(`Seed generated: ${filePath}`);
    } catch (err) {
      CLILogger.panic(err as Error, "generate:seed");
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: migrate
// ═══════════════════════════════════════════════════════════════════
program
  .command("migrate")
  .description("Apply all pending database migrations.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;
      const migrationDir = path.resolve(process.cwd(), "migrations");
      const files = (await glob(`${migrationDir}/*.json`)).sort();
      const migrations: Migration[] = await Promise.all(
        files.map(async (f) => JSON.parse(await fs.readFile(f, "utf-8"))),
      );
      if (!migrations.length) {
        CLILogger.warn("No migration files found.");
        return;
      }
      spinner.start(`Applying ${migrations.length} migration(s)...`);
      await runMigrations(config, migrations);
      spinner.stop(true, `All ${migrations.length} migration(s) applied.`);
    } catch (err) {
      spinner.stop(false, "Migration failed.");
      CLILogger.panic(err as Error, "migrate");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: migrate:rollback
// ═══════════════════════════════════════════════════════════════════
program
  .command("migrate:rollback")
  .description("Roll back the most recent migration.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { orm: o } = await loadConfig(opts.config);
      orm = o;
      spinner.start("Rolling back last migration...");
      const [latest] = await orm.client.query<{ name: string }>(
        `SELECT name FROM stabilize_migrations ORDER BY applied_at DESC, name DESC LIMIT 1`,
      );
      if (!latest) {
        spinner.stop(false, "No migrations to roll back.");
        return;
      }
      const migrationFile = path.resolve(
        process.cwd(),
        "migrations",
        `${latest.name}.json`,
      );
      const migration: Migration = JSON.parse(
        await fs.readFile(migrationFile, "utf-8"),
      );
      await orm.transaction(async (tx) => {
        for (const q of migration.down) await tx.query(q);
        await tx.query(`DELETE FROM stabilize_migrations WHERE name = ?`, [
          latest.name,
        ]);
      });
      spinner.stop(true, `Rolled back: ${latest.name}`);
    } catch (err) {
      spinner.stop(false, "Rollback failed.");
      CLILogger.panic(err as Error, "migrate:rollback");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: seed
// ═══════════════════════════════════════════════════════════════════
program
  .command("seed")
  .description("Run all pending seed files.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { orm: o } = await loadConfig(opts.config);
      orm = o;
      const dbType = orm.client.config.type;
      const seedTableSQL =
        dbType === DBType.MySQL
          ? `CREATE TABLE IF NOT EXISTS stabilize_seed_history (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, applied_at DATETIME NOT NULL)`
          : dbType === DBType.Postgres
            ? `CREATE TABLE IF NOT EXISTS stabilize_seed_history (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, applied_at TIMESTAMP WITH TIME ZONE NOT NULL)`
            : `CREATE TABLE IF NOT EXISTS stabilize_seed_history (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, applied_at TEXT NOT NULL)`;
      await orm.client.query(seedTableSQL);

      const seedDir = path.resolve(process.cwd(), "seeds");
      const seedFiles = (await glob(`${seedDir}/*.ts`)).sort();
      if (!seedFiles.length) {
        CLILogger.warn("No seed files found.");
        return;
      }

      const applied = new Set(
        (
          await orm.client.query<{ name: string }>(
            `SELECT name FROM stabilize_seed_history`,
          )
        ).map((r) => r.name),
      );
      const pending = seedFiles.filter(
        (f) => !applied.has(path.basename(f, ".ts")),
      );
      if (!pending.length) {
        CLILogger.info("All seeds already applied.");
        return;
      }

      spinner.start(`Running ${pending.length} seed(s)...`);
      for (const file of pending) {
        const name = path.basename(file, ".ts");
        const mod = await import(path.resolve(file).replace(/\\/g, "/"));
        await mod.seed(orm);
        const now = new Date().toISOString();
        await orm.client.query(
          formatQuery(
            `INSERT INTO stabilize_seed_history (name, applied_at) VALUES (?, ?)`,
            dbType,
          ),
          [
            name,
            dbType === DBType.MySQL ? now.slice(0, 19).replace("T", " ") : now,
          ],
        );
      }
      spinner.stop(true, `Applied ${pending.length} seed(s).`);
    } catch (err) {
      spinner.stop(false, "Seeding failed.");
      CLILogger.panic(err as Error, "seed");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:drop
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:drop")
  .description("Drop all tables in the database. DANGEROUS.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .option("-f, --force", "Skip confirmation")
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;
      const dbName =
        config.type === DBType.SQLite
          ? config.connectionString
          : new URL(config.connectionString).pathname.slice(1);

      if (
        !opts.force &&
        !(await confirm(
          `Drop ALL TABLES in '${dbName}'? This cannot be undone.`,
        ))
      ) {
        CLILogger.warn("Cancelled.");
        return;
      }

      spinner.start(`Dropping all tables...`);

      if (config.type === DBType.SQLite) {
        await orm.close();
        orm = null;
        const absPath = path.isAbsolute(dbName)
          ? dbName
          : path.resolve(process.cwd(), dbName);
        try {
          await fs.unlink(absPath);
        } catch {}
        spinner.stop(true, `SQLite database deleted: ${absPath}`);
      } else {
        const query =
          config.type === DBType.Postgres
            ? `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
            : `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`;
        const tables = await orm.client.query<any>(query);
        for (const t of tables) {
          const tbl = t.tablename || t.table_name;
          const dropQ =
            config.type === DBType.Postgres
              ? `DROP TABLE IF EXISTS "${tbl}" CASCADE`
              : `DROP TABLE IF EXISTS \`${tbl}\``;
          await orm.client.query(dropQ);
        }
        spinner.stop(true, `All tables dropped.`);
      }
    } catch (err) {
      spinner.stop(false, "Drop failed.");
      CLILogger.panic(err as Error, "db:drop");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:reset
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:reset")
  .description("Drop, migrate, and seed the database.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .option("-f, --force", "Skip confirmation")
  .action(async (opts) => {
    CLILogger.warn("This will destroy and rebuild your database.");
    let orm: Stabilize | null = null;
    try {
      // Drop
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;
      const dbName =
        config.type === DBType.SQLite
          ? config.connectionString
          : new URL(config.connectionString).pathname.slice(1);

      if (
        !opts.force &&
        !(await confirm(
          `Drop ALL TABLES in '${dbName}'? This cannot be undone.`,
        ))
      ) {
        CLILogger.warn("Cancelled.");
        return;
      }

      spinner.start("Dropping all tables...");
      if (config.type === DBType.SQLite) {
        await orm.close();
        orm = null;
        const absPath = path.isAbsolute(dbName)
          ? dbName
          : path.resolve(process.cwd(), dbName);
        try {
          await fs.unlink(absPath);
        } catch {}
        spinner.stop(true, "Tables dropped.");
      } else {
        const query =
          config.type === DBType.Postgres
            ? `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
            : `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`;
        const tables = await orm.client.query<any>(query);
        for (const t of tables) {
          const tbl = t.tablename || t.table_name;
          const dropQ =
            config.type === DBType.Postgres
              ? `DROP TABLE IF EXISTS "${tbl}" CASCADE`
              : `DROP TABLE IF EXISTS \`${tbl}\``;
          await orm.client.query(dropQ);
        }
        spinner.stop(true, "Tables dropped.");
      }

      // Migrate
      if (!orm) {
        const result = await loadConfig(opts.config);
        orm = result.orm;
      }
      const migrationDir = path.resolve(process.cwd(), "migrations");
      const files = (await glob(`${migrationDir}/*.json`)).sort();
      const migrations: Migration[] = await Promise.all(
        files.map(async (f) => JSON.parse(await fs.readFile(f, "utf-8"))),
      );
      if (migrations.length) {
        spinner.start(`Applying ${migrations.length} migration(s)...`);
        await runMigrations(config, migrations);
        spinner.stop(true, `${migrations.length} migration(s) applied.`);
      }

      // Seed
      const seedDir = path.resolve(process.cwd(), "seeds");
      const seedFiles = (await glob(`${seedDir}/*.ts`)).sort();
      if (seedFiles.length) {
        spinner.start(`Running ${seedFiles.length} seed(s)...`);
        for (const file of seedFiles) {
          const mod = await import(path.resolve(file).replace(/\\/g, "/"));
          if (typeof mod.seed === "function") {
            await mod.seed(orm);
          }
        }
        spinner.stop(true, `${seedFiles.length} seed(s) applied.`);
      }

      CLILogger.success("Database reset complete.");
    } catch (err) {
      spinner.stop(false, "Reset failed.");
      CLILogger.panic(err as Error, "db:reset");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: status
// ═══════════════════════════════════════════════════════════════════
program
  .command("status")
  .description("Show migration and seed status.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { orm: o } = await loadConfig(opts.config);
      orm = o;

      const health = await orm.healthCheck();
      console.log(`\n${C.BRIGHT}Database Health${C.RESET}`);
      console.log(
        `  Status:  ${health.status === "healthy" ? C.GREEN : C.RED}${health.status}${C.RESET}`,
      );
      console.log(`  Type:    ${health.database}`);
      console.log(`  Latency: ${health.latencyMs}ms`);
      console.log(`  Cache:   ${health.cacheStatus}`);

      console.log(`\n${C.BRIGHT}Migration Status${C.RESET}`);
      console.log(`  ${C.DIM}---------------------------------${C.RESET}`);
      const migrationFiles = (await glob(`migrations/*.json`))
        .map((f) => path.basename(f, ".json"))
        .sort();
      let appliedMigrations = new Set<string>();
      try {
        appliedMigrations = new Set(
          (
            await orm.client.query<{ name: string }>(
              `SELECT name FROM stabilize_migrations`,
            )
          ).map((r) => r.name),
        );
      } catch {}
      for (const name of migrationFiles) {
        const status = appliedMigrations.has(name)
          ? `${C.BG_GREEN} APPLIED ${C.RESET}`
          : `${C.BG_YELLOW} PENDING ${C.RESET}`;
        console.log(`  ${status} ${C.WHITE}${name}${C.RESET}`);
      }
      if (!migrationFiles.length)
        console.log(`  ${C.DIM}No migration files found.${C.RESET}`);

      console.log(`\n${C.BRIGHT}Seed Status${C.RESET}`);
      console.log(`  ${C.DIM}---------------------------------${C.RESET}`);
      const seedFiles = (await glob(`seeds/*.ts`))
        .map((f) => path.basename(f, ".ts"))
        .sort();
      let appliedSeeds = new Set<string>();
      try {
        appliedSeeds = new Set(
          (
            await orm.client.query<{ name: string }>(
              `SELECT name FROM stabilize_seed_history`,
            )
          ).map((r) => r.name),
        );
      } catch {}
      for (const name of seedFiles) {
        const status = appliedSeeds.has(name)
          ? `${C.BG_GREEN} APPLIED ${C.RESET}`
          : `${C.BG_YELLOW} PENDING ${C.RESET}`;
        console.log(`  ${status} ${C.WHITE}${name}${C.RESET}`);
      }
      if (!seedFiles.length)
        console.log(`  ${C.DIM}No seed files found.${C.RESET}`);
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "status");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:tables
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:tables")
  .description("List all tables in the database.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;

      let tables: string[] = [];
      if (config.type === DBType.SQLite) {
        const rows = await orm.client.query<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        );
        tables = rows.map((r) => r.name);
      } else if (config.type === DBType.Postgres) {
        const rows = await orm.client.query<{ tablename: string }>(
          `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
        );
        tables = rows.map((r) => r.tablename);
      } else {
        const rows = await orm.client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`,
        );
        tables = rows.map((r) => r.table_name);
      }

      console.log(`\n${C.BRIGHT}Tables (${tables.length})${C.RESET}`);
      for (const t of tables) {
        const count = await orm.client.query<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM ${t}`,
        );
        console.log(
          `  ${C.GREEN}●${C.RESET} ${C.WHITE}${t}${C.RESET} ${C.DIM}(${count[0]?.cnt ?? 0} rows)${C.RESET}`,
        );
      }
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "db:tables");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: health
// ═══════════════════════════════════════════════════════════════════
program
  .command("health")
  .description("Check database and cache health.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { orm: o } = await loadConfig(opts.config);
      orm = o;
      const health = await orm.healthCheck();
      const icon = health.status === "healthy" ? `${C.GREEN}✔` : `${C.RED}✖`;
      console.log(`\n${icon} Database: ${health.status}${C.RESET}`);
      console.log(`  Type:    ${health.database}`);
      console.log(`  Latency: ${health.latencyMs}ms`);
      console.log(`  Cache:   ${health.cacheStatus}`);
      const stats = await orm.getCacheStats();
      console.log(
        `  Cache hits: ${stats.hits}  misses: ${stats.misses}  keys: ${stats.keys}`,
      );
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "health");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: query
// ═══════════════════════════════════════════════════════════════════
program
  .command("query <sql>")
  .description("Execute a raw SQL query and display results.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .option("-p, --params <values...>", "Query parameters")
  .action(async (sql: string, opts: any) => {
    let orm: Stabilize | null = null;
    try {
      const { orm: o } = await loadConfig(opts.config);
      orm = o;
      const params = opts.params || [];
      const start = performance.now();
      const results = await orm.rawQuery(sql, params);
      const elapsed = (performance.now() - start).toFixed(2);
      console.log(
        `\n${C.GREEN}✔${C.RESET} Query returned ${results.length} row(s) in ${elapsed}ms\n`,
      );
      if (results.length > 0) {
        console.table(results);
      }
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "query");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: info
// ═══════════════════════════════════════════════════════════════════
program
  .command("info")
  .description("Show information about the ORM and environment.")
  .action(() => {
    displayBanner();
    console.log(`  ${C.BRIGHT}CLI Version:${C.RESET}  ${version}`);
    console.log(
      `  ${C.BRIGHT}Runtime:${C.RESET}      ${process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`}`,
    );
    console.log(
      `  ${C.BRIGHT}Platform:${C.RESET}     ${process.platform} ${process.arch}`,
    );
    console.log(`  ${C.BRIGHT}CWD:${C.RESET}         ${process.cwd()}`);
    console.log(`  ${C.BRIGHT}PID:${C.RESET}         ${process.pid}`);
    console.log(
      `  ${C.BRIGHT}Memory:${C.RESET}      ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`,
    );
    console.log();
    console.log(`  ${C.BRIGHT}Available Commands:${C.RESET}`);
    console.log(
      `    ${C.GREEN}generate:model${C.RESET}      Generate a new model file`,
    );
    console.log(
      `    ${C.GREEN}generate:migration${C.RESET}   Generate a migration file`,
    );
    console.log(
      `    ${C.GREEN}generate:seed${C.RESET}        Generate a seed file`,
    );
    console.log(
      `    ${C.GREEN}generate:api${C.RESET}         Generate REST API scaffold`,
    );
    console.log(
      `    ${C.GREEN}generate:all${C.RESET}         Generate model + migration + seed`,
    );
    console.log(
      `    ${C.GREEN}migrate${C.RESET}              Apply pending migrations`,
    );
    console.log(
      `    ${C.GREEN}migrate:rollback${C.RESET}     Roll back last migration`,
    );
    console.log(
      `    ${C.GREEN}migrate:fresh${C.RESET}        Drop and re-migrate`,
    );
    console.log(
      `    ${C.GREEN}migrate:status${C.RESET}       Detailed migration status`,
    );
    console.log(`    ${C.GREEN}seed${C.RESET}                 Run seed files`);
    console.log(`    ${C.GREEN}db:drop${C.RESET}              Drop all tables`);
    console.log(
      `    ${C.GREEN}db:reset${C.RESET}             Full database reset`,
    );
    console.log(`    ${C.GREEN}db:backup${C.RESET}            Backup database`);
    console.log(
      `    ${C.GREEN}db:restore${C.RESET}           Restore from backup`,
    );
    console.log(`    ${C.GREEN}db:tables${C.RESET}            List all tables`);
    console.log(
      `    ${C.GREEN}db:size${C.RESET}              Database size stats`,
    );
    console.log(
      `    ${C.GREEN}db:diff${C.RESET}              Schema diff (models vs DB)`,
    );
    console.log(
      `    ${C.GREEN}db:console${C.RESET}           Interactive SQL console`,
    );
    console.log(
      `    ${C.GREEN}model:validate${C.RESET}       Validate all models`,
    );
    console.log(
      `    ${C.GREEN}status${C.RESET}               Migration/seed status`,
    );
    console.log(`    ${C.GREEN}health${C.RESET}               Health check`);
    console.log(`    ${C.GREEN}query${C.RESET}                Execute raw SQL`);
    console.log(`    ${C.GREEN}info${C.RESET}                 This info page`);
    console.log();
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:backup (NEW FEATURE 1)
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:backup")
  .description("Backup the database to a timestamped file.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .option("-o, --output <dir>", "Backup output directory", "backups")
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T.]/g, "")
        .slice(0, 14);
      const backupDir = path.resolve(process.cwd(), opts.output);
      await fs.mkdir(backupDir, { recursive: true });

      if (config.type === DBType.SQLite) {
        const dbPath = path.isAbsolute(config.connectionString)
          ? config.connectionString
          : path.resolve(process.cwd(), config.connectionString);
        const backupPath = path.join(backupDir, `backup_${timestamp}.db`);
        spinner.start("Backing up SQLite database...");
        await orm.close();
        orm = null;
        await fs.copyFile(dbPath, backupPath);
        spinner.stop(true, `SQLite backup saved: ${backupPath}`);
      } else {
        spinner.start("Backing up database schema and data...");
        const tables = await o.client.query<any>(
          config.type === DBType.Postgres
            ? `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
            : `SELECT table_name as tablename FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`,
        );
        const backup: Record<string, any[]> = {};
        for (const t of tables) {
          const tbl = t.tablename;
          if (tbl.startsWith("stabilize_")) continue;
          backup[tbl] = await o.client.query(`SELECT * FROM ${tbl}`);
        }
        const backupPath = path.join(backupDir, `backup_${timestamp}.json`);
        await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
        spinner.stop(
          true,
          `Backup saved: ${backupPath} (${Object.keys(backup).length} tables)`,
        );
      }
    } catch (err) {
      spinner.stop(false, "Backup failed.");
      CLILogger.panic(err as Error, "db:backup");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:restore (NEW FEATURE 2)
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:restore <file>")
  .description("Restore the database from a backup file.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .option("-f, --force", "Skip confirmation")
  .action(async (file: string, opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;
      const backupPath = path.resolve(process.cwd(), file);

      if (
        !opts.force &&
        !(await confirm(
          `Restore from '${file}'? This will overwrite existing data.`,
        ))
      ) {
        CLILogger.warn("Cancelled.");
        return;
      }

      if (config.type === DBType.SQLite && backupPath.endsWith(".db")) {
        spinner.start("Restoring SQLite database...");
        const dbPath = path.isAbsolute(config.connectionString)
          ? config.connectionString
          : path.resolve(process.cwd(), config.connectionString);
        await orm.close();
        orm = null;
        await fs.copyFile(backupPath, dbPath);
        spinner.stop(true, "SQLite database restored.");
      } else if (backupPath.endsWith(".json")) {
        spinner.start("Restoring from JSON backup...");
        const backup = JSON.parse(await fs.readFile(backupPath, "utf-8"));
        for (const [table, rows] of Object.entries(backup)) {
          if ((rows as any[]).length === 0) continue;
          const columns = Object.keys((rows as any[])[0]);
          const colNames = columns.join(", ");
          const placeholders = columns.map(() => "?").join(", ");
          for (const row of rows as any[]) {
            const values = columns.map((c) => row[c]);
            await orm.client.query(
              `INSERT OR REPLACE INTO ${table} (${colNames}) VALUES (${placeholders})`,
              values,
            );
          }
        }
        spinner.stop(true, `Restored ${Object.keys(backup).length} tables.`);
      } else {
        CLILogger.error(
          "Unsupported backup format. Use .db for SQLite or .json for other databases.",
        );
      }
    } catch (err) {
      spinner.stop(false, "Restore failed.");
      CLILogger.panic(err as Error, "db:restore");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: generate:api (NEW FEATURE 3)
// ═══════════════════════════════════════════════════════════════════
program
  .command("generate:api <name>")
  .alias("g:api")
  .alias("g:a")
  .description("Generate a REST API scaffold from a model.")
  .option("-p, --prefix <prefix>", "API route prefix", "/api")
  .action(async (name: string, opts: any) => {
    try {
      const cap = name.charAt(0).toUpperCase() + name.slice(1);
      const modelPath = path.resolve(process.cwd(), "models", `${name}.ts`);
      const apiDir = path.resolve(process.cwd(), "api");
      await fs.mkdir(apiDir, { recursive: true });
      const filePath = path.join(apiDir, `${name}.ts`);
      const prefix = opts.prefix.replace(/\/$/, "");

      // Create model if it doesn't exist
      try {
        await fs.access(modelPath);
      } catch {
        const modelDir = path.resolve(process.cwd(), "models");
        await fs.mkdir(modelDir, { recursive: true });
        const modelContent = `import { defineModel, DataTypes } from "stabilize-orm";

const ${cap} = defineModel({
  tableName: "${name.toLowerCase()}s",
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  columns: {
    id: { type: DataTypes.STRING, required: true, unique: true },
  },
});

export { ${cap} };
`;
        await fs.writeFile(modelPath, modelContent);
        CLILogger.success(`Model created: models/${name}.ts`);
      }

      const content = `import { Stabilize } from "stabilize-orm";
import { ${cap} } from "../models/${name}";
import { generateUUID } from "stabilize-orm";

export async function list${cap}(req: any, res: any) {
  try {
    const { page = "1", pageSize = "20" } = req.query;
    const orm = req.orm as Stabilize;
    const repo = orm.getRepository(${cap});
    const result = await repo.paginate(Number(page), Number(pageSize));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function get${cap}(req: any, res: any) {
  try {
    const orm = req.orm as Stabilize;
    const repo = orm.getRepository(${cap});
    const item = await repo.findOne(req.params.id);
    if (!item) return res.status(404).json({ error: "${cap} not found" });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function create${cap}(req: any, res: any) {
  try {
    const orm = req.orm as Stabilize;
    const repo = orm.getRepository(${cap});
    const item = await repo.create({ id: generateUUID(), ...req.body });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function update${cap}(req: any, res: any) {
  try {
    const orm = req.orm as Stabilize;
    const repo = orm.getRepository(${cap});
    const item = await repo.update(req.params.id, req.body);
    res.json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function delete${cap}(req: any, res: any) {
  try {
    const orm = req.orm as Stabilize;
    const repo = orm.getRepository(${cap});
    await repo.delete(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export function register${cap}Routes(app: any) {
  app.get("${prefix}/${name}s", list${cap});
  app.get("${prefix}/${name}s/:id", get${cap});
  app.post("${prefix}/${name}s", create${cap});
  app.patch("${prefix}/${name}s/:id", update${cap});
  app.delete("${prefix}/${name}s/:id", delete${cap});
}
`;

      await fs.writeFile(filePath, content);
      CLILogger.success(`API scaffold generated: ${filePath}`);
      CLILogger.info(
        `Routes: GET/POST ${prefix}/${name}s, GET/PATCH/DELETE ${prefix}/${name}s/:id`,
      );
    } catch (err) {
      CLILogger.panic(err as Error, "generate:api");
    }
  });

// Space-separated alias: "generate api"
program
  .command("generate api <name>")
  .description("Generate a REST API scaffold (space syntax).")
  .option("-p, --prefix <prefix>", "API route prefix", "/api")
  .action(async (name: string, opts: any) => {
    // Delegate to generate:api
    await program.commands
      .find((c) => c.name() === "generate:api")
      ?.parseAsync(
        ["node", "stabilize", "generate:api", name, "--prefix", opts.prefix],
        { from: "user" },
      );
  });

// Space-separated aliases for other generate commands
program
  .command("generate model <name> [fields...]")
  .description("Generate a model file (space syntax).")
  .option("--no-timestamps", "Disable timestamps")
  .option("--no-soft-delete", "Disable soft delete")
  .option("--versioned", "Enable version history")
  .action(async (name: string, fields: string[], opts: any) => {
    await program.commands
      .find((c) => c.name() === "generate:model")
      ?.parseAsync(
        [
          "node",
          "stabilize",
          "generate:model",
          name,
          ...fields,
          ...(opts.timestamps ? [] : ["--no-timestamps"]),
          ...(opts.softDelete ? [] : ["--no-soft-delete"]),
          ...(opts.versioned ? ["--versioned"] : []),
        ],
        { from: "user" },
      );
  });

program
  .command("generate migration <name>")
  .description("Generate a migration file (space syntax).")
  .option("-c, --config <path>", "Path to db config", "config/database.ts")
  .action(async (name: string, opts: any) => {
    await program.commands
      .find((c) => c.name() === "generate:migration")
      ?.parseAsync(
        [
          "node",
          "stabilize",
          "generate:migration",
          name,
          "--config",
          opts.config,
        ],
        { from: "user" },
      );
  });

program
  .command("generate seed <name>")
  .description("Generate a seed file (space syntax).")
  .option("-n, --count <number>", "Row count", "5")
  .action(async (name: string, opts: any) => {
    await program.commands
      .find((c) => c.name() === "generate:seed")
      ?.parseAsync(
        ["node", "stabilize", "generate:seed", name, "--count", opts.count],
        { from: "user" },
      );
  });

program
  .command("generate all <name> [fields...]")
  .description("Generate model + migration + seed (space syntax).")
  .option("--no-timestamps", "Disable timestamps")
  .option("--versioned", "Enable versioning")
  .option("-n, --count <number>", "Seed row count", "5")
  .action(async (name: string, fields: string[], opts: any) => {
    await program.commands
      .find((c) => c.name() === "generate:all")
      ?.parseAsync(
        [
          "node",
          "stabilize",
          "generate:all",
          name,
          ...fields,
          ...(opts.versioned ? ["--versioned"] : []),
          "--count",
          opts.count,
        ],
        { from: "user" },
      );
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: migrate:fresh (NEW FEATURE 4)
// ═══════════════════════════════════════════════════════════════════
program
  .command("migrate:fresh")
  .description("Drop all tables and re-run all migrations (no seed).")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .option("-f, --force", "Skip confirmation")
  .action(async (opts) => {
    CLILogger.warn("This will destroy all tables and re-run migrations.");
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;

      // Drop
      const dbName =
        config.type === DBType.SQLite
          ? config.connectionString
          : new URL(config.connectionString).pathname.slice(1);

      if (
        !opts.force &&
        !(await confirm(
          `Drop ALL TABLES in '${dbName}'? This cannot be undone.`,
        ))
      ) {
        CLILogger.warn("Cancelled.");
        return;
      }

      spinner.start("Dropping all tables...");
      if (config.type === DBType.SQLite) {
        await orm.close();
        orm = null;
        const absPath = path.isAbsolute(dbName)
          ? dbName
          : path.resolve(process.cwd(), dbName);
        try {
          await fs.unlink(absPath);
        } catch {}
        spinner.stop(true, "Tables dropped.");
        const result = await loadConfig(opts.config);
        orm = result.orm;
      } else {
        const query =
          config.type === DBType.Postgres
            ? `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
            : `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`;
        const tables = await orm.client.query<any>(query);
        for (const t of tables) {
          const tbl = t.tablename || t.table_name;
          const dropQ =
            config.type === DBType.Postgres
              ? `DROP TABLE IF EXISTS "${tbl}" CASCADE`
              : `DROP TABLE IF EXISTS \`${tbl}\``;
          await orm.client.query(dropQ);
        }
        spinner.stop(true, "Tables dropped.");
      }

      // Migrate
      const migrationDir = path.resolve(process.cwd(), "migrations");
      const files = (await glob(`${migrationDir}/*.json`)).sort();
      const migrations: Migration[] = await Promise.all(
        files.map(async (f) => JSON.parse(await fs.readFile(f, "utf-8"))),
      );
      if (migrations.length) {
        spinner.start(`Applying ${migrations.length} migration(s)...`);
        await runMigrations(config, migrations);
        spinner.stop(true, `${migrations.length} migration(s) applied.`);
      }

      CLILogger.success("Fresh migration complete.");
    } catch (err) {
      spinner.stop(false, "Fresh migration failed.");
      CLILogger.panic(err as Error, "migrate:fresh");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:size (NEW FEATURE 5)
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:size")
  .description("Show database and table size statistics.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;

      console.log(`\n${C.BRIGHT}Database Size Report${C.RESET}`);
      console.log(`  ${C.DIM}---------------------------------${C.RESET}`);

      if (config.type === DBType.SQLite) {
        const dbPath = path.isAbsolute(config.connectionString)
          ? config.connectionString
          : path.resolve(process.cwd(), config.connectionString);
        try {
          const stat = await fs.stat(dbPath);
          const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
          console.log(`  ${C.BRIGHT}File:${C.RESET} ${dbPath}`);
          console.log(
            `  ${C.BRIGHT}Size:${C.RESET} ${sizeMB} MB (${stat.size.toLocaleString()} bytes)`,
          );
        } catch {
          console.log(`  ${C.DIM}Database file not found.${C.RESET}`);
        }

        const tables = await orm.client.query<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        );
        let totalRows = 0;
        for (const t of tables) {
          const count = await orm.client.query<{ cnt: number }>(
            `SELECT COUNT(*) as cnt FROM ${t.name}`,
          );
          const rows = count[0]?.cnt ?? 0;
          totalRows += rows;
          console.log(
            `  ${C.GREEN}●${C.RESET} ${C.WHITE}${t.name}${C.RESET} ${C.DIM}(${rows.toLocaleString()} rows)${C.RESET}`,
          );
        }
        console.log(
          `\n  ${C.BRIGHT}Total:${C.RESET} ${tables.length} tables, ${totalRows.toLocaleString()} rows`,
        );
      } else {
        const tables = await orm.client.query<any>(
          config.type === DBType.Postgres
            ? `SELECT tablename, pg_size_pretty(pg_total_relation_size(quote_ident(tablename))) as size FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
            : `SELECT table_name as tablename, ROUND((data_length + index_length) / 1024 / 1024, 2) as size_mb FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`,
        );
        for (const t of tables) {
          const count = await orm.client.query<{ cnt: number }>(
            `SELECT COUNT(*) as cnt FROM ${t.tablename}`,
          );
          const rows = count[0]?.cnt ?? 0;
          const sizeInfo =
            t.size || t.size_mb ? ` ~${t.size || t.size_mb + " MB"}` : "";
          console.log(
            `  ${C.GREEN}●${C.RESET} ${C.WHITE}${t.tablename}${C.RESET} ${C.DIM}(${rows.toLocaleString()} rows${sizeInfo})${C.RESET}`,
          );
        }
      }
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "db:size");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:diff (NEW FEATURE 6)
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:diff")
  .description("Compare model definitions against the database schema.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;

      console.log(`\n${C.BRIGHT}Schema Diff${C.RESET}`);
      console.log(`  ${C.DIM}---------------------------------${C.RESET}`);

      // Get tables from DB
      let dbTables: Set<string>;
      if (config.type === DBType.SQLite) {
        const rows = await orm.client.query<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        );
        dbTables = new Set(rows.map((r) => r.name));
      } else if (config.type === DBType.Postgres) {
        const rows = await orm.client.query<{ tablename: string }>(
          `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
        );
        dbTables = new Set(rows.map((r) => r.tablename));
      } else {
        const rows = await orm.client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`,
        );
        dbTables = new Set(rows.map((r) => r.table_name));
      }

      // Get model tables from files
      const modelDir = path.resolve(process.cwd(), "models");
      const modelFiles = await glob(`${modelDir}/**/*.ts`);
      const modelTables = new Map<string, string>();

      for (const file of modelFiles) {
        try {
          const mod = await import(path.resolve(file).replace(/\\/g, "/"));
          for (const exported of Object.values(mod)) {
            if (typeof exported === "function") {
              const meta = MetadataStorage.getModelMetadata(
                exported as new (...args: any[]) => any,
              );
              if (meta?.tableName) {
                modelTables.set(meta.tableName, path.basename(file));
              }
            }
          }
        } catch {}
      }

      // Compare
      let hasDiff = false;
      for (const [table, file] of modelTables) {
        if (!dbTables.has(table)) {
          console.log(
            `  ${C.YELLOW}+${C.RESET} ${C.WHITE}${table}${C.RESET} ${C.DIM}(in ${file}, not in DB)${C.RESET}`,
          );
          hasDiff = true;
        }
      }
      for (const table of dbTables) {
        if (!modelTables.has(table)) {
          console.log(
            `  ${C.RED}-${C.RESET} ${C.WHITE}${table}${C.RESET} ${C.DIM}(in DB, no model)${C.RESET}`,
          );
          hasDiff = true;
        }
      }
      if (!hasDiff) {
        console.log(`  ${C.GREEN}✔ Schema is in sync.${C.RESET}`);
      }
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "db:diff");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: migrate:status (NEW FEATURE 7)
// ═══════════════════════════════════════════════════════════════════
program
  .command("migrate:status")
  .description("Show detailed migration status with timestamps.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;

      // Create migrations table if not exists
      const createTableSQL =
        config.type === DBType.MySQL
          ? `CREATE TABLE IF NOT EXISTS stabilize_migrations (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) UNIQUE NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
          : config.type === DBType.Postgres
            ? `CREATE TABLE IF NOT EXISTS stabilize_migrations (id SERIAL PRIMARY KEY, name VARCHAR(255) UNIQUE NOT NULL, applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP)`
            : `CREATE TABLE IF NOT EXISTS stabilize_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
      await orm.client.query(createTableSQL);

      const migrationFiles = (await glob(`migrations/*.json`))
        .map((f) => path.basename(f, ".json"))
        .sort();

      const appliedRows = await orm.client.query<{
        name: string;
        applied_at: string;
      }>(
        `SELECT name, applied_at FROM stabilize_migrations ORDER BY applied_at`,
      );

      const appliedMap = new Map<string, string>();
      for (const r of appliedRows) {
        appliedMap.set(r.name, r.applied_at);
      }

      console.log(`\n${C.BRIGHT}Migration Status${C.RESET}`);
      console.log(`  ${C.BRIGHT}Database:${C.RESET}  ${config.type}`);
      console.log(
        `  ${C.BRIGHT}Total:${C.RESET}     ${migrationFiles.length} migration(s)`,
      );
      console.log(`  ${C.BRIGHT}Applied:${C.RESET}    ${appliedMap.size}`);
      console.log(
        `  ${C.BRIGHT}Pending:${C.RESET}    ${migrationFiles.length - appliedMap.size}`,
      );
      console.log(`  ${C.DIM}---------------------------------${C.RESET}`);

      if (!migrationFiles.length) {
        console.log(`  ${C.DIM}No migration files found.${C.RESET}`);
      } else {
        for (const name of migrationFiles) {
          const applied = appliedMap.get(name);
          if (applied) {
            console.log(
              `  ${C.GREEN}✔${C.RESET} ${C.WHITE}${name}${C.RESET} ${C.DIM}(applied: ${applied})${C.RESET}`,
            );
          } else {
            console.log(
              `  ${C.YELLOW}○${C.RESET} ${C.WHITE}${name}${C.RESET} ${C.DIM}(pending)${C.RESET}`,
            );
          }
        }
      }
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "migrate:status");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:console (NEW FEATURE 8)
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:console")
  .alias("db:sql")
  .description("Start an interactive SQL console.")
  .option(
    "-c, --config <path>",
    "Path to database config file",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;

      console.log(
        `\n${C.BRIGHT}Stabilize SQL Console${C.RESET} ${C.DIM}(type 'exit' to quit, 'tables' to list tables)${C.RESET}`,
      );
      console.log(`  ${C.BRIGHT}Database:${C.RESET} ${config.type}`);
      console.log();

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${C.CYAN}sql>${C.RESET} `,
      });

      rl.prompt();
      rl.on("line", async (line) => {
        const sql = line.trim();
        if (!sql) {
          rl.prompt();
          return;
        }
        if (sql.toLowerCase() === "exit" || sql.toLowerCase() === "quit") {
          rl.close();
          return;
        }
        if (sql.toLowerCase() === "tables") {
          try {
            let query: string;
            if (config.type === DBType.SQLite) {
              query = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`;
            } else if (config.type === DBType.Postgres) {
              query = `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
            } else {
              query = `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`;
            }
            const rows = await orm!.client.query<any>(query);
            console.log(`  ${C.GREEN}${rows.length} table(s):${C.RESET}`);
            for (const r of rows) {
              console.log(
                `    ${C.WHITE}${r.name || r.tablename || r.table_name}${C.RESET}`,
              );
            }
          } catch (err: any) {
            console.log(`  ${C.RED}Error: ${err.message}${C.RESET}`);
          }
          rl.prompt();
          return;
        }

        try {
          const start = performance.now();
          const results = await orm!.rawQuery(sql);
          const ms = (performance.now() - start).toFixed(1);
          console.log(
            `  ${C.GREEN}✔${C.RESET} ${results.length} row(s) in ${ms}ms`,
          );
          if (results.length > 0) {
            console.table(results.slice(0, 20));
            if (results.length > 20) {
              console.log(
                `  ${C.DIM}... ${results.length - 20} more rows${C.RESET}`,
              );
            }
          }
        } catch (err: any) {
          console.log(`  ${C.RED}Error: ${err.message}${C.RESET}`);
        }
        rl.prompt();
      });

      rl.on("close", async () => {
        console.log(`\n${C.DIM}Goodbye.${C.RESET}\n`);
        await orm!.close();
        process.exit(0);
      });
    } catch (err) {
      CLILogger.panic(err as Error, "db:console");
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: model:validate (NEW FEATURE 9)
// ═══════════════════════════════════════════════════════════════════
program
  .command("model:validate")
  .description("Validate all model definitions for errors.")
  .action(async () => {
    try {
      const modelDir = path.resolve(process.cwd(), "models");
      const modelFiles = await glob(`${modelDir}/**/*.ts`);

      if (!modelFiles.length) {
        CLILogger.warn("No model files found in models/ directory.");
        return;
      }

      console.log(`\n${C.BRIGHT}Model Validation${C.RESET}`);
      console.log(`  ${C.DIM}---------------------------------${C.RESET}`);

      let errors = 0;
      let warnings = 0;
      let models = 0;

      for (const file of modelFiles) {
        const shortFile = path.relative(process.cwd(), file);
        try {
          const mod = await import(path.resolve(file).replace(/\\/g, "/"));
          for (const [exportName, exported] of Object.entries(mod)) {
            if (typeof exported !== "function") continue;
            const meta = MetadataStorage.getModelMetadata(
              exported as new (...args: any[]) => any,
            );
            if (!meta) continue;
            models++;

            const issues: string[] = [];
            const warns: string[] = [];

            if (!meta.tableName) {
              issues.push("Missing tableName");
            }
            if (Object.keys(meta.columns).length === 0) {
              issues.push("No columns defined");
            }
            if (!meta.columns["id"]) {
              warns.push("No 'id' column (auto-increment PK)");
            }
            for (const [key, col] of Object.entries(meta.columns)) {
              const c = col as any;
              if (!c.type) {
                issues.push(`Column '${key}' missing type`);
              }
            }

            if (issues.length) {
              errors += issues.length;
              console.log(
                `\n  ${C.RED}✖ ${exportName}${C.RESET} ${C.DIM}(${shortFile})${C.RESET}`,
              );
              for (const issue of issues) {
                console.log(`    ${C.RED}Error: ${issue}${C.RESET}`);
              }
            } else if (warns.length) {
              warnings += warns.length;
              console.log(
                `\n  ${C.YELLOW}⚠ ${exportName}${C.RESET} ${C.DIM}(${shortFile})${C.RESET}`,
              );
              for (const w of warns) {
                console.log(`    ${C.YELLOW}Warning: ${w}${C.RESET}`);
              }
            } else {
              console.log(
                `\n  ${C.GREEN}✔ ${exportName}${C.RESET} ${C.DIM}(${shortFile}, table: ${meta.tableName})${C.RESET}`,
              );
            }
          }
        } catch (err: any) {
          errors++;
          console.log(
            `\n  ${C.RED}✖ ${shortFile}${C.RESET} ${C.DIM}(failed to load: ${err.message})${C.RESET}`,
          );
        }
      }

      console.log(`\n  ${C.DIM}---------------------------------${C.RESET}`);
      console.log(
        `  ${C.BRIGHT}Summary:${C.RESET} ${models} models, ${errors} errors, ${warnings} warnings`,
      );
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "model:validate");
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: generate:all (NEW FEATURE 10)
// ═══════════════════════════════════════════════════════════════════
program
  .command("generate:all <name> [fields...]")
  .alias("g:all")
  .alias("g:x")
  .description("Generate model, migration, and seed file together.")
  .option("--no-timestamps", "Disable createdAt/updatedAt")
  .option("--versioned", "Enable version history")
  .option("-n, --count <number>", "Seed row count", "5")
  .option("-c, --config <path>", "Path to db config", "config/database.ts")
  .action(async (name: string, fields: string[], opts: any) => {
    try {
      CLILogger.info(`Generating model, migration, and seed for '${name}'...`);

      // Generate model
      const cap = name.charAt(0).toUpperCase() + name.slice(1);
      const modelDir = path.resolve(process.cwd(), "models");
      await fs.mkdir(modelDir, { recursive: true });
      const modelPath = path.join(modelDir, `${name}.ts`);

      const typeMap: Record<string, string> = {
        string: "DataTypes.STRING",
        text: "DataTypes.TEXT",
        int: "DataTypes.INTEGER",
        integer: "DataTypes.INTEGER",
        bigint: "DataTypes.BIGINT",
        float: "DataTypes.FLOAT",
        double: "DataTypes.DOUBLE",
        decimal: "DataTypes.DECIMAL",
        bool: "DataTypes.BOOLEAN",
        boolean: "DataTypes.BOOLEAN",
        date: "DataTypes.DATE",
        datetime: "DataTypes.DATETIME",
        json: "DataTypes.JSON",
        uuid: "DataTypes.UUID",
        blob: "DataTypes.BLOB",
      };

      const columns = [
        `    id: { type: DataTypes.STRING, required: true, unique: true },`,
      ];
      for (const arg of fields) {
        let [field, typeRaw] = arg.split(":");
        if (!field?.trim()) continue;
        const dt =
          typeMap[(typeRaw || "string").toLowerCase()] || "DataTypes.STRING";
        columns.push(`    ${field.trim()}: { type: ${dt} },`);
      }
      if (opts.timestamps) {
        columns.push(
          `    deletedAt: { type: DataTypes.DATETIME, softDelete: true },`,
        );
      }

      const modelContent =
        [
          `import { defineModel, DataTypes } from "stabilize-orm";`,
          ``,
          `const ${cap} = defineModel({`,
          `  tableName: "${name.toLowerCase()}s",`,
          opts.versioned ? `  versioned: true,` : null,
          `  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },`,
          `  columns: {`,
          ...columns,
          `  },`,
          `});`,
          ``,
          `export { ${cap} };`,
        ]
          .filter(Boolean)
          .join("\n") + "\n";

      await fs.writeFile(modelPath, modelContent);
      CLILogger.success(`Model: ${modelPath}`);

      // Generate migration
      const { config } = await loadConfig(opts.config);
      const modelModule = await import(
        path.resolve(modelPath).replace(/\\/g, "/")
      );
      const modelClass = modelModule[cap];
      if (modelClass && MetadataStorage.getModelMetadata(modelClass)) {
        const migration = await generateMigration(
          modelClass,
          `create_${name}_table`,
          config.type,
        );
        const migrationDir = path.resolve(process.cwd(), "migrations");
        await fs.mkdir(migrationDir, { recursive: true });
        const timestamp = new Date()
          .toISOString()
          .replace(/[-:T.]/g, "")
          .slice(0, 14);
        const migFile = `${timestamp}_create_${name}_table.json`;
        migration.name = path.basename(migFile, ".json");
        await fs.writeFile(
          path.join(migrationDir, migFile),
          JSON.stringify(migration, null, 2),
        );
        CLILogger.success(`Migration: migrations/${migFile}`);
      }

      // Generate seed
      const seedDir = path.resolve(process.cwd(), "seeds");
      await fs.mkdir(seedDir, { recursive: true });
      const seedTimestamp = new Date()
        .toISOString()
        .replace(/[-:T.]/g, "")
        .slice(0, 14);
      const seedFile = `${seedTimestamp}_seed_${name}.ts`;
      const count = Math.max(1, Number(opts.count) || 5);

      const seedRows = Array.from({ length: count }, (_, i) => {
        const row: Record<string, any> = { id: crypto.randomUUID() };
        for (const arg of fields) {
          const [field, typeRaw] = arg.split(":");
          if (!field?.trim()) continue;
          const t = (typeRaw || "string").toLowerCase();
          if (t === "bool" || t === "boolean") row[field.trim()] = i % 2 === 0;
          else if (t === "int" || t === "integer" || t === "bigint")
            row[field.trim()] = i + 1;
          else if (t === "float" || t === "double" || t === "decimal")
            row[field.trim()] = (i + 1) * 1.5;
          else row[field.trim()] = `${field.trim()}_${i}`;
        }
        return row;
      });

      const seedContent =
        [
          `import { Stabilize } from "stabilize-orm";`,
          `import { ${cap} } from "../models/${name}";`,
          ``,
          `export async function seed(orm: Stabilize) {`,
          `  const repo = orm.getRepository(${cap});`,
          `  await repo.bulkCreate(${JSON.stringify(seedRows, null, 4)});`,
          `  console.log("Seeded ${count} ${name}(s)");`,
          `}`,
        ].join("\n") + "\n";

      await fs.writeFile(path.join(seedDir, seedFile), seedContent);
      CLILogger.success(`Seed: seeds/${seedFile}`);
    } catch (err) {
      CLILogger.panic(err as Error, "generate:all");
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:truncate (NEW)
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:truncate [table]")
  .description("Truncate a table or all tables.")
  .option(
    "-c, --config <path>",
    "Path to database config",
    "config/database.ts",
  )
  .option("-f, --force", "Skip confirmation")
  .action(async (table: string | undefined, opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;

      if (
        !opts.force &&
        !(await confirm(
          `Truncate ${table || "ALL TABLES"}? Data will be lost.`,
        ))
      ) {
        CLILogger.warn("Cancelled.");
        return;
      }

      if (table) {
        spinner.start(`Truncating ${table}...`);
        if (config.type === DBType.SQLite) {
          await orm.client.query(`DELETE FROM ${table}`);
        } else {
          await orm.client.query(`TRUNCATE TABLE ${table}`);
        }
        spinner.stop(true, `Truncated: ${table}`);
      } else {
        spinner.start("Truncating all tables...");
        let tables: string[];
        if (config.type === DBType.SQLite) {
          const rows = await orm.client.query<{ name: string }>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'stabilize_%' ORDER BY name`,
          );
          tables = rows.map((r) => r.name);
        } else if (config.type === DBType.Postgres) {
          const rows = await orm.client.query<{ tablename: string }>(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
          );
          tables = rows.map((r) => r.tablename);
        } else {
          const rows = await orm.client.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`,
          );
          tables = rows.map((r) => r.table_name);
        }
        for (const t of tables) {
          if (t.startsWith("stabilize_")) continue;
          await orm.client.query(`DELETE FROM ${t}`);
        }
        spinner.stop(true, `Truncated ${tables.length} table(s).`);
      }
    } catch (err) {
      spinner.stop(false, "Truncate failed.");
      CLILogger.panic(err as Error, "db:truncate");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: model:info (NEW)
// ═══════════════════════════════════════════════════════════════════
program
  .command("model:info <name>")
  .description("Show detailed info about a model.")
  .action(async (name: string) => {
    try {
      const cap = name.charAt(0).toUpperCase() + name.slice(1);
      const modelPath = path.resolve(process.cwd(), "models", `${name}.ts`);
      const mod = await import(path.resolve(modelPath).replace(/\\/g, "/"));
      const modelClass = mod[cap];
      if (!modelClass || !MetadataStorage.getModelMetadata(modelClass)) {
        CLILogger.error(`'${cap}' is not a valid defineModel in ${modelPath}`);
        return;
      }

      const meta = MetadataStorage.getModelMetadata(modelClass)!;
      const softDeleteField = MetadataStorage.getSoftDeleteField(modelClass);

      console.log(`\n${C.BRIGHT}${cap} Model${C.RESET}`);
      console.log(`  ${C.DIM}---------------------------------${C.RESET}`);
      console.log(`  ${C.BRIGHT}Table:${C.RESET}      ${meta.tableName}`);
      console.log(
        `  ${C.BRIGHT}Versioned:${C.RESET}  ${meta.versioned ? "Yes" : "No"}`,
      );
      console.log(
        `  ${C.BRIGHT}SoftDelete:${C.RESET} ${softDeleteField || "None"}`,
      );

      const columns = meta.columns;
      console.log(
        `\n  ${C.BRIGHT}Columns (${Object.keys(columns).length})${C.RESET}`,
      );
      for (const [key, col] of Object.entries(columns)) {
        const c = col as any;
        const flags = [];
        if (c.required) flags.push("required");
        if (c.unique) flags.push("unique");
        if (c.softDelete) flags.push("softDelete");
        if (c.optimisticLock) flags.push("optimisticLock");
        const flagStr = flags.length
          ? ` ${C.DIM}(${flags.join(", ")})${C.RESET}`
          : "";
        console.log(
          `    ${C.GREEN}●${C.RESET} ${C.WHITE}${key}${C.RESET} ${C.DIM}${c.type}${C.RESET}${flagStr}`,
        );
      }

      if (meta.relations?.length) {
        console.log(
          `\n  ${C.BRIGHT}Relations (${meta.relations.length})${C.RESET}`,
        );
        for (const r of meta.relations) {
          const target = r.target?.name || "unknown";
          console.log(
            `    ${C.GREEN}●${C.RESET} ${C.WHITE}${r.property}${C.RESET} ${C.DIM}${r.type} -> ${target} (fk: ${r.foreignKey})${C.RESET}`,
          );
        }
      }

      if (meta.scopes && Object.keys(meta.scopes).length) {
        console.log(
          `\n  ${C.BRIGHT}Scopes (${Object.keys(meta.scopes).length})${C.RESET}`,
        );
        for (const scope of Object.keys(meta.scopes)) {
          console.log(`    ${C.GREEN}●${C.RESET} ${C.WHITE}${scope}${C.RESET}`);
        }
      }

      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "model:info");
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: config:init (NEW)
// ═══════════════════════════════════════════════════════════════════
program
  .command("config:init")
  .description("Scaffold a starter config/database.ts file.")
  .option("--type <db>", "Database type: postgres, mysql, sqlite", "sqlite")
  .action(async (opts) => {
    try {
      const configDir = path.resolve(process.cwd(), "config");
      await fs.mkdir(configDir, { recursive: true });
      const filePath = path.join(configDir, "database.ts");

      try {
        await fs.access(filePath);
        CLILogger.warn("config/database.ts already exists. Skipping.");
        return;
      } catch {}

      const dbTypeMap: Record<string, string> = {
        postgres: "DBType.Postgres",
        mysql: "DBType.MySQL",
        sqlite: "DBType.SQLite",
      };
      const dbType = dbTypeMap[opts.type.toLowerCase()] || "DBType.SQLite";
      const connStr =
        opts.type === "postgres"
          ? 'process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/mydb"'
          : opts.type === "mysql"
            ? 'process.env.DATABASE_URL || "mysql://user:password@localhost:3306/mydb"'
            : '"./data/app.db"';

      const content = `import { DBType, type DBConfig } from "stabilize-orm";

const dbConfig: DBConfig = {
  type: ${dbType},
  connectionString: ${connStr},
  retryAttempts: 3,
  retryDelay: 1000,
};

export default dbConfig;
`;
      await fs.writeFile(filePath, content);
      CLILogger.success(`Config generated: ${filePath}`);
      CLILogger.info("Edit the connectionString to match your database.");
    } catch (err) {
      CLILogger.panic(err as Error, "config:init");
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: generate:test (NEW)
// ═══════════════════════════════════════════════════════════════════
program
  .command("generate:test <name>")
  .alias("g:test")
  .alias("g:t")
  .description("Generate a test file for a model.")
  .action(async (name: string) => {
    try {
      const cap = name.charAt(0).toUpperCase() + name.slice(1);
      const testDir = path.resolve(process.cwd(), "tests");
      await fs.mkdir(testDir, { recursive: true });
      const filePath = path.join(testDir, `${name}.test.ts`);

      const content = `import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Stabilize, DBType, generateUUID } from "stabilize-orm";
import { ${cap} } from "../models/${name}";

let orm: Stabilize;

beforeAll(async () => {
  orm = new Stabilize({
    type: DBType.SQLite,
    connectionString: ":memory:",
  });
  // Create table for testing
  await orm.client.migrationQuery(\`CREATE TABLE IF NOT EXISTS ${name.toLowerCase()}s (id TEXT PRIMARY KEY)\`);
});

afterAll(async () => {
  await orm.close();
});

describe("${cap}", () => {
  it("should create a record", async () => {
    const repo = orm.getRepository(${cap});
    const item = await repo.create({ id: generateUUID() });
    expect(item).toBeDefined();
    expect(item.id).toBeDefined();
  });

  it("should find a record by id", async () => {
    const repo = orm.getRepository(${cap});
    const created = await repo.create({ id: generateUUID() });
    const found = await repo.findOne(created.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
  });

  it("should update a record", async () => {
    const repo = orm.getRepository(${cap});
    const item = await repo.create({ id: generateUUID() });
    const updated = await repo.update(item.id, item);
    expect(updated).toBeDefined();
  });

  it("should delete a record", async () => {
    const repo = orm.getRepository(${cap});
    const item = await repo.create({ id: generateUUID() });
    await repo.delete(item.id);
    const found = await repo.findOne(item.id);
    expect(found).toBeNull();
  });

  it("should count records", async () => {
    const repo = orm.getRepository(${cap});
    const count = await repo.count();
    expect(typeof count).toBe("number");
  });
});
`;
      await fs.writeFile(filePath, content);
      CLILogger.success(`Test generated: ${filePath}`);
    } catch (err) {
      CLILogger.panic(err as Error, "generate:test");
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: db:table:info (NEW)
// ═══════════════════════════════════════════════════════════════════
program
  .command("db:table:info <table>")
  .description("Show detailed column info for a specific table.")
  .option(
    "-c, --config <path>",
    "Path to database config",
    "config/database.ts",
  )
  .action(async (table: string, opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;

      console.log(`\n${C.BRIGHT}Table: ${table}${C.RESET}`);
      console.log(`  ${C.DIM}---------------------------------${C.RESET}`);

      let columns: Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }> = [];
      if (config.type === DBType.SQLite) {
        columns = await orm.client.query<any>(`PRAGMA table_info(${table})`);
        for (const col of columns) {
          const flags = [];
          if (col.pk) flags.push("PRIMARY KEY");
          if (col.notnull) flags.push("NOT NULL");
          console.log(
            `  ${C.GREEN}●${C.RESET} ${C.WHITE}${col.name}${C.RESET} ${C.DIM}${col.type}${C.RESET} ${flags.length ? C.YELLOW + "(" + flags.join(", ") + ")" + C.RESET : ""}`,
          );
        }
      } else if (config.type === DBType.Postgres) {
        columns = await orm.client.query<any>(
          `SELECT column_name as name, data_type as type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
          [table],
        );
        for (const col of columns) {
          const nullable = col.is_nullable === "NO" ? "NOT NULL" : "";
          console.log(
            `  ${C.GREEN}●${C.RESET} ${C.WHITE}${col.name}${C.RESET} ${C.DIM}${col.type}${C.RESET} ${nullable ? C.YELLOW + "(" + nullable + ")" + C.RESET : ""}`,
          );
        }
      } else {
        columns = await orm.client.query<any>(
          `SELECT column_name as name, data_type as type, is_nullable, column_key FROM information_schema.columns WHERE table_name = ? AND table_schema = DATABASE() ORDER BY ordinal_position`,
          [table],
        );
        for (const col of columns) {
          const flags = [];
          if (col.column_key === "PRI") flags.push("PRIMARY KEY");
          if (col.is_nullable === "NO") flags.push("NOT NULL");
          console.log(
            `  ${C.GREEN}●${C.RESET} ${C.WHITE}${col.name}${C.RESET} ${C.DIM}${col.type}${C.RESET} ${flags.length ? C.YELLOW + "(" + flags.join(", ") + ")" + C.RESET : ""}`,
          );
        }
      }

      const count = await orm.client.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${table}`,
      );
      console.log(`\n  ${C.BRIGHT}Rows:${C.RESET} ${count[0]?.cnt ?? 0}`);
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "db:table:info");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: migrate:pending (NEW)
// ═══════════════════════════════════════════════════════════════════
program
  .command("migrate:pending")
  .description("Show only pending migrations.")
  .option(
    "-c, --config <path>",
    "Path to database config",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;

      const createTableSQL =
        config.type === DBType.MySQL
          ? `CREATE TABLE IF NOT EXISTS stabilize_migrations (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) UNIQUE NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
          : config.type === DBType.Postgres
            ? `CREATE TABLE IF NOT EXISTS stabilize_migrations (id SERIAL PRIMARY KEY, name VARCHAR(255) UNIQUE NOT NULL, applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP)`
            : `CREATE TABLE IF NOT EXISTS stabilize_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
      await orm.client.query(createTableSQL);

      const migrationFiles = (await glob(`migrations/*.json`))
        .map((f) => path.basename(f, ".json"))
        .sort();
      const appliedRows = await orm.client.query<{ name: string }>(
        `SELECT name FROM stabilize_migrations`,
      );
      const appliedNames = new Set(appliedRows.map((r) => r.name));
      const pending = migrationFiles.filter((n) => !appliedNames.has(n));

      console.log(`\n${C.BRIGHT}Pending Migrations${C.RESET}`);
      if (!pending.length) {
        console.log(`  ${C.GREEN}✔ No pending migrations.${C.RESET}`);
      } else {
        for (const name of pending) {
          console.log(`  ${C.YELLOW}○${C.RESET} ${C.WHITE}${name}${C.RESET}`);
        }
        console.log(
          `\n  ${C.DIM}Run 'stabilize-cli migrate' to apply.${C.RESET}`,
        );
      }
      console.log();
    } catch (err) {
      CLILogger.panic(err as Error, "migrate:pending");
    } finally {
      if (orm) await orm.close();
    }
  });

// ═══════════════════════════════════════════════════════════════════
// COMMAND: --json flag support for health
// ═══════════════════════════════════════════════════════════════════
program
  .command("health:json")
  .description("Health check with JSON output for automation.")
  .option(
    "-c, --config <path>",
    "Path to database config",
    "config/database.ts",
  )
  .action(async (opts) => {
    let orm: Stabilize | null = null;
    try {
      const { config, orm: o } = await loadConfig(opts.config);
      orm = o;
      const health = await orm.healthCheck();
      const cacheStats = await orm.getCacheStats();
      console.log(
        JSON.stringify(
          { ...health, cache: cacheStats, timestamp: new Date().toISOString() },
          null,
          2,
        ),
      );
    } catch (err) {
      console.log(
        JSON.stringify(
          { status: "unhealthy", error: (err as Error).message },
          null,
          2,
        ),
      );
      process.exit(1);
    } finally {
      if (orm) await orm.close();
    }
  });

program
  .option("-l, --log-level <level>", "Global log level", "Info")
  .parse(process.argv);
