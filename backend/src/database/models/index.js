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
const SavedProject = require('./SavedProject');
const AcademicHistory = require('./AcademicHistory');
const Certification = require('./Certification');
const Notification = require('./Notification');
const EmailVerification = require('./EmailVerification');
const PasswordReset = require('./PasswordReset');
const TwoFactorCode = require('./TwoFactorCode');
const Attachment = require('./Attachment');
const Contract = require('./Contract');
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

// Project <-> Application
Project.hasMany(Application, { foreignKey: 'project_id', as: 'applications' });
Application.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Project <-> Match
Project.hasMany(Match, { foreignKey: 'brief_id', as: 'matches' });
Match.belongsTo(Project, { foreignKey: 'brief_id', as: 'project' });

// ResearcherProfile <-> Match
ResearcherProfile.hasMany(Match, { foreignKey: 'researcher_id', as: 'matches' });
Match.belongsTo(ResearcherProfile, { foreignKey: 'researcher_id', as: 'researcher' });

// Project <-> Rating
Project.hasMany(Rating, { foreignKey: 'project_id', as: 'ratings' });
Rating.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// User <-> Rating (reviewer)
User.hasMany(Rating, { foreignKey: 'rated_by_user_id', as: 'givenRatings' });
Rating.belongsTo(User, { foreignKey: 'rated_by_user_id', as: 'reviewer' });

// User <-> Rating (reviewed user)
User.hasMany(Rating, { foreignKey: 'rated_user_id', as: 'receivedRatings' });
Rating.belongsTo(User, { foreignKey: 'rated_user_id', as: 'reviewedUser' });

// User <-> Rating (moderator)
User.hasMany(Rating, { foreignKey: 'moderated_by', as: 'moderatedRatings' });
Rating.belongsTo(User, { foreignKey: 'moderated_by', as: 'moderator' });

// Project <-> Milestone
Project.hasMany(Milestone, { foreignKey: 'project_id', as: 'milestones' });
Milestone.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
Milestone.belongsTo(Milestone, { foreignKey: 'depends_on', as: 'dependency' });
Milestone.hasMany(Milestone, { foreignKey: 'depends_on', as: 'dependents' });

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

// User <-> Notification
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> EmailVerification (one-to-one, used for signup verification)
User.hasOne(EmailVerification, { foreignKey: 'user_id', as: 'emailVerification' });
EmailVerification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> PasswordReset (one-to-one, used for password resets)
User.hasOne(PasswordReset, { foreignKey: 'user_id', as: 'passwordReset' });
PasswordReset.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> TwoFactorCode (one-to-many, used for 2FA verification)
User.hasMany(TwoFactorCode, { foreignKey: 'user_id', as: 'twoFactorCodes' });
TwoFactorCode.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> SavedProject
User.hasMany(SavedProject, { foreignKey: 'user_id', as: 'savedProjects' });
SavedProject.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Project <-> SavedProject
Project.hasMany(SavedProject, { foreignKey: 'project_id', as: 'savedEntries' });
SavedProject.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Project <-> Attachment
Project.hasMany(Attachment, { foreignKey: 'project_id', as: 'attachments' });
Attachment.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// User <-> Attachment (uploader)
User.hasMany(Attachment, { foreignKey: 'uploaded_by', as: 'uploadedAttachments' });
Attachment.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

// Application <-> Contract
Application.hasMany(Contract, { foreignKey: 'application_id', as: 'contracts' });
Contract.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });

// Project <-> Contract
Project.hasMany(Contract, { foreignKey: 'project_id', as: 'contracts' });
Contract.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// User <-> Contract (nonprofit signer)
User.hasMany(Contract, { foreignKey: 'nonprofit_user_id', as: 'nonprofitContracts' });
Contract.belongsTo(User, { foreignKey: 'nonprofit_user_id', as: 'nonprofitUser' });

// User <-> Contract (researcher signer)
User.hasMany(Contract, { foreignKey: 'researcher_user_id', as: 'researcherContracts' });
Contract.belongsTo(User, { foreignKey: 'researcher_user_id', as: 'researcherUser' });

// User <-> Contract (terminated by)
User.hasMany(Contract, { foreignKey: 'terminated_by', as: 'terminatedContracts' });
Contract.belongsTo(User, { foreignKey: 'terminated_by', as: 'terminator' });

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
  SavedProject,
  AcademicHistory,
  Certification,
  Notification,
  EmailVerification,
  PasswordReset,
  TwoFactorCode,
  Attachment,
  Contract,
  sequelize
};