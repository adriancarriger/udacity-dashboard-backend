'use strict';

var test = require('./lambda.js').handler;

test(
  { },
  {
    succeed: (data) => {
      console.log( data );
      process.exit();
    }
  }
);
