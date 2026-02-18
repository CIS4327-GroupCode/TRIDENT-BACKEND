'use strict';

/**
 * Migration: Enhance matches table for scoring and caching
 * 
 * This migration modifies the matches table to store match scores and metadata:
 * - Changes score from STRING to DECIMAL for proper numerical storage
 * - Adds score_breakdown (JSONB) for detailed factor scores
 * - Adds dismissed flag for user preferences
 * - Adds calculated_at timestamp
 * - Adds performance indexes
 * 
 * Note: Simplified for Phase 1 - minimal storage, on-demand calculation
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Helper function to check if column exists
    const columnExists = async (tableName, columnName) => {
      const table = await queryInterface.describeTable(tableName);
      return table[columnName] !== undefined;
    };

    // Check current score column type
    const table = await queryInterface.describeTable('matches');
    const scoreColumn = table['score'];
    
    // Change score column from STRING to DECIMAL if needed
    if (scoreColumn && scoreColumn.type !== 'NUMERIC') {
      // Use raw SQL to handle the type conversion with USING clause
      await queryInterface.sequelize.query(`
        ALTER TABLE matches 
        ALTER COLUMN score TYPE NUMERIC(5,2) 
        USING CASE 
          WHEN score ~ '^[0-9]+(\\.[0-9]+)?$' THEN score::NUMERIC(5,2)
          ELSE NULL 
        END;
      `);

      await queryInterface.sequelize.query(`
        COMMENT ON COLUMN matches.score IS 'Match score from 0.00 to 100.00';
      `);
    }

    // Add score_breakdown for detailed scoring
    if (!(await columnExists('matches', 'score_breakdown'))) {
      await queryInterface.addColumn('matches', 'score_breakdown', {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Detailed scoring by factor (expertise, methods, budget, etc.)'
      });
    }

    // Add dismissed flag
    if (!(await columnExists('matches', 'dismissed'))) {
      await queryInterface.addColumn('matches', 'dismissed', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'User dismissed this match'
      });
    }

    // Add calculated_at timestamp
    if (!(await columnExists('matches', 'calculated_at'))) {
      await queryInterface.addColumn('matches', 'calculated_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.NOW,
        comment: 'When the match score was last calculated'
      });
    }

    // Create indexes for performance (wrapped in try-catch for idempotency)
    try {
      await queryInterface.addIndex('matches', ['brief_id'], {
        name: 'idx_matches_project_id',
        where: {
          dismissed: false
        }
      });
    } catch (error) {
      console.log('Note: idx_matches_project_id already exists');
    }

    try {
      await queryInterface.addIndex('matches', ['researcher_id'], {
        name: 'idx_matches_researcher_id',
        where: {
          dismissed: false
        }
      });
    } catch (error) {
      console.log('Note: idx_matches_researcher_id already exists');
    }

    try {
      await queryInterface.addIndex('matches', ['score'], {
        name: 'idx_matches_score',
        order: [['score', 'DESC']]
      });
    } catch (error) {
      console.log('Note: idx_matches_score already exists');
    }

    // Add unique constraint to prevent duplicate matches
    try {
      await queryInterface.addConstraint('matches', {
        fields: ['brief_id', 'researcher_id'],
        type: 'unique',
        name: 'unique_match_pair'
      });
    } catch (error) {
      console.log('Note: unique_match_pair constraint already exists');
    }

    console.log('✓ Matches table enhanced for scoring algorithm');
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes
    await queryInterface.removeIndex('matches', 'idx_matches_project_id');
    await queryInterface.removeIndex('matches', 'idx_matches_researcher_id');
    await queryInterface.removeIndex('matches', 'idx_matches_score');

    // Remove unique constraint
    try {
      await queryInterface.removeConstraint('matches', 'unique_match_pair');
    } catch (error) {
      // Constraint might not exist, continue
    }

    // Remove new columns
    await queryInterface.removeColumn('matches', 'calculated_at');
    await queryInterface.removeColumn('matches', 'dismissed');
    await queryInterface.removeColumn('matches', 'score_breakdown');

    // Revert score to STRING
    await queryInterface.changeColumn('matches', 'score', {
      type: Sequelize.STRING(255),
      allowNull: true
    });

    console.log('✓ Matches table reverted to original schema');
  }
};
