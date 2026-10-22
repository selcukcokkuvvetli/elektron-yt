const path = require('path');
const { JsonStore } = require('./json-store');

const ranges = {
  concurrency: [1, 10], maxRetries: [1, 10], jobTimeoutMs: [20, 3600000],
  startupTimeoutMs: [1000, 300000], postprocessTimeoutMs: [1000, 3600000],
  analysisTimeoutMs: [100, 300000], analysisConcurrency: [1, 3]
};

class SettingsStore {
  constructor(filePath, defaults) {
    this.filePath = filePath;
    this.defaults = defaults || {};
    this.settings = null;
  }

  load() {
    if (this.settings) {
      return this.settings;
    }

    this.store = this.createStore();
    this.settings = this.store.load();
    return this.settings;
  }

  save(settings) {
    if (!this.store) this.store = this.createStore();
    this.settings = this.store.save(Object.assign({}, this.defaults, settings));
    return this.settings;
  }

  update(patch) {
    return this.save(Object.assign({}, this.load(), patch));
  }

  get warnings() { return this.store ? this.store.warnings : []; }

  createStore() {
    return new JsonStore(this.filePath, value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Gecersiz ayarlar.');
      const settings = { ...this.defaults };
      const warnings = [];
      for (const [key, limits] of Object.entries(ranges)) {
        if (value[key] === undefined) continue;
        const number = Number(value[key]);
        if (Number.isInteger(number) && number >= limits[0] && number <= limits[1]) settings[key] = number;
        else warnings.push('Gecersiz ayar varsayilana dondu: ' + key);
      }
      if (value.downloadFolder !== undefined) {
        if (typeof value.downloadFolder === 'string' && value.downloadFolder.length <= 32768
          && path.isAbsolute(value.downloadFolder)) settings.downloadFolder = value.downloadFolder;
        else warnings.push('Gecersiz indirme klasoru varsayilana dondu.');
      }
      return { value: settings, warnings };
    }, () => ({ ...this.defaults }));
  }
}

module.exports = SettingsStore;
