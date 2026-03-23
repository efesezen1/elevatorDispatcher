const router = require('express').Router();
const c = require('./analyticsController');

router.get('/:districtId/mass-balance', c.massBalance);
router.get('/:districtId/pressure-correlation', c.pressureCorrelation);
router.get('/:districtId/smoothed-flow', c.smoothed);
router.get('/:districtId/mnf', c.mnf);
router.get('/:districtId/summary', c.summary);

module.exports = router;
