'use strict';

/**
 * Updates Firebase data to reflect
 * new (fictional) time and Firebase pushes
 * to listening clients. The client dashbards
 * show an updated date and data associated 
 * with that date.
 */

var Mailgun = require('mailgun').Mailgun;
var config = require('./config.js').config;
var mg = new Mailgun(config.key);

exports.handler = (event, context, callback) => {
  
  var queryParams = event.queryParams;
  
  
  
  callback(null, queryParams);
  
};
