'use strict';

module.exports = {
  async up(queryInterface) {
    // Drop old uniqueness: one rating per project per reviewer.
    try {
      await queryInterface.removeIndex('ratings', 'idx_ratings_project_reviewer_unique');
    } catch (_) {
      // Ignore when the index does not exist in the current environment.
    }

    // New uniqueness: one rating per project per reviewer per rated user.
    await queryInterface.addIndex('ratings', ['project_id', 'rated_by_user_id', 'rated_user_id'], {
      name: 'idx_ratings_project_reviewer_target_unique',
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('ratings', 'idx_ratings_project_reviewer_target_unique');

    await queryInterface.addIndex('ratings', ['project_id', 'rated_by_user_id'], {
      name: 'idx_ratings_project_reviewer_unique',
      unique: true,
      where: {
        rated_by_user_id: {
          [Sequelize.Op.ne]: null
        }
      }
    });
  }
};
