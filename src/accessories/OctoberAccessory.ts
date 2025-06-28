import { PlatformAccessory, Service, UnknownContext } from 'homebridge';

import { OctoberPlatform } from '../platform';
import { AbstractAccessory } from './AbstractAccessory';
import SerialInterface from '../lib/SerialInterface';
import { Mode, State as CurrentState } from '../lib/data';

export interface State {
    temperature: number;
    mode: number;
}

export class OctoberAccessory extends AbstractAccessory {
    private readonly primaryService: Service;

    private serialInterface: SerialInterface;

    constructor(
        protected readonly platform: OctoberPlatform,
        protected readonly accessory: PlatformAccessory,
        protected readonly data: UnknownContext,
    ) {
        super(platform, accessory, data);

        this.serialInterface = this.platform._serialInterface;

        this.primaryService = this.accessory.getService(this.platform.api.hap.Service.Thermostat) || this.accessory.addService(
            this.platform.api.hap.Service.Thermostat);

        this.primaryService.getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
            .onGet(this.getCurrentHeatingCoolingState.bind(this));

        this.primaryService.getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
            .onGet(this.getTargetHeatingCoolingState.bind(this))
            .onSet(this.setTargetHeatingCoolingState.bind(this));

        this.primaryService.getCharacteristic(this.Characteristic.CurrentTemperature)
            .onGet(this.getCurrentTemperature.bind(this));

        this.primaryService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
            .onGet(this.getCurrentHumidity.bind(this));

        this.primaryService.getCharacteristic(this.Characteristic.TargetTemperature)
            .onGet(this.getTargetTemperature.bind(this))
            .onSet(this.setTargetTemperature.bind(this));

        this.primaryService.getCharacteristic(this.Characteristic.TemperatureDisplayUnits)
            .onGet(this.getTemperatureDisplayUnits.bind(this))
            .onSet(this.setTemperatureDisplayUnits.bind(this));
    }

    private mapModeToTargetCharacteristic(mode: Mode) {
        switch (mode) {
            case Mode.Auto:
                return this.Characteristic.TargetHeatingCoolingState.AUTO;
            case Mode.Off:
                return this.Characteristic.TargetHeatingCoolingState.OFF;
            case Mode.On:
                return this.Characteristic.TargetHeatingCoolingState.HEAT;
        }
    }

    private mapTargetCharacteristicToMode(value: number) {
        switch (value) {
            case 3: // Auto
                return Mode.Auto;
            case 0: // Off
                return Mode.Off;
            case 1: // Heat
                return Mode.On;
            default:
                return Mode.Off;
        }
    }

    private mapModeToCurrentCharacteristic(state: CurrentState) {
        switch (state) {
            case CurrentState.On:
                return this.Characteristic.CurrentHeatingCoolingState.HEAT;
            case CurrentState.Off:
                return this.Characteristic.CurrentHeatingCoolingState.OFF;
        }
    }

    getCurrentHeatingCoolingState() {
        const state = this.serialInterface.getState().state;
        this.platform.log.debug('Get current state:', state);

        return this.mapModeToCurrentCharacteristic(state);
    }

    getTargetHeatingCoolingState() {
        const value = this.serialInterface.getState().mode;
        this.platform.log.debug('Get target mode:', value);

        return this.mapModeToTargetCharacteristic(value);
    }

    setTargetHeatingCoolingState(value) {
        this.platform.log.debug('Set target mode:', value);

        const mappedValue = this.mapTargetCharacteristicToMode(value);

        this.serialInterface.setState(mappedValue, undefined);
    }

    getCurrentTemperature() {
        const value = this.serialInterface.getState().intTemp;
        this.platform.log.debug('Get current int temperature:', value);

        return value;
    }

    getCurrentHumidity() {
        const value = this.serialInterface.getState().intHumid;
        this.platform.log.debug('Get current int humidity:', value);

        return value;
    }

    getTargetTemperature() {
        const value = this.serialInterface.getState().setTemp;
        this.platform.log.debug('Get target int temperature:', value);

        return value;
    }

    setTargetTemperature(value) {
        this.platform.log.debug('Set target int temperature:', value);

        this.serialInterface.setState(undefined, Math.floor(value));
    }

    // Misc

    getTemperatureDisplayUnits() {
        this.platform.log.debug('Set temperature display units');

        return this.Characteristic.TemperatureDisplayUnits.CELSIUS;
    }

    setTemperatureDisplayUnits(value) {
        this.platform.log.debug('Get temperature display units', value);
    }
}
