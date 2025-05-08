import {OctoberPlatform} from '../platform';
import {Service, PlatformAccessory, Characteristic, UnknownContext} from 'homebridge';

export abstract class AbstractAccessory {
  protected Service: typeof Service;
  protected Characteristic: typeof Characteristic;

  protected constructor(
    protected readonly platform: OctoberPlatform,
    protected readonly accessory: PlatformAccessory,
    protected readonly data: UnknownContext = {},
  ) {

    this.Service = this.platform.api.hap.Service;
    this.Characteristic = this.platform.api.hap.Characteristic;

    this.accessory.getService(this.platform.api.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, 'Volchok')
      .setCharacteristic(this.platform.api.hap.Characteristic.Model, 'Suburbs: October')
      .setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, '033');
  }
}
