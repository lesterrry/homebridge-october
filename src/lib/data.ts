export enum Mode {
  Auto = 0,
  On = 1,
  Off = 2,
}

export enum State {
  On = 1,
  Off = 0,
}

export const TARGET_TEMPERATURE = { minValue: 10, maxValue: 30, minStep: 1 };
export const SENSOR_TEMPERATURE = { minValue: -40, maxValue: 40 };

export type SerialResponse = {
  mode: Mode;
  state: State;
  setTemp: number;
  intTemp: number | null;
  extTemp: number | null;
  intHumid: number | null;
  extHumid: number | null;
};

function parseNumber(value: string, min: number, max: number): number {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number < min || number > max) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return number;
}

export function validateMode(value: number): asserts value is Mode {
  if (![Mode.Auto, Mode.On, Mode.Off].includes(value)) {
    throw new Error(`Invalid mode: ${value}`);
  }
}

export function validateTargetTemperature(value: number): void {
  if (!Number.isInteger(value) || value < TARGET_TEMPERATURE.minValue || value > TARGET_TEMPERATURE.maxValue) {
    throw new Error(`Invalid target temperature: ${value}`);
  }
}

function parseSensor(value: string, min: number, max: number): number | null {
  try {
    return parseNumber(value, min, max);
  } catch {
    return null;
  }
}

// mode;state;setTemp;intTemp;extTemp;intHumid;extHumid
export function parseResponseString(response: string): SerialResponse {
  const fields = response.split(';');
  if (fields.length !== 7) {
    throw new Error('Wrong number of response fields');
  }
  const [modeString, stateString, setTempString, intTemp, extTemp, intHumid, extHumid] = fields;
  const mode = parseNumber(modeString, Mode.Auto, Mode.Off);
  validateMode(mode);
  const state = parseNumber(stateString, State.Off, State.On);
  if (!Number.isInteger(state)) {
    throw new Error(`Invalid state: ${stateString}`);
  }
  const setTemp = parseNumber(setTempString, TARGET_TEMPERATURE.minValue, TARGET_TEMPERATURE.maxValue);
  validateTargetTemperature(setTemp);

  return {
    mode,
    state,
    setTemp,
    intTemp: parseSensor(intTemp, SENSOR_TEMPERATURE.minValue, SENSOR_TEMPERATURE.maxValue),
    extTemp: parseSensor(extTemp, SENSOR_TEMPERATURE.minValue, SENSOR_TEMPERATURE.maxValue),
    intHumid: parseSensor(intHumid, 0, 100),
    extHumid: parseSensor(extHumid, 0, 100),
  };
}

export function makeRequestString(mode: Mode, temperature: number): string {
  validateMode(mode);
  validateTargetTemperature(temperature);
  return `${mode};${temperature}`;
}
