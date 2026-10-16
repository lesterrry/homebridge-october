import type { PlatformAccessory, Service } from 'homebridge';
import { SENSOR_TEMPERATURE, type SerialResponse } from '../lib/data';
import type { OctoberPlatform } from '../platform';
import { AbstractAccessory } from './AbstractAccessory';

export class OctoberExtTempAccessory extends AbstractAccessory {
  private readonly temperatureService: Service;
  private readonly humidityService: Service;

  constructor(
    protected readonly platform: OctoberPlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
    this.temperatureService =
      this.accessory.getService(this.Service.TemperatureSensor) ||
      this.accessory.addService(this.Service.TemperatureSensor);
    this.temperatureService.setCharacteristic(this.Characteristic.Name, 'Temperature');
    this.temperatureService
      .getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps(SENSOR_TEMPERATURE)
      .onGet(async () => this.sensorValue((await this.getState()).extTemp));

    this.humidityService =
      this.accessory.getService(this.Service.HumiditySensor) || this.accessory.addService(this.Service.HumiditySensor);
    this.humidityService.setCharacteristic(this.Characteristic.Name, 'Humidity');
    this.humidityService
      .getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .onGet(async () => this.sensorValue((await this.getState()).extHumid));

    this.serialInterface.on('state', (state: SerialResponse) => this.updateState(state));
    this.serialInterface.on('unavailable', () => this.updateState());
  }

  private updateState(state?: SerialResponse): void {
    this.temperatureService
      .getCharacteristic(this.Characteristic.CurrentTemperature)
      .updateValue(state?.extTemp ?? this.communicationError());
    this.humidityService
      .getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .updateValue(state?.extHumid ?? this.communicationError());
  }
}
