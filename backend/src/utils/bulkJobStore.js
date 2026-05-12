const MAX_BULK_JOB_AGE_MS = 1000 * 60 * 60; // 1 hour
const jobs = new Map();

const nowIso = () => new Date().toISOString();

const pruneExpiredJobs = () => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - new Date(job.createdAt).getTime() > MAX_BULK_JOB_AGE_MS) {
      jobs.delete(id);
    }
  }
};

const createBulkJob = ({ entityType, action, actorId, requestedCount }) => {
  pruneExpiredJobs();
  const jobId = `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const timestamp = nowIso();
  const job = {
    jobId,
    entityType,
    action,
    actorId,
    requestedCount,
    status: 'queued',
    createdAt: timestamp,
    updatedAt: timestamp,
    result: null,
    error: null,
  };

  jobs.set(jobId, job);
  return job;
};

const updateBulkJob = (jobId, patch) => {
  const existing = jobs.get(jobId);
  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };

  jobs.set(jobId, updated);
  return updated;
};

const getBulkJob = (jobId) => {
  pruneExpiredJobs();
  return jobs.get(jobId) || null;
};

module.exports = {
  createBulkJob,
  updateBulkJob,
  getBulkJob,
};
