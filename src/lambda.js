'use strict';

/**
 * Updates Firebase data to reflect
 * new (fictional) time and Firebase pushes
 * to listening clients. The client dashbards
 * show an updated date and data associated 
 * with that date.
 */

var firebase = require("firebase");
var config = require("./config.js").config;

exports.handler = (event, context) => {

  var queryParams = event.queryParams;

  // Initialize Firebase
  firebase.initializeApp(config.firebase.config);
  // Authenticate
  var email = config.firebase.credentials.email;
  var password = config.firebase.credentials.password;
  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(info => {
      getData( (data) => context.succeed('data: ' + data) );
    })
    .catch( error => console.log(error) );
};

function getData(callback) {
  var database = firebase.database();

  var ref = database.ref('testing');

  ref.on('value', function(snapshot) {
    callback(snapshot.val());
  });
}
