const fs = require('fs');

class JobStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  save(jobs) {
    fs.writeFileSync(this.filePath, JSON.stringify(jobs, null, 2), 'utf8');
  }
}

module.exports = JobStore;
