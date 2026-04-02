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

const version = "2.1.0";

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

    if (opts.timestamps) {
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
        `  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },`,
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
          `import { defineSeed } from "stabilize-orm";`,
          `import { Stabilize } from "stabilize-orm";`,
          `import { ${cap} } from "../models/${name}";`,
          ``,
          `defineSeed("seed_${name}", async (db) => {`,
          `  const repo = new Stabilize(db.config).getRepository(${cap});`,
          `  await repo.bulkCreate(${JSON.stringify(seedRows, null, 2)});`,
          `});`,
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
    try {
      await program.commands
        .find((c) => c.name() === "db:drop")
        ?.parseAsync([...process.argv, ...(opts.force ? ["--force"] : [])], {
          from: "user",
        });
      await program.commands
        .find((c) => c.name() === "migrate")
        ?.parseAsync(process.argv, { from: "user" });
      await program.commands
        .find((c) => c.name() === "seed")
        ?.parseAsync(process.argv, { from: "user" });
      CLILogger.success("Database reset complete.");
    } catch (err) {
      CLILogger.panic(err as Error, "db:reset");
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
      `    ${C.GREEN}generate:model${C.RESET}    Generate a new model file`,
    );
    console.log(
      `    ${C.GREEN}generate:migration${C.RESET} Generate a migration file`,
    );
    console.log(
      `    ${C.GREEN}generate:seed${C.RESET}      Generate a seed file`,
    );
    console.log(
      `    ${C.GREEN}generate:api${C.RESET}       Generate REST API scaffold`,
    );
    console.log(
      `    ${C.GREEN}migrate${C.RESET}            Apply pending migrations`,
    );
    console.log(
      `    ${C.GREEN}migrate:rollback${C.RESET}   Roll back last migration`,
    );
    console.log(
      `    ${C.GREEN}migrate:fresh${C.RESET}      Drop and re-migrate`,
    );
    console.log(`    ${C.GREEN}seed${C.RESET}               Run seed files`);
    console.log(`    ${C.GREEN}db:drop${C.RESET}            Drop all tables`);
    console.log(
      `    ${C.GREEN}db:reset${C.RESET}           Full database reset`,
    );
    console.log(`    ${C.GREEN}db:backup${C.RESET}          Backup database`);
    console.log(
      `    ${C.GREEN}db:restore${C.RESET}         Restore from backup`,
    );
    console.log(`    ${C.GREEN}db:tables${C.RESET}          List all tables`);
    console.log(
      `    ${C.GREEN}db:size${C.RESET}            Database size stats`,
    );
    console.log(
      `    ${C.GREEN}status${C.RESET}             Migration/seed status`,
    );
    console.log(`    ${C.GREEN}health${C.RESET}             Health check`);
    console.log(`    ${C.GREEN}query${C.RESET}              Execute raw SQL`);
    console.log(`    ${C.GREEN}info${C.RESET}               This info page`);
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

      const content = `import { Stabilize, ${cap} } from "../models/${name}";
import { generateUUID } from "stabilize-orm";

const repo = Stabilize.getRepository(${cap});

export const ${name}Routes = {
  async list(req: any, res: any) {
    try {
      const { page = "1", pageSize = "20" } = req.query;
      const result = await repo.paginate(Number(page), Number(pageSize));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  async getOne(req: any, res: any) {
    try {
      const item = await repo.findOne(req.params.id);
      if (!item) return res.status(404).json({ error: "${cap} not found" });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  async create(req: any, res: any) {
    try {
      const item = await repo.create({ id: generateUUID(), ...req.body });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  async update(req: any, res: any) {
    try {
      const item = await repo.update(req.params.id, req.body);
      res.json(item);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  async remove(req: any, res: any) {
    try {
      await repo.delete(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
};

export function register${cap}Routes(app: any) {
  app.get("${prefix}/${name}s", ${name}Routes.list);
  app.get("${prefix}/${name}s/:id", ${name}Routes.getOne);
  app.post("${prefix}/${name}s", ${name}Routes.create);
  app.patch("${prefix}/${name}s/:id", ${name}Routes.update);
  app.delete("${prefix}/${name}s/:id", ${name}Routes.remove);
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
    try {
      await program.commands
        .find((c) => c.name() === "db:drop")
        ?.parseAsync([...process.argv, ...(opts.force ? ["--force"] : [])], {
          from: "user",
        });
      await program.commands
        .find((c) => c.name() === "migrate")
        ?.parseAsync(process.argv, { from: "user" });
      CLILogger.success("Fresh migration complete.");
    } catch (err) {
      CLILogger.panic(err as Error, "migrate:fresh");
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

program
  .option("-l, --log-level <level>", "Global log level", "Info")
  .parse(process.argv);
