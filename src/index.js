'use strict';

let firebase = require("firebase");
let Promise = require("promise");
var path = require('path');
var Converter = require("csvtojson").Converter;

let config = require("./config.js").config;

let items = ['branches'];

init(false);

auth()
  .then(prepareData)
  .then(postAll)
  .then(process.exit);

function prepareData() {
  let completed = 0;
  let preparedData = {};
  return new Promise(function (resolve, reject) {
    for (let i = 0; i < items.length; i++) {
       let name = items[i];
       let filePath = path.join(__dirname, '../assets/', name + '.csv');
       getJson( filePath )
        .then( data => {
          preparedData[name] = data;
          completed++;
          if (completed === items.length) {
            resolve(preparedData);
          }
        });
    }
  });
}

function getJson(file) {
  return new Promise(function (resolve, reject) {
    let converter = new Converter({});
    converter.fromFile(file, (err,result) => {
      if (err) { reject(err); }
      resolve(result);
    });
  });
}

function init(logging) {
  // Initialize Firebase
  firebase.initializeApp(config.firebase.config);
  // Optional Firebase logging
  if (logging === true) {
    firebase.database.enableLogging(true);
  }
}

function auth() {
  return firebase.auth().signInWithEmailAndPassword(
    config.firebase.credentials.email,
    config.firebase.credentials.password);
}

function postAll(preparedData) {
  return new Promise( (resolve, reject) => {
    firebase.database().ref('client').transaction( () => {
      return preparedData;
    }, () => resolve() );
  });
}
