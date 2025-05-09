export enum Mode {
    Auto = 0,
    On = 1,
    Off = 2
}

export type SerialResponse = {
    mode: Mode,
    setTemp: number,
    intTemp: number,
    extTemp: number,
    intHumid: number,
    extHumid: number
};

function parseModeString(value: string): Mode {
    const numValue = Number(value);

    if (isNaN(numValue) || !Object.values(Mode).includes(numValue)) {
        throw new Error(`Invalid Mode value: ${value}`);
    }

    return numValue as Mode;
}

function parseNumericValue(value: string, min: number, max: number): number {
    const numValue = Number(value);

    if (isNaN(numValue) || !isFinite(numValue) || numValue < min || numValue > max) {
        throw new Error(`Invalid numeric value: ${value}`);
    }

    return numValue;
}

// 2;22;19.85;7.78;57.68;66.59
export function parseResponseString(response: string): SerialResponse {
    const split = response.split(';');

    if (split.length != 6) throw Error('Wrong number of props');

    const [modeString, setTempString, intTempString, extTempString, intHumidString, extHumidString] = split;

    const mode = parseModeString(modeString);
    const setTemp = parseNumericValue(setTempString, 10, 30);
    const intTemp = parseNumericValue(intTempString, -40, 40);
    const extTemp = parseNumericValue(extTempString, -40, 40);
    const intHumid = parseNumericValue(intHumidString, 0, 100);
    const extHumid = parseNumericValue(extHumidString, 0, 100);

    return {
        mode,
        setTemp,
        intTemp,
        extTemp,
        intHumid,
        extHumid,
    }
};

export function makeRequestString(modeValue: number, tempValue: number) {
    return String(modeValue) + ';' + String(tempValue);
}
