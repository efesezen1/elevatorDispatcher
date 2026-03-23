const router = require('express').Router();
const c = require('../controllers/pressureReadingsController');

// No valve guard — pressure sensors must report even when valve is CLOSED.
router.get('/', c.list);
router.post('/', c.create);
router.get('/:id', c.get);
router.delete('/:id', c.remove);

module.exports = router;
