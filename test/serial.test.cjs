const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const test = require('node:test');
const { Mode } = require('../dist/lib/data');
const { createSerial, response } = require('./helpers.cjs');

test('concurrent reads share the cache and serialize the transport', async () => {
  const commands = [];
  const serial = createSerial(async (command) => {
    commands.push(command);
    await nextTurn();
    return response();
  });
  const states = await Promise.all([serial.getState(), serial.getState(), serial.getState()]);
  assert.deepEqual(commands, ['S']);
  assert.ok(states.every((state) => state.setTemp === 22));
});

test('a failed Off write rejects and invalidates the previously healthy cache', async () => {
  const commands = [];
  let unavailable = 0;
  const serial = createSerial(async (command) => {
    commands.push(command);
    if (command !== 'S') {
      throw new Error('USB disconnected');
    }
    return response({ mode: Mode.On, state: 1 });
  });
  serial.on('unavailable', () => unavailable++);
  await serial.getState();
  await assert.rejects(serial.setState(Mode.Off), /USB disconnected/);
  await assert.rejects(serial.getState(), /USB disconnected/);
  assert.deepEqual(commands, ['S', 'S', '2;22']);
  assert.equal(unavailable, 1);
});

test('an unchanged response cannot acknowledge a rejected setting', async () => {
  const serial = createSerial(async () => response());
  await assert.rejects(serial.setState(Mode.Off), /did not confirm/);
});

test('temperature changes preserve the current hardware mode rather than the cached one', async () => {
  let hardware = { mode: Mode.Auto, setTemp: 22 };
  const serial = createSerial(async (command) => {
    if (command !== 'S') {
      const [mode, setTemp] = command.split(';').map(Number);
      hardware = { mode, setTemp };
    }
    return response(hardware);
  });
  await serial.getState();
  hardware.mode = Mode.Off; // The physical knob changed after the cached read.
  await serial.setState(undefined, 23);
  assert.deepEqual(hardware, { mode: Mode.Off, setTemp: 23 });
});

test('concurrent writes stay whole and the final read observes the relay after the acknowledgement', async () => {
  const commands = [];
  let hardware = { mode: Mode.Auto, setTemp: 22, state: 0 };
  let active = 0;
  const serial = createSerial(async (command) => {
    assert.equal(active++, 0, 'overlapping commands');
    commands.push(command);
    await nextTurn();
    let reply;
    if (command !== 'S') {
      const [mode, setTemp] = command.split(';').map(Number);
      hardware = { ...hardware, mode, setTemp };
      reply = response(hardware); // Firmware responds before setRelay().
      hardware.state = mode === Mode.On ? 1 : 0;
    } else {
      reply = response(hardware);
    }
    active--;
    return reply;
  });
  await Promise.all([serial.setState(undefined, 24), serial.setState(Mode.On)]);
  assert.deepEqual(commands, ['S', '0;24', 'S', 'S', '1;24', 'S']);
  assert.equal((await serial.getState()).state, 1);
  assert.equal(hardware.setTemp, 24);
});

test('a faulty external sensor cannot prevent switching Off', async () => {
  let mode = Mode.On;
  const commands = [];
  const serial = createSerial(async (command) => {
    commands.push(command);
    if (command !== 'S') {
      mode = Number(command.split(';')[0]);
    }
    return response({ mode, extTemp: -999, extHumid: 'nan' });
  });
  await serial.setState(Mode.Off);
  assert.deepEqual(commands, ['S', '2;22', 'S']);
  assert.equal((await serial.getState()).extTemp, null);
});

test('invalid outgoing values are rejected before touching the transport', async () => {
  let calls = 0;
  const serial = createSerial(async () => {
    calls++;
    return response();
  });
  await assert.rejects(serial.setState(3));
  await assert.rejects(serial.setState(undefined, 22.5));
  await assert.rejects(serial.setState(undefined, 35));
  assert.equal(calls, 0);
});

test('repeated failed reads back off, then recover without poisoning the queue', async () => {
  let calls = 0;
  let online = false;
  const serial = createSerial(async () => {
    calls++;
    if (!online) {
      throw new Error('offline');
    }
    return response();
  });
  await Promise.all(Array.from({ length: 5 }, () => assert.rejects(serial.getState(), /offline/)));
  assert.equal(calls, 1);
  online = true;
  assert.equal((await serial.getState(true)).setTemp, 22);
  assert.equal(calls, 2);
});

test('polling publishes changes periodically and stops on shutdown', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const temperatures = [];
  const serial = createSerial(async () => response({ intTemp: 20 + calls++ }), { pollInterval: 1 });
  t.after(() => serial.stopPolling());
  serial.on('state', (state) => temperatures.push(state.intTemp));
  serial.startPolling();
  serial.startPolling();
  await nextTurn();
  assert.deepEqual(temperatures, [20]);
  t.mock.timers.tick(1000);
  await nextTurn();
  assert.deepEqual(temperatures, [20, 21]);
  serial.stopPolling();
  t.mock.timers.tick(5000);
  await nextTurn();
  assert.equal(calls, 2);
});

test('loss of communication after acknowledgement still fails the write without retrying it', async () => {
  const commands = [];
  const serial = createSerial(async (command) => {
    commands.push(command);
    if (commands.length === 3) {
      throw new Error('verification timed out');
    }
    return response({ mode: command === 'S' ? Mode.On : Mode.Off, state: 1 });
  });
  await assert.rejects(serial.setState(Mode.Off), /verification timed out/);
  await assert.rejects(serial.getState(), /verification timed out/);
  assert.deepEqual(commands, ['S', '2;22', 'S']);
});
