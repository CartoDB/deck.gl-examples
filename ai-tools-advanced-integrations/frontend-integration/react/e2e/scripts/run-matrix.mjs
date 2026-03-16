#!/usr/bin/env node
/**
 * Run E2E tests across multiple models locally (simulates CI matrix).
 *
 * Usage:
 *   pnpm e2e:matrix                                          # all models from model-config.ts
 *   pnpm e2e:matrix --model "ac_7xhfwyml::openai::gpt-5.2"  # single model
 *   pnpm e2e:matrix --current                                # use current CARTO_AI_API_MODEL from .env
 *   pnpm e2e:matrix -- --grep "Counties"                     # forward args to Playwright
 *
 * Environment:
 *   E2E_MODELS="model1,model2"   # override model list (comma-separated)
 */
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(__dirname, '../..');
const MODEL_CONFIG = resolve(__dirname, '../helpers/model-config.ts');

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function parseModelsFromConfig() {
  const content = readFileSync(MODEL_CONFIG, 'utf-8');
  const models = [];
  for (const line of content.split('\n')) {
    if (line.trimStart().startsWith('//')) continue;
    const match = line.match(/['"]ac_[^'"]+['"]/);
    if (match) models.push(match[0].slice(1, -1));
  }
  if (models.length === 0) {
    console.error('ERROR: No models found in', MODEL_CONFIG);
    process.exit(1);
  }
  return models;
}

function slugify(model) {
  return model.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
}

function killPort(port) {
  try {
    execSync(`lsof -ti:${port} | xargs kill 2>/dev/null`, { stdio: 'ignore' });
  } catch {
    // Nothing running on port
  }
}

function getBackendEnvPath(backend) {
  return resolve(FRONTEND_DIR, `../../backend-integration/${backend}/.env`);
}

function getEnvModel(backendEnv) {
  if (!existsSync(backendEnv)) return '';
  const content = readFileSync(backendEnv, 'utf-8');
  const match = content.match(/^CARTO_AI_API_MODEL=(.*)$/m);
  return match ? match[1] : '';
}

function setEnvModel(backendEnv, model) {
  if (!existsSync(backendEnv)) {
    console.warn('  WARNING: Backend .env not found at', backendEnv);
    return;
  }
  let content = readFileSync(backendEnv, 'utf-8');
  if (/^CARTO_AI_API_MODEL=/m.test(content)) {
    content = content.replace(/^CARTO_AI_API_MODEL=.*$/m, `CARTO_AI_API_MODEL=${model}`);
  } else {
    content += `\nCARTO_AI_API_MODEL=${model}\n`;
  }
  writeFileSync(backendEnv, content);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let models = null;
  let useCurrent = false;
  let backend = 'openai-agents-sdk';
  const playwrightArgs = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
      models = [args[++i]];
    } else if (args[i] === '--backend' && i + 1 < args.length) {
      backend = args[++i];
    } else if (args[i] === '--current') {
      useCurrent = true;
    } else {
      playwrightArgs.push(args[i]);
    }
  }

  return { models, useCurrent, backend, playwrightArgs };
}

function resolveModels(cliModels, useCurrent, backendEnv) {
  if (cliModels) return cliModels;

  if (useCurrent) {
    const current = getEnvModel(backendEnv);
    if (!current) {
      console.error('ERROR: --current used but no CARTO_AI_API_MODEL found in backend .env');
      process.exit(1);
    }
    return [current];
  }

  if (process.env.E2E_MODELS) {
    return process.env.E2E_MODELS.split(',').map((m) => m.trim()).filter(Boolean);
  }

  return parseModelsFromConfig();
}

// Run a single model test, streaming Playwright output live with a spinner during quiet periods
function runTest(model, playwrightArgs, backend) {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['e2e', ...playwrightArgs], {
      cwd: FRONTEND_DIR,
      env: { ...process.env, TEST_MODEL: model, BACKEND_SDK: backend },
      stdio: 'pipe',
    });

    const chunks = { stdout: [], stderr: [] };
    let spinnerIdx = 0;
    const spinnerLine = '  waiting...';

    // Spinner runs during quiet periods (server startup, etc.)
    const spinner = setInterval(() => {
      process.stdout.write(`\r  ${SPINNER[spinnerIdx++ % SPINNER.length]} ${spinnerLine}`);
    }, 80);

    function clearSpinner() {
      process.stdout.write(`\r${' '.repeat(spinnerLine.length + 6)}\r`);
    }

    child.stdout.on('data', (d) => {
      chunks.stdout.push(d);
      const text = d.toString();
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/[✓✗✘·]|passed|failed|skipped|\d+ test/.test(trimmed)) {
          clearSpinner();
          console.log(`  ${trimmed}`);
        }
      }
    });

    child.stderr.on('data', (d) => chunks.stderr.push(d));

    child.on('close', (code) => {
      clearInterval(spinner);
      clearSpinner();
      resolve({
        passed: code === 0,
        stdout: Buffer.concat(chunks.stdout).toString(),
        stderr: Buffer.concat(chunks.stderr).toString(),
      });
    });
  });
}

// Main
async function main() {
  const { models: cliModels, useCurrent, backend, playwrightArgs } = parseArgs();
  const backendEnv = getBackendEnvPath(backend);
  const models = resolveModels(cliModels, useCurrent, backendEnv);
  const originalModel = getEnvModel(backendEnv);

  function cleanup() {
    if (originalModel) setEnvModel(backendEnv, originalModel);
    killPort(3003);
  }
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });
  process.on('SIGTERM', () => { cleanup(); process.exit(1); });

  console.log(`\nE2E Matrix: ${models.length} model${models.length > 1 ? 's' : ''} (backend: ${backend})\n`);

  const results = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const slug = slugify(model);
    const prefix = `[${i + 1}/${models.length}] ${slug}`;

    setEnvModel(backendEnv, model);
    killPort(3003);

    console.log(`\n${prefix}`);
    console.log(`${'─'.repeat(prefix.length)}`);
    const result = await runTest(model, playwrightArgs, backend);

    if (result.passed) {
      console.log(`  \u2713 PASS`);
    } else {
      console.log(`  \u2717 FAIL`);
      const combined = (result.stdout + '\n' + result.stderr).trim();
      const lines = combined.split('\n').filter(Boolean);
      const context = lines.slice(-10).join('\n');
      if (context) {
        console.log(`\n${context}\n`);
      }
    }

    results.push({ slug, passed: result.passed });
  }

  // Summary
  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.length - passCount;

  console.log(`\n${'MODEL'.padEnd(45)} RESULT`);
  console.log(`${'─'.repeat(45)} ──────`);
  for (const { slug, passed } of results) {
    console.log(`${slug.padEnd(45)} ${passed ? '\u2713 PASS' : '\u2717 FAIL'}`);
  }
  console.log(`\nTotal: ${results.length} | Pass: ${passCount} | Fail: ${failCount}`);

  process.exit(failCount > 0 ? 1 : 0);
}

main();
