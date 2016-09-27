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
  .then(updateData)
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

function sortData(data) {
  let updates = [];
  let firstDate = -654886800000;
  // Branches
  let branchesUpdate = {};
  let branchInfo = {};
  for (let i = 0; i <  data.branches.length; i++) {
    let startEmployees = 0;
    let openDate = moment(data.branches[i].opened, "MM/DD/YYYY").valueOf();
    if (openDate <= firstDate) {
      startEmployees = data.branches[i].average_employees;
    }
    branchesUpdate[data.branches[i].id] = {
      city: data.branches[i].city,
      employees: startEmployees,
      lat: data.branches[i].lat,
      lng: data.branches[i].lng,
      state: data.branches[i].state
    };
    branchInfo[data.branches[i].id] = {
      openDates: {
        opened: openDate,
        closed: moment(data.branches[i].closed, "MM/DD/YYYY").valueOf()
      },
      employees: data.branches[i].average_employees
    }
  }
  updates.push({
    ref: '/client/branches',
    data: branchesUpdate
  });

  // Employee changes
  let eChanges = {};
  for (let i = 0; i < data.changes.length; i++) {
    let stamp = moment(data.changes[i].date, "MM/DD/YYYY").valueOf();
    let branchId = data.changes[i].branch_id;
    if (data.changes[i].type === 'Employee') {
      let eId = data.changes[i].id;
      if (!(eId in eChanges)) {
        eChanges[eId] = [];
      }
      eChanges[eId].push({
        stamp: stamp,
        branchId: branchId
      });
    } else if (data.changes[i].type === 'Client') {
      
    }
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
  branchLog[firstDate] = {};
  for (let i = 0; i < data.branches.length; i++) {
   let branchId = data.branches[i].id;
   branchLog[firstDate][branchId] = data.branches[i].average_employees;
   if (branchInfo[branchId].openDates.opened > firstDate) {
      // Set to zero employees if branch is closed
      branchLog[firstDate][branchId] = 0;
    }
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
        // If branch is closed during date, then set employees to zero
        if (branchInfo[branchId].openDates.opened > branchChanges[i].stamp
          || (!isNaN(branchInfo[branchId].openDates.closed)
            && branchInfo[branchId].openDates.closed < branchChanges[i].stamp)) {
          // Set to zero employees if branch is closed
          branchLog[branchChanges[i].stamp][branchId] = 0;
        } else if (branchLog[lastStamp][branchId] === 0) {
          branchLog[branchChanges[i].stamp][branchId] = branchInfo[branchId].employees;
        }
      }
    }
    lastStamp = branchChanges[i].stamp;
  }
  console.log(branchLog);
  updates.push({
    ref: 'server/employee_count',
    data: branchLog
  });
  updates.push({
    ref: 'client/current',
    data: '-654886800000'
  });
  updates.push({
    ref: 'server/current',
    data: '-654886800000'
  });
  return updates;
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