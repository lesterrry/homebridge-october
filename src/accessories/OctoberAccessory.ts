import type { CharacteristicValue, PlatformAccessory, Service, UnknownContext } from 'homebridge';
import { State as CurrentState, Mode, SENSOR_TEMPERATURE, type SerialResponse, TARGET_TEMPERATURE } from '../lib/data';
import type { OctoberPlatform } from '../platform';
import { AbstractAccessory } from './AbstractAccessory';

export class OctoberAccessory extends AbstractAccessory {
  private readonly primaryService: Service;
  private readonly humidityService: Service;

  constructor(
    protected readonly platform: OctoberPlatform,
    protected readonly accessory: PlatformAccessory,
    protected readonly data: UnknownContext,
  ) {
    super(platform, accessory, data);
    const legacyService = this.accessory.getService(this.Service.Thermostat);
    if (legacyService) {
      this.accessory.removeService(legacyService);
      this.platform.log.info('Migrating October from Thermostat to HeaterCooler');
    }
    this.primaryService =
      this.accessory.getService(this.Service.HeaterCooler) || this.accessory.addService(this.Service.HeaterCooler);
    this.primaryService.setPrimaryService();

    this.primaryService
      .getCharacteristic(this.Characteristic.Active)
      .onGet(async () => this.mapActive((await this.getState()).mode))
      .onSet(this.setActive.bind(this));
    this.primaryService
      .getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .setProps({
        maxValue: this.Characteristic.CurrentHeaterCoolerState.HEATING,
        validValues: [
          this.Characteristic.CurrentHeaterCoolerState.INACTIVE,
          this.Characteristic.CurrentHeaterCoolerState.IDLE,
          this.Characteristic.CurrentHeaterCoolerState.HEATING,
        ],
      })
      .onGet(async () => this.mapCurrentState(await this.getState()));
    this.primaryService
      .getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
      .updateValue(this.Characteristic.TargetHeaterCoolerState.HEAT)
      .setProps({
        minValue: this.Characteristic.TargetHeaterCoolerState.HEAT,
        maxValue: this.Characteristic.TargetHeaterCoolerState.HEAT,
        validValues: [this.Characteristic.TargetHeaterCoolerState.HEAT],
      })
      .onGet(() => this.Characteristic.TargetHeaterCoolerState.HEAT)
      .onSet((value) => {
        if (value !== this.Characteristic.TargetHeaterCoolerState.HEAT) {
          throw this.invalidValueError();
        }
      });
    this.primaryService
      .getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps(SENSOR_TEMPERATURE)
      .onGet(async () => this.sensorValue((await this.getState()).intTemp));
    this.primaryService
      .getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
      .updateValue(TARGET_TEMPERATURE.minValue)
      .setProps(TARGET_TEMPERATURE)
      .onGet(async () => (await this.getState()).setTemp)
      .onSet(this.setTargetTemperature.bind(this));
    this.primaryService
      .getCharacteristic(this.Characteristic.TemperatureDisplayUnits)
      .setProps({ validValues: [this.Characteristic.TemperatureDisplayUnits.CELSIUS] })
      .onGet(() => this.Characteristic.TemperatureDisplayUnits.CELSIUS);

    this.humidityService =
      this.accessory.getService(this.Service.HumiditySensor) ||
      this.accessory.addService(this.Service.HumiditySensor, 'Humidity');
    this.humidityService
      .getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .onGet(async () => this.sensorValue((await this.getState()).intHumid));

    this.serialInterface.on('state', (state: SerialResponse) => this.updateState(state));
    this.serialInterface.on('unavailable', () => this.updateState());
    this.updateState();
  }

  private mapActive(mode: Mode): number {
    return mode === Mode.Off ? this.Characteristic.Active.INACTIVE : this.Characteristic.Active.ACTIVE;
  }

  private mapCurrentState(state: SerialResponse): number {
    if (state.mode === Mode.Off) {
      return this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
    return state.state === CurrentState.On
      ? this.Characteristic.CurrentHeaterCoolerState.HEATING
      : this.Characteristic.CurrentHeaterCoolerState.IDLE;
  }

  private invalidValueError(): Error {
    return new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
  }

  private async setActive(value: CharacteristicValue): Promise<void> {
    if (value !== this.Characteristic.Active.ACTIVE && value !== this.Characteristic.Active.INACTIVE) {
      throw this.invalidValueError();
    }
    const mode = value === this.Characteristic.Active.ACTIVE ? Mode.Auto : Mode.Off;
    try {
      await this.serialInterface.setState(mode);
    } catch {
      throw this.communicationError();
    }
  }

  private async setTargetTemperature(value: CharacteristicValue): Promise<void> {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < TARGET_TEMPERATURE.minValue ||
      value > TARGET_TEMPERATURE.maxValue
    ) {
      throw this.invalidValueError();
    }
    try {
      await this.serialInterface.setState(undefined, value);
    } catch {
      throw this.communicationError();
    }
  }

  private updateState(state?: SerialResponse): void {
    const error = this.communicationError();
    this.primaryService
      .getCharacteristic(this.Characteristic.Active)
      .updateValue(state ? this.mapActive(state.mode) : error);
    this.primaryService
      .getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .updateValue(state ? this.mapCurrentState(state) : error);
    this.primaryService
      .getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
      .updateValue(state?.setTemp ?? error);
    this.primaryService.getCharacteristic(this.Characteristic.CurrentTemperature).updateValue(state?.intTemp ?? error);
    this.humidityService
      .getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .updateValue(state?.intHumid ?? error);
  }
}
