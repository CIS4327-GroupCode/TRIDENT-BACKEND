const Milestone = require('../../src/database/models/Milestone');

describe('Milestone model instance methods', () => {
  const buildMilestone = (overrides = {}) => Milestone.build({
    id: 1,
    project_id: 3,
    name: 'Milestone A',
    status: 'pending',
    due_date: null,
    ...overrides
  });

  test('toSafeObject returns plain object', () => {
    const milestone = buildMilestone();
    const safeObject = milestone.toSafeObject();

    expect(safeObject).toHaveProperty('name', 'Milestone A');
    expect(safeObject).toHaveProperty('project_id', 3);
  });

  test('isOverdue returns false for completed status', () => {
    const milestone = buildMilestone({
      status: 'completed',
      due_date: '2020-01-01'
    });

    expect(milestone.isOverdue()).toBe(false);
  });

  test('isOverdue returns false when no due date', () => {
    const milestone = buildMilestone({ due_date: null });
    expect(milestone.isOverdue()).toBe(false);
  });

  test('isOverdue returns true for past due date', () => {
    const milestone = buildMilestone({ due_date: '2020-01-01' });
    expect(milestone.isOverdue()).toBe(true);
  });

  test('daysUntilDue returns null when no due date', () => {
    const milestone = buildMilestone({ due_date: null });
    expect(milestone.daysUntilDue()).toBeNull();
  });

  test('daysUntilDue returns negative for past due date', () => {
    const milestone = buildMilestone({ due_date: '2020-01-01' });
    expect(milestone.daysUntilDue()).toBeLessThan(0);
  });

  test('daysUntilDue returns positive for future due date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const milestone = buildMilestone({ due_date: future.toISOString().slice(0, 10) });

    expect(milestone.daysUntilDue()).toBeGreaterThan(0);
  });

  test('getStatus returns completed when completed', () => {
    const milestone = buildMilestone({ status: 'completed' });
    expect(milestone.getStatus()).toBe('completed');
  });

  test('getStatus returns overdue when overdue', () => {
    const milestone = buildMilestone({ due_date: '2020-01-01' });
    expect(milestone.getStatus()).toBe('overdue');
  });

  test('getStatus returns raw status when not overdue', () => {
    const future = new Date();
    future.setDate(future.getDate() + 2);
    const milestone = buildMilestone({
      status: 'in_progress',
      due_date: future.toISOString().slice(0, 10)
    });

    expect(milestone.getStatus()).toBe('in_progress');
  });
});
