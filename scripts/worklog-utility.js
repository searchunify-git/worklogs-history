let timesheetEnabled = false;
const timesheetOptions = {
  "headers": {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "sec-ch-ua": "\"Chromium\";v=\"116\", \"Not)A;Brand\";v=\"24\", \"Google Chrome\";v=\"116\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "upgrade-insecure-requests": "1"
  },
  "referrer": "https://timesheet.grazitti.com/",
  "referrerPolicy": "strict-origin-when-cross-origin",
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "include",
  "redirect": "error" 
};

const timesheetPostOptions = {
  "headers": timesheetOptions.headers,
  "referrer": "https://timesheet.grazitti.com/dailyHuddle.php",
  "referrerPolicy": "strict-origin-when-cross-origin",
  "body": null,
  "method": "POST",
  "mode": "cors",
  "credentials": "include"
};

let extLocalStorage = {};

const openInNewTab = async () => {
  console.log('open tab called');
  await chrome.tabs.create({ url: chrome.runtime.getURL("popup/main.html") });
}

const showJiraSuggestions = async () => {
  let suggestionContainer = document.getElementById('worklog-jira-suggestion');
  let result = await chrome.storage.local.get(["recentJiraTabsVisited"]);
  if(result && result.recentJiraTabsVisited && result.recentJiraTabsVisited.length>0){
    result.recentJiraTabsVisited.sort((a,b) => {
      return b.ts - a.ts;
    });
    let suggestions = result.recentJiraTabsVisited.map(tab => {
      return `<p><a class="jira-task-item" href="${tab.url}" target="_blank" data-jiraId="${tab.jiraId}">${tab.title}</a></p>`;
    });
    suggestionContainer.innerHTML = suggestions.join('');
    let jiraTaskItems = document.getElementsByClassName('jira-task-item');
    for(let i=0;i<jiraTaskItems.length;i++) {
      let jiraTaskItem = jiraTaskItems[i];
      console.log('jiraTaskItem.jiraId: ', jiraTaskItem.getAttribute('data-jiraId'));
      
      jiraTaskItem.removeEventListener('click', setJiraId);
      jiraTaskItem.addEventListener('click', setJiraId);
    }
    suggestionContainer.className = 'worklog-jira-suggestion';
  }
}

const hideJiraSuggestions = async () => {
  let suggestionContainer = document.getElementById('worklog-jira-suggestion');
  suggestionContainer.className = 'worklog-jira-suggestion hidden';
}

const setJiraId = (e) => {
  e.preventDefault();
  let ele = e.target;
  let jiraIdInput = document.getElementById('worklog-ext-jiraid');
  jiraIdInput.value = ele.getAttribute('data-jiraId');
  return false;
}

const setOptionValueByText = (select, textToFind, type) => {
  let selectedId = -1;
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].text === textToFind) {
        select.selectedIndex = i;
        selectedId = select.options[i].value;
        if (type === 'client') {
          extLocalStorage.selectedClient = selectedId;
        } else if (type === 'project') {
          extLocalStorage.selectedProject = selectedId;
        } else if (type === 'task') {
          extLocalStorage.selectedTask = selectedId;
        } else if (type === 'tag') {
          extLocalStorage.selectedTag = selectedId;
        }
        break;
    }
  }
  return selectedId;
}

const fetchJiraTSPath = async (jiraId) => {
  let issueData =  await fetch(`https://jira.grazitti.com/rest/api/latest/issue/${jiraId}`, {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "cache-control": "max-age=0",
      "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1"
    },
    "referrerPolicy": "strict-origin-when-cross-origin",
    "body": null,
    "method": "GET",
    "mode": "cors",
    "credentials": "include"
  }).then(res => res.json());
  let tsPath = issueData.fields.customfield_13738;
  let tsObj = {};
  if(tsPath) {
    tsPath.split('~').map(item => {
      tsObj[item.split(':')[0]] = item.split(':')[1];
    });

    extLocalStorage.selectedClientName = tsObj.client;
    extLocalStorage.selectedProjectName = tsObj.project;
    extLocalStorage.selectedTaskName = tsObj.task;
    fetchTimesheetClients();
    
  }

}
const initializeWorkLogExt = () => {
  console.log('worklog initialize')
  // check last logged time entry
  chrome.storage.local.get(["grzLastLogged", "selectedClient","selectedProject","selectedTask","logDate","logMessage"]).then(result => {
    extLocalStorage = result;
    let logDateElement = document.getElementById('worklog-ext-worklog-date');
    if(false && result.logDate && logDateElement.value != result.logDate) {
      logDateElement.value = result.logDate;
    } else {
      logDateElement.value = new Date().toISOString().split('T')[0];
    }
    let logMessageElement = document.getElementById('worklog-ext-comment');
    if(result.logMessage && logMessageElement.value != result.logMessage) {
      logMessageElement.value = result.logMessage;
    }
    if(!result || !result.grzLastLogged) {
     console.log('lastLogged in not set');
    }else {
      console.log('lastLogged: ', result.grzLastLogged)
    }
  });
  // check if jira is open
  chrome.tabs.query({currentWindow: true, active: true}, function(tabs){
    console.log(tabs[0].url);
    let matchedPatterns = tabs[0].url.match(new RegExp(/https:\/\/jira\.grazitti\.com\/browse\/([^\?$]+)/));
    if(matchedPatterns && matchedPatterns.length>1){
      let jiraId = matchedPatterns[1];
      document.getElementById('worklog-ext-jiraid').value = jiraId;
      fetchJiraTSPath(jiraId);
    }
  });

  let btn = document.getElementById('worklog-ext-btn');
  if(btn){
    console.log('add event click to button');
    btn.removeEventListener('click', logWork);
    btn.addEventListener('click',logWork);
  }
  let jiraIdInput = document.getElementById('worklog-ext-jiraid');
  let clientSelect = document.getElementById('worklog-ext-client');
  let projectSelect = document.getElementById('worklog-ext-project');
  let taskSelect = document.getElementById('worklog-ext-task');
  let logDate = document.getElementById('worklog-ext-worklog-date');
  let logMessage = document.getElementById('worklog-ext-comment');

  let newTabButton = document.getElementById('new-tab-button');
  
  newTabButton.removeEventListener('click', openInNewTab);
  newTabButton.addEventListener('click', openInNewTab);

  jiraIdInput.removeEventListener('focus', showJiraSuggestions);
  jiraIdInput.addEventListener('focus', showJiraSuggestions);
  // jiraIdInput.removeEventListener('blur', hideJiraSuggestions);
  // jiraIdInput.addEventListener('blur', hideJiraSuggestions);


  clientSelect.removeEventListener('change', clientChange);
  clientSelect.addEventListener('change', clientChange);
  projectSelect.removeEventListener('change', projectChange);
  projectSelect.addEventListener('change', projectChange);
  taskSelect.removeEventListener('change', taskChange);
  taskSelect.addEventListener('change', taskChange);


  logDate.removeEventListener('change', logDateChange);
  logDate.addEventListener('change', logDateChange);
  logMessage.removeEventListener('change', logMessageChange);
  logMessage.addEventListener('change', logMessageChange);

  let radios = document.querySelectorAll('input[type=radio][name="worklog-type"]');

  function changeHandler(event) {
    let calenderSelect = document.getElementById('worklog-ext-calender-meet');
    let logTimeEle = document.getElementById('worklog-ext-time-spent');
    let timeSpentLabel = document.getElementById('time-spent-label');
    if ( this.value === 'calender' ) {
      calenderSelect.className = 'worklog-ext-input';
      logMessage.className = 'worklog-ext-input hidden';
      logTimeEle.className = 'worklog-ext-input hidden';
      timeSpentLabel.className = 'hidden';
    } else if ( this.value === 'comment' ) {
      calenderSelect.className = 'worklog-ext-input hidden';
      logMessage.className = 'worklog-ext-input';
      logTimeEle.className = 'worklog-ext-input';
      timeSpentLabel.className = '';
    }  
  }

  Array.prototype.forEach.call(radios, function(radio) {
    radio.removeEventListener('change', changeHandler);
    radio.addEventListener('change', changeHandler);
  });
  fetchTimesheetClients();
}

const updateTimesheeetPathForJira = async (jiraId, pathValue) => {
  let result = true;
  let response = await fetch(`https://jira.grazitti.com/rest/api/2/issue/${jiraId}`, {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "cache-control": "max-age=0",
      "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "Content-Type": "application/json"
    },
    "referrerPolicy": "strict-origin-when-cross-origin",
    "body": `{"fields":{"customfield_13738": "${pathValue}"}}`,
    "method": "PUT",
    "mode": "cors",
    "credentials": "include"
  }).then(data => data.text())
  .catch(e => {
    result = false;
    console.log('error while updating jira', e);
  });
  return result;
}

const fetchWorklogIdsForIssue = async (issueId, tsPath) => {
  console.log(issueId, tsPath)
  return fetch(`https://jira.grazitti.com/rest/api/latest/issue/${issueId}/worklog`, {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "cache-control": "max-age=0",
      "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1"
    },
    "referrerPolicy": "strict-origin-when-cross-origin",
    "body": null,
    "method": "GET",
    "mode": "cors",
    "credentials": "include"
  }).then(res => res.json()).then(res => {
    for( const log of res.worklogs){
      log.tsPath = tsPath
    }
    return {
      tsPath, ...res
    }
  });
}

const fetchCurrentUserEmail = async () => {
  let result = await fetch("https://jira.grazitti.com/rest/api/latest/myself", {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "cache-control": "max-age=0",
      "sec-ch-ua": "\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1"
    },
    "referrerPolicy": "strict-origin-when-cross-origin",
    "body": null,
    "method": "GET",
    "mode": "cors",
    "credentials": "include"
  }).then(res => res.json());
  return result.emailAddress;
}

const getTodaysJiraWorklog = async (logDate) => {
  let currentUser = await fetchCurrentUserEmail();
  let result = await fetch(`https://jira.grazitti.com/rest/api/latest/search?jql=worklogDate%3C='${logDate}'%20AND%20worklogDate%3E='${logDate}'%20AND%20worklogAuthor=currentUser()`, {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "cache-control": "max-age=0",
      "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1"
    },
    "referrerPolicy": "strict-origin-when-cross-origin",
    "body": null,
    "method": "GET",
    "mode": "cors",
    "credentials": "include"
  }).then(res => res.json());
  //result = result.issues.map(issue => { return {title: issue.key + ' || ' +issue.fields.summary, timeSpent: issue.fields.timespent}});
  console.log(result);
  
  let allResults = await Promise.all(result.issues.map(issue => fetchWorklogIdsForIssue(issue.id, issue.fields.customfield_13738)));
  oldresult = result;
  result = [];
  console.log("logdate", logDate, allResults);
  allResults.map((r, idx) => {result = result.concat(r.worklogs.filter(a => (a.author.emailAddress == currentUser && a.created.split('T')[0] == new Date(logDate).toISOString().split('T')[0])).map(a => { return {title: oldresult.issues[idx].key + ' || '+a.comment, timeSpent: a.timeSpentSeconds,tsPath: a.tsPath}}))});


  let content = `<table>
    <tr>
      <th>Task</th>
      <th>TimeSpent</th>
      <th>TS Path</th>
    </tr>
  `;
  let totalTime = 0;
  content += result.map(r => {
    console.log("this is r", r);
    let minutes = r.timeSpent/60;
    let hours = Math.floor(minutes/60);
    minutes = minutes%60;
    totalTime += r.timeSpent;
    return `<tr>
      <td>${r.title}</td>
      <td>${hours}h ${minutes}m</td>
      <td>${r.tsPath}</td>
    </tr>`
  }).join('');
  let minutes = totalTime/60;
  let hours = Math.floor(minutes/60);
  minutes = minutes%60;
  content += `<tr style="font-weight: 600">
    <td>Total Time</td>
    <td>${hours}h ${minutes}m</td>
    <td>-</td>
  </tr>`;
  content+=`</table>`;
  document.getElementById('worklog-ext-timesheet-logs').innerHTML = content;
  return result;
}

const renderWorkLogExtension = (dateStr, d) => {
  fetchGoogleCalenderEvents(dateStr);
  document.getElementById('worklog-ext-timesheet-login-error').className = 'hidden';
  document.getElementById('worklog-ext-timesheet-login-success').className = '';
  document.getElementById('worklog-ext-loader-icon').className = 'hidden';
  //clearInterval(timesheetLoginInterval);
  if(timesheetEnabled) {
    let myDoc = new DOMParser();
    let myElement = myDoc.parseFromString(d, 'text/html');
    let tsTable = myElement.getElementById('ts_daily_entries');

    if(tsTable && tsTable.getElementsByTagName('tbody')[1].textContent.indexOf('No entry') >= 0){
      chrome.storage.local.set({ grzLastLogged: new Date(dateStr.split('T')[0] + 'T14:00:00.000Z').toISOString() }).then(() => {
        console.log("lastLoggedIsSet");
      });
      document.getElementById('worklog-ext-timesheet-logs').innerHTML = `<tr><td class="calendar_totals_line_weekly_right" colspan="6" align="right"> Daily Total: <span class="calendar_total_value_weekly">0h 0m</span></td></tr>`
    } else if (tsTable) {
      let lastTimeEntry = tsTable.getElementsByTagName('tbody')[1].getElementsByTagName('tr')[0].getElementsByTagName('td')[4].getElementsByTagName('div')[0].textContent
      document.getElementById('worklog-ext-timesheet-logs').innerHTML = tsTable.getElementsByTagName('tbody')[1].outerHTML;
      lastTimeEntry = lastTimeEntry.split('-')[1].trim();
      let hour = lastTimeEntry.split(':')[0];
      let minutes = lastTimeEntry.split(':')[1].replace('am','').replace('pm','');
      if(lastTimeEntry.indexOf('pm')>=0){
        // 10pm then 10+12 = 22
        // 12pm then 12+12 = 24
        hour = parseInt(hour);
        if (hour != 12){
          hour = hour + 12;
        }
      }
      chrome.storage.local.set({ grzLastLogged: new Date( dateStr.split('T')[0] + `T${hour<10?(`0${hour}`):hour}:${minutes}:00.000Z`).toISOString() }).then(() => {
        console.log("lastLoggedIsSet");
      });
    }
  }
  getTodaysJiraWorklog(dateStr.split('T')[0]);
  initializeWorkLogExt();
}
const checkTimesheetLogin = async () => {
  let result = await chrome.storage.local.get('logDate');
  console.log('storage logDate: ', result);
  let paramString = '';
  let dateStr = new Date().toISOString();
  if(false && result.logDate){
    let logDate = result.logDate;
    dateStr = logDate;
    paramString = `?month=${logDate.split('-')[1]}&year=${logDate.split('-')[0]}&day=${logDate.split('-')[2]}`;
  }
  console.log('paramString = '+paramString);
  if(timesheetEnabled) {
    fetch("https://timesheet.grazitti.com/daily.php"+paramString, timesheetOptions).then(res => res.text()).then(async d => {
      renderWorkLogExtension(dateStr, d);
    }).catch(e => {
      console.log(e);
      document.getElementById('worklog-ext-timesheet-login-error').className = '';
      document.getElementById('worklog-ext-timesheet-login-success').className = 'hidden';
    });
  } else {
    renderWorkLogExtension(dateStr, '');
  }
}

const fetchTimesheetEntriesForDate = (dateStr) => {
  fetch(`https://timesheet.grazitti.com/daily.php?month=${dateStr.split('-')[1]}&year=${dateStr.split('-')[0]}&day=${dateStr.split('-')[2]}`, timesheetOptions).then(res => res.text()).then(d => {
    let myDoc = new DOMParser();
    let myElement = myDoc.parseFromString(d, 'text/html');
    let tsTable = myElement.getElementById('ts_daily_entries');
    if(tsTable && tsTable.getElementsByTagName('tbody')[1].textContent.indexOf('No entry') >= 0){
      chrome.storage.local.set({ grzLastLogged: new Date(dateStr + 'T14:00:00.000Z').toISOString() }).then(() => {
        console.log("lastLoggedIsSet");
      });
      document.getElementById('worklog-ext-timesheet-logs').innerHTML = `<tr><td class="calendar_totals_line_weekly_right" colspan="6" align="right"> Daily Total: <span class="calendar_total_value_weekly">0h 0m</span></td></tr>`
    } else if (tsTable) {
      let lastTimeEntry = tsTable.getElementsByTagName('tbody')[1].getElementsByTagName('tr')[0].getElementsByTagName('td')[4].getElementsByTagName('div')[0].textContent
      document.getElementById('worklog-ext-timesheet-logs').innerHTML = tsTable.getElementsByTagName('tbody')[1].outerHTML;
      lastTimeEntry = lastTimeEntry.split('-')[1].trim();
      let hour = lastTimeEntry.split(':')[0];
      let minutes = lastTimeEntry.split(':')[1].replace('am','').replace('pm','');
      if(lastTimeEntry.indexOf('pm')>=0){
        hour = parseInt(hour);
        if (hour != 12){
          hour = hour + 12;
        }
      }
      chrome.storage.local.set({ grzLastLogged: new Date(dateStr + `T${hour<10?(`0${hour}`):hour}:${minutes}:00.000Z`).toISOString() }).then(() => {
        console.log("lastLoggedIsSet");
      });
    }
  }).catch(e => {
    console.log(e);
  });
}

const logDateChange = (e, noGoogle) => {
  let logDate = document.getElementById('worklog-ext-worklog-date').value;
  chrome.storage.local.set({ logDate: logDate }).then(() => {
    console.log("logDate updated");
  });
  if(timesheetEnabled) {
    fetchTimesheetEntriesForDate(logDate);
  } else {
    getTodaysJiraWorklog(logDate);
  }
  if(!noGoogle) {
    fetchGoogleCalenderEvents(logDate);
  }
  
}

const logMessageChange = () => {
  let logMessage = document.getElementById('worklog-ext-comment').value;
  chrome.storage.local.set({ logMessage: logMessage }).then(() => {
    console.log("logMessage updated");
  });
}

const projectChange = () => {
  let projectId = document.getElementById('worklog-ext-project').value;
  chrome.storage.local.set({ selectedProject: projectId }).then(() => {
    console.log("selectedProject updated");
  });
  console.log('project change called',projectId);
  fetchTimesheetTasks(projectId);
}
const clientChange = () => {
  let clientId = document.getElementById('worklog-ext-client').value;
  chrome.storage.local.set({ selectedClient: clientId }).then(() => {
    console.log("selectedClient updated");
  });
  console.log('client change called',clientId);
  fetchTimesheetProjects(clientId);
}

const taskChange = () => {
  let taskId = document.getElementById('worklog-ext-task').value;
  chrome.storage.local.set({ selectedTask: taskId }).then(() => {
    console.log("selectedTask updated");
  });
  console.log('task change called',taskId);
  fetchTimesheetTags(taskId);
}

const populateOptions = (selectElement, optionData, type) => {
  selectElement.options.length = 0;
  let id = -1;
  let selectedId = -1;
  let value = '';
  if(type == 'client'){
    selectedId = extLocalStorage.selectedClient ? extLocalStorage.selectedClient : -1;
    value = extLocalStorage.selectedClientName ? extLocalStorage.selectedClientName : '';
  } else if (type == 'project') {
    selectedId = extLocalStorage.selectedProject ? extLocalStorage.selectedProject : -1;
    value = extLocalStorage.selectedProjectName ? extLocalStorage.selectedProjectName : '';
  }  else if (type == 'task') {
    selectedId = extLocalStorage.selectedTask ? extLocalStorage.selectedTask : -1;
    value = extLocalStorage.selectedTaskName ? extLocalStorage.selectedTaskName : '';
  }
  console.log('selected Value: ',value, selectedId);
  let selectedIndex = 0;
  optionData.map(od => {
    if(selectElement.options.length == 0){
      id = od[1];
    }
    if(od[1] == selectedId) {
      id = selectedId;
      console.log('selectedID: ',selectedId);
      selectedIndex = selectElement.options.length;
    }
    // option 0 is label, option 1 is value
    selectElement.options[selectElement.options.length] = new Option(od[0], od[1]);
    return '';
  });

  selectElement.selectedIndex = selectedIndex;

  if(id != -1) {
    if (type === 'client') {
      fetchTimesheetProjects(id);
    } else if(type === 'project') {
      fetchTimesheetTasks(id);
    } else if(type == 'task') {
      fetchTimesheetTags(id);
    }
  }
}
const fetchTimesheetClients = () => {
  console.log('fetching timesheet clients');
  
  return chrome.storage.local.get(["grzClients"]).then((result) => {
    if(result && result.grzClients && result.grzClients.length > 0) {
      let clientData = result.grzClients;
      let clientSelect = document.getElementById('worklog-ext-client');
      populateOptions(clientSelect, clientData, 'client');
    } else {
      return fetch("https://timesheet.grazitti.com/ajax/daily_filters.php?type=client", timesheetPostOptions).then(res => res.text()).then(text => {
        let myDoc = new DOMParser();
        let myElement = myDoc.parseFromString(text, 'text/html');
        let clients = myElement.getElementsByTagName('li');
        
        let clientData = [];
        for(i=0;i<clients.length;i++){
          let c = clients[i]; 
          clientData.push([c.innerText, c.id]);
        }

        chrome.storage.local.set({ grzClients: clientData }).then(() => {
          console.log("Value is set");
        });

        let clientSelect = document.getElementById('worklog-ext-client');
        populateOptions(clientSelect, clientData, 'client');
        //clientSelect.innerHtml = myDoc.parseFromString(clientHtml, 'text/html');
        return clientData;
      });
    }
    
  });
  
}

const fetchTimesheetProjects = (clientId) => {
  console.log('fetching timesheet Projects');
  return chrome.storage.local.get(["grzProjects"]).then((result) => {
    if(result && result.grzProjects && result.grzProjects[clientId]){
      let projectData = result.grzProjects[clientId];
      let projectSelect = document.getElementById('worklog-ext-project');
      populateOptions(projectSelect, projectData, 'project');
    } else {
      return fetch(`https://timesheet.grazitti.com/ajax/daily_filters.php?type=project&client_id=${clientId}`, timesheetPostOptions).then(res => res.text()).then(text => {
        let myDoc = new DOMParser();
        let myElement = myDoc.parseFromString(text, 'text/html');
        let projects = myElement.getElementsByTagName('li');
        
        let projectData = [];
        for(i=0;i<projects.length;i++){
          let c = projects[i]; 
          projectData.push([c.innerText, c.id]);
        }

        let grzProjects = {};
        if(result && result.grzProjects){
          grzProjects = result.grzProjects;
        }
        grzProjects[clientId] = projectData;
        
        chrome.storage.local.set({ grzProjects: grzProjects }).then(() => {
          console.log("Value is set");
        });
        let projectSelect = document.getElementById('worklog-ext-project');
        populateOptions(projectSelect, projectData, 'project');

        return projectData;
      });
    }
  });

}

const fetchTimesheetTasks = (projectId) => {
  console.log('fetching timesheet Tasks');
  return chrome.storage.local.get(["grzTasks"]).then((result) => {
    if(result && result.grzTasks && result.grzTasks[projectId]){
      let taskData = result.grzTasks[projectId]
      let taskSelect = document.getElementById('worklog-ext-task');
      populateOptions(taskSelect, taskData, 'task');
    } else {
      return fetch(`https://timesheet.grazitti.com/ajax/daily_filters.php?type=task&project_id=${projectId}`, timesheetPostOptions).then(res => res.text()).then(text => {
        let myDoc = new DOMParser();
        let myElement = myDoc.parseFromString(text, 'text/html');
        let tasks = myElement.getElementsByTagName('li');
        
        let taskData = [];
        for(i=0;i<tasks.length;i++){
          let c = tasks[i]; 
          taskData.push([c.innerText, c.id]);
        }

        let grzTasks = {};
        if(result && result.grzTasks){
          grzTasks = result.grzTasks;
        }
        grzTasks[projectId] = taskData;
        
        chrome.storage.local.set({ grzTasks: grzTasks }).then(() => {
          console.log("Value is set");
        });

        let taskSelect = document.getElementById('worklog-ext-task');
        populateOptions(taskSelect, taskData, 'task');

        return taskData;
      });
    }
  });

}

const fetchTimesheetTags = (taskId) => {
  console.log('fetching timesheet Tags');
  return chrome.storage.local.get(["grzTags"]).then((result) => {
    if(result && result.grzTags && result.grzTags[taskId]){
      let tagData = result.grzTags[taskId]
      let tagSelect = document.getElementById('worklog-ext-tag');
      populateOptions(tagSelect, tagData, 'tag');
    } else {
      return fetch(`https://timesheet.grazitti.com/ajax/daily_filters.php?type=tag&task_id=${taskId}&taglist=1`, timesheetPostOptions).then(res => res.text()).then(text => {
        let myDoc = new DOMParser();
        let myElement = myDoc.parseFromString(text, 'text/html');
        let tags = myElement.getElementsByTagName('li');
        
        let tagData = [];
        for(i=0;i<tags.length;i++){
          let c = tags[i]; 
          tagData.push([c.innerText, c.id]);
        }

        let grzTags = {};
        if(result && result.grzTags){
          grzTags = result.grzTags;
        }
        grzTags[taskId] = tagData;
        
        chrome.storage.local.set({ grzTags: grzTags }).then(() => {
          console.log("Tag value is set");
        });

        let tagSelect = document.getElementById('worklog-ext-tag');
        populateOptions(tagSelect, tagData, 'tag');
        return tagData;
      });
    }
  });

}

const fetchGoogleCalenderEvents = async (dateStr) => {
  chrome.identity.getAuthToken({ interactive: true }, async function (token) {
    //initialization (think they're all the same)
    //console.log('google auth token-----', token);
    let init = {
      method: "GET",
      async: true,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
     contentType: "json",
    };

    async function getCalendarId() {
      return new Promise((resolve, reject) => {
        fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary",
          init
        )
          .then((response) => response.json()) // Transform the data into json
          .then(function (data) {
            console.log(data["id"]);
            var id = data["id"];
            resolve(id);
          });
      });
    }
    calendarId = await getCalendarId();
    await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/" +
        calendarId +
        `/events?timeMax=${dateStr.split('T')[0]}T23%3A59%3A00Z&timeMin=${dateStr.split('T')[0]}T00%3A00%3A00Z&singleEvents=true`,
      init
    )
      .then((response) => response.json()) // Transform the data into json
      .then(async function (data) {
        let selectElement = document.getElementById('worklog-ext-calender-meet');
        selectElement.options.length = 0;
        let uniqueEvents = {};
        if(data && data.items && data.items.length){
          
          data.items.map(e => {
            let eventDate = e && e.start ? e.start.dateTime.split('T')[0] : '';
            console.log(eventDate, dateStr.split('T')[0]);
            if(e.status != 'cancelled' && eventDate === dateStr.split('T')[0]) {
              //console.log(e);
              // option 0 is label, option 1 is value
              if(!uniqueEvents[e.summary]){
                selectElement.options[selectElement.options.length] = new Option(e.summary, JSON.stringify({summary: e.summary, startTime: e.start, endTime: e.end}));
                uniqueEvents[e.summary] = 1;
              }
              return '';
            }
          });
        }
      });
  });
}
const logWorkInJira = (body) => {
  const bodyData = `{
      "comment": "${body.comment}",
      "started": "${body.startTime}",
      "timeSpentSeconds": ${body.timeSpentSeconds}
    }`;

  fetch(`https://jira.grazitti.com/rest/api/latest/issue/${body.jiraId}/worklog`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: bodyData
  })
    .then(response => {
      console.log(
        `Response: ${response.status} ${response.statusText}`
      );
      return response.text();
    })
    .then(text => {
      console.log(text);
      document.getElementById('worklog-ext-comment').value='';
      logMessageChange();
      document.getElementById('worklog-ext-btn').className = '';
      document.getElementById('worklog-ext-api-response').className = '';
      setTimeout(() => {
        document.getElementById('worklog-ext-api-response').className = 'hidden';
      },5000)
      document.getElementById('worklog-ext-log-response-loader').className = 'hidden';
      logDateChange(null, true);
    })
    .catch(err => {
      document.getElementById('worklog-ext-btn').className = '';
      document.getElementById('worklog-ext-api-response-error').className = '';
      document.getElementById('worklog-ext-log-response-loader').className = 'hidden';
      
    });
}

const logWorkInTimesheet = (body, cb) => {
  if(timesheetEnabled) {
    fetch("https://timesheet.grazitti.com/ajax/daily_ts_action.php", {
      "headers": {
        "accept": "*/*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "sec-ch-ua": "\"Chromium\";v=\"116\", \"Not)A;Brand\";v=\"24\", \"Google Chrome\";v=\"116\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-requested-with": "XMLHttpRequest"
      },
      "referrer": "https://timesheet.grazitti.com/daily.php?month=9&year=2023&day=4",
      "referrerPolicy": "strict-origin-when-cross-origin",
      "body": `destination=daily&year=${body.year}&month=${body.month}&day=${body.day}&client_id=${body.clientId}&proj_id=${body.projectId}&task_id=${body.taskId}&tag_id=&tag_count=&edit=1&del=1&transNum=&clients=${body.clientName}&projects=${body.projectName}&tasks=${body.taskName}&clock_on_time_hour=${body.startTimeHour}&clock_on_time_min=${body.startTimeMinute}&clock_off_time_hour=${body.endTimeHour}&clock_off_time_min=${body.endTimeMinute}&log_message=${body.logMessage}`,
      "method": "POST",
      "mode": "cors",
      "credentials": "include"
    }).then(res => {
      console.log('after timesheet log ');
      cb(res);
    });
  } else {
    cb({});
  }
}

const logWorkInTimesheetFromCalender = (body, cb) => {
  if(timesheetEnabled) {
    let params = new URLSearchParams(body);
    fetch("https://timesheet.grazitti.com/ajax/calender_filters.php", {
      "headers": {
        "accept": "*/*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "sec-ch-ua": "\"Chromium\";v=\"116\", \"Not)A;Brand\";v=\"24\", \"Google Chrome\";v=\"116\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-requested-with": "XMLHttpRequest"
      },
      "referrer": "https://timesheet.grazitti.com/dailyHuddle.php",
      "referrerPolicy": "strict-origin-when-cross-origin",
      "body": "formSubmit=formSubmit&submit%5B%5D=dTimesheet&" + params.toString(),
      "method": "POST",
      "mode": "cors",
      "credentials": "include"
    }).then(res => {
      console.log('after timesheet log ');
      cb(res);
    });
  } else {
    cb({});
  }
}

const getTime = (date) => {
  const shortTime = new Intl.DateTimeFormat("en", {
    timeStyle: "short",
  });
  let timeStr = shortTime.format(date).toLowerCase().replace(' ', '');
  if(timeStr.length == 6)
    timeStr = '0'+timeStr;

  return timeStr; 
}

const toISOStringWithTimezone = date => {
  date = new Date(date.toISOString().replace('.000Z',''));
  const tzOffset = -date.getTimezoneOffset();
  const diff = tzOffset >= 0 ? '+' : '-';
  const pad = n => `${Math.floor(Math.abs(n))}`.padStart(2, '0');
  return date.getFullYear() +
    '-' + pad(date.getMonth() + 1) +
    '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) +
    ':' + pad(date.getMinutes()) +
    ':' + pad(date.getSeconds()) +
    '.000Z';
};

const logWork = () => {
  // hide submit button and show loader
  document.getElementById('worklog-ext-btn').className = 'hidden';
  document.getElementById('worklog-ext-api-response').className = 'hidden';
  document.getElementById('worklog-ext-log-response-loader').className = '';

  ///////////
  let clientSelect = document.getElementById('worklog-ext-client');
  let projectSelect = document.getElementById('worklog-ext-project');
  let taskSelect = document.getElementById('worklog-ext-task');
  
  chrome.storage.local.get(["grzLastLogged"]).then(result => {
    if(result && result.grzLastLogged) {
      let radios = document.querySelectorAll('input[type=radio][name="worklog-type"]');
      let selectedType = 'comment';
      for (i=0;i<radios.length;i++){
        if(radios[i].checked){
          selectedType = radios[i].value;
        }
      }
      let body = {};
      body.comment = '';
      body.jiraId = document.getElementById('worklog-ext-jiraid').value;
      body.startTime = new Date(document.getElementById('worklog-ext-worklog-date').value).toISOString().replace('Z', '+0000');
      
      if(selectedType == 'comment') {
        body.comment = document.getElementById('worklog-ext-comment').value;
        let timeSpentStr = document.getElementById('worklog-ext-time-spent').value;

        let timeSpentArr = timeSpentStr.split(new RegExp(/[,\s]+/));
        body.timeSpentSeconds = 0;
        timeSpentArr.map(timeSpent => {
          if(timeSpent && timeSpent.indexOf('h') > 0) {
            body.timeSpentSeconds += parseInt(timeSpent) * 3600;
          } else if (timeSpent && timeSpent.indexOf('m') > 0) {
            body.timeSpentSeconds += parseInt(timeSpent) * 60;
          } else {
            alert('Invalid time format, please specify in hours or minutes for e.g. 2h, 30m etc');
            return;
          }
        });
        console.log(JSON.stringify(body, undefined, 2));

        let lastLogTime = result.grzLastLogged;
        let startTimeHour = lastLogTime.split('T')[1].split(':')[0];
        let startTimeMinute = lastLogTime.split('T')[1].split(':')[1];

        let endTime = new Date(new Date(lastLogTime).getTime() + (body.timeSpentSeconds*1000)).toISOString();
        let endTimeHour = endTime.split('T')[1].split(':')[0];
        let endTimeMinute = endTime.split('T')[1].split(':')[1];

        let timesheetPayload = {
          year: body.startTime.split('-')[0],
          month: body.startTime.split('-')[1],
          day: body.startTime.split('T')[0].split('-')[2],
          clientId: document.getElementById('worklog-ext-client').value,
          projectId: document.getElementById('worklog-ext-project').value,
          taskId: document.getElementById('worklog-ext-task').value,
          tagId: document.getElementById('worklog-ext-tag').value,
          clientName: clientSelect.options[clientSelect.selectedIndex].text,
          projectName: projectSelect.options[projectSelect.selectedIndex].text,
          taskName: taskSelect.options[taskSelect.selectedIndex].text,
          startTimeHour: startTimeHour,
          startTimeMinute: startTimeMinute,
          endTimeHour: endTimeHour,
          endTimeMinute: endTimeMinute,
          logMessage: body.jiraId?(body.jiraId + ' ' + body.comment): body.comment
        };

        console.log('timesheetPayload', JSON.stringify(timesheetPayload,undefined,2));
        logWorkInTimesheet(timesheetPayload, (res) => {
          chrome.storage.local.set({ grzLastLogged: endTime }).then(() => {
            console.log("lastLoggedIsSet");
          });
          console.log('timesheet logged');
          
          if(body.jiraId) {
            updateTimesheeetPathForJira(body.jiraId, `client:${timesheetPayload.clientName}~project:${timesheetPayload.projectName}~task:${timesheetPayload.taskName}`);
            logWorkInJira(body);
          } else {
            document.getElementById('worklog-ext-comment').value='';
            logMessageChange();
            document.getElementById('worklog-ext-btn').className = '';
            document.getElementById('worklog-ext-api-response').className = '';
            setTimeout(() => {
              document.getElementById('worklog-ext-api-response').className = 'hidden';
            },5000)
            document.getElementById('worklog-ext-log-response-loader').className = 'hidden';
            logDateChange(null, true);
          }
        })
      } else {
        let calenderValue = document.getElementById('worklog-ext-calender-meet');
        var selected = [...calenderValue.selectedOptions]
                        .map(option => JSON.parse(option.value));
        let lastLogTime = result.grzLastLogged;

        let timesheetPayload = {
          dater: toISOStringWithTimezone(new Date(lastLogTime)).split('T')[0]
        };
        let i=1;
        console.log(selected);
        let totalTimeSpent = 0;
        let completeMessage = '';
        selected.map(d => {
          let startTimeStr = getTime(new Date(lastLogTime.replace('.000Z', '')));
          let timeSpan = new Date(d.endTime.dateTime).getTime() - new Date(d.startTime.dateTime).getTime();
          let endTime = new Date(new Date(lastLogTime.replace('.000Z', '')).getTime() + timeSpan);
          totalTimeSpent += timeSpan;
          let endTimeStr = getTime(endTime);
          let duration = startTimeStr + ' ' + endTimeStr;
          timesheetPayload['client_'+i] = document.getElementById('worklog-ext-client').value
          timesheetPayload['project_'+i] = document.getElementById('worklog-ext-project').value
          timesheetPayload['task_'+i] = document.getElementById('worklog-ext-task').value
          timesheetPayload['tag_'+i] = document.getElementById('worklog-ext-tag').value
          timesheetPayload['message_'+i] = body.jiraId?(body.jiraId + ' ' + d.summary): d.summary;
          timesheetPayload['duration_'+i] =  duration;

          completeMessage += d.summary + '\\n';

          i = i + 1;
          lastLogTime = endTime.toString();
        });
        lastLogTime = toISOStringWithTimezone(new Date(lastLogTime));
        logWorkInTimesheetFromCalender(timesheetPayload,(res) => {

          chrome.storage.local.set({ grzLastLogged: lastLogTime }).then(() => {
            console.log("lastLoggedIsSet");
          });
          console.log('timesheet logged');
          body.timeSpentSeconds = totalTimeSpent / 1000;
          body.comment = completeMessage;
          if(body.jiraId) {
            let clientName = clientSelect.options[clientSelect.selectedIndex].text;
            let projectName = projectSelect.options[projectSelect.selectedIndex].text;
            let taskName = taskSelect.options[taskSelect.selectedIndex].text;
            
            updateTimesheeetPathForJira(body.jiraId, `client:${clientName}~project:${projectName}~task:${taskName}`);
            logWorkInJira(body);
          } else {
            document.getElementById('worklog-ext-comment').value='';
            logMessageChange();
            document.getElementById('worklog-ext-btn').className = '';
            document.getElementById('worklog-ext-api-response').className = '';
            setTimeout(() => {
              document.getElementById('worklog-ext-api-response').className = 'hidden';
            },5000)
            document.getElementById('worklog-ext-log-response-loader').className = 'hidden';
            logDateChange(null, true);
        }
            
        });
      }
    }
  });
};

const clearCache = async () => {
  await chrome.storage.local.remove(["grzClients","grzProjects","grzTasks"]);
  alert('Cache cleared');
}

const addDefaultEvents = () => {
  let deleteCacheButton = document.getElementById('clear-cache-button');
  fetchTimesheetClients();
  deleteCacheButton.removeEventListener('click', clearCache);
  deleteCacheButton.addEventListener('click', clearCache);

}
setTimeout(() => {
  addDefaultEvents();
  checkTimesheetLogin();
},300);