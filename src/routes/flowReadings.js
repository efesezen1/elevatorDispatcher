const router = require('express').Router();
const valveGuard = require('../middleware/valveGuard');
const c = require('../controllers/flowReadingsController');

router.get('/', c.list);
router.post('/', valveGuard, c.create);  // valve guard fires before insert
router.get('/:id', c.get);
router.delete('/:id', c.remove);

module.exports = router;
