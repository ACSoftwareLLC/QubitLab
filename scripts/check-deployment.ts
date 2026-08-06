#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const args = process.argv.slice(2);

function parseArg(name: string, short?: string): string | undefined {
  const index = args.findIndex(
    (a) =>
      a === name ||
      a === short ||
      a.startsWith(`${name}=`) ||
      (short && a.startsWith(`${short}=`))
  );
  if (index === -1) return undefined;
  const arg = args[index];
  if (arg.includes('=')) return arg.split('=')[1];
  return args[index + 1];
}

const env = parseArg('--env', '-e') ?? 'dev';

interface WranglerConfig {
  name?: string;
  d1_databases?: Array<{ binding: string; database_name: string; database_id: string }>;
  r2_buckets?: Array<{ binding: string; bucket_name: string }>;
  env?: Record<string, WranglerConfig>;
}

function loadWranglerConfig(): WranglerConfig {
  const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const stripped = text.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return JSON.parse(stripped) as WranglerConfig;
}

function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['wrangler', command, ...args], {
      cwd: __dirname,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => {
      stdout += String(data);
    });
    child.stderr?.on('data', (data) => {
      stderr += String(data);
    });
    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });
  });
}

function log(message: string): void {
  console.log(`[check] ${message}`);
}

function fail(message: string): void {
  console.error(`[FAIL] ${message}`);
}

async function checkD1Database(config: WranglerConfig): Promise<boolean> {
  const databases = config.d1_databases ?? [];
  if (databases.length === 0) {
    fail('No D1 database configured in wrangler.jsonc');
    return false;
  }

  const remote = env !== 'local';
  const args = ['migrations', 'list', 'DB', '--env', env];
  if (remote) args.push('--remote');
  const { exitCode, stderr } = await runCommand('d1', args);

  if (exitCode !== 0) {
    fail(`Could not list D1 migrations for ${databases[0].database_name}: ${stderr}`);
    return false;
  }

  log(`D1 database "${databases[0].database_name}" is accessible`);
  return true;
}

async function checkR2Buckets(config: WranglerConfig): Promise<boolean> {
  const buckets = config.r2_buckets ?? [];
  if (buckets.length === 0) {
    fail('No R2 buckets configured in wrangler.jsonc');
    return false;
  }

  const { exitCode, stdout, stderr } = await runCommand('r2', ['bucket', 'list']);
  if (exitCode !== 0) {
    fail(`Could not list R2 buckets: ${stderr}`);
    return false;
  }

  const names = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  let ok = true;
  for (const bucket of buckets) {
    if (!names.includes(bucket.bucket_name)) {
      fail(`R2 bucket "${bucket.bucket_name}" not found`);
      ok = false;
    } else {
      log(`R2 bucket "${bucket.bucket_name}" exists`);
    }
  }
  return ok;
}

async function main() {
  const config = loadWranglerConfig();
  const envConfig = config.env?.[env] ?? config;

  log(`Running deployment checks for environment: ${env}`);

  const [d1Ok, r2Ok] = await Promise.all([
    checkD1Database(envConfig),
    checkR2Buckets(envConfig),
  ]);

  if (!d1Ok || !r2Ok) {
    process.exit(1);
  }

  log('All deployment checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
