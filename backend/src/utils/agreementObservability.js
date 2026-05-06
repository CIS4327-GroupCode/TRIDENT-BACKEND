const METRIC_STORE = new Map();
const ANOMALY_EVENTS = [];
const MAX_ANOMALY_EVENTS = 200;

function buildMetricKey(name, labels) {
  const orderedLabels = Object.keys(labels || {})
    .sort()
    .map((key) => `${key}=${String(labels[key])}`)
    .join('|');
  return `${name}|${orderedLabels}`;
}

function incrementMetric(name, labels = {}, amount = 1) {
  const key = buildMetricKey(name, labels);
  const existing = METRIC_STORE.get(key);
  if (existing) {
    existing.value += amount;
    return;
  }

  METRIC_STORE.set(key, {
    name,
    labels: { ...labels },
    value: amount
  });
}

function logStructured(event, payload = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...payload
  };

  console.log(`[agreements-observability] ${JSON.stringify(entry)}`);
}

function recordTransitionStart({ transition, actorId, agreementId }) {
  incrementMetric('agreements.transition.started', { transition });
  logStructured('agreement.transition.start', {
    transition,
    actor_id: actorId || null,
    agreement_id: agreementId || null
  });
}

function recordTransitionOutcome({ transition, outcome, actorId, agreementId, durationMs, statusCode, agreementStatus, errorMessage }) {
  incrementMetric('agreements.transition.completed', {
    transition,
    outcome
  });

  if (statusCode) {
    incrementMetric('agreements.transition.status_code', {
      transition,
      status_code: String(statusCode)
    });
  }

  if (agreementStatus) {
    incrementMetric('agreements.transition.agreement_status', {
      transition,
      agreement_status: agreementStatus
    });
  }

  logStructured('agreement.transition.complete', {
    transition,
    outcome,
    actor_id: actorId || null,
    agreement_id: agreementId || null,
    duration_ms: durationMs,
    status_code: statusCode || null,
    agreement_status: agreementStatus || null,
    error: errorMessage || null
  });
}

function recordAnomaly(type, details = {}) {
  incrementMetric('agreements.anomaly.detected', { type });

  const event = {
    ts: new Date().toISOString(),
    type,
    details: { ...details }
  };

  ANOMALY_EVENTS.push(event);
  if (ANOMALY_EVENTS.length > MAX_ANOMALY_EVENTS) {
    ANOMALY_EVENTS.shift();
  }

  logStructured('agreement.anomaly.detected', {
    type,
    details
  });
}

function inspectAgreementForAnomalies(agreement, context = {}) {
  if (!agreement || typeof agreement !== 'object') {
    return;
  }

  if (agreement.status === 'pending_signature' && agreement.nonprofit_signed_at && agreement.researcher_signed_at) {
    recordAnomaly('pending_signature_with_both_signatures', {
      agreement_id: agreement.id || null,
      transition: context.transition || null
    });
  }

  if (agreement.status === 'executed' && (!agreement.storage_key || !agreement.checksum)) {
    recordAnomaly('executed_missing_artifact_or_checksum', {
      agreement_id: agreement.id || null,
      transition: context.transition || null
    });
  }

  if (agreement.status !== 'terminated' && agreement.terminated_at) {
    recordAnomaly('terminated_timestamp_without_terminated_status', {
      agreement_id: agreement.id || null,
      status: agreement.status,
      transition: context.transition || null
    });
  }

  if (agreement.is_current_version && ['completed', 'terminated', 'expired', 'archived'].includes(agreement.status)) {
    recordAnomaly('terminal_status_marked_current_version', {
      agreement_id: agreement.id || null,
      status: agreement.status,
      transition: context.transition || null
    });
  }
}

function getAgreementObservabilitySnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    metrics: Array.from(METRIC_STORE.values()).sort((a, b) => a.name.localeCompare(b.name)),
    recentAnomalies: [...ANOMALY_EVENTS]
  };
}

module.exports = {
  recordTransitionStart,
  recordTransitionOutcome,
  recordAnomaly,
  inspectAgreementForAnomalies,
  getAgreementObservabilitySnapshot
};
