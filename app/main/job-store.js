const { JsonStore } = require('./json-store');
const { validateUrl } = require('./urls');

class JobStore extends JsonStore {
  constructor(filePath) {
    super(filePath, value => {
      if (!Array.isArray(value)) throw new Error('Is listesi bir dizi olmali.');
      const warnings = [];
      const ids = new Set();
      const jobs = value.filter(job => {
        try {
          if (!job || typeof job !== 'object' || typeof job.id !== 'string'
            || !/^[\w-]{1,128}$/.test(job.id) || ids.has(job.id)) throw new Error();
          // Failed URL analysis may deliberately retain invalid input for error display/retry.
          if (typeof job.url !== 'string' || job.url.length > 8192) throw new Error();
          if (job.failureStage !== 'analysis' && !/^Analiz hatasi:/.test(job.errorMessage || '')) validateUrl(job.url);
          if (!['waiting', 'queued', 'downloading', 'completed', 'failed', 'cancelled', 'skipped'].includes(job.status)) throw new Error();
          ids.add(job.id);
          return true;
        } catch (_) { warnings.push('Gecersiz veya tekrarlanan is kaydi atlandi.'); return false; }
      });
      return { value: jobs, warnings };
    }, () => []);
  }
}

module.exports = JobStore;
