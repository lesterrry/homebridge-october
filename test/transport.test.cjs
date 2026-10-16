const assert = require('node:assert/strict');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const SerialInterface = require('../dist/lib/SerialInterface').default;
const { log } = require('./helpers.cjs');

async function executable(t, source) {
  const directory = await mkdtemp(path.join(tmpdir(), 'october-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const commandPath = path.join(directory, 'october mock; no shell');
  await writeFile(commandPath, `#!/usr/bin/env node\n${source}\n`, { mode: 0o755 });
  return commandPath;
}

test('executes the configured path asynchronously without a shell and skips firmware READY', async (t) => {
  const commandPath = await executable(
    t,
    `
    if (process.argv[2] !== 'S' || process.argv.length !== 3) process.exit(1);
    setTimeout(() => process.stdout.write('READY\\n0;0;22;20;-5;50;60\\n'), 50);
  `,
  );
  const serial = new SerialInterface(log, { commandPath });
  let completed = false;
  const pending = serial.getState().then((state) => {
    completed = true;
    return state;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false, 'the event loop must keep running during the command');
  assert.equal((await pending).extTemp, -5);
});

test('a hung executable times out and rejects instead of serving cached success', async (t) => {
  const commandPath = await executable(t, 'setInterval(() => {}, 1000);');
  const serial = new SerialInterface(log, { commandPath, commandTimeout: 100 });
  await assert.rejects(serial.getState(), /Command execution failed/);
});
