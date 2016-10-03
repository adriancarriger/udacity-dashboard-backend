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
    .then(runForAMinute)
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

function runForAMinute() {
  return new Promise( (resolve, reject) => {
    runOnce();
    let runTotal = 1;
    let maxPerMinute = 6;
    for (let i = 1; i < maxPerMinute; i++) {
      setTimeout( () => {
        runOnce()
          .then( () => {
            runTotal++;
            if (runTotal === maxPerMinute) {
              resolve();
            }
          });
      }, 10000 * i);
    }
  });
}

function runOnce() {
  return new Promise( (resolve, reject) => {
    getData()
    .then(sortData)
    .then(updateData)
    .then( () => resolve() );
  });
  
}

function updateData(updates) {
  return new Promise( (resolve, reject) => {
    let completed = 0;
    for (let i = 0; i < updates.length; i++) {
      let ref = firebase.database().ref( updates[i].ref );
      ref.transaction( () => {
        return updates[i].data;
      }, () => {
        completed++;
        if (completed === updates.length) {
          resolve();
        }
      });
    }
  });
}

function getData() {
  return new Promise( (resolve, reject) => {
    var database = firebase.database();
    var ref = database.ref('server');
    ref.once('value', (snapshot) => {
      resolve(snapshot.val());
    });
  }); 
}

function sortData(data) {
  let currentTime = data.current + '';
  let times = Object.keys(data.reports);
  times.sort( (a, b) => {
    return a - b;
  });
  let newTime = undefined;
  for (let i = 0; i < times.length; i++) {
    if (times[i] === currentTime) {
      if (i === times.length - 1) {
        newTime = times[0];
      } else {
        newTime = times[i + 1];
      }
    }
  }
  let updates = [
    {
      ref: 'client/current',
      data: newTime
    },
    {
      ref: 'server/current',
      data: newTime
    }
  ];
  // Update branch data
  for (let i = 1; i < data.reports[newTime].branches.length; i++) {
    let typeObj = data.reports[newTime].branches[i];
    for (let changeType in typeObj) {
      if (typeObj.hasOwnProperty(changeType)) {
        updates.push({
          ref: 'client/branches/' + i + '/' + changeType,
          data: data.reports[newTime].branches[i][changeType]
        }); 
      }
    }
  }
  return updates;
}
