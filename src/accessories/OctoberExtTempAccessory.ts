import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { OctoberPlatform } from '../platform';

export class OctoberExtTempAccessory {
  private temperatureService: Service;
  private humidityService: Service;
  
  // Hardcoded values
  private currentTemperature = 22.5; // 22.5°C
  private currentHumidity = 50.0;   // 50%

  constructor(
    private readonly platform: OctoberPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.temperatureService = this.accessory.getService(this.platform.api.hap.Service.TemperatureSensor) || 
      this.accessory.addService(this.platform.api.hap.Service.TemperatureSensor);

    this.temperatureService.setCharacteristic(
      this.platform.api.hap.Characteristic.Name, 
      'Temperature'
    );

    // Set up characteristics for temperature
    this.temperatureService.getCharacteristic(this.platform.api.hap.Characteristic.CurrentTemperature)
      .onGet(this.getTemperature.bind(this));

    // Humidity Sensor service
    this.humidityService = this.accessory.getService(this.platform.api.hap.Service.HumiditySensor) || 
      this.accessory.addService(this.platform.api.hap.Service.HumiditySensor);

    this.humidityService.setCharacteristic(
      this.platform.api.hap.Characteristic.Name, 
      'Humidity'
    );

    // Set up characteristics for humidity
    this.humidityService.getCharacteristic(this.platform.api.hap.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getHumidity.bind(this));
  }

  /**
   * Handle requests to get the current temperature
   */
  getTemperature(): CharacteristicValue {
    this.platform.log.debug('Get temperature:', this.currentTemperature);
    return this.currentTemperature;
  }

  /**
   * Handle requests to get the current humidity
   */
  getHumidity(): CharacteristicValue {
    this.platform.log.debug('Get humidity:', this.currentHumidity);
    return this.currentHumidity;
  }
}