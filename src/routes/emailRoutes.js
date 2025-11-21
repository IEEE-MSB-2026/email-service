const express = require('express');
const { sendEmailDirect, bulkTemplatedSend } = require('../controllers/emailController');

const router = express.Router();

router.post('/send', sendEmailDirect);
router.post('/bulk-template', bulkTemplatedSend);

module.exports = router;
