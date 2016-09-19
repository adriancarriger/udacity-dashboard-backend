'use strict';

var sendEmail = require('./lambda.js').handler;

var emailText = 'my random email';

sendEmail(
  { queryParams: { meow: emailText } },
  undefined,
  () => console.log('done!')
);
