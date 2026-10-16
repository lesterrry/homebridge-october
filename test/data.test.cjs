const assert = require('node:assert/strict');
const test = require('node:test');
const { makeRequestString, Mode, parseResponseString } = require('../dist/lib/data');
const { response } = require('./helpers.cjs');

test('parses the seven-field firmware response, preserving negative temperatures', () => {
  assert.deepEqual(parseResponseString('2;1;30;-10.25;-5;0;100'), {
    mode: Mode.Off,
    state: 1,
    setTemp: 30,
    intTemp: -10.25,
    extTemp: -5,
    intHumid: 0,
    extHumid: 100,
  });
});

test('rejects missing or invalid control fields and malformed frames', () => {
  for (const frame of [
    '',
    'READY',
    'ERROR: TEMP CORRUPT',
    '0;0;22',
    ';;22;;;;',
    response({ mode: ' ' }),
    response({ mode: 0.5 }),
    response({ state: '' }),
    response({ state: 0.5 }),
    response({ setTemp: '' }),
    response({ setTemp: 22.5 }),
    response({ setTemp: 35 }),
  ]) {
    assert.throws(() => parseResponseString(frame), frame);
  }
});

test('invalid sensor readings are unavailable individually, never fabricated as zero', () => {
  const parsed = parseResponseString(response({ extTemp: -41, intHumid: '', extHumid: 'nan' }));
  assert.equal(parsed.extTemp, null);
  assert.equal(parsed.intHumid, null);
  assert.equal(parsed.extHumid, null);
  assert.equal(parsed.intTemp, 20);
  assert.equal(parsed.setTemp, 22);
  assert.equal(parseResponseString(response({ intTemp: 'Infinity' })).intTemp, null);
});

test('outgoing commands obey the firmware integer range and mode enum', () => {
  assert.equal(makeRequestString(Mode.Auto, 10), '0;10');
  assert.equal(makeRequestString(Mode.On, 30), '1;30');
  assert.equal(makeRequestString(Mode.Off, 22), '2;22');
  for (const value of [9, 31, 22.5, NaN, Infinity, '22']) {
    assert.throws(() => makeRequestString(Mode.Auto, value));
  }
  for (const value of [-1, 3, 0.5, '0']) {
    assert.throws(() => makeRequestString(value, 22));
  }
});
