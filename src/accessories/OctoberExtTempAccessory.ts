import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { OctoberPlatform } from '../platform';
import SerialInterface from '../lib/SerialInterface';
import { AbstractAccessory } from './AbstractAccessory';

export class OctoberExtTempAccessory extends AbstractAccessory {
    private temperatureService: Service;
    private humidityService: Service;

    private serialInterface: SerialInterface;

    constructor(
        protected readonly platform: OctoberPlatform,
        protected readonly accessory: PlatformAccessory,
    ) {
        super(platform, accessory);

        this.serialInterface = this.platform._serialInterface;

        this.temperatureService = this.accessory.getService(this.platform.api.hap.Service.TemperatureSensor) ||
            this.accessory.addService(this.platform.api.hap.Service.TemperatureSensor);

        this.temperatureService.setCharacteristic(
            this.platform.api.hap.Characteristic.Name,
            'Temperature',
        );

        // Set up characteristics for temperature
        this.temperatureService.getCharacteristic(this.platform.api.hap.Characteristic.CurrentTemperature)
            .onGet(this.getTemperature.bind(this));

        // Humidity Sensor service
        this.humidityService = this.accessory.getService(this.platform.api.hap.Service.HumiditySensor) ||
            this.accessory.addService(this.platform.api.hap.Service.HumiditySensor);

        this.humidityService.setCharacteristic(
            this.platform.api.hap.Characteristic.Name,
            'Humidity',
        );

        // Set up characteristics for humidity
        this.humidityService.getCharacteristic(this.platform.api.hap.Characteristic.CurrentRelativeHumidity)
            .onGet(this.getHumidity.bind(this));
    }

    getTemperature(): CharacteristicValue {
        const value = (this.serialInterface.getState()).extTemp;
        this.platform.log.debug('Get current ext temperature:', value);

        return value;
    }

    getHumidity(): CharacteristicValue {
        const value = (this.serialInterface.getState()).extHumid;
        this.platform.log.debug('Get current ext humidity:', value);

        return value;
    }
}
