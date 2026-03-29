const fs = require('fs');

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

    try {
      const raw = fs.existsSync(this.filePath)
        ? fs.readFileSync(this.filePath, 'utf8')
        : '{}';
      const parsed = JSON.parse(raw || '{}');
      this.settings = Object.assign({}, this.defaults, parsed);
    } catch (error) {
      this.settings = Object.assign({}, this.defaults);
    }

    return this.settings;
  }

  save(settings) {
    this.settings = Object.assign({}, this.defaults, settings);
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf8');
    return this.settings;
  }

  update(patch) {
    return this.save(Object.assign({}, this.load(), patch));
  }
}

module.exports = SettingsStore;
