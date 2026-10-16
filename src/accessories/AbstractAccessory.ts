import type { Characteristic, PlatformAccessory, Service, UnknownContext } from 'homebridge';
import type { SerialResponse } from '../lib/data';
import type SerialInterface from '../lib/SerialInterface';
import type { OctoberPlatform } from '../platform';

export abstract class AbstractAccessory {
  protected Service: typeof Service;
  protected Characteristic: typeof Characteristic;
  protected readonly serialInterface: SerialInterface;

  protected constructor(
    protected readonly platform: OctoberPlatform,
    protected readonly accessory: PlatformAccessory,
    protected readonly data: UnknownContext = {},
  ) {
    this.Service = this.platform.api.hap.Service;
    this.Characteristic = this.platform.api.hap.Characteristic;
    this.serialInterface = this.platform._serialInterface;

    this.accessory
      .getService(this.platform.api.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, 'volchok')
      .setCharacteristic(this.platform.api.hap.Characteristic.Model, 'Suburbs: October')
      .setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, '033');
  }

  protected communicationError(): Error {
    return new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  protected async getState(): Promise<SerialResponse> {
    try {
      return await this.serialInterface.getState();
    } catch {
      throw this.communicationError();
    }
  }

  protected sensorValue(value: number | null): number {
    if (value === null) {
      throw this.communicationError();
    }
    return value;
  }
}
