const assert = require('node:assert/strict');
const test = require('node:test');
const { Mode } = require('../dist/lib/data');
const { createAccessories, createSerial, response } = require('./helpers.cjs');

test('HomeKit exposes supported modes, integer targets and negative temperatures', async () => {
  const serial = createSerial(async () => response({ intTemp: -3, extTemp: -5 }));
  const { thermostat, outdoorTemperature, Characteristic: C } = createAccessories(serial);
  const target = thermostat.getCharacteristic(C.TargetTemperature);
  assert.equal(target.props.minValue, 10);
  assert.equal(target.props.maxValue, 30);
  assert.equal(target.props.minStep, 1);
  assert.deepEqual(thermostat.getCharacteristic(C.TargetHeatingCoolingState).props.validValues, [0, 1]);
  assert.equal(thermostat.getCharacteristic(C.TargetHeatingCoolingState).props.maxValue, 1);
  assert.equal(await thermostat.getCharacteristic(C.CurrentTemperature).handleGetRequest(), -3);
  assert.equal(await outdoorTemperature.handleGetRequest(), -5);
});

test('COOL, AUTO and invalid targets fail rather than changing the thermostat', async () => {
  const commands = [];
  const serial = createSerial(async (command) => {
    commands.push(command);
    return response();
  });
  const { thermostat, Characteristic: C, hap } = createAccessories(serial);
  const invalid = (error) => error === hap.HAPStatus.INVALID_VALUE_IN_REQUEST;
  for (const value of [C.TargetHeatingCoolingState.COOL, C.TargetHeatingCoolingState.AUTO]) {
    const mode = thermostat.getCharacteristic(C.TargetHeatingCoolingState);
    await assert.rejects(mode.handleSetRequest(value, {}), invalid);
    await assert.rejects(mode.setHandler(value), (error) => error.hapStatus === hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
  }
  for (const value of [22.5, 35]) {
    await assert.rejects(thermostat.getCharacteristic(C.TargetTemperature).handleSetRequest(value, {}), invalid);
  }
  assert.deepEqual(commands, []);
});

test('HomeKit reports a failed Off command as a communication error', async () => {
  const serial = createSerial(async (command) => {
    if (command !== 'S') {
      throw new Error('USB disconnected');
    }
    return response({ mode: Mode.On, state: 1 });
  });
  const { thermostat, Characteristic: C, hap } = createAccessories(serial);
  const mode = thermostat.getCharacteristic(C.TargetHeatingCoolingState);
  await mode.handleGetRequest();
  await assert.rejects(mode.handleSetRequest(0, {}), (error) => error === hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  assert.equal(mode.statusCode, hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
});

test('a faulty sensor faults only its characteristic, while healthy readings and controls work', async () => {
  let mode = Mode.On;
  const serial = createSerial(async (command) => {
    if (command !== 'S') {
      mode = Number(command.split(';')[0]);
    }
    return response({ mode, extTemp: '', extHumid: 55 });
  });
  const { thermostat, outdoorTemperature, outdoorHumidity, Characteristic: C, hap } = createAccessories(serial);
  await assert.rejects(
    outdoorTemperature.handleGetRequest(),
    (error) => error === hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
  );
  assert.equal(await outdoorHumidity.handleGetRequest(), 55);
  assert.equal(await thermostat.getCharacteristic(C.CurrentTemperature).handleGetRequest(), 20);
  await thermostat.getCharacteristic(C.TargetHeatingCoolingState).handleSetRequest(0, {});
  assert.equal(mode, Mode.Off);
});

test('state updates notify HomeKit; transport failure and recovery update availability', async () => {
  let online = true;
  let temperature = 21;
  const serial = createSerial(async () => {
    if (!online) {
      throw new Error('offline');
    }
    return response({ intTemp: temperature, extTemp: temperature - 10 });
  });
  const { thermostat, outdoorTemperature, Characteristic: C, hap } = createAccessories(serial);
  const current = thermostat.getCharacteristic(C.CurrentTemperature);
  const changes = [];
  current.on('change', (change) => changes.push(change.newValue));
  await serial.getState(true);
  temperature = 23;
  await serial.getState(true);
  assert.equal(current.value, 23);
  assert.equal(outdoorTemperature.value, 13);
  assert.ok(changes.includes(23));
  online = false;
  await assert.rejects(serial.getState(true));
  assert.equal(current.statusCode, hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  assert.equal(outdoorTemperature.statusCode, hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  online = true;
  await serial.getState(true);
  assert.equal(current.statusCode, 0);
  assert.equal(outdoorTemperature.statusCode, 0);
});

test('HomeKit HEAT enables regulation, temperature changes preserve it, and Off stays Off', async () => {
  let hardware = { mode: Mode.Off, setTemp: 22, state: 0 };
  const writes = [];
  const serial = createSerial(async (command) => {
    if (command !== 'S') {
      writes.push(command);
      const [mode, setTemp] = command.split(';').map(Number);
      hardware = { mode, setTemp, state: mode === Mode.Off ? 0 : 1 };
    }
    return response(hardware);
  });
  const { thermostat, Characteristic: C } = createAccessories(serial);
  const mode = thermostat.getCharacteristic(C.TargetHeatingCoolingState);
  const target = thermostat.getCharacteristic(C.TargetTemperature);
  await mode.handleSetRequest(C.TargetHeatingCoolingState.HEAT, {});
  assert.equal(hardware.mode, Mode.Auto);
  await target.handleSetRequest(25, {});
  assert.equal(hardware.mode, Mode.Auto);
  assert.equal(hardware.setTemp, 25);
  await mode.handleSetRequest(C.TargetHeatingCoolingState.OFF, {});
  await target.handleSetRequest(26, {});
  assert.equal(hardware.mode, Mode.Off);
  assert.deepEqual(writes, ['0;22', '0;25', '2;25', '2;26']);
});

test('both active firmware modes display as HEAT, even while automatic heating is idle', async () => {
  for (const [mode, state] of [
    [Mode.Auto, 0],
    [Mode.On, 1],
    [Mode.Off, 0],
  ]) {
    const serial = createSerial(async () => response({ mode, state }));
    const { thermostat, Characteristic: C } = createAccessories(serial);
    const target = thermostat.getCharacteristic(C.TargetHeatingCoolingState);
    const current = thermostat.getCharacteristic(C.CurrentHeatingCoolingState);
    await serial.getState(true);
    const expected = mode === Mode.Off ? C.TargetHeatingCoolingState.OFF : C.TargetHeatingCoolingState.HEAT;
    assert.equal(target.value, expected);
    assert.equal(await target.handleGetRequest(), expected);
    assert.equal(await current.handleGetRequest(), state);
  }
});

test('selecting HEAT replaces the physical always-on mode with temperature regulation', async () => {
  let mode = Mode.On;
  const serial = createSerial(async (command) => {
    if (command !== 'S') {
      mode = Number(command.split(';')[0]);
    }
    return response({ mode });
  });
  const { thermostat, Characteristic: C } = createAccessories(serial);
  await thermostat
    .getCharacteristic(C.TargetHeatingCoolingState)
    .handleSetRequest(C.TargetHeatingCoolingState.HEAT, {});
  assert.equal(mode, Mode.Auto);
});
