'use strict';

let firebase = require("firebase");
let Promise = require("promise");
let path = require('path');
let Converter = require("csvtojson").Converter;
let moment = require('moment');

let config = require("./config.js").config;

let items = ['branches', 'employees', 'changes'];

init(false);

auth()
  .then(prepareData)
  .then(sortData)
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

function postAll(sortedData) {
  return new Promise( (resolve, reject) => {
    firebase.database().ref('server/employee_count').transaction( () => {
      return sortedData;
    }, () => resolve() );
  });
}

function sortData(data) {
  // Employee changes
  let eChanges = {};
  for (let i = 0; i < data.changes.length; i++) {
    let stamp = moment(data.changes[i].date, "MM/DD/YYYY").valueOf();
    let branchId = data.changes[i].branch_id;
    let eId = data.changes[i].employee_id;
    if (!(eId in eChanges)) {
      eChanges[eId] = [];
    }
    eChanges[eId].push({
      stamp: stamp,
      branchId: branchId
    });
  }
  // Branch changes
  let aggregate = { };
  for (let eId in eChanges) {
    if (eChanges.hasOwnProperty(eId)) {
      eChanges[eId].sort( (a, b) => {
        return a.stamp - b.stamp;
      });
      let previousBranchId = -1;
      for (let i = 0; i < eChanges[eId].length; i++) {
        let stamp = eChanges[eId][i].stamp;
        let branchId = eChanges[eId][i].branchId;
        if (branchId === -1 || previousBranchId !== -1) {
          // Change the last branchId
          aggregate = updateChange(aggregate, stamp, previousBranchId, -1);
        } 
        if (branchId !== -1) {
          aggregate = updateChange(aggregate, stamp, branchId, 1);
        }
        previousBranchId = branchId;
      }
    }
  }

  let randomChanges = {};
  let maxVariation = 5;
  let branchChanges = [];
  // Create imaginary changes for unlisted branches
  for (let stamp in aggregate) {
    if (aggregate.hasOwnProperty(stamp)) {
      for (let i = 0; i < data.branches.length; i++) {
        let branchId = data.branches[i].id;
        if (!(branchId in aggregate[stamp])) {
          // generate data
          let change = 0;
          if (!(branchId in randomChanges)) {
            randomChanges[branchId] = 0;
          }
          if (randomChanges[branchId] >= maxVariation) {
            change = -3;
          } else if (randomChanges[branchId] <= -maxVariation) {
            change = 3;
          } else {
            // use random number between -2 and 2
            change = Math.floor(Math.random() * 5) - 2;
          }
          randomChanges[branchId] += change;
          aggregate[stamp][branchId] = change;
        }
      }
      branchChanges.push({
        changes: aggregate[stamp],
        stamp: stamp
      });
    }
  }
  // sort changes by stamp
  branchChanges.sort( (a, b) => {
    return a.stamp - b.stamp;
  });
  // set inital values
  let branchLog = {};
  let firstDate = -654886800000;
  branchLog[firstDate] = {};
  for (let i = 0; i < data.branches.length; i++) {
   let branchId = data.branches[i].id;
   branchLog[firstDate][branchId] = data.branches[i].average_employees;
  }
  let lastStamp = firstDate;
  // Apply changes
  for (let i = 0; i < branchChanges.length; i++) {
    // Set this date's inital value
    let periodChanges = branchChanges[i].changes;
    // Loop through this periods branch changes
    for (let branchId in periodChanges) {
      if (periodChanges.hasOwnProperty(branchId)) {
        if (!(branchChanges[i].stamp in branchLog)) {
          branchLog[branchChanges[i].stamp] = {};
        }
        if (!(branchId in branchLog[branchChanges[i].stamp])) {
          // new branch (not in inital values from `firstDate`)
          branchLog[branchChanges[i].stamp][branchId] = 0;
        }
        // Apply change
        branchLog[branchChanges[i].stamp][branchId] = periodChanges[branchId] + branchLog[lastStamp][branchId];
      }
    }
    lastStamp = branchChanges[i].stamp;
  }
  return branchLog;
}

function updateChange(object, stamp, branchId, change) {
  if (!(stamp in object)) {
    object[stamp] = {};
  }
  if (!(branchId in object[stamp])) {
    object[stamp][branchId] = 0;
  }
  object[stamp][branchId] += change;
  return object;
}

function asdf() {

}