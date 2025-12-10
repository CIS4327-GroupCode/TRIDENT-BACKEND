# TRIDENT Match Portal - Backend

**Last Updated**: December 10, 2025  
**Version**: 0.2.0  
**Tech Stack**: Node.js 18+, Express 4.18, Sequelize 6.37, PostgreSQL 15+

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+ (or Neon cloud database)
- npm or yarn

### Installation

1. **Install dependencies:**
```bash
cd backend
npm install
```

2. **Set up environment variables:**
```bash
# Create .env file
cp .env.example .env
```

Edit `.env` with your configuration:
```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-min-32-chars
REFRESH_TOKEN_SECRET=your-refresh-secret
ACCESS_TOKEN_EXPIRES=15m
REFRESH_TOKEN_EXPIRES=7d
FRONTEND_URL=http://localhost:3000
```

3. **Run database migrations:**
```bash
npm run db:migrate
```

4. **Optional - Seed database:**
```bash
node seed-database.js
```

5. **Start development server:**
```bash
npm run dev
```

Server runs on `http://localhost:5000`

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js           # Sequelize configuration
│   ├── controllers/
│   │   ├── adminController.js    # Admin operations
│   │   ├── authController.js     # Authentication
│   │   ├── userController.js     # User management
│   │   ├── projectController.js  # Project CRUD
│   │   ├── milestoneController.js
│   │   ├── organizationController.js
│   │   └── researcherController.js
│   ├── database/
│   │   ├── index.js              # Sequelize instance
│   │   ├── migrations/           # Database migrations
│   │   └── models/               # Sequelize models
│   │       ├── User.js
│   │       ├── Organization.js
│   │       ├── ResearcherProfile.js
│   │       ├── Project.js
│   │       ├── Match.js
│   │       ├── Message.js
│   │       ├── Milestone.js
│   │       ├── Rating.js
│   │       ├── AuditLog.js
│   │       ├── Application.js
│   │       ├── ProjectReview.js
│   │       ├── UserPreferences.js
│   │       ├── AcademicHistory.js
│   │       └── Certification.js
│   ├── middleware/
│   │   └── auth.js               # JWT verification
│   ├── models/
│   │   └── authModel.js          # Auth business logic
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── adminRoutes.js
│   │   ├── projectRoutes.js
│   │   ├── milestoneRoutes.js
│   │   ├── organizationRoutes.js
│   │   ├── researcherRoutes.js
│   │   └── messagesRoutes.js
│   ├── utils/
│   │   └── encryption.js
│   ├── db.js                     # Database connection
│   ├── index.js                  # Express app entry
│   └── messages.js
├── tests/
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── mocks/                    # Test mocks
│   └── setup.js                  # Test configuration
├── .env                          # Environment variables (not in git)
├── package.json
└── README.md
```

---

---

## 🔌 API Endpoints

### Authentication (`/api/auth`)
- `POST /signup` - Create new user account
- `POST /login` - Authenticate user
- `POST /logout` - End user session
- `GET /me` - Get current user profile

### Users (`/api/users`)
- `GET /profile` - Get current user profile
- `PUT /profile` - Update user profile
- `DELETE /account` - Delete user account
- `PUT /password` - Change password
- `PUT /preferences` - Update notification preferences

### Projects (`/api/projects`)
- `GET /` - List all projects (with filters)
- `GET /:id` - Get project details
- `POST /` - Create new project (nonprofit only)
- `PUT /:id` - Update project
- `DELETE /:id` - Delete project
- `POST /:id/apply` - Apply to project (researcher only)

### Organizations (`/api/organizations`)
- `GET /me` - Get organization profile
- `PUT /me` - Update organization details

### Researchers (`/api/researchers`)
- `GET /me` - Get researcher profile
- `PUT /me` - Update researcher details

### Milestones (`/api/milestones`)
- `GET /project/:projectId` - Get project milestones
- `POST /` - Create milestone
- `PUT /:id` - Update milestone
- `DELETE /:id` - Delete milestone

### Messages (`/api/messages`)
- `GET /` - Get user conversations
- `GET /:conversationId` - Get messages
- `POST /` - Send new message

### Admin (`/api/admin`)
- `GET /dashboard/stats` - Platform statistics
- `GET /users` - List all users
- `GET /organizations` - List all organizations
- `GET /projects` - List all projects
- `PUT /users/:id/status` - Update user account status
- `DELETE /users/:id` - Delete user
- `DELETE /organizations/:id` - Delete organization
- `DELETE /projects/:id` - Delete project

---

## 🗄️ Database Schema

### Core Tables (14 total)

1. **_user** - User accounts
   - id, name, email, password_hash, role
   - account_status, mfa_enabled, org_id
   - created_at, updated_at, deleted_at

2. **organizations** - Nonprofit profiles
   - id, name, EIN, mission, type, location
   - website, focus_areas, budget_range, team_size
   - established_year, user_id

3. **researcher_profiles** - Researcher details
   - id, user_id, affiliation, domains, methods
   - tools, rate_min, rate_max, availability

4. **projects** - Collaboration projects
   - id, title, description, requirements
   - timeline, budget, status, org_id

5. **matches** - User-project matches
   - id, researcher_id, project_id, score, status

6. **messages** - Communication system
   - id, sender_id, receiver_id, content

7. **milestones** - Project tracking
   - id, project_id, title, status, due_date

8. **ratings** - Feedback system
   - id, rater_id, rated_id, score, feedback

9. **audit_logs** - Activity tracking
   - id, user_id, action, entity, timestamp

10. **user_preferences** - Notification settings

11. **applications** - Project applications

12. **project_reviews** - Project feedback

13. **academic_history** - Researcher education

14. **certifications** - Professional credentials

---

## 🛠️ Available Scripts

```bash
npm run dev              # Start with nodemon (auto-reload)
npm start                # Start production server
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
npm run db:migrate       # Run pending migrations
npm run db:migrate:undo  # Rollback last migration
npm run db:seed          # Seed database
npm run db:reset         # Reset and reseed database
```

---

## ✨ Key Features

### Security
- Password hashing with bcrypt (10 rounds)
- JWT tokens with configurable expiration
- CORS configured for frontend origin
- SQL injection prevention via Sequelize
- Input validation and sanitization
- Role-based route protection

### Database
- PostgreSQL with Sequelize ORM
- Migration system for schema changes
- Soft deletes for user data
- Timestamp tracking on all records
- Foreign key constraints
- JSONB for flexible data (focus_areas, tools, etc.)

### API Design
- RESTful conventions
- Consistent error responses
- Pagination support
- Filter and search capabilities
- Relationship loading (eager/lazy)

---

## 🧪 Testing

The backend includes a comprehensive test suite:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/auth.test.js

# Run with coverage
npm run test:coverage
```

Test coverage:
- Unit tests for models and controllers
- Integration tests for API endpoints
- Mock data for consistent testing
- Database transaction rollback for test isolation

See `tests/README.md` for detailed testing documentation.

---

## 🔍 Troubleshooting

### Database Connection Issues

**Error: `ECONNREFUSED`**
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Verify database exists

**Error: `SSL required`**
- Using Neon? Update `src/config/database.js` SSL settings:
  ```javascript
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
  ```

### Migration Issues

**Error: `column does not exist`**
```bash
# Run pending migrations
npm run db:migrate

# If issues persist, reset database (caution: data loss)
npm run db:reset
```

---

## 📚 Additional Documentation

- [API Reference](../docs/api/) - Detailed endpoint documentation
- [Database Schema](../docs/architecture/database-schema.md) - ER diagrams
- [Authentication Flow](../docs/architecture/auth-flow.md) - Login/signup process
- [Testing Guide](../docs/guides/testing.md) - Test suite overview

---

**Last Updated:** December 10, 2025  
**Maintainer:** TRIDENT Development Team

**Authentication Routes** (`/api/auth`)
- ✅ POST `/register` - User registration with profile creation
- ✅ POST `/login` - User authentication

**User Routes** (`/api/users`)
- ✅ GET `/me` - Get current user profile
- ✅ PUT `/me` - Update user profile
- ✅ PUT `/me/password` - Change password
- ✅ DELETE `/me` - Delete account (soft delete)

**Organization Routes** (`/api/organizations`)
- ✅ GET `/` - List all organizations (public)
- ✅ GET `/:id` - Get organization details
- ✅ GET `/me` - Get current org profile
- ✅ PUT `/me` - Update org profile

**Researcher Routes** (`/api/researchers`)
- ✅ GET `/me` - Get researcher profile
- ✅ PUT `/me` - Update researcher profile
- ✅ GET `/me/projects` - Get collaboration projects
- ✅ GET `/me/academic` - List academic history
- ✅ POST `/me/academic` - Add academic record
- ✅ PUT `/me/academic/:id` - Update academic record
- ✅ DELETE `/me/academic/:id` - Delete academic record
- ✅ GET `/me/certifications` - List certifications
- ✅ POST `/me/certifications` - Add certification
- ✅ PUT `/me/certifications/:id` - Update certification
- ✅ DELETE `/me/certifications/:id` - Delete certification

**Project Routes** (`/api/projects`)
- ✅ GET `/` - Browse projects (public)
- ✅ GET `/:id` - Get project details
- ✅ POST `/` - Create project (nonprofits only)
- ✅ PUT `/:id` - Update project
- ✅ DELETE `/:id` - Delete project

**Milestone Routes** (`/api/milestones`)
- ✅ GET `/project/:projectId` - Get project milestones
- ✅ POST `/` - Create milestone
- ✅ PUT `/:id` - Update milestone
- ✅ DELETE `/:id` - Delete milestone
- ✅ GET `/analytics/:projectId` - Get analytics

**Admin Routes** (`/api/admin`)
- ✅ GET `/stats` - System statistics
- ✅ GET `/users` - List all users
- ✅ GET `/organizations` - List all organizations
- ✅ GET `/projects` - List all projects
- ✅ PUT `/users/:id/suspend` - Suspend user
- ✅ PUT `/users/:id/activate` - Activate user
- ✅ DELETE `/users/:id` - Delete user
- ✅ DELETE `/organizations/:id` - Delete organization
- ✅ DELETE `/projects/:id` - Delete project

### Database Architecture ✅

**14 Tables Migrated:**
1. `_user` - User accounts with authentication
2. `organizations` - Nonprofit profiles
3. `researcher_profiles` - Researcher profiles
4. `project_ideas` - Project briefs
5. `milestones` - Project milestones
6. `agreements` - Collaboration agreements
7. `matches` - Project-researcher matches
8. `ratings` - Post-project reviews
9. `messages` - Messaging system
10. `audit_logs` - Admin action logging
11. `user_preferences` - User settings
12. `project_reviews` - Project feedback
13. `academic_history` - Researcher education
14. `certifications` - Researcher certifications

**18 Model Associations:**
- User ↔ ResearcherProfile (one-to-one)
- User ↔ UserPreferences (one-to-one)
- User → Organization (one-to-many)
- Organization → Project (one-to-many)
- Project → Milestone (one-to-many)
- ResearcherProfile → Application (one-to-many)
- Application → Organization (many-to-one)
- Plus 11 more associations

### Testing Infrastructure ✅

- **59 unit tests** with 100% pass rate
- Jest test framework configured
- Mock implementations for models and middleware
- Database-independent testing
- Coverage reporting enabled

### Security Features ✅

- Password hashing with bcrypt
- JWT token authentication
- Role-based access control middleware
- Input validation
- SQL injection prevention (Sequelize ORM)
- Account status validation
- Audit logging for admin actions

---

## 📋 Pending Features

### High Priority
- ⏳ Email verification system
- ⏳ Password reset flow
- ⏳ Real-time messaging (Socket.io)
- ⏳ Matching algorithm implementation
- ⏳ File upload for documents

### Medium Priority
- ⏳ Rate limiting for API endpoints
- ⏳ Multi-factor authentication (MFA)
- ⏳ Advanced search and filtering
- ⏳ Notification system
- ⏳ Analytics dashboard

### Low Priority
- ⏳ SSO integration (OAuth)
- ⏳ API versioning
- ⏳ GraphQL endpoint
- ⏳ Webhooks for integrations

---

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm test -- authController.test.js
```

### Run with Coverage
```bash
npm test -- --coverage
```

### Test Files
- `tests/unit/authController.test.js` - Authentication tests
- `tests/unit/userController.test.js` - User management tests
- `tests/unit/auth.middleware.test.js` - Middleware tests

See `tests/README.md` for detailed testing documentation.

---

## 📚 Additional Documentation

- **[../Documentation/ProjectStatus/IMPLEMENTATION_PROGRESS.md](../Documentation/ProjectStatus/IMPLEMENTATION_PROGRESS.md)** - Detailed progress tracker
- **[../Documentation/ProjectStatus/DATABASE_UML_SPECIFICATION.md](../Documentation/ProjectStatus/DATABASE_UML_SPECIFICATION.md)** - Complete database schema
- **[../Documentation/UC3_API_DOCUMENTATION.md](../Documentation/UC3_API_DOCUMENTATION.md)** - Project browsing API
- **[../Documentation/UC4_API_DOCUMENTATION.md](../Documentation/UC4_API_DOCUMENTATION.md)** - Milestone API
- **[../Documentation/UC6_API_DOCUMENTATION.md](../Documentation/UC6_API_DOCUMENTATION.md)** - Account settings API
- **[../Documentation/UC7_API_DOCUMENTATION.md](../Documentation/UC7_API_DOCUMENTATION.md)** - Project creation API

---

## 🔧 Utility Scripts

### Database Management
```bash
# Run migrations
npm run db:migrate

# Seed database with test data
node seed-database.js

# Check migration status
node check-migration.js

# Clear all data (development only)
node clear-data.js
```

### Development Tools
```bash
# Start with nodemon (auto-reload)
npm run dev

# Start production server
npm start

# Run linting
npm run lint
```

---

## 🚀 Deployment

Recommended: Deploy to Vercel with Neon PostgreSQL

See **[../Documentation/VERCEL_DEPLOYMENT_GUIDE.md](../Documentation/VERCEL_DEPLOYMENT_GUIDE.md)** for complete deployment instructions.
