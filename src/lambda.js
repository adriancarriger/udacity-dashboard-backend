'use strict';

/**
 * Updates Firebase data to reflect
 * new (fictional) time and Firebase pushes
 * to listening clients. The client dashbards
 * show an updated date and data associated 
 * with that date.
 */

let firebase = require("firebase");
let config = require("./config.js").config;
let moment = require('moment');

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
    let database = firebase.database();
    let ref = database.ref('server');
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
  let itemNumber;
  for (let i = 0; i < times.length; i++) {
    if (times[i] === currentTime) {
      if (i === times.length - 1) {
        itemNumber = 0;
      } else {
        itemNumber = i + 1;
      }
      newTime = times[itemNumber]
    }
  }
  let sales = [ ];
  let issues = {
    client: [ ],
    employee: [ ]
  };
  let labels = [ ];
  let currentIssues = 0;
  for (let i = 0; i <= itemNumber; i++) {
    let thisTime = times[i];
    labels.push( moment( Number(thisTime) ).format('MM/DD/YYYY') );
    issues.client.push( data.reports[thisTime].issues.client );
    issues.employee.push( data.reports[thisTime].issues.employee );
    let thisEmployeeTotal = 0;
    let theseBranches = data.reports[thisTime].branches;
    for (let j = 0; j < theseBranches.length; j++) {
      if (theseBranches[j] !== undefined && 'clients' in theseBranches[j]) {
        thisEmployeeTotal += theseBranches[j].clients;
      }
    }
    sales.push( thisEmployeeTotal );
    if (newTime === thisTime) {
      currentIssues = data.reports[thisTime].issues.client + data.reports[thisTime].issues.employee;
    }
  }
  if (itemNumber <= 2) {
    labels.unshift('');
    sales.unshift(0);
    issues.client.unshift(0);
    issues.employee.unshift(0);
  }
  // Set updates
  let updates = [
    {
      ref: 'client/current',
      data: newTime
    },
    {
      ref: 'server/current',
      data: newTime
    },
    {
      ref: 'client/sales/clients/0/data',
      data: sales
    },
    {
      ref: 'client/sales/dates',
      data: labels
    },
    {
      ref: 'client/issues/labels',
      data: labels
    },
    {
      ref: 'client/issues/datasets/0/data',
      data: issues.client
    },
    {
      ref: 'client/issues/datasets/1/data',
      data: issues.employee
    },
    {
      ref: 'client/issues/total',
      data: currentIssues
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
