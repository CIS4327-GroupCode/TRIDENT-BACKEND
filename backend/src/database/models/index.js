const User = require('./User');
const Organization = require('./Organization');
const Project = require('./Project');
const Application = require('./Application');
const ResearcherProfile = require('./ResearcherProfile');
const Match = require('./Match');
const Rating = require('./Rating');
const Milestone = require('./Milestone');
const Message = require('./Message');
const AuditLog = require('./AuditLog');
const UserPreferences = require('./UserPreferences');
const ProjectReview = require('./ProjectReview');
const AcademicHistory = require('./AcademicHistory');
const Certification = require('./Certification');
const sequelize = require('../index');

// User <-> ResearcherProfile (one-to-one)
User.hasOne(ResearcherProfile, { foreignKey: 'user_id', as: 'researcherProfile' });
ResearcherProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> UserPreferences (one-to-one)
User.hasOne(UserPreferences, { foreignKey: 'user_id', as: 'preferences' });
UserPreferences.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> Organization (for nonprofit users)
User.belongsTo(Organization, { foreignKey: 'org_id', as: 'organization' });
Organization.hasMany(User, { foreignKey: 'org_id', as: 'users' });

// Organization <-> Project
Organization.hasMany(Project, { foreignKey: 'org_id', as: 'projects' });
Project.belongsTo(Organization, { foreignKey: 'org_id', as: 'organization' });

// ResearcherProfile <-> Application
ResearcherProfile.hasMany(Application, { foreignKey: 'researcher_id', as: 'applications' });
Application.belongsTo(ResearcherProfile, { foreignKey: 'researcher_id', as: 'researcher' });

// Organization <-> Application
Organization.hasMany(Application, { foreignKey: 'org_id', as: 'applications' });
Application.belongsTo(Organization, { foreignKey: 'org_id', as: 'organization' });

// Project <-> Match
Project.hasMany(Match, { foreignKey: 'brief_id', as: 'matches' });
Match.belongsTo(Project, { foreignKey: 'brief_id', as: 'project' });

// ResearcherProfile <-> Match
ResearcherProfile.hasMany(Match, { foreignKey: 'researcher_id', as: 'matches' });
Match.belongsTo(ResearcherProfile, { foreignKey: 'researcher_id', as: 'researcher' });

// Project <-> Rating
Project.hasMany(Rating, { foreignKey: 'project_id', as: 'ratings' });
Rating.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Project <-> Milestone
Project.hasMany(Milestone, { foreignKey: 'project_id', as: 'milestones' });
Milestone.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// User <-> Message (sender)
User.hasMany(Message, { foreignKey: 'sender_id', as: 'sentMessages' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });

// User <-> Message (recipient)
User.hasMany(Message, { foreignKey: 'recipient_id', as: 'receivedMessages' });
Message.belongsTo(User, { foreignKey: 'recipient_id', as: 'recipient' });

// User <-> AuditLog
User.hasMany(AuditLog, { foreignKey: 'actor_id', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'actor_id', as: 'actor' });

// Project <-> ProjectReview
Project.hasMany(ProjectReview, { foreignKey: 'project_id', as: 'reviews' });
ProjectReview.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// User <-> ProjectReview (reviewer)
User.hasMany(ProjectReview, { foreignKey: 'reviewer_id', as: 'projectReviews' });
ProjectReview.belongsTo(User, { foreignKey: 'reviewer_id', as: 'reviewer' });

// User <-> AcademicHistory
User.hasMany(AcademicHistory, { foreignKey: 'user_id', as: 'academicHistory' });
AcademicHistory.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> Certification
User.hasMany(Certification, { foreignKey: 'user_id', as: 'certifications' });
Certification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  User,
  Organization,
  Project,
  Application,
  ResearcherProfile,
  Match,
  Rating,
  Milestone,
  Message,
  AuditLog,
  UserPreferences,
  ProjectReview,
  AcademicHistory,
  Certification,
  sequelize
};