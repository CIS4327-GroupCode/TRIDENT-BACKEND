const LIST_FIELDS = ['domains', 'methods', 'tools', 'expertise'];

function parseDelimitedList(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || '').trim())
          .filter((item) => item.length > 0);
      }
    } catch (error) {
      // Fall through to comma-separated parsing.
    }
  }

  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function serializeDelimitedList(value) {
  const parsed = parseDelimitedList(value);
  return parsed.length > 0 ? parsed.join(', ') : null;
}

function normalizeResearcherListPayload(payload = {}, listFields = LIST_FIELDS) {
  const normalized = { ...payload };

  listFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = serializeDelimitedList(normalized[field]);
    }
  });

  return normalized;
}

function normalizeResearcherProfileForResponse(profile = {}, listFields = LIST_FIELDS) {
  const normalized = { ...profile };

  listFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = serializeDelimitedList(normalized[field]);
    }
  });

  if ((normalized.hourly_rate_min === null || normalized.hourly_rate_min === undefined) && normalized.rate_min !== undefined) {
    normalized.hourly_rate_min = normalized.rate_min;
  }

  if ((normalized.hourly_rate_max === null || normalized.hourly_rate_max === undefined) && normalized.rate_max !== undefined) {
    normalized.hourly_rate_max = normalized.rate_max;
  }

  return normalized;
}

module.exports = {
  LIST_FIELDS,
  parseDelimitedList,
  serializeDelimitedList,
  normalizeResearcherListPayload,
  normalizeResearcherProfileForResponse,
};
