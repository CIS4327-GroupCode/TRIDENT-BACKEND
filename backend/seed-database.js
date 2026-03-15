require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Sequelize } = require('sequelize');

// Initialize Sequelize connection
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

// Import models
const User = require('./src/database/models/User');
const Organization = require('./src/database/models/Organization');
const ResearcherProfile = require('./src/database/models/ResearcherProfile');
const Project = require('./src/database/models/Project');
const Milestone = require('./src/database/models/Milestone');
const UserPreferences = require('./src/database/models/UserPreferences');
const Application = require('./src/database/models/Application');
const AcademicHistory = require('./src/database/models/AcademicHistory');
const Certification = require('./src/database/models/Certification');
const Match = require('./src/database/models/Match');
const Message = require('./src/database/models/Message');
const Rating = require('./src/database/models/Rating');
const ProjectReview = require('./src/database/models/ProjectReview');
const SavedProject = require('./src/database/models/SavedProject');
const AuditLog = require('./src/database/models/AuditLog');
const Attachment = require('./src/database/models/Attachment');
const Notification = require('./src/database/models/Notification');

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...\n');

    // Check if data already exists
    const existingOrgs = await Organization.count();
    const seedingMode = existingOrgs > 0 ? 'UPDATE' : 'INITIAL';
    
    if (seedingMode === 'UPDATE') {
      console.log('⚠️  Database already contains data!');
      console.log(`Found ${existingOrgs} organizations.`);
      console.log('\n🔄 Running in UPDATE mode - Adding missing data only...\n');
    } else {
      console.log('🆕 Running in INITIAL mode - Creating all data...\n');
    }

    // Hash password once for all users
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    const shiftDays = (days) => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date;
    };

    // ==================== STEP 1: Create Organizations ====================
    console.log('📋 Step 1: Creating Organizations...');
    
    let organizations;
    if (seedingMode === 'UPDATE') {
      organizations = await Organization.findAll({ order: [['id', 'ASC']] });
      console.log(`✓ Found ${organizations.length} existing organizations\n`);
    } else {
      organizations = await Organization.bulkCreate([
      {
        name: 'Children\'s Health Foundation',
        EIN: '12-3456789',
        mission: 'Improving pediatric healthcare access in underserved communities',
        focus_tags: 'Healthcare, Children, Education',
        compliance_flags: 'HIPAA, FERPA',
        contacts: 'contact@childrenshealth.org'
      },
      {
        name: 'Environmental Action Alliance',
        EIN: '23-4567890',
        mission: 'Protecting local ecosystems and promoting sustainable practices',
        focus_tags: 'Environment, Sustainability, Conservation',
        compliance_flags: 'EPA',
        contacts: 'info@envaction.org'
      },
      {
        name: 'Community Education Initiative',
        EIN: '34-5678901',
        mission: 'Bridging the education gap through technology and mentorship',
        focus_tags: 'Education, Technology, Youth',
        compliance_flags: 'FERPA, COPPA',
        contacts: 'hello@comedu.org'
      },
      {
        name: 'Senior Wellness Coalition',
        EIN: '45-6789012',
        mission: 'Enhancing quality of life for senior citizens through health programs',
        focus_tags: 'Healthcare, Seniors, Community',
        compliance_flags: 'HIPAA',
        contacts: 'support@seniorwellness.org'
      },
      {
        name: 'Urban Housing Project',
        EIN: '56-7890123',
        mission: 'Providing affordable housing solutions for low-income families',
        focus_tags: 'Housing, Social Justice, Community',
        compliance_flags: 'HUD',
        contacts: 'info@urbanhousing.org'
      }
    ]);
      console.log(`✓ Created ${organizations.length} organizations\n`);
    }

    // ==================== STEP 2: Create Nonprofit Users ====================
    console.log('👥 Step 2: Creating Nonprofit Users...');
    
    let nonprofitUsers;
    if (seedingMode === 'UPDATE') {
      nonprofitUsers = await User.findAll({ where: { role: 'nonprofit' }, order: [['id', 'ASC']] });
      console.log(`✓ Found ${nonprofitUsers.length} existing nonprofit users\n`);
    } else {
      nonprofitUsers = await User.bulkCreate([
      {
        name: 'Sarah Johnson',
        email: 'sarah.j@childrenshealth.org',
        password_hash: hashedPassword,
        role: 'nonprofit',
        account_status: 'active'
      },
      {
        name: 'Michael Chen',
        email: 'michael.c@envaction.org',
        password_hash: hashedPassword,
        role: 'nonprofit',
        account_status: 'active'
      },
      {
        name: 'Emily Rodriguez',
        email: 'emily.r@comedu.org',
        password_hash: hashedPassword,
        role: 'nonprofit',
        account_status: 'active'
      },
      {
        name: 'David Thompson',
        email: 'david.t@seniorwellness.org',
        password_hash: hashedPassword,
        role: 'nonprofit',
        account_status: 'active'
      },
      {
        name: 'Jennifer Martinez',
        email: 'jennifer.m@urbanhousing.org',
        password_hash: hashedPassword,
        role: 'nonprofit',
        account_status: 'active'
      }
    ]);
      console.log(`✓ Created ${nonprofitUsers.length} nonprofit users\n`);
    }

    // ==================== Link Nonprofits to Organizations ====================
    if (seedingMode === 'INITIAL') {
      console.log('🔗 Step 2.5: Linking Nonprofit Users to Organizations...');
      
      for (let i = 0; i < nonprofitUsers.length; i++) {
        await nonprofitUsers[i].update({ org_id: organizations[i].id });
      }
      console.log(`✓ Linked ${nonprofitUsers.length} users to organizations\n`);
    }

    //==================== STEP 3: Create Researcher Users ====================
    console.log('👨‍🔬 Step 3: Creating Researcher User Accounts...');
    
    let researcherUsers;
    if (seedingMode === 'UPDATE') {
      researcherUsers = await User.findAll({ where: { role: 'researcher' }, order: [['id', 'ASC']] });
      console.log(`✓ Found ${researcherUsers.length} existing researcher users\n`);
    } else {
      researcherUsers = await User.bulkCreate([
      {
        name: 'Dr. Amanda Foster',
        email: 'amanda.foster@stanford.edu',
        password_hash: hashedPassword,
        role: 'researcher',
        account_status: 'active'
      },
      {
        name: 'Dr. James Liu',
        email: 'james.liu@mit.edu',
        password_hash: hashedPassword,
        role: 'researcher',
        account_status: 'active'
      },
      {
        name: 'Dr. Maria Santos',
        email: 'maria.santos@berkeley.edu',
        password_hash: hashedPassword,
        role: 'researcher',
        account_status: 'active'
      },
      {
        name: 'Dr. Robert Kim',
        email: 'robert.kim@jhu.edu',
        password_hash: hashedPassword,
        role: 'researcher',
        account_status: 'active'
      },
      {
        name: 'Dr. Lisa Anderson',
        email: 'lisa.anderson@columbia.edu',
        password_hash: hashedPassword,
        role: 'researcher',
        account_status: 'active'
      },
      {
        name: 'Dr. Kevin Patel',
        email: 'kevin.patel@harvard.edu',
        password_hash: hashedPassword,
        role: 'researcher',
        account_status: 'active'
      }
    ]);
      console.log(`✓ Created ${researcherUsers.length} researcher user accounts\n`);
    }

    // ==================== STEP 4: Create Researcher Profiles ====================
    console.log('🔬 Step 4: Creating Researcher Profiles...');
    
    let researchers;
    if (seedingMode === 'UPDATE') {
      researchers = await ResearcherProfile.findAll({ order: [['user_id', 'ASC']] });
      console.log(`✓ Found ${researchers.length} existing researcher profiles\n`);
    } else {
      researchers = await ResearcherProfile.bulkCreate([
      {
        user_id: researcherUsers[0].id,
        affiliation: 'Stanford University',
        expertise: 'Public Health, Epidemiology, Data Analysis',
        methods: 'Quantitative Research, Statistical Analysis, Survey Design',
        compliance_certifications: 'HIPAA, IRB Certified',
        availability_hours: 20,
        rate_min: 75,
        rate_max: 150
      },
      {
        user_id: researcherUsers[1].id,
        affiliation: 'MIT Environmental Lab',
        expertise: 'Environmental Science, GIS Mapping, Climate Change',
        methods: 'Field Research, Remote Sensing, Data Visualization',
        compliance_certifications: 'EPA Certified',
        availability_hours: 15,
        rate_min: 100,
        rate_max: 200
      },
      {
        user_id: researcherUsers[2].id,
        affiliation: 'UC Berkeley Education Dept',
        expertise: 'Educational Technology, Learning Analytics, Curriculum Design',
        methods: 'Qualitative Research, Mixed Methods, User Testing',
        compliance_certifications: 'FERPA, CITI Training',
        availability_hours: 25,
        rate_min: 60,
        rate_max: 120
      },
      {
        user_id: researcherUsers[3].id,
        affiliation: 'Johns Hopkins School of Nursing',
        expertise: 'Geriatric Care, Health Outcomes, Quality Improvement',
        methods: 'Clinical Trials, Observational Studies, Meta-Analysis',
        compliance_certifications: 'HIPAA, GCP Certified',
        availability_hours: 10,
        rate_min: 90,
        rate_max: 180
      },
      {
        user_id: researcherUsers[4].id,
        affiliation: 'Columbia University School of Social Work',
        expertise: 'Housing Policy, Social Determinants of Health, Community Development',
        methods: 'Case Studies, Ethnography, Community-Based Research',
        compliance_certifications: 'IRB, Human Subjects Research',
        availability_hours: 30,
        rate_min: 50,
        rate_max: 100
      },
      {
        user_id: researcherUsers[5].id,
        affiliation: 'Harvard T.H. Chan School of Public Health',
        expertise: 'Biostatistics, Machine Learning, Predictive Modeling',
        methods: 'Statistical Modeling, R/Python Programming, Database Management',
        compliance_certifications: 'HIPAA, Data Security Certified',
        availability_hours: 18,
        rate_min: 120,
        rate_max: 250
      }
    ]);
      console.log(`✓ Created ${researchers.length} researcher profiles\n`);
    }

    // ==================== STEP 5: Create Admin User ====================
    console.log('👑 Step 5: Creating Admin User...');
    
    let adminUser;
    if (seedingMode === 'UPDATE') {
      adminUser = await User.findOne({ where: { role: 'admin' } });
      if (!adminUser) {
        adminUser = await User.create({
          name: 'System Administrator',
          email: 'admin@trident.org',
          password_hash: hashedPassword,
          role: 'admin',
          account_status: 'active'
        });
        console.log(`✓ Created admin user\n`);
      } else {
        console.log(`✓ Found existing admin user\n`);
      }
    } else {
      adminUser = await User.create({
        name: 'System Administrator',
        email: 'admin@trident.org',
        password_hash: hashedPassword,
        role: 'admin',
        account_status: 'active'
      });
      console.log(`✓ Created admin user\n`);
    }

    // ==================== STEP 6: Create User Preferences ====================
    console.log('⚙️ Step 6: Creating User Preferences...');
    
    const allUsers = [...nonprofitUsers, ...researcherUsers, adminUser];
    let preferences;
    if (seedingMode === 'UPDATE') {
      preferences = await UserPreferences.findAll();
      console.log(`✓ Found ${preferences.length} existing user preferences\n`);
    } else {
      preferences = await UserPreferences.bulkCreate(
        allUsers.map(user => ({
        user_id: user.id,
        email_new_matches: true,
        email_messages: true,
        email_milestones: true,
        email_project_updates: true,
        email_weekly_digest: true,
        email_applications: true,
        email_agreements: true,
        inapp_new_matches: true,
        inapp_messages: true,
        inapp_milestones: true,
        inapp_project_updates: true
      }))
    );
      console.log(`✓ Created ${preferences.length} user preference records\n`);
    }

    // ==================== STEP 7: Create Projects ====================
    console.log('📊 Step 7: Creating Projects...');
    
    let projects;
    if (seedingMode === 'UPDATE') {
      projects = await Project.findAll({ order: [['project_id', 'ASC']] });
      console.log(`✓ Found ${projects.length} existing projects\n`);
    } else {
      projects = await Project.bulkCreate([
      // Children's Health Foundation Projects
      {
        title: 'Childhood Asthma Intervention Study',
        problem: 'High rates of asthma in urban children due to air quality and lack of proper management',
        outcomes: 'Reduce asthma-related hospitalizations by 30% through education and monitoring program',
        methods_required: 'Quantitative Research, Statistical Analysis, Survey Design',
        timeline: '6 months',
        budget_min: 15000,
        data_sensitivity: 'High',
        status: 'open',
        org_id: organizations[0].id
      },
      {
        title: 'Pediatric Nutrition Database Development',
        problem: 'Need comprehensive database of nutritional interventions for underweight children',
        outcomes: 'Create searchable database of evidence-based nutrition programs',
        methods_required: 'Database Management, Literature Review, Data Visualization',
        timeline: '4 months',
        budget_min: 8000,
        data_sensitivity: 'Medium',
        status: 'open',
        org_id: organizations[0].id
      },
      {
        title: 'Mental Health Screening Tool Validation',
        problem: 'Current screening tools not culturally appropriate for diverse communities',
        outcomes: 'Validate and adapt screening tool for multi-cultural pediatric population',
        methods_required: 'Qualitative Research, Survey Design, Statistical Analysis',
        timeline: '8 months',
        budget_min: 20000,
        data_sensitivity: 'High',
        status: 'draft',
        org_id: organizations[0].id
      },
      
      // Environmental Action Alliance Projects
      {
        title: 'Urban Green Space Impact Assessment',
        problem: 'Unknown impact of new park developments on local biodiversity and air quality',
        outcomes: 'Measure environmental and community health benefits of urban green spaces',
        methods_required: 'Field Research, GIS Mapping, Statistical Analysis',
        timeline: '12 months',
        budget_min: 25000,
        data_sensitivity: 'Low',
        status: 'open',
        org_id: organizations[1].id
      },
      {
        title: 'Community Composting Behavior Study',
        problem: 'Low adoption rates of composting despite free bin distribution',
        outcomes: 'Identify barriers and motivators for composting adoption',
        methods_required: 'Survey Design, Qualitative Research, Data Analysis',
        timeline: '3 months',
        budget_min: 5000,
        data_sensitivity: 'Low',
        status: 'in_progress',
        org_id: organizations[1].id
      },
      
      // Community Education Initiative Projects
      {
        title: 'Digital Literacy Program Evaluation',
        problem: 'Need to assess effectiveness of coding bootcamp for underserved youth',
        outcomes: 'Evaluate learning outcomes and long-term skill retention',
        methods_required: 'Mixed Methods, User Testing, Statistical Analysis',
        timeline: '5 months',
        budget_min: 12000,
        data_sensitivity: 'Medium',
        status: 'open',
        org_id: organizations[2].id
      },
      {
        title: 'Virtual Tutoring Platform Optimization',
        problem: 'High dropout rates in online tutoring program',
        outcomes: 'Identify UX improvements to increase student engagement and completion',
        methods_required: 'User Testing, Data Visualization, A/B Testing',
        timeline: '4 months',
        budget_min: 10000,
        data_sensitivity: 'Medium',
        status: 'open',
        org_id: organizations[2].id
      },
      
      // Senior Wellness Coalition Projects
      {
        title: 'Fall Prevention Intervention Trial',
        problem: 'High rates of falls among seniors living independently',
        outcomes: 'Test effectiveness of balance training program on fall prevention',
        methods_required: 'Clinical Trials, Statistical Analysis, Observational Studies',
        timeline: '10 months',
        budget_min: 30000,
        data_sensitivity: 'High',
        status: 'open',
        org_id: organizations[3].id
      },
      {
        title: 'Social Isolation Measurement Tool',
        problem: 'Lack of validated tool to measure social isolation in elderly',
        outcomes: 'Develop and validate assessment tool for social connectedness',
        methods_required: 'Survey Design, Statistical Analysis, Psychometrics',
        timeline: '6 months',
        budget_min: 18000,
        data_sensitivity: 'Medium',
        status: 'draft',
        org_id: organizations[3].id
      },
      
      // Urban Housing Project
      {
        title: 'Housing Stability Outcomes Research',
        problem: 'Need evidence of how stable housing affects family health and education',
        outcomes: 'Document long-term outcomes for families receiving housing assistance',
        methods_required: 'Case Studies, Ethnography, Longitudinal Analysis',
        timeline: '18 months',
        budget_min: 35000,
        data_sensitivity: 'High',
        status: 'open',
        org_id: organizations[4].id
      },
      {
        title: 'Affordable Housing Needs Assessment',
        problem: 'Outdated data on housing needs in rapidly growing neighborhoods',
        outcomes: 'Comprehensive assessment of affordable housing demand and gaps',
        methods_required: 'Survey Design, GIS Mapping, Statistical Analysis',
        timeline: '5 months',
        budget_min: 15000,
        data_sensitivity: 'Low',
        status: 'completed',
        org_id: organizations[4].id
      }
    ]);
      console.log(`✓ Created ${projects.length} projects\n`);
    }

    // Ensure all project statuses are represented for in-browser testing.
    const existingProjectStatuses = new Set(projects.map((project) => project.status));
    const requiredStatusProjects = [
      {
        title: 'Pediatric Care Data Governance Review',
        problem: 'Need governance model for handling pediatric cross-organization datasets',
        outcomes: 'Deliver governance recommendations and approval checklist',
        methods_required: 'Policy Analysis, Qualitative Research, Stakeholder Interviews',
        timeline: '2 months',
        budget_min: 6000,
        budget_max: 9000,
        data_sensitivity: 'High',
        status: 'pending_review',
        org_id: organizations[0].id
      },
      {
        title: 'Community Air Sensor Recalibration Pilot',
        problem: 'Prior calibration design lacked statistical confidence intervals and QA plan',
        outcomes: 'Create a corrected pilot protocol with QA gates',
        methods_required: 'Statistical Analysis, Experimental Design, Field Validation',
        timeline: '3 months',
        budget_min: 7000,
        budget_max: 11000,
        data_sensitivity: 'Low',
        status: 'needs_revision',
        org_id: organizations[1].id
      },
      {
        title: 'Youth Engagement Survey Redesign',
        problem: 'Original survey design produced low completion and biased responses',
        outcomes: 'Produce revised instrument and response quality diagnostics',
        methods_required: 'Survey Design, Psychometrics, Qualitative Research',
        timeline: '2 months',
        budget_min: 5000,
        budget_max: 8000,
        data_sensitivity: 'Medium',
        status: 'rejected',
        org_id: organizations[2].id
      },
      {
        title: 'Senior Outreach Program Feasibility Study',
        problem: 'Program paused due to budget reallocation and staffing constraints',
        outcomes: 'Document feasibility and go/no-go criteria for next cycle',
        methods_required: 'Feasibility Analysis, Budget Modeling, Program Evaluation',
        timeline: '3 months',
        budget_min: 4000,
        budget_max: 7500,
        data_sensitivity: 'Low',
        status: 'cancelled',
        org_id: organizations[3].id
      },
      {
        title: 'Affordable Transit and Housing Correlation Study',
        problem: 'Need validated analysis linking transit access and housing retention',
        outcomes: 'Deliver approved study package and baseline dashboard',
        methods_required: 'GIS Mapping, Longitudinal Analysis, Statistical Modeling',
        timeline: '6 months',
        budget_min: 14000,
        budget_max: 20000,
        data_sensitivity: 'Medium',
        status: 'approved',
        org_id: organizations[4].id
      }
    ];

    const missingStatusProjects = requiredStatusProjects.filter(
      (projectSeed) => !existingProjectStatuses.has(projectSeed.status)
    );

    if (missingStatusProjects.length > 0) {
      const createdStatusProjects = await Project.bulkCreate(missingStatusProjects);
      projects = [...projects, ...createdStatusProjects];
      console.log(`✓ Added ${createdStatusProjects.length} status-coverage projects\n`);
    }

    // ==================== STEP 8: Create Milestones ====================
    console.log('🎯 Step 8: Creating Milestones...');
    
    let milestones;
    if (seedingMode === 'UPDATE') {
      milestones = await Milestone.findAll();
      console.log(`✓ Found ${milestones.length} existing milestones\n`);
    } else {
      const today = new Date();
    const futureDate = (days) => {
      const date = new Date(today);
      date.setDate(date.getDate() + days);
      return date.toISOString().split('T')[0];
    };
    const pastDate = (days) => {
      const date = new Date(today);
      date.setDate(date.getDate() - days);
      return date.toISOString().split('T')[0];
    };

      milestones = await Milestone.bulkCreate([
      // Project 1: Childhood Asthma Study (open)
      {
        project_id: projects[0].project_id,
        name: 'IRB Approval Submission',
        due_date: futureDate(14),
        status: 'pending'
      },
      {
        project_id: projects[0].project_id,
        name: 'Recruit Study Participants',
        description: 'Recruit 200 children aged 5-12 with asthma diagnosis',
        due_date: futureDate(60),
        status: 'pending'
      },
      {
        project_id: projects[0].project_id,
        name: 'Baseline Data Collection',
        description: 'Complete baseline surveys and health assessments',
        due_date: futureDate(90),
        status: 'pending'
      },
      
      // Project 2: Pediatric Nutrition Database (open)
      {
        project_id: projects[1].project_id,
        name: 'Literature Review Complete',
        description: 'Systematic review of peer-reviewed nutrition interventions',
        due_date: futureDate(30),
        status: 'in_progress'
      },
      {
        project_id: projects[1].project_id,
        name: 'Database Schema Design',
        description: 'Finalize database structure and fields',
        due_date: futureDate(45),
        status: 'pending'
      },
      
      // Project 4: Urban Green Space (open)
      {
        project_id: projects[3].project_id,
        name: 'Site Selection and Baseline Assessment',
        description: 'Select 10 urban parks for study and conduct initial surveys',
        due_date: futureDate(21),
        status: 'in_progress'
      },
      {
        project_id: projects[3].project_id,
        name: 'Install Air Quality Monitors',
        description: 'Deploy monitoring equipment at all sites',
        due_date: futureDate(45),
        status: 'pending'
      },
      {
        project_id: projects[3].project_id,
        name: 'Biodiversity Survey Round 1',
        description: 'Complete first round of species counts and habitat assessment',
        due_date: futureDate(90),
        status: 'pending'
      },
      
      // Project 5: Community Composting (in_progress)
      {
        project_id: projects[4].project_id,
        name: 'Survey Design and Testing',
        description: 'Develop and pilot test community survey instrument',
        due_date: pastDate(10),
        status: 'completed',
        completed_at: new Date(pastDate(12))
      },
      {
        project_id: projects[4].project_id,
        name: 'Community Survey Distribution',
        description: 'Distribute surveys to 500 households',
        due_date: pastDate(2),
        status: 'completed',
        completed_at: new Date(pastDate(5))
      },
      {
        project_id: projects[4].project_id,
        name: 'Data Analysis',
        description: 'Analyze survey responses and identify key themes',
        due_date: futureDate(15),
        status: 'in_progress'
      },
      {
        project_id: projects[4].project_id,
        name: 'Final Report Delivery',
        description: 'Complete final report with recommendations',
        due_date: futureDate(30),
        status: 'pending'
      },
      
      // Project 6: Digital Literacy Evaluation (open)
      {
        project_id: projects[5].project_id,
        name: 'Evaluation Framework Design',
        description: 'Design comprehensive evaluation methodology',
        due_date: futureDate(20),
        status: 'pending'
      },
      {
        project_id: projects[5].project_id,
        name: 'Pre-Program Assessments',
        description: 'Conduct baseline skills assessments for all participants',
        due_date: futureDate(40),
        status: 'pending'
      },
      
      // Project 8: Fall Prevention Trial (open)
      {
        project_id: projects[7].project_id,
        name: 'Protocol Development',
        description: 'Develop detailed trial protocol and safety procedures',
        due_date: futureDate(25),
        status: 'in_progress'
      },
      {
        project_id: projects[7].project_id,
        name: 'Recruit Senior Participants',
        description: 'Enroll 150 seniors aged 65+ into study',
        due_date: futureDate(60),
        status: 'pending'
      },
      {
        project_id: projects[7].project_id,
        name: 'Baseline Balance Testing',
        description: 'Complete initial balance and mobility assessments',
        due_date: futureDate(75),
        status: 'pending'
      },
      
      // Project 10: Housing Stability Research (open)
      {
        project_id: projects[9].project_id,
        name: 'Identify Case Study Families',
        description: 'Select 30 families for longitudinal case studies',
        due_date: futureDate(30),
        status: 'pending'
      },
      {
        project_id: projects[9].project_id,
        name: 'Initial Interviews',
        description: 'Conduct baseline interviews with all families',
        due_date: futureDate(90),
        status: 'pending'
      },
      
      // Project 11: Housing Needs Assessment (completed)
      {
        project_id: projects[10].project_id,
        name: 'Survey Design',
        description: 'Design comprehensive housing needs survey',
        due_date: pastDate(120),
        status: 'completed',
        completed_at: new Date(pastDate(125))
      },
      {
        project_id: projects[10].project_id,
        name: 'Data Collection',
        description: 'Collect survey data from 1000 households',
        due_date: pastDate(60),
        status: 'completed',
        completed_at: new Date(pastDate(65))
      },
      {
        project_id: projects[10].project_id,
        name: 'Analysis and Report',
        description: 'Complete analysis and deliver final report',
        due_date: pastDate(10),
        status: 'completed',
        completed_at: new Date(pastDate(12))
      }
    ]);
      console.log(`✓ Created ${milestones.length} milestones\n`);

      // Dependency chain for UC4 manual testing (A -> B -> C)
      const irb = milestones.find(
        (milestone) =>
          milestone.project_id === projects[0].project_id && milestone.name === 'IRB Approval Submission'
      );
      const recruit = milestones.find(
        (milestone) =>
          milestone.project_id === projects[0].project_id && milestone.name === 'Recruit Study Participants'
      );
      const baseline = milestones.find(
        (milestone) =>
          milestone.project_id === projects[0].project_id && milestone.name === 'Baseline Data Collection'
      );

      if (irb && recruit && baseline) {
        await recruit.update({ depends_on: irb.id });
        await baseline.update({ depends_on: recruit.id });
      }
    }

    // ==================== STEP 9: Create Academic History ====================
    console.log('🎓 Step 9: Creating Academic History Records...');
    
    const existingAcademicHistory = await AcademicHistory.count();
    let academicHistory = [];
    
    if (existingAcademicHistory === 0 && researcherUsers.length >= 6) {
      academicHistory = await AcademicHistory.bulkCreate([
        // Dr. Amanda Foster - Stanford
        {
          user_id: researcherUsers[0].id,
          degree: 'PhD',
          field: 'Public Health',
          institution: 'Stanford University',
          year: 2018
        },
        {
          user_id: researcherUsers[0].id,
          degree: 'MPH',
          field: 'Epidemiology',
          institution: 'Johns Hopkins University',
          year: 2013
        },
        {
          user_id: researcherUsers[0].id,
          degree: 'BS',
          field: 'Biology',
          institution: 'UC Berkeley',
          year: 2011
        },
        
        // Dr. James Liu - MIT
        {
          user_id: researcherUsers[1].id,
          degree: 'PhD',
          field: 'Environmental Science',
          institution: 'MIT',
          year: 2016
        },
        {
          user_id: researcherUsers[1].id,
          degree: 'MS',
          field: 'Atmospheric Science',
          institution: 'University of Washington',
          year: 2012
        },
        
        // Dr. Maria Santos - Berkeley
        {
          user_id: researcherUsers[2].id,
          degree: 'PhD',
          field: 'Education',
          institution: 'UC Berkeley',
          year: 2019
        },
        {
          user_id: researcherUsers[2].id,
          degree: 'MA',
          field: 'Educational Technology',
          institution: 'Stanford University',
          year: 2014
        },
        
        // Dr. Robert Kim - JHU
        {
          user_id: researcherUsers[3].id,
          degree: 'PhD',
          field: 'Nursing Science',
          institution: 'Johns Hopkins University',
          year: 2017
        },
        {
          user_id: researcherUsers[3].id,
          degree: 'MSN',
          field: 'Geriatric Nursing',
          institution: 'University of Pennsylvania',
          year: 2013
        },
        
        // Dr. Lisa Anderson - Columbia
        {
          user_id: researcherUsers[4].id,
          degree: 'PhD',
          field: 'Social Work',
          institution: 'Columbia University',
          year: 2020
        },
        {
          user_id: researcherUsers[4].id,
          degree: 'MSW',
          field: 'Community Practice',
          institution: 'University of Michigan',
          year: 2015
        },
        
        // Dr. Kevin Patel - Harvard
        {
          user_id: researcherUsers[5].id,
          degree: 'PhD',
          field: 'Biostatistics',
          institution: 'Harvard University',
          year: 2015
        },
        {
          user_id: researcherUsers[5].id,
          degree: 'MS',
          field: 'Statistics',
          institution: 'Carnegie Mellon University',
          year: 2011
        }
      ]);
      console.log(`✓ Created ${academicHistory.length} academic history records\n`);
    } else {
      console.log(`✓ Skipped - ${existingAcademicHistory} academic history records already exist\n`);
    }

    // ==================== STEP 10: Create Certifications ====================
    console.log('📜 Step 10: Creating Certification Records...');
    
    const existingCertifications = await Certification.count();
    let certifications = [];
    
    if (existingCertifications === 0 && researcherUsers.length >= 6) {
      certifications = await Certification.bulkCreate([
        // Dr. Amanda Foster certifications
        {
          user_id: researcherUsers[0].id,
          name: 'HIPAA Compliance Certification',
          issuer: 'HHS Office for Civil Rights',
          issue_date: '2023-01-15',
          expiry_date: '2025-01-15'
        },
        {
          user_id: researcherUsers[0].id,
          name: 'IRB Protocol Review Certification',
          issuer: 'CITI Program',
          issue_date: '2022-06-20',
          expiry_date: '2025-06-20'
        },
        
        // Dr. James Liu certifications
        {
          user_id: researcherUsers[1].id,
          name: 'EPA Environmental Compliance',
          issuer: 'Environmental Protection Agency',
          issue_date: '2023-03-10',
          expiry_date: null
        },
        {
          user_id: researcherUsers[1].id,
          name: 'GIS Professional Certification',
          issuer: 'GISCI',
          issue_date: '2021-09-05',
          expiry_date: '2024-09-05'
        },
        
        // Dr. Maria Santos certifications
        {
          user_id: researcherUsers[2].id,
          name: 'FERPA Training Certificate',
          issuer: 'US Department of Education',
          issue_date: '2023-08-01',
          expiry_date: '2026-08-01'
        },
        {
          user_id: researcherUsers[2].id,
          name: 'CITI Human Subjects Research',
          issuer: 'CITI Program',
          issue_date: '2022-11-15',
          expiry_date: '2025-11-15'
        },
        
        // Dr. Robert Kim certifications
        {
          user_id: researcherUsers[3].id,
          name: 'Good Clinical Practice (GCP)',
          issuer: 'NIH',
          issue_date: '2023-02-20',
          expiry_date: '2026-02-20'
        },
        {
          user_id: researcherUsers[3].id,
          name: 'HIPAA Privacy & Security',
          issuer: 'Johns Hopkins University',
          issue_date: '2023-05-10',
          expiry_date: '2024-05-10'
        },
        
        // Dr. Lisa Anderson certifications
        {
          user_id: researcherUsers[4].id,
          name: 'IRB Human Subjects Protection',
          issuer: 'Columbia University',
          issue_date: '2023-01-25',
          expiry_date: '2026-01-25'
        },
        {
          user_id: researcherUsers[4].id,
          name: 'Community-Based Participatory Research',
          issuer: 'Prevention Research Center',
          issue_date: '2022-07-30',
          expiry_date: null
        },
        
        // Dr. Kevin Patel certifications
        {
          user_id: researcherUsers[5].id,
          name: 'Data Security & Privacy Certification',
          issuer: 'Harvard University',
          issue_date: '2023-04-12',
          expiry_date: '2025-04-12'
        },
        {
          user_id: researcherUsers[5].id,
          name: 'HIPAA Security Rule Compliance',
          issuer: 'HHS',
          issue_date: '2022-12-01',
          expiry_date: '2024-12-01'
        }
      ]);
      console.log(`✓ Created ${certifications.length} certification records\n`);
    } else {
      console.log(`✓ Skipped - ${existingCertifications} certifications already exist\n`);
    }

    // ==================== STEP 11: Create Applications (Collaboration Agreements) ====================
    console.log('📝 Step 11: Creating Application/Agreement Records...');
    
    const existingApplications = await Application.count();
    let applications = [];
    
    if (existingApplications === 0 && researchers.length >= 6 && organizations.length >= 5) {
      applications = await Application.bulkCreate([
        // Dr. Amanda Foster collaborations
        {
          status: 'accepted',
          type: 'Data Use Agreement',
          value: 'Access to de-identified patient health records for asthma study',
          budget_info: '$15,000 - 6 month research contract',
          audit_trail: JSON.stringify([{
            date: new Date('2024-11-15'),
            action: 'Agreement created',
            user: 'sarah.j@childrenshealth.org'
          }]),
          org_id: organizations[0].id,
          project_id: projects[0].project_id,
          researcher_id: researchers[0].user_id
        },
        {
          status: 'accepted',
          type: 'completed',
          value: 'Mental health screening tool validation for pediatric patients',
          budget_info: '$8,000 - Project completed December 2024',
          audit_trail: JSON.stringify([
            { date: new Date('2024-06-01'), action: 'Agreement signed' },
            { date: new Date('2024-12-01'), action: 'Project completed' }
          ]),
          org_id: organizations[0].id,
          project_id: projects[2].project_id,
          researcher_id: researchers[0].user_id
        },
        
        // Dr. James Liu collaborations
        {
          status: 'pending',
          type: 'Research Collaboration Agreement',
          value: 'Environmental impact assessment of urban parks',
          budget_info: '$25,000 - 12 month study',
          audit_trail: JSON.stringify([{
            date: new Date('2024-10-20'),
            action: 'Agreement initiated',
            user: 'michael.c@envaction.org'
          }]),
          org_id: organizations[1].id,
          project_id: projects[3].project_id,
          researcher_id: researchers[1].user_id
        },
        
        // Dr. Maria Santos collaborations
        {
          status: 'pending',
          type: 'Service Agreement',
          value: 'Digital literacy program evaluation and improvement recommendations',
          budget_info: '$12,000 - 5 month evaluation',
          audit_trail: JSON.stringify([{
            date: new Date('2024-11-01'),
            action: 'Contract signed',
            user: 'emily.r@comedu.org'
          }]),
          org_id: organizations[2].id,
          project_id: projects[5].project_id,
          researcher_id: researchers[2].user_id
        },
        {
          status: 'accepted',
          type: 'completed',
          value: 'Online tutoring platform UX audit',
          budget_info: '$6,500 - Completed November 2024',
          audit_trail: JSON.stringify([
            { date: new Date('2024-07-15'), action: 'Project started' },
            { date: new Date('2024-11-01'), action: 'Final report delivered' }
          ]),
          org_id: organizations[2].id,
          project_id: projects[6].project_id,
          researcher_id: researchers[2].user_id
        },
        
        // Dr. Robert Kim collaborations
        {
          status: 'pending',
          type: 'Clinical Research Agreement',
          value: 'Fall prevention intervention trial design and implementation',
          budget_info: '$30,000 - 10 month clinical trial',
          audit_trail: JSON.stringify([{
            date: new Date('2024-11-10'),
            action: 'IRB approved protocol',
            user: 'david.t@seniorwellness.org'
          }]),
          org_id: organizations[3].id,
          project_id: projects[7].project_id,
          researcher_id: researchers[3].user_id
        },
        
        // Dr. Lisa Anderson collaborations
        {
          status: 'pending',
          type: 'Research Partnership',
          value: 'Housing stability outcomes longitudinal study',
          budget_info: '$35,000 - 18 month case study research',
          audit_trail: JSON.stringify([{
            date: new Date('2024-09-15'),
            action: 'Partnership established',
            user: 'jennifer.m@urbanhousing.org'
          }]),
          org_id: organizations[4].id,
          project_id: projects[9].project_id,
          researcher_id: researchers[4].user_id
        },
        {
          status: 'accepted',
          type: 'completed',
          value: 'Affordable housing needs assessment survey',
          budget_info: '$15,000 - Completed October 2024',
          audit_trail: JSON.stringify([
            { date: new Date('2024-04-01'), action: 'Survey launched' },
            { date: new Date('2024-10-15'), action: 'Final report submitted' }
          ]),
          org_id: organizations[4].id,
          project_id: projects[10].project_id,
          researcher_id: researchers[4].user_id
        },
        
        // Dr. Kevin Patel collaborations
        {
          status: 'rejected',
          type: 'Data Analysis Agreement',
          value: 'Statistical modeling for community composting behavior study',
          budget_info: '$8,000 - 3 month data analysis',
          audit_trail: JSON.stringify([{
            date: new Date('2024-11-25'),
            action: 'Agreement signed',
            user: 'michael.c@envaction.org'
          }]),
          org_id: organizations[1].id,
          project_id: projects[4].project_id,
          researcher_id: researchers[5].user_id
        }
      ]);
      console.log(`✓ Created ${applications.length} application/agreement records\n`);
    } else {
      console.log(`✓ Skipped - ${existingApplications} applications already exist\n`);
    }

    // ==================== STEP 12: Create Matches ====================
    console.log('🤝 Step 12: Creating Match Records...');

    let matches;
    const existingMatches = await Match.count();
    if (existingMatches === 0 && researchers.length > 0 && projects.length > 0) {
      const candidateProjects = projects.filter((project) => ['open', 'in_progress'].includes(project.status));
      const matchPayload = [];

      candidateProjects.forEach((project, projectIndex) => {
        researchers.forEach((researcher, researcherIndex) => {
          if ((projectIndex + researcherIndex) % 2 === 0) {
            const expertiseScore = 70 + ((projectIndex + researcherIndex) % 25);
            const methodsScore = 65 + ((projectIndex * 3 + researcherIndex) % 30);
            const budgetScore = 55 + ((projectIndex * 7 + researcherIndex * 5) % 35);
            const availabilityScore = 60 + ((projectIndex * 5 + researcherIndex * 2) % 35);
            const experienceScore = 58 + ((projectIndex + researcherIndex * 4) % 38);
            const domainScore = 62 + ((projectIndex * 2 + researcherIndex * 6) % 33);

            const score = (
              expertiseScore * 0.3 +
              methodsScore * 0.25 +
              budgetScore * 0.15 +
              availabilityScore * 0.1 +
              experienceScore * 0.1 +
              domainScore * 0.1
            ).toFixed(2);

            matchPayload.push({
              brief_id: project.project_id,
              researcher_id: researcher.user_id,
              score,
              score_breakdown: {
                expertise: expertiseScore,
                methods: methodsScore,
                budget: budgetScore,
                availability: availabilityScore,
                experience: experienceScore,
                domain: domainScore
              },
              reason_codes: 'expertise_high,methods_match,budget_fit',
              dismissed: matchPayload.length % 9 === 0,
              calculated_at: shiftDays(-((projectIndex + researcherIndex) % 7))
            });
          }
        });
      });

      matches = await Match.bulkCreate(matchPayload);
      console.log(`✓ Created ${matches.length} match records\n`);
    } else {
      matches = await Match.findAll();
      console.log(`✓ Found ${matches.length} existing match records\n`);
    }

    // ==================== STEP 13: Create Project Reviews ====================
    console.log('🧾 Step 13: Creating Project Review Records...');

    let projectReviews;
    const existingProjectReviews = await ProjectReview.count();
    if (existingProjectReviews === 0 && adminUser && projects.length > 0) {
      const pendingProject = projects.find((project) => project.status === 'pending_review');
      const rejectedProject = projects.find((project) => project.status === 'rejected');
      const needsRevisionProject = projects.find((project) => project.status === 'needs_revision');
      const approvedProject = projects.find((project) => project.status === 'approved') || projects.find((project) => project.status === 'open');

      const reviewPayload = [];

      if (pendingProject) {
        reviewPayload.push({
          project_id: pendingProject.project_id,
          reviewer_id: adminUser.id,
          action: 'submitted',
          previous_status: 'draft',
          new_status: 'pending_review',
          feedback: 'Project submitted and queued for moderation.',
          reviewed_at: shiftDays(-2)
        });
      }

      if (approvedProject) {
        reviewPayload.push({
          project_id: approvedProject.project_id,
          reviewer_id: adminUser.id,
          action: 'approved',
          previous_status: 'pending_review',
          new_status: approvedProject.status === 'approved' ? 'approved' : 'open',
          feedback: 'Scope and methods are clear. Approved for publication.',
          reviewed_at: shiftDays(-1)
        });
      }

      if (rejectedProject) {
        reviewPayload.push({
          project_id: rejectedProject.project_id,
          reviewer_id: adminUser.id,
          action: 'rejected',
          previous_status: 'pending_review',
          new_status: 'rejected',
          feedback: 'Submission lacks measurable outcomes and compliance detail.',
          reviewed_at: shiftDays(-3)
        });
      }

      if (needsRevisionProject) {
        reviewPayload.push({
          project_id: needsRevisionProject.project_id,
          reviewer_id: adminUser.id,
          action: 'needs_revision',
          previous_status: 'pending_review',
          new_status: 'needs_revision',
          feedback: 'Please clarify participant recruitment and risk mitigation.',
          changes_requested: 'Add recruitment quotas, ethics escalation process, and quality control plan.',
          reviewed_at: shiftDays(-4)
        });
      }

      projectReviews = await ProjectReview.bulkCreate(reviewPayload);
      console.log(`✓ Created ${projectReviews.length} project review records\n`);
    } else {
      projectReviews = await ProjectReview.findAll();
      console.log(`✓ Found ${projectReviews.length} existing project review records\n`);
    }

    // ==================== STEP 14: Create Saved Projects ====================
    console.log('🔖 Step 14: Creating Saved Project Records...');

    let savedProjects;
    const existingSavedProjects = await SavedProject.count();
    if (existingSavedProjects === 0 && researcherUsers.length > 0 && projects.length > 0) {
      const openProjects = projects.filter((project) => ['open', 'in_progress'].includes(project.status));
      const savedPayload = [];

      researcherUsers.forEach((researcherUser, researcherIndex) => {
        for (let i = 0; i < Math.min(3, openProjects.length); i += 1) {
          const project = openProjects[(researcherIndex + i) % openProjects.length];
          savedPayload.push({
            user_id: researcherUser.id,
            project_id: project.project_id,
            created_at: shiftDays(-(researcherIndex + i + 1)),
            updated_at: shiftDays(-(researcherIndex + i + 1))
          });
        }
      });

      savedProjects = await SavedProject.bulkCreate(savedPayload);
      console.log(`✓ Created ${savedProjects.length} saved project records\n`);
    } else {
      savedProjects = await SavedProject.findAll();
      console.log(`✓ Found ${savedProjects.length} existing saved project records\n`);
    }

    // ==================== STEP 15: Create Messages ====================
    console.log('💬 Step 15: Creating Message Records...');

    let messages;
    const existingMessages = await Message.count();
    if (existingMessages === 0 && nonprofitUsers.length > 0 && researcherUsers.length > 0) {
      const messagePayload = [
        { sender_id: nonprofitUsers[0].id, recipient_id: researcherUsers[0].id, body: 'Hi Amanda, can we review the asthma baseline survey this week?', created_at: shiftDays(-10) },
        { sender_id: researcherUsers[0].id, recipient_id: nonprofitUsers[0].id, body: 'Absolutely. I can share a revised draft by Thursday.', created_at: shiftDays(-9) },
        { sender_id: nonprofitUsers[1].id, recipient_id: researcherUsers[1].id, body: 'Do you have availability for an on-site calibration workshop?', created_at: shiftDays(-8) },
        { sender_id: researcherUsers[1].id, recipient_id: nonprofitUsers[1].id, body: 'Yes, next Tuesday works. Please send preferred time windows.', created_at: shiftDays(-7) },
        { sender_id: nonprofitUsers[2].id, recipient_id: researcherUsers[2].id, body: 'We need your feedback on the tutoring engagement metrics.', created_at: shiftDays(-6) },
        { sender_id: researcherUsers[2].id, recipient_id: nonprofitUsers[2].id, body: 'I will annotate the dashboard and return suggestions today.', created_at: shiftDays(-5) },
        { sender_id: nonprofitUsers[3].id, recipient_id: researcherUsers[3].id, body: 'Can we lock participant onboarding criteria this sprint?', created_at: shiftDays(-4) },
        { sender_id: researcherUsers[3].id, recipient_id: nonprofitUsers[3].id, body: 'Yes, sending a concise checklist and consent script now.', created_at: shiftDays(-3) },
        { sender_id: nonprofitUsers[4].id, recipient_id: researcherUsers[4].id, body: 'Could we compare retention trends across both housing cohorts?', created_at: shiftDays(-2) },
        { sender_id: researcherUsers[4].id, recipient_id: nonprofitUsers[4].id, body: 'Done. I uploaded a cohort comparison memo for your review.', created_at: shiftDays(-1) }
      ];

      messages = await Message.bulkCreate(messagePayload);
      console.log(`✓ Created ${messages.length} message records\n`);
    } else {
      messages = await Message.findAll();
      console.log(`✓ Found ${messages.length} existing message records\n`);
    }

    // ==================== STEP 16: Create Ratings ====================
    console.log('⭐ Step 16: Creating Rating Records...');

    let ratings;
    const existingRatings = await Rating.count();
    if (existingRatings === 0 && projects.length > 0) {
      const completedOrActiveProjects = projects.filter((project) => ['completed', 'in_progress', 'open'].includes(project.status));
      const ratingPayload = completedOrActiveProjects.slice(0, 4).map((project, index) => ({
        from_party: index % 2 === 0 ? 'nonprofit' : 'researcher',
        scores: {
          quality: 4 + (index % 2),
          communication: 5,
          timeliness: 3 + (index % 3),
          overall: 4
        },
        comments: [
          'Excellent collaboration and clear deliverables.',
          'Strong communication and thoughtful methodology.',
          'Very responsive partner, with actionable outputs.',
          'Great domain expertise and practical recommendations.'
        ][index],
        project_id: project.project_id,
        rated_by_user_id: index % 2 === 0
          ? nonprofitUsers[index % nonprofitUsers.length].id
          : researcherUsers[index % researcherUsers.length].id,
        rated_user_id: index % 2 === 0
          ? researcherUsers[index % researcherUsers.length].id
          : nonprofitUsers[index % nonprofitUsers.length].id,
        status: 'active'
      }));

      ratings = await Rating.bulkCreate(ratingPayload);
      console.log(`✓ Created ${ratings.length} rating records\n`);
    } else {
      ratings = await Rating.findAll();
      console.log(`✓ Found ${ratings.length} existing rating records\n`);
    }

    // ==================== STEP 17: Create Notifications ====================
    console.log('🔔 Step 17: Creating Notification Records...');

    let notifications;
    const existingNotifications = await Notification.count();
    if (existingNotifications === 0 && allUsers.length > 0) {
      const notificationTypes = [
        'project_created',
        'project_approved',
        'project_rejected',
        'milestone_completed',
        'milestone_deadline_approaching',
        'message_received',
        'application_received',
        'application_accepted',
        'new_match_available',
        'rating_received'
      ];

      const notificationPayload = [];
      for (let i = 0; i < 20; i += 1) {
        const user = allUsers[i % allUsers.length];
        const type = notificationTypes[i % notificationTypes.length];

        notificationPayload.push({
          user_id: user.id,
          type,
          title: `Testing alert: ${type.replaceAll('_', ' ')}`,
          message: `This seeded notification helps validate ${type} UI behavior in manual browser testing.`,
          link: user.role === 'admin' ? '/admin' : `/dashboard/${user.role}`,
          is_read: i % 5 === 0,
          archived: false,
          metadata: {
            seeded: true,
            scenario: type,
            priority: i % 3 === 0 ? 'high' : 'normal'
          },
          created_at: shiftDays(-(i % 14)),
          updated_at: shiftDays(-(i % 14))
        });
      }

      notifications = await Notification.bulkCreate(notificationPayload);
      console.log(`✓ Created ${notifications.length} notification records\n`);
    } else {
      notifications = await Notification.findAll();
      console.log(`✓ Found ${notifications.length} existing notification records\n`);
    }

    // ==================== STEP 18: Create Audit Logs ====================
    console.log('🕵️ Step 18: Creating Audit Log Records...');

    let auditLogs;
    const existingAuditLogs = await AuditLog.count();
    if (existingAuditLogs === 0 && allUsers.length > 0) {
      const auditPayload = [
        { actor_id: adminUser.id, action: 'user_login', entity_type: 'user', entity_id: adminUser.id, metadata: { source: 'seed-script' }, timestamp: shiftDays(-9) },
        { actor_id: nonprofitUsers[0].id, action: 'project_created', entity_type: 'project', entity_id: projects[0].project_id, metadata: { title: projects[0].title }, timestamp: shiftDays(-8) },
        { actor_id: nonprofitUsers[1].id, action: 'project_status_changed', entity_type: 'project', entity_id: projects[4].project_id, metadata: { from: 'open', to: 'in_progress' }, timestamp: shiftDays(-7) },
        { actor_id: researcherUsers[0].id, action: 'profile_updated', entity_type: 'user', entity_id: researcherUsers[0].id, metadata: { field: 'expertise' }, timestamp: shiftDays(-6) },
        { actor_id: researcherUsers[2].id, action: 'settings_changed', entity_type: 'user', entity_id: researcherUsers[2].id, metadata: { section: 'notifications' }, timestamp: shiftDays(-5) },
        { actor_id: nonprofitUsers[3].id, action: 'milestone_created', entity_type: 'milestone', entity_id: milestones[0].id, metadata: { name: milestones[0].name }, timestamp: shiftDays(-4) },
        { actor_id: adminUser.id, action: 'project_reviewed', entity_type: 'project', entity_id: projects[0].project_id, metadata: { decision: 'approved' }, timestamp: shiftDays(-3) },
        { actor_id: nonprofitUsers[4].id, action: 'organization_updated', entity_type: 'organization', entity_id: organizations[4].id, metadata: { field: 'focus_areas' }, timestamp: shiftDays(-2) },
        { actor_id: researcherUsers[5].id, action: 'application_submitted', entity_type: 'project', entity_id: projects[4].project_id, metadata: { channel: 'dashboard' }, timestamp: shiftDays(-1) },
        { actor_id: adminUser.id, action: 'dashboard_exported', entity_type: 'system', entity_id: null, metadata: { report: 'weekly_activity' }, timestamp: shiftDays(0) }
      ];

      auditLogs = await AuditLog.bulkCreate(auditPayload);
      console.log(`✓ Created ${auditLogs.length} audit log records\n`);
    } else {
      auditLogs = await AuditLog.findAll();
      console.log(`✓ Found ${auditLogs.length} existing audit log records\n`);
    }

    // ==================== STEP 19: Create Attachment Metadata ====================
    console.log('📎 Step 19: Creating Attachment Metadata Records...');

    let attachments;
    const existingAttachments = await Attachment.count();
    if (existingAttachments === 0 && projects.length > 0) {
      const nonprofitByOrg = new Map(
        nonprofitUsers
          .filter((nonprofitUser) => nonprofitUser.org_id)
          .map((nonprofitUser) => [nonprofitUser.org_id, nonprofitUser])
      );

      const targetProjects = projects.filter((project) => ['open', 'in_progress', 'completed'].includes(project.status)).slice(0, 5);
      const attachmentPayload = targetProjects.map((project, index) => {
        const owner = nonprofitByOrg.get(project.org_id);
        const uploadedBy = owner ? owner.id : adminUser.id;

        return {
          filename: [
            'research_proposal.pdf',
            'data_collection_template.xlsx',
            'methodology_notes.docx',
            'participant_onboarding_checklist.pdf',
            'outcomes_dashboard_spec.csv'
          ][index],
          mimetype: [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/pdf',
            'text/csv'
          ][index],
          size: [348210, 193004, 142882, 276901, 98122][index],
          storage_key: `seeded/attachments/project-${project.project_id}/artifact-${index + 1}`,
          project_id: project.project_id,
          uploaded_by: uploadedBy,
          status: index === 3 ? 'quarantined' : 'active',
          version: 1,
          is_latest: true,
          scan_status: index === 3 ? 'infected' : 'clean',
          scanned_at: shiftDays(-(index + 1)),
          quarantine_reason: index === 3 ? 'Flagged during malware scan simulation for QA testing.' : null,
          retention_expires_at: shiftDays(180 + index * 30),
          created_at: shiftDays(-(index + 6)),
          updated_at: shiftDays(-(index + 2))
        };
      });

      attachments = await Attachment.bulkCreate(attachmentPayload);
      console.log(`✓ Created ${attachments.length} attachment metadata records\n`);
    } else {
      attachments = await Attachment.findAll();
      console.log(`✓ Found ${attachments.length} existing attachment metadata records\n`);
    }

    // ==================== STEP 20: Summary ====================
    console.log('\n✅ Database seeding completed successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Summary of Records:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Organizations:          ${organizations.length}`);
    console.log(`Nonprofit Users:        ${nonprofitUsers.length}`);
    console.log(`Researcher Profiles:    ${researchers.length}`);
    console.log(`Researcher Users:       ${researcherUsers.length}`);
    console.log(`Admin Users:            1`);
    console.log(`Total Users:            ${allUsers.length}`);
    console.log(`User Preferences:       ${preferences.length}`);
    console.log(`Projects:               ${projects.length}`);
    console.log(`Milestones:             ${milestones.length}`);
    console.log(`Academic History:       ${academicHistory.length}`);
    console.log(`Certifications:         ${certifications.length}`);
    console.log(`Applications/Agreements: ${applications.length}`);
    console.log(`Matches:                ${matches.length}`);
    console.log(`Project Reviews:        ${projectReviews.length}`);
    console.log(`Saved Projects:         ${savedProjects.length}`);
    console.log(`Messages:               ${messages.length}`);
    console.log(`Ratings:                ${ratings.length}`);
    console.log(`Notifications:          ${notifications.length}`);
    console.log(`Audit Logs:             ${auditLogs.length}`);
    console.log(`Attachments:            ${attachments.length}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n📝 Login Credentials:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('All users have password: Password123!');
    console.log('');
    console.log('ADMIN:');
    console.log('  Email: admin@trident.org');
    console.log('');
    console.log('NONPROFITS:');
    nonprofitUsers.forEach((user, i) => {
      console.log(`  ${user.email.padEnd(35)} | ${organizations[i].name}`);
    });
    console.log('');
    console.log('RESEARCHERS:');
    researcherUsers.forEach((user, i) => {
      console.log(`  ${user.email.padEnd(35)} | ${researchers[i].affiliation}`);
    });
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    console.error(error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run seeding
seedDatabase();
