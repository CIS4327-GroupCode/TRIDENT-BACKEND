const Notification = require('../../src/database/models/Notification');

describe('Notification model notification types', () => {
  const buildNotification = (overrides = {}) => Notification.build({
    user_id: 1,
    type: 'project_created',
    title: 'Test notification',
    message: 'Test message',
    ...overrides,
  });

  test('accepts project_application notifications emitted by application flows', async () => {
    const notification = buildNotification({
      type: 'project_application',
      metadata: { project_id: 10, application_id: 12 },
    });

    await expect(notification.validate()).resolves.toMatchObject({
      type: 'project_application',
      metadata: { project_id: 10, application_id: 12 },
    });
  });
});