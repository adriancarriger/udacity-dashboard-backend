'use strict';

var test = require('./lambda.js').handler;

var event = {
  queryParams: { logging: false }
};
var context = { succeed: onSucceed, awsRequestId: 'testing' };

// Run test
test(event, context);


/**
 * Print returned data and exit process
 */
function onSucceed(data) {
  if (data !== undefined) { console.log( data ); }
  process.exit();
}
