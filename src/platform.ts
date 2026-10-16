import {
  type API,
  APIEvent,
  Categories,
  type DynamicPlatformPlugin,
  type Logging,
  type PlatformAccessory,
  PlatformAccessoryEvent,
  type PlatformConfig,
} from 'homebridge';
import { OctoberAccessory } from './accessories';
import { OctoberExtTempAccessory } from './accessories/OctoberExtTempAccessory';
import SerialInterface from './lib/SerialInterface';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export class OctoberPlatform implements DynamicPlatformPlugin {
  private _accessories: { [key: string]: PlatformAccessory } = {};

  public _serialInterface: SerialInterface;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this._serialInterface = new SerialInterface(log, {
      commandPath: config.commandPath,
      pollInterval: config.pollInterval,
      commandTimeout: config.commandTimeout,
    });

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.log.debug('Executed didFinishLaunching callback');

      this.discoverDevices();
      this._serialInterface.startPolling();
    });
    this.api.on(APIEvent.SHUTDOWN, () => this._serialInterface.stopPolling());
  }

  discoverDevices() {
    this.addAccessory('october', Categories.THERMOSTAT);
    this.addAccessory('october-ext-temp', Categories.SENSOR);
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log('Configuring accessory %s', accessory.displayName);

    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log('%s identified!', accessory.displayName);
    });

    if (accessory.category === this.api.hap.Categories.THERMOSTAT) {
      new OctoberAccessory(this, accessory, accessory.context);
    } else if (accessory.category === this.api.hap.Categories.SENSOR) {
      new OctoberExtTempAccessory(this, accessory);
    }

    this._accessories[accessory.UUID] = accessory;
  }

  addAccessory(name: string, category: Categories) {
    const uuid = this.api.hap.uuid.generate(name);

    if (!this._accessories[uuid]) {
      this.log.info('Adding new accessory with name %s', name);

      const accessory = new this.api.platformAccessory(name, uuid, category);

      this.configureAccessory(accessory); // abusing the configureAccessory here

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      this.log.info('Skipping to add new accessory with name %s because it exists in cache', name);
    }
  }
}
