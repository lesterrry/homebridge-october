import type { CharacteristicValue, PlatformAccessory, Service, UnknownContext } from 'homebridge';
import { State as CurrentState, Mode, SENSOR_TEMPERATURE, type SerialResponse, TARGET_TEMPERATURE } from '../lib/data';
import type { OctoberPlatform } from '../platform';
import { AbstractAccessory } from './AbstractAccessory';

export class OctoberAccessory extends AbstractAccessory {
  private readonly primaryService: Service;

  constructor(
    protected readonly platform: OctoberPlatform,
    protected readonly accessory: PlatformAccessory,
    protected readonly data: UnknownContext,
  ) {
    super(platform, accessory, data);
    this.primaryService =
      this.accessory.getService(this.Service.Thermostat) || this.accessory.addService(this.Service.Thermostat);

    this.primaryService
      .getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
      .setProps({
        maxValue: this.Characteristic.CurrentHeatingCoolingState.HEAT,
        validValues: [
          this.Characteristic.CurrentHeatingCoolingState.OFF,
          this.Characteristic.CurrentHeatingCoolingState.HEAT,
        ],
      })
      .onGet(async () => this.mapCurrentState((await this.getState()).state));
    this.primaryService
      .getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
      .setProps({
        maxValue: this.Characteristic.TargetHeatingCoolingState.HEAT,
        validValues: [
          this.Characteristic.TargetHeatingCoolingState.OFF,
          this.Characteristic.TargetHeatingCoolingState.HEAT,
        ],
      })
      .onGet(async () => this.mapMode((await this.getState()).mode))
      .onSet(this.setTargetHeatingCoolingState.bind(this));
    this.primaryService
      .getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps(SENSOR_TEMPERATURE)
      .onGet(async () => this.sensorValue((await this.getState()).intTemp));
    this.primaryService
      .getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .onGet(async () => this.sensorValue((await this.getState()).intHumid));
    this.primaryService
      .getCharacteristic(this.Characteristic.TargetTemperature)
      .setProps(TARGET_TEMPERATURE)
      .onGet(async () => (await this.getState()).setTemp)
      .onSet(this.setTargetTemperature.bind(this));
    this.primaryService
      .getCharacteristic(this.Characteristic.TemperatureDisplayUnits)
      .setProps({ validValues: [this.Characteristic.TemperatureDisplayUnits.CELSIUS] })
      .onGet(() => this.Characteristic.TemperatureDisplayUnits.CELSIUS);

    this.serialInterface.on('state', (state: SerialResponse) => this.updateState(state));
    this.serialInterface.on('unavailable', () => this.updateState());
  }

  private mapMode(mode: Mode): number {
    switch (mode) {
      case Mode.Auto:
      case Mode.On:
        return this.Characteristic.TargetHeatingCoolingState.HEAT;
      case Mode.Off:
        return this.Characteristic.TargetHeatingCoolingState.OFF;
    }
  }

  private mapTargetMode(value: CharacteristicValue): Mode {
    switch (value) {
      case this.Characteristic.TargetHeatingCoolingState.OFF:
        return Mode.Off;
      case this.Characteristic.TargetHeatingCoolingState.HEAT:
        return Mode.Auto;
      default:
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
    }
  }

  private mapCurrentState(state: CurrentState): number {
    return state === CurrentState.On
      ? this.Characteristic.CurrentHeatingCoolingState.HEAT
      : this.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  private async setTargetHeatingCoolingState(value: CharacteristicValue): Promise<void> {
    const mode = this.mapTargetMode(value);
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
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
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
      .getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
      .updateValue(state ? this.mapCurrentState(state.state) : error);
    this.primaryService
      .getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
      .updateValue(state ? this.mapMode(state.mode) : error);
    this.primaryService.getCharacteristic(this.Characteristic.TargetTemperature).updateValue(state?.setTemp ?? error);
    this.primaryService.getCharacteristic(this.Characteristic.CurrentTemperature).updateValue(state?.intTemp ?? error);
    this.primaryService
      .getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .updateValue(state?.intHumid ?? error);
  }
}
