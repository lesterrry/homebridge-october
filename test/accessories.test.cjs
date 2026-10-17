const assert = require('node:assert/strict');
const test = require('node:test');
const { HomebridgeAPI } = require('homebridge/lib/api');
const { PlatformAccessory } = require('homebridge/lib/platformAccessory');
const { Mode } = require('../dist/lib/data');
const { createAccessories, createSerial, response } = require('./helpers.cjs');

test('HeaterCooler exposes only heat, integer thresholds and negative temperatures', async () => {
  const serial = createSerial(async () => response({ intTemp: -3, extTemp: -5 }));
  const { heater, humidity, outdoorTemperature, Characteristic: C } = createAccessories(serial);
  const threshold = heater.getCharacteristic(C.HeatingThresholdTemperature);
  assert.equal(threshold.props.minValue, 10);
  assert.equal(threshold.props.maxValue, 30);
  assert.equal(threshold.props.minStep, 1);
  const target = heater.getCharacteristic(C.TargetHeaterCoolerState);
  assert.deepEqual(target.props.validValues, [C.TargetHeaterCoolerState.HEAT]);
  assert.equal(target.props.minValue, C.TargetHeaterCoolerState.HEAT);
  assert.equal(target.props.maxValue, C.TargetHeaterCoolerState.HEAT);
  assert.equal(target.value, C.TargetHeaterCoolerState.HEAT);
  assert.equal(await target.handleGetRequest(), C.TargetHeaterCoolerState.HEAT);
  assert.equal(heater.isPrimaryService, true);
  assert.equal(heater.testCharacteristic(C.CoolingThresholdTemperature), false);
  assert.equal(heater.testCharacteristic(C.TargetTemperature), false);
  assert.equal(heater.testCharacteristic(C.TargetHeatingCoolingState), false);
  assert.equal(heater.testCharacteristic(C.CurrentRelativeHumidity), false);
  assert.equal(await heater.getCharacteristic(C.CurrentTemperature).handleGetRequest(), -3);
  assert.equal(await outdoorTemperature.handleGetRequest(), -5);
  assert.equal(await humidity.handleGetRequest(), 50);
});

test('COOL, AUTO and invalid active or temperature values fail before sending commands', async () => {
  const commands = [];
  const serial = createSerial(async (command) => {
    commands.push(command);
    return response();
  });
  const { heater, Characteristic: C, hap } = createAccessories(serial);
  const invalid = (error) => error === hap.HAPStatus.INVALID_VALUE_IN_REQUEST;
  const target = heater.getCharacteristic(C.TargetHeaterCoolerState);
  for (const value of [C.TargetHeaterCoolerState.COOL, C.TargetHeaterCoolerState.AUTO]) {
    await assert.rejects(target.handleSetRequest(value, {}), invalid);
    assert.throws(
      () => target.setHandler(value),
      (error) => error.hapStatus === hap.HAPStatus.INVALID_VALUE_IN_REQUEST,
    );
  }
  const active = heater.getCharacteristic(C.Active);
  await assert.rejects(active.handleSetRequest(2, {}), invalid);
  await assert.rejects(active.setHandler('1'), (error) => error.hapStatus === hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
  for (const value of [22.5, 35]) {
    await assert.rejects(heater.getCharacteristic(C.HeatingThresholdTemperature).handleSetRequest(value, {}), invalid);
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
  const { heater, Characteristic: C, hap } = createAccessories(serial);
  const active = heater.getCharacteristic(C.Active);
  await active.handleGetRequest();
  await assert.rejects(
    active.handleSetRequest(0, {}),
    (error) => error === hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
  );
  assert.equal(active.statusCode, hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
});

test('faulty sensors fault only their own characteristics while heating controls remain usable', async () => {
  let mode = Mode.On;
  const serial = createSerial(async (command) => {
    if (command !== 'S') {
      mode = Number(command.split(';')[0]);
    }
    return response({ mode, extTemp: '', intHumid: 'nan', extHumid: 55 });
  });
  const { heater, humidity, outdoorTemperature, outdoorHumidity, Characteristic: C, hap } = createAccessories(serial);
  for (const sensor of [outdoorTemperature, humidity]) {
    await assert.rejects(sensor.handleGetRequest(), (error) => error === hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }
  assert.equal(await outdoorHumidity.handleGetRequest(), 55);
  assert.equal(await heater.getCharacteristic(C.CurrentTemperature).handleGetRequest(), 20);
  await heater.getCharacteristic(C.Active).handleSetRequest(0, {});
  assert.equal(mode, Mode.Off);
});

test('state updates notify HomeKit; transport failure and recovery update availability', async () => {
  let online = true;
  let hardware = { mode: Mode.Auto, state: 1, intTemp: 21, setTemp: 22, intHumid: 45 };
  const serial = createSerial(async () => {
    if (!online) {
      throw new Error('offline');
    }
    return response({ ...hardware, extTemp: hardware.intTemp - 10 });
  });
  const { heater, humidity, outdoorTemperature, Characteristic: C, hap } = createAccessories(serial);
  const current = heater.getCharacteristic(C.CurrentTemperature);
  const active = heater.getCharacteristic(C.Active);
  const heating = heater.getCharacteristic(C.CurrentHeaterCoolerState);
  const threshold = heater.getCharacteristic(C.HeatingThresholdTemperature);
  const changes = [];
  current.on('change', (change) => changes.push(change.newValue));
  await serial.getState(true);
  assert.equal(heating.value, C.CurrentHeaterCoolerState.HEATING);
  hardware = { mode: Mode.Off, state: 0, intTemp: 23, setTemp: 25, intHumid: 46 };
  await serial.getState(true);
  assert.equal(current.value, 23);
  assert.equal(outdoorTemperature.value, 13);
  assert.equal(active.value, C.Active.INACTIVE);
  assert.equal(heating.value, C.CurrentHeaterCoolerState.INACTIVE);
  assert.equal(threshold.value, 25);
  assert.equal(humidity.value, 46);
  assert.ok(changes.includes(23));
  const characteristics = [current, active, heating, threshold, humidity, outdoorTemperature];
  online = false;
  await assert.rejects(serial.getState(true));
  for (const characteristic of characteristics) {
    assert.equal(characteristic.statusCode, hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }
  online = true;
  await serial.getState(true);
  for (const characteristic of characteristics) {
    assert.equal(characteristic.statusCode, 0);
  }
});

test('Active enables regulation, threshold changes preserve it, and Off stays Off', async () => {
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
  const { heater, Characteristic: C } = createAccessories(serial);
  const active = heater.getCharacteristic(C.Active);
  const threshold = heater.getCharacteristic(C.HeatingThresholdTemperature);
  await active.handleSetRequest(C.Active.ACTIVE, {});
  assert.equal(hardware.mode, Mode.Auto);
  await threshold.handleSetRequest(25, {});
  assert.equal(hardware.mode, Mode.Auto);
  assert.equal(hardware.setTemp, 25);
  await active.handleSetRequest(C.Active.INACTIVE, {});
  await threshold.handleSetRequest(26, {});
  assert.equal(hardware.mode, Mode.Off);
  assert.deepEqual(writes, ['0;22', '0;25', '2;25', '2;26']);
});

test('firmware mode and relay state distinguish inactive, idle and heating', async () => {
  for (const [mode, state, active, current] of [
    [Mode.Auto, 0, 1, 1],
    [Mode.Auto, 1, 1, 2],
    [Mode.On, 1, 1, 2],
    [Mode.Off, 0, 0, 0],
  ]) {
    const serial = createSerial(async () => response({ mode, state }));
    const { heater, Characteristic: C } = createAccessories(serial);
    await serial.getState(true);
    for (const [type, expected] of [
      [C.Active, active],
      [C.CurrentHeaterCoolerState, current],
    ]) {
      const characteristic = heater.getCharacteristic(type);
      assert.equal(characteristic.value, expected);
      assert.equal(await characteristic.handleGetRequest(), expected);
    }
  }
});

test('activating replaces the physical always-on mode with temperature regulation', async () => {
  let mode = Mode.On;
  const serial = createSerial(async (command) => {
    if (command !== 'S') {
      mode = Number(command.split(';')[0]);
    }
    return response({ mode });
  });
  const { heater, Characteristic: C } = createAccessories(serial);
  await heater.getCharacteristic(C.Active).handleSetRequest(C.Active.ACTIVE, {});
  assert.equal(mode, Mode.Auto);
});

test('selecting the fixed HEAT target does not turn on an inactive heater', async () => {
  let calls = 0;
  const serial = createSerial(async () => {
    calls++;
    return response({ mode: Mode.Off });
  });
  const { heater, Characteristic: C } = createAccessories(serial);
  await heater.getCharacteristic(C.TargetHeaterCoolerState).handleSetRequest(C.TargetHeaterCoolerState.HEAT, {});
  assert.equal(calls, 0);
  assert.equal(await heater.getCharacteristic(C.Active).handleGetRequest(), C.Active.INACTIVE);
});

test('a restored Thermostat is replaced in place and migration survives another cache round trip', () => {
  const api = new HomebridgeAPI();
  const original = new api.platformAccessory(
    'October',
    api.hap.uuid.generate('october'),
    api.hap.Categories.THERMOSTAT,
  );
  original.context = { retainedSetting: 'keep' };
  original.addService(api.hap.Service.Thermostat).setPrimaryService();
  const cached = PlatformAccessory.deserialize(PlatformAccessory.serialize(original));
  const serial = createSerial(async () => response());
  const { heaterAccessory } = createAccessories(serial, cached);
  for (const accessory of [
    heaterAccessory,
    PlatformAccessory.deserialize(PlatformAccessory.serialize(heaterAccessory)),
  ]) {
    assert.equal(accessory.UUID, original.UUID);
    assert.equal(accessory.displayName, original.displayName);
    assert.deepEqual(accessory.context, original.context);
    assert.equal(accessory.getService(api.hap.Service.Thermostat), undefined);
    assert.ok(accessory.getService(api.hap.Service.HeaterCooler));
    assert.ok(accessory.getService(api.hap.Service.HumiditySensor));
  }
  const restored = PlatformAccessory.deserialize(PlatformAccessory.serialize(heaterAccessory));
  createAccessories(
    createSerial(async () => response()),
    restored,
  );
  assert.equal(restored.services.length, 3); // Information, HeaterCooler, internal humidity.
});
