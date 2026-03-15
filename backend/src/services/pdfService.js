const crypto = require('crypto');
const PDFDocument = require('pdfkit');

const TEMPLATE_DEFINITIONS = {
  NDA: {
    label: 'Non-Disclosure Agreement',
    requiredVariables: [
      'project_title',
      'nonprofit_name',
      'researcher_name',
      'effective_date',
      'confidential_scope',
      'term_months',
      'governing_law'
    ],
    template: [
      'NON-DISCLOSURE AGREEMENT',
      '',
      'Project: {{project_title}}',
      'Effective Date: {{effective_date}}',
      '',
      'This Non-Disclosure Agreement is entered into by {{nonprofit_name}} and {{researcher_name}}.',
      'Confidential Information Scope: {{confidential_scope}}.',
      'The obligations in this agreement remain in effect for {{term_months}} months.',
      'Governing Law: {{governing_law}}.',
      '',
      'Both parties agree to protect confidential information and only use it for the project listed above.'
    ].join('\n')
  },
  DUA: {
    label: 'Data Use Agreement',
    requiredVariables: [
      'project_title',
      'nonprofit_name',
      'researcher_name',
      'dataset_description',
      'permitted_use',
      'security_controls',
      'retention_period'
    ],
    template: [
      'DATA USE AGREEMENT',
      '',
      'Project: {{project_title}}',
      '',
      '{{nonprofit_name}} provides the following dataset to {{researcher_name}}:',
      '{{dataset_description}}',
      '',
      'Permitted Use: {{permitted_use}}.',
      'Security Controls Required: {{security_controls}}.',
      'Data Retention Period: {{retention_period}}.',
      '',
      'Researcher agrees to comply with all applicable data protection obligations.'
    ].join('\n')
  },
  SOW: {
    label: 'Statement of Work',
    requiredVariables: [
      'project_title',
      'nonprofit_name',
      'researcher_name',
      'scope',
      'deliverables',
      'timeline',
      'budget_terms'
    ],
    template: [
      'STATEMENT OF WORK',
      '',
      'Project: {{project_title}}',
      'Parties: {{nonprofit_name}} and {{researcher_name}}',
      '',
      'Scope of Work:',
      '{{scope}}',
      '',
      'Deliverables:',
      '{{deliverables}}',
      '',
      'Timeline: {{timeline}}',
      'Budget and Payment Terms: {{budget_terms}}',
      '',
      'Both parties acknowledge and agree to execute this scope as documented.'
    ].join('\n')
  }
};

function getTemplateDefinition(templateType) {
  const definition = TEMPLATE_DEFINITIONS[templateType];
  if (!definition) {
    throw new Error('Unsupported template type');
  }

  return definition;
}

function renderTemplatePreview(templateType, variables = {}) {
  const definition = getTemplateDefinition(templateType);
  const missingVariables = definition.requiredVariables.filter((key) => {
    const value = variables[key];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missingVariables.length) {
    throw new Error(`Missing required template variables: ${missingVariables.join(', ')}`);
  }

  return definition.template.replace(/{{\s*([^}\s]+)\s*}}/g, (_, key) => {
    return String(variables[key] ?? '').trim();
  });
}

function generatePdfBufferFromText(textContent, title) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4'
    });

    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(title, { align: 'left' });
    doc.moveDown(0.8);
    doc.fontSize(10).text(`Generated at ${new Date().toISOString()}`);
    doc.moveDown(1.2);
    doc.fontSize(12).text(textContent, {
      align: 'left',
      lineGap: 4
    });

    doc.end();
  });
}

async function generatePdf(templateType, variables = {}) {
  const definition = getTemplateDefinition(templateType);
  const preview = renderTemplatePreview(templateType, variables);
  const buffer = await generatePdfBufferFromText(preview, definition.label);

  const checksum = crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');

  return {
    buffer,
    checksum,
    preview
  };
}

function getAvailableTemplates() {
  return Object.entries(TEMPLATE_DEFINITIONS).map(([key, value]) => ({
    type: key,
    label: value.label,
    requiredVariables: value.requiredVariables
  }));
}

module.exports = {
  getAvailableTemplates,
  renderTemplatePreview,
  generatePdf
};
