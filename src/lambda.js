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

  init(event.queryParams);
  
  // Run Firebase
  auth()
    .then(getData)
    .then(sortData)
    .then(postData)
    .then(context.succeed);

};

function init(params) {
  // Initialize Firebase
  firebase.initializeApp(config.firebase.config);
    // Optional Firebase logging
  if (params !== undefined && params.logging === true) {
    firebase.database.enableLogging(true);
  }
}

function auth() {
  return firebase.auth().signInWithEmailAndPassword(
    config.firebase.credentials.email,
    config.firebase.credentials.password);
}

function postData(postInfo) {
  return new Promise( (resolve, reject) => {
    var testRef = firebase.database().ref(postInfo.ref);
    testRef.transaction( () => {
      return postInfo.data;
    }, () => {
      resolve();
    });
  });
}

function getData() {
  return new Promise( (resolve, reject) => {
    var database = firebase.database();
    var ref = database.ref('test/ref');
    ref.once('value', (snapshot) => {
      resolve(snapshot.val());
    });
  }); 
}

function sortData(data2) {
  var ref = 'test/ref';
  var data = 'test data-' + Date.now();
  return {ref: ref, data: data};
}
