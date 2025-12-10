const express = require('express');
const router = express.Router();
const researcherController = require('../controllers/researcherController');
const { authenticate, requireResearcher } = require('../middleware/auth');

// All routes require authentication and researcher role
router.use(authenticate);
router.use(requireResearcher);

// Researcher profile settings routes
router.get('/me', researcherController.getResearcherProfile);
router.put('/me', researcherController.updateResearcherProfile);

// Academic history routes
router.get('/me/academic', researcherController.getAcademicHistory);
router.post('/me/academic', researcherController.createAcademicHistory);
router.put('/me/academic/:id', researcherController.updateAcademicHistory);
router.delete('/me/academic/:id', researcherController.deleteAcademicHistory);

// Certification routes
router.get('/me/certifications', researcherController.getCertifications);
router.post('/me/certifications', researcherController.createCertification);
router.put('/me/certifications/:id', researcherController.updateCertification);
router.delete('/me/certifications/:id', researcherController.deleteCertification);

// Projects routes
router.get('/me/projects', researcherController.getResearcherProjects);

module.exports = router;
