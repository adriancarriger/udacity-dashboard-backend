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
    .then(updateRunUntil)
    .then(update)
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

function updateRunUntil() {
  return new Promise( (resolve, reject) => {
    firebase.database().ref('server/run_info/run_until').transaction( () => {
      let runTime = 1000 * 60 * 2;
      return moment().valueOf() + runTime;
    }, () => {
      resolve();
    });
  });
}

function update() {
  return new Promise( (resolve, reject) => {
    checkForUpdates().then( updateNeeded => {
      if (updateNeeded) {
        let database = firebase.database();
        // Set running status to true
        database.ref('server/run_info/running').transaction( () => {
          return true;
        }, () => {
          // Run every 7 seconds
          let interval = setInterval( () => {
            run().then( finished => {
              if (finished) {
                resolve();
              }
            });
          }, 7 * 1000);
        });
      } else {
        resolve();
      }
    });
  });
}

function checkForUpdates() {
  return new Promise( (resolve, reject) => {
    getData().then( data => {
      let secondsSinceUpdate = (moment().valueOf() - data.run_info.last_update) / 1000;
      if ( (data.run_info.running && secondsSinceUpdate < 20)
        || moment( data.run_info.run_until ).valueOf() < moment().valueOf() ) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

function run() {
  return new Promise( (resolve, reject) => {
    getData()
    .then(sortData)
    .then(updateData)
    .then( finished => resolve(finished) );
  });
}

function updateData(updates) {
  return new Promise( (resolve, reject) => {
    let completed = 0;
    let finished = false;
    for (let i = 0; i < updates.length; i++) {
      let ref = firebase.database().ref( updates[i].ref );
      ref.transaction( () => {
        return updates[i].data;
      }, () => {
        completed++;
        if (updates[i].ref === 'server/run_info/running' && updates[i].data === false) {
          finished = true;
        }
        if (completed === updates.length) {
          resolve(finished);
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
  let itemNumber; // The number of dates to display in a chart
  /**
   * Finds the new time
   * It takes the current time, loops through
   * the available times and picks the next time avaiable. 
   */
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
  /**
   * Collect data to display in charts.
   * This starts with the first date's chart data and continues to collect
   * data until it reaches the current date's set of data. 
   */
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
  /**
   * If there are only <= 2 items, then we show a blank date with
   * zero as the chart data, so the very first date would show an
   * increase from zero to the first date's datapoint.
   */
  if (itemNumber <= 2) {
    labels.unshift('');
    sales.unshift(0);
    issues.client.unshift(0);
    issues.employee.unshift(0);
  }
  /**
   * Only show raw issue data that would be avaiable on the current date
   */
  let raw_issues = [];
  for (let i = 0; i < data.issues_raw.length; i++){
    let issue = data.issues_raw[i];
    if ( newTime >= moment(issue.opened, "MM/DD/YYYY").valueOf() ) {
      if (issue.closed !== '' && moment(issue.closed, "MM/DD/YYYY").valueOf() > newTime ) {
        issue.closed = '';
      }
      raw_issues.push( issue );
    }
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
    },
    {
      ref: 'client/issues_raw',
      data: raw_issues
    },
    {
      ref: 'server/run_info/last_update',
      data: moment().valueOf()
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
  // Check if updates should pause
  if ( data.run_info.run_until < moment().valueOf() ) {
    updates.push({
      ref: 'server/run_info/running',
      data: false
    }); 
  }
  return updates;
}
