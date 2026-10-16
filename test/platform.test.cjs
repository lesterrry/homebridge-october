const assert = require('node:assert/strict');
const test = require('node:test');
const { HomebridgeAPI } = require('homebridge/lib/api');
const { APIEvent } = require('homebridge');
const { OctoberPlatform } = require('../dist/platform');
const SerialInterface = require('../dist/lib/SerialInterface').default;
const schema = require('../config.schema.json');
const { log } = require('./helpers.cjs');

test('configuration contains thermostat options rather than mandatory Aqara credentials', () => {
  const properties = schema.schema.properties;
  assert.deepEqual(Object.keys(properties), ['name', 'commandPath', 'pollInterval', 'commandTimeout']);
  assert.equal(properties.name.default, 'October');
  const defaults = Object.fromEntries(Object.entries(properties).map(([key, property]) => [key, property.default]));
  assert.doesNotThrow(() => new SerialInterface(log, defaults));
  for (const options of [{ commandPath: '' }, { pollInterval: 0 }, { pollInterval: '30' }, { commandTimeout: -1 }]) {
    assert.throws(() => new SerialInterface(log, options));
  }
});

test('platform starts polling after discovery and stops on Homebridge shutdown', () => {
  const api = new HomebridgeAPI();
  const registered = [];
  api.registerPlatformAccessories = (_plugin, _platform, accessories) => registered.push(...accessories);
  const platform = new OctoberPlatform(log, { platform: 'October', name: 'October', pollInterval: 15 }, api);
  let starts = 0;
  let stops = 0;
  platform._serialInterface.startPolling = () => {
    starts++;
  };
  platform._serialInterface.stopPolling = () => {
    stops++;
  };
  assert.equal(starts, 0);
  api.emit(APIEvent.DID_FINISH_LAUNCHING);
  assert.equal(registered.length, 2);
  assert.equal(starts, 1);
  api.emit(APIEvent.SHUTDOWN);
  assert.equal(stops, 1);
});
