'use strict';

let firebase = require("firebase");
let fs = require('fs');
let Promise = require("promise");
let path = require('path');
let Converter = require("csvtojson").Converter;
let moment = require('moment');

let config = require("./config.js").config;

let csvItems = ['branches', 'changes'];

init(false);

auth()
  .then(prepareData)
  .then(sortData)
  .then(updateData)
  .then(process.exit);

function prepareData() {
  let completed = 0;
  let preparedData = { };
  return new Promise(function (resolve, reject) {
    // JSON 
    let filePath = path.join(__dirname, '../assets/issues.json');
    preparedData.issues = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // CSV
    for (let i = 0; i < csvItems.length; i++) {
       let name = csvItems[i];
       let filePath = path.join(__dirname, '../assets/', name + '.csv');
       getJson( filePath )
        .then( data => {
          preparedData[name] = data;
          completed++;
          if (completed === csvItems.length) {
            resolve(preparedData);
          }
        });
    }
  });
}

function getJson(file) {
  return new Promise(function (resolve, reject) {
    let converter = new Converter({ });
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
  let updates = [ ];
  let firstDate = -654886800000;

  // Changes
  let changes = { };
  let types = [ ];

  for (let i = 0; i < data.changes.length; i++) {
    let stamp = moment(data.changes[i].date, "MM/DD/YYYY").valueOf();
    if (data.changes[i].date === '') {
      console.error('Error in changes.csv => No date found for id: ' + data.changes[i].related_id);
    }
    let branchId = data.changes[i].branch_id;
    let changeType = (data.changes[i].type).toLowerCase() + 's';
    
    if (!(changeType in changes)) {
      changes[changeType] = { };
      types.push(changeType);
    }
    let id = data.changes[i].related_id;
    if (!(id in changes[changeType])) {
      changes[changeType][id] = [ ];
    }
    changes[changeType][id].push({
      stamp: stamp,
      branchId: branchId
    });
  }

  let defaultTypeStart = { };
  for (let i = 0; i < types.length; i++) {
    defaultTypeStart[types[i]] = 0;
  }

  // Branches
  let typeStart;
  let branchesUpdate = { };
  let branchInfo = { };
  for (let i = 0; i <  data.branches.length; i++) {
    typeStart = defaultTypeStart;
    let openDate = moment(data.branches[i].opened, "MM/DD/YYYY").valueOf();
    if (openDate <= firstDate) {
      for (let n = 0; n < types.length; n++) {
        typeStart[types[n]] = data.branches[i]['average_' + types[n]];
      }
    }
    let thisBranchUpdate = {
      city: data.branches[i].city,
      lat: data.branches[i].lat,
      lng: data.branches[i].lng,
      state: data.branches[i].state
    }
    for (let n = 0; n < types.length; n++) {
      thisBranchUpdate[types[n]] = typeStart[types[n]];
    }
    branchesUpdate[data.branches[i].id] = thisBranchUpdate;
    branchInfo[data.branches[i].id] = {
      openDates: {
        opened: openDate,
        closed: moment(data.branches[i].closed, "MM/DD/YYYY").valueOf()
      },
    }
    for (let j = 0; j < types.length; j++) {
      branchInfo[data.branches[i].id][types[j]] = data.branches[i]['average_' + types[j]];;
    }
  }
  updates.push({
    ref: '/client/branches',
    data: branchesUpdate
  });
  let branchLogs = { };
  let times = [ ];
  let reports = { };
  for (let changeType in changes) {
    if (changes.hasOwnProperty(changeType)) {
      let branchLog = sortType( changes.employees, data.branches, firstDate, branchInfo, changeType );
      branchLogs[changeType] = branchLog;

      let timesOfType = Object.keys( branchLog );
      
      for (let i = 0; i < timesOfType.length; i++) {
        if (times.indexOf(timesOfType[i]) === -1) {
          times.push( timesOfType[i] );
          let thisTime = Number( timesOfType[i] );
          // Count issues
          let reportedIssues = {
            client: 0,
            employee: 0
          };
          let openIssues = 0;
          for (let j = 0; j < data.issues.length; j++) {
            let use = false;
            let opened = moment(data.issues[j].opened, "MM/DD/YYYY").valueOf();            
            let closed;
            let issueType = (data.issues[j].type).toLowerCase();
            if (data.issues[j].closed !== '') {
              closed = moment(data.issues[j].closed, "MM/DD/YYYY").valueOf()
            }
            // Reported issues
            if (i === 0) {
              /**
               * If checking the first date of business, accept any issue opened on or before
               */
              if (opened <= Number( timesOfType[0] )) {
                reportedIssues[issueType]++;
              }
            } else {
              /**
               * If checking after the first date of business, accept any issue
               *  opened after the last date checked up to the current date
               */
              if (opened > Number( timesOfType[i - 1] ) && opened <= thisTime) {
                reportedIssues[issueType]++;
              }
            }
            // Open issues
            if (opened <= thisTime
              && (data.issues[j].closed === '' || closed > thisTime) ) {
              openIssues++;
            }
          }
          // Save data
          reports[thisTime] = {
            branches: { },
            issues: reportedIssues, // total reported issues for time period
            openIssues: openIssues
          }
        }
      }
    }
  }
  // Sort times
  times.sort( (a, b) => {
    return a - b;
  });
  // Merge types  
  for (let changeType in branchLogs) {
    if (branchLogs.hasOwnProperty(changeType)) {
      let log = branchLogs[changeType];
      let lastOfType;
      for (let i = 0; i < times.length; i++) {
        let time = times[i];
        let copyLog;
        let setZero = false;
        if (time in log) { // If this type has data for this time, then use that data
          copyLog = log[time];
        } else if (lastOfType !== undefined) { // if not, then copy the last used data
          copyLog = lastOfType;
        } else { // if this is the first entry, then set to zero
          copyLog = branchInfo;
          setZero = true;
        }
        for (let branchId in copyLog) {
          if (copyLog.hasOwnProperty(branchId)) {
            if (!(branchId in reports[time].branches)) {
              reports[time].branches[branchId] = { };
            }
            if (setZero === true) {
              reports[time].branches[branchId][changeType] = 0;
            } else {
              reports[time].branches[branchId][changeType] = copyLog[branchId];
            }
          }
        }
        lastOfType = copyLog;
      }
    }
  }
  // Sort raw issues
  let rawIssues = [];
  for (let i = 0; i <  data.issues.length; i++) {
   // Set complainer
   let complainer = 'Anonymous';
   if (data.issues[i].complainer !== '') {
     complainer = data.issues[i].complainer;
   }
   // Set complainee
   let complainee = 'Unknown';
   if (data.issues[i].complainee !== '') {
     complainee = data.issues[i].complainee;
   }
   rawIssues.push({
     type: data.issues[i].type,
     complainer: complainer,
     complainee: complainee,
     email: data.issues[i].email,
     comments: data.issues[i].comments,
     opened: data.issues[i].opened,
     closed: data.issues[i].closed
   }); 
  }
  updates.push({
    ref: '/server/issues_raw',
    data: rawIssues
  });
  updates.push({
    ref: 'server/reports',
    data: reports
  });
  
  updates.push({
    ref: 'client/current',
    data: firstDate + ''
  });
  updates.push({
    ref: 'server/current',
    data: firstDate + ''
  });
  return updates;
}

function sortType(changes, branches, firstDate, branchInfo, type) {
  // Branch changes
  let aggregate = { };
  for (let eId in changes) {
    if (changes.hasOwnProperty(eId)) {
      changes[eId].sort( (a, b) => {
        return a.stamp - b.stamp;
      });
      let previousBranchId = -1;
      for (let i = 0; i < changes[eId].length; i++) {
        let stamp = changes[eId][i].stamp;
        let branchId = changes[eId][i].branchId;
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

  let randomChanges = { };
  let maxVariation = 8;
  let branchChanges = [ ];
  // Create imaginary changes for unlisted branches
  for (let stamp in aggregate) {
    if (aggregate.hasOwnProperty(stamp)) {
      for (let i = 0; i < branches.length; i++) {
        let branchId = branches[i].id;
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
            change = Math.floor(Math.random() * 6) - 3;
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
  let branchLog = { };
  branchLog[firstDate] = { };
  for (let i = 0; i < branches.length; i++) {
    let branchId = branches[i].id;
    branchLog[firstDate][branchId] = branches[i]['average_' + type];
    
    if (branchInfo[branchId].openDates.opened > firstDate) {
      // Set to zero of type if branch is closed
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
          branchLog[branchChanges[i].stamp] = { };
        }
        if (!(branchId in branchLog[branchChanges[i].stamp])) {
          // new branch (not in inital values from `firstDate`)
          branchLog[branchChanges[i].stamp][branchId] = 0;
        }
        // Apply change
        branchLog[branchChanges[i].stamp][branchId] = periodChanges[branchId] + branchLog[lastStamp][branchId];
        // If branch is closed during date, then set current type to zero
        if (branchInfo[branchId].openDates.opened > branchChanges[i].stamp
          || (!isNaN(branchInfo[branchId].openDates.closed)
            && branchInfo[branchId].openDates.closed < branchChanges[i].stamp)) {
          // Set to zero of type if branch is closed
          branchLog[branchChanges[i].stamp][branchId] = 0;
        } else if (branchLog[lastStamp][branchId] === 0) {
          branchLog[branchChanges[i].stamp][branchId] = branchInfo[branchId][type];
        }
      }
    }
    lastStamp = branchChanges[i].stamp;
  }
  return branchLog;
}

function updateChange(object, stamp, branchId, change) {
  if (!(stamp in object)) {
    object[stamp] = { };
  }
  if (!(branchId in object[stamp])) {
    object[stamp][branchId] = 0;
  }
  object[stamp][branchId] += change;
  return object;
}
