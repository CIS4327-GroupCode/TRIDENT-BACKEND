const { DataTypes, Model } = require('sequelize');
const sequelize = require('../index');

class Milestone extends Model {
  // Instance methods
  toSafeObject() {
    const { ...safeMilestone } = this.toJSON();
    return safeMilestone;
  }

  // Check if milestone is overdue
  isOverdue() {
    if (this.status === 'completed') return false;
    if (!this.due_date) return false;
    return new Date(this.due_date) < new Date();
  }

  // Calculate days until due
  daysUntilDue() {
    if (!this.due_date) return null;
    const now = new Date();
    const dueDate = new Date(this.due_date);
    const diffTime = dueDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  // Get status with overdue check
  getStatus() {
    if (this.status === 'completed') return 'completed';
    if (this.isOverdue()) return 'overdue';
    return this.status;
  }
}

Milestone.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'project_ideas',
        key: 'project_id'
      },
      onDelete: 'CASCADE',
      field: 'project_id'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'due_date'
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'in_progress', 'completed', 'cancelled']]
      }
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'Milestone',
    tableName: 'milestones',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = Milestone;
