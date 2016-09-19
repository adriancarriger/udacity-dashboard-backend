'use strict';

var sendEmail = require('./lambda.js').handler;

var emailText = 'my random email sent at ' + Math.floor(Date.now() / 1000);

sendEmail(
  { queryParams: { meow: emailText } },
  undefined,
  () => console.log('done!')
);
