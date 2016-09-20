'use strict';

var firebase = require("firebase");
var Promise = require("promise");

var config = require("./config.js").config;

exports.handler = (event, context) => {

  var queryParams = event.queryParams;

  // Initialize Firebase
  firebase.initializeApp(config.firebase.config);

  // Optional Firebase logging
  if (queryParams !== undefined && queryParams.logging === true) {
    firebase.database.enableLogging(true);
  }
  
  // Run Firebase
  auth()
    .then(updateData)
    .then(context.succeed);

};

function auth() {
  return firebase.auth().signInWithEmailAndPassword(
    config.firebase.credentials.email,
    config.firebase.credentials.password);
}

function updateData() {
  return new Promise(function (resolve, reject) {
    var testRef = firebase.database().ref('test/ref');
    testRef.transaction( () => {
      return 'test data-' + Date.now();
    }, () => {
      resolve();
    });
  });
}
