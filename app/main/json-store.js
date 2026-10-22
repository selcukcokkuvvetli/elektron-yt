const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx');
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    // Same-directory rename preserves the old file if replacement fails.
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

class JsonStore {
  constructor(filePath, validate, fallback) {
    this.filePath = filePath;
    this.validate = validate;
    this.fallback = fallback;
    this.warnings = [];
    this.readOnly = false;
  }

  preserveDamagedFile() {
    const copy = this.filePath + '.corrupt-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    try {
      fs.copyFileSync(this.filePath, copy);
      this.warnings.push('Bozuk veri korundu: ' + path.basename(copy));
    } catch (error) {
      this.readOnly = true;
      this.warnings.push('Bozuk veri yedeklenemedi; kayit kapatildi: ' + error.code);
    }
  }

  load() {
    if (!fs.existsSync(this.filePath)) return this.fallback();
    try {
      const result = this.validate(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
      if (result.warnings.length) {
        this.preserveDamagedFile();
        this.warnings.push(...result.warnings);
      }
      return result.value;
    } catch (error) {
      this.preserveDamagedFile();
      this.warnings.push('Veri okunamadi: ' + path.basename(this.filePath));
      try {
        const result = this.validate(JSON.parse(fs.readFileSync(this.filePath + '.bak', 'utf8')));
        if (result.warnings.length) throw new Error('Invalid backup');
        this.warnings.push('Son saglam yedek yuklendi.');
        return result.value;
      } catch (_) { return this.fallback(); }
    }
  }

  save(value) {
    if (this.readOnly) throw new Error('Bozuk veri korunamadigi icin kayit devre disi.');
    const result = this.validate(value);
    if (result.warnings.length) throw new Error('Gecersiz veri kaydedilemedi: ' + result.warnings.join('; '));
    if (fs.existsSync(this.filePath)) {
      const old = fs.readFileSync(this.filePath, 'utf8');
      let valid = false;
      try { valid = this.validate(JSON.parse(old)).warnings.length === 0; } catch (_) {}
      if (valid) atomicWrite(this.filePath + '.bak', old);
      else {
        this.preserveDamagedFile();
        if (this.readOnly) throw new Error('Bozuk veri yedeklenemedi.');
      }
    }
    atomicWrite(this.filePath, JSON.stringify(result.value, null, 2));
    return result.value;
  }
}

module.exports = { JsonStore, atomicWrite };
