import { execFile } from 'child_process';
import { EventEmitter } from 'events';
import type { Logging } from 'homebridge';
import {
  type Mode,
  makeRequestString,
  parseResponseString,
  type SerialResponse,
  validateMode,
  validateTargetTemperature,
} from './data';

export interface SerialOptions {
  commandPath?: string;
  pollInterval?: number;
  commandTimeout?: number;
}

export default class SerialInterface extends EventEmitter {
  private readonly commandPath: string;
  private readonly pollInterval: number;
  private readonly commandTimeout: number;
  private cachedResponse?: { time: number; data: SerialResponse };
  private queue: Promise<void> = Promise.resolve();
  private lastError?: Error;
  private retryAt = 0;
  private polling = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly logging: Logging,
    options: SerialOptions = {},
  ) {
    super();
    this.commandPath = options.commandPath ?? '/home/volchok/bin/october';
    this.pollInterval = options.pollInterval ?? 30;
    this.commandTimeout = options.commandTimeout ?? 2000;
    if (typeof this.commandPath !== 'string' || !this.commandPath.trim()) {
      throw new Error('commandPath must be a non-empty executable path');
    }
    if (!Number.isInteger(this.pollInterval) || this.pollInterval < 1 || this.pollInterval > 3600) {
      throw new Error('pollInterval must be an integer between 1 and 3600 seconds');
    }
    if (!Number.isInteger(this.commandTimeout) || this.commandTimeout < 100 || this.commandTimeout > 60000) {
      throw new Error('commandTimeout must be an integer between 100 and 60000 milliseconds');
    }
  }

  getState(force = false): Promise<SerialResponse> {
    return this.enqueue(() => this.readState(force));
  }

  async setState(mode?: Mode, temperature?: number): Promise<void> {
    if (mode !== undefined) {
      validateMode(mode);
    }
    if (temperature !== undefined) {
      validateTargetTemperature(temperature);
    }
    return this.enqueue(async () => {
      // Read inside the same queue operation as the write: never reuse a cached
      // mode or temperature when preserving the other setting.
      const current = await this.readState(true);
      const requestedMode = mode ?? current.mode;
      const requestedTemperature = temperature ?? current.setTemp;
      try {
        const acknowledgement = await this.exchange(makeRequestString(requestedMode, requestedTemperature));
        if (acknowledgement.mode !== requestedMode || acknowledgement.setTemp !== requestedTemperature) {
          throw new Error('Thermostat did not confirm the requested settings');
        }
        // Firmware acknowledges the settings before setRelay(). Read S afterwards
        // so CurrentHeatingCoolingState reflects the relay after the write.
        const state = await this.exchange('S');
        if (state.mode !== requestedMode || state.setTemp !== requestedTemperature) {
          throw new Error('Thermostat settings changed during write verification');
        }
        this.acceptState(state);
      } catch (error) {
        throw this.fail(error);
      }
    });
  }

  startPolling(): void {
    if (this.polling) {
      return;
    }
    this.polling = true;
    void this.poll();
  }

  stopPolling(): void {
    this.polling = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async poll(): Promise<void> {
    try {
      await this.getState(true);
    } catch {
      // readState already logs the error and marks the characteristics unavailable.
    }
    if (this.polling) {
      this.timer = setTimeout(() => void this.poll(), this.pollInterval * 1000);
      this.timer.unref();
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readState(force: boolean): Promise<SerialResponse> {
    if (!force && this.cachedResponse && Date.now() - this.cachedResponse.time < this.pollInterval * 1000) {
      return this.cachedResponse.data;
    }
    if (!force && this.lastError && Date.now() < this.retryAt) {
      throw this.lastError;
    }
    try {
      const state = await this.exchange('S');
      this.acceptState(state);
      return state;
    } catch (error) {
      throw this.fail(error);
    }
  }

  private async exchange(command: string): Promise<SerialResponse> {
    return parseResponseString(await this.sendCommand(command));
  }

  private acceptState(state: SerialResponse): void {
    this.cachedResponse = { time: Date.now(), data: state };
    this.lastError = undefined;
    this.retryAt = 0;
    this.emit('state', state);
  }

  private fail(error: unknown): Error {
    const failure = error instanceof Error ? error : new Error(String(error));
    this.cachedResponse = undefined;
    this.lastError = failure;
    this.retryAt = Date.now() + 2000;
    this.logging.error(failure.message);
    this.emit('unavailable', failure);
    return failure;
  }

  protected sendCommand(command: string): Promise<string> {
    this.logging.debug(`Sending ${command}`);
    return new Promise((resolve, reject) => {
      execFile(
        this.commandPath,
        [command],
        { encoding: 'utf8', timeout: this.commandTimeout, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 },
        (error, stdout) => {
          if (error) {
            reject(new Error(`Command execution failed: ${error.message}`));
            return;
          }
          const line = stdout
            .split('\n')
            .map((value) => value.trim())
            .find((value) => value && value !== 'READY');
          resolve(line ?? '');
        },
      );
    });
  }
}
