const express = require('express');
const router = express.Router();
const researcherController = require('../controllers/researcherController');
const { authenticate, requireResearcher } = require('../middleware/auth');

// Researcher profile settings routes (require researcher role)
router.get('/me', authenticate, requireResearcher, researcherController.getResearcherProfile);
router.put('/me', authenticate, requireResearcher, researcherController.updateResearcherProfile);

// Academic history routes (require researcher role)
router.get('/me/academic', authenticate, requireResearcher, researcherController.getAcademicHistory);
router.post('/me/academic', authenticate, requireResearcher, researcherController.createAcademicHistory);
router.put('/me/academic/:id', authenticate, requireResearcher, researcherController.updateAcademicHistory);
router.delete('/me/academic/:id', authenticate, requireResearcher, researcherController.deleteAcademicHistory);

// Certification routes (require researcher role)
router.get('/me/certifications', authenticate, requireResearcher, researcherController.getCertifications);
router.post('/me/certifications', authenticate, requireResearcher, researcherController.createCertification);
router.put('/me/certifications/:id', authenticate, requireResearcher, researcherController.updateCertification);
router.delete('/me/certifications/:id', authenticate, requireResearcher, researcherController.deleteCertification);

// Projects routes (require researcher role)
router.get('/me/projects', authenticate, requireResearcher, researcherController.getResearcherProjects);

// Public profile view (any authenticated user — nonprofits, researchers, admins)
// Must be AFTER /me routes so Express doesn't match "me" as :id
router.get('/:id', authenticate, researcherController.getResearcherProfileById);

module.exports = router;
