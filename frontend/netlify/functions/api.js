const express = require('express');
const serverless = require('serverless-http');
const app = require('../../../backend/server');

// Wrap express app with serverless
module.exports.handler = serverless(app);