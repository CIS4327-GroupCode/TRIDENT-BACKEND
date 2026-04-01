const pdfService = require('../../src/services/pdfService');

describe('pdfService', () => {
  it('lists supported templates', () => {
    const templates = pdfService.getAvailableTemplates();
    const types = templates.map((template) => template.type);

    expect(types).toEqual(expect.arrayContaining(['NDA', 'DUA', 'SOW']));
  });

  it('renders preview with required variables', () => {
    const preview = pdfService.renderTemplatePreview('NDA', {
      project_title: 'Neuro Data Collaboration',
      nonprofit_name: 'HealthForAll Org',
      researcher_name: 'Dr. Jane Doe',
      effective_date: '2026-03-14',
      confidential_scope: 'patient-level datasets and analytics plans',
      term_months: '12',
      governing_law: 'California'
    });

    expect(preview).toContain('NON-DISCLOSURE AGREEMENT');
    expect(preview).toContain('Neuro Data Collaboration');
    expect(preview).toContain('Dr. Jane Doe');
  });

  it('throws when required variables are missing', () => {
    expect(() => {
      pdfService.renderTemplatePreview('DUA', {
        project_title: 'Incomplete DUA'
      });
    }).toThrow('Missing required template variables');
  });

  it('throws for unsupported template type', () => {
    expect(() => {
      pdfService.renderTemplatePreview('UNKNOWN', {});
    }).toThrow('Unsupported template type');
  });

  it('generates a pdf buffer and checksum', async () => {
    const result = await pdfService.generatePdf('SOW', {
      project_title: 'Cancer Trial Study',
      nonprofit_name: 'Care Foundation',
      researcher_name: 'Dr. Michael Smith',
      scope: 'Analyze trial data and publish findings',
      deliverables: 'Interim report, final report, data quality summary',
      timeline: '6 months',
      budget_terms: '$25,000 split into 3 milestones'
    });

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(typeof result.checksum).toBe('string');
    expect(result.checksum).toHaveLength(64);
    expect(result.preview).toContain('STATEMENT OF WORK');
  });
});
