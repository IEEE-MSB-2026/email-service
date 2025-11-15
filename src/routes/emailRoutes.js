const express = require('express');
const { sendEmailDirect } = require('../controllers/emailController');

const router = express.Router();

router.post('/send', sendEmailDirect);

module.exports = router;
