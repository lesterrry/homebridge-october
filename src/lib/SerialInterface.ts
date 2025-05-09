import { Logging } from 'homebridge';
import { execSync } from 'child_process';

import { makeRequestString, Mode, parseResponseString, SerialResponse } from './data';

export default class SerialInterface {
    private cachedResponse: { time: number, data: SerialResponse | undefined } | undefined;

    private ttl: number; // in seconds
    private logging: Logging;

    constructor(ttl: number, logging: Logging) {
        this.ttl = ttl;
        this.logging = logging;
    }

    getState(): SerialResponse {
        if (this.cachedResponse?.data && (Date.now() - this.cachedResponse.time) / 1000 <= this.ttl) {
            this.logging.debug('Cache hit');

            return this.cachedResponse.data;
        } else {
            this.logging.debug('Cache expired');

            return this.sendCommandAndParseState('S');
        }
    }

    setState(mode?: Mode, temp?: number) {
        this.logging.debug('Setting state');

        const modeValue = Number(mode ?? this.getState().mode);

        const tempValue = Number(temp ?? this.getState().setTemp);

        const command = makeRequestString(modeValue, tempValue);

        this.sendCommandAndParseState(command);
    }

    private sendCommandAndParseState(command: string): SerialResponse {
        try {
            const response = this.sendCommand(command);

            this.logging.debug(response);

            const parsed = parseResponseString(response);

            this.logging.debug(JSON.stringify(parsed));

            this.cachedResponse = {
                time: Date.now(),
                data: parsed,
            };

            return parsed;
        } catch (error) {
            this.logging.error('ERR: ' + (error instanceof Error ? error.message : String(error)));
        }

        this.cachedResponse = {
            time: Date.now(),
            data: undefined,
        };

        throw new Error('Failed to obtain data');
    }

    private sendCommand(command: string): string {
        this.logging.debug(`Sending ${command}`);

        try {
            const stdout = execSync(`/home/volchok/bin/october "${command}"`, { encoding: 'utf-8', timeout: 2000 });

            const lines = stdout.split('\n').filter(line => line.trim().length > 0);
            return lines.length > 0 ? lines[0].trim() : '';
        } catch (error) {
            throw new Error(`Command execution failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
