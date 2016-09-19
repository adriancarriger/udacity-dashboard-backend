'use strict';

var Mailgun = require('mailgun').Mailgun;
var mg = new Mailgun('');

exports.handler = (event, context, callback) => {
  
  var queryParams = event.queryParams;
  
  var test = 'Default';
  if ("meow" in queryParams) {
    test = queryParams.meow;
  }
  
  mg.sendText('adrian@thecarrigers.com', ['Adrian & Nicole <mail@adrianandnicole.com>'],
  'This is the subject',
  'This is the text. ' + test,
  'noreply@example.com', {},
  function(err) {
    if (err) console.log('Oh noes: ' + err);
    else     console.log('Success');
  });
  
  callback(null, queryParams);
  
};
