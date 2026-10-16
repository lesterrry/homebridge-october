const { HomebridgeAPI } = require('homebridge/lib/api');
const { OctoberAccessory } = require('../dist/accessories/OctoberAccessory');
const { OctoberExtTempAccessory } = require('../dist/accessories/OctoberExtTempAccessory');
const SerialInterface = require('../dist/lib/SerialInterface').default;

const log = Object.assign(() => {}, { debug() {}, info() {}, warn() {}, error() {} });

function response(overrides = {}) {
  const values = { mode: 0, state: 0, setTemp: 22, intTemp: 20, extTemp: -5, intHumid: 50, extHumid: 60, ...overrides };
  return Object.values(values).join(';');
}

function createSerial(handler, options = {}) {
  const serial = new SerialInterface(log, options);
  serial.sendCommand = handler;
  return serial;
}

function createAccessories(serial) {
  const api = new HomebridgeAPI();
  const { Service, Characteristic, uuid, Categories } = api.hap;
  const platform = { api, log, _serialInterface: serial };
  const thermostat = new api.platformAccessory('October', uuid.generate('test-thermostat'), Categories.THERMOSTAT);
  const outdoor = new api.platformAccessory('Outdoor', uuid.generate('test-outdoor'), Categories.SENSOR);
  new OctoberAccessory(platform, thermostat, {});
  new OctoberExtTempAccessory(platform, outdoor);
  return {
    Characteristic,
    hap: api.hap,
    thermostat: thermostat.getService(Service.Thermostat),
    outdoorTemperature: outdoor
      .getService(Service.TemperatureSensor)
      .getCharacteristic(Characteristic.CurrentTemperature),
    outdoorHumidity: outdoor
      .getService(Service.HumiditySensor)
      .getCharacteristic(Characteristic.CurrentRelativeHumidity),
  };
}

module.exports = { createAccessories, createSerial, response, log };
