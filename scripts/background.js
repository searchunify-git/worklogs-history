console.log('hello background')

const removeOldJiraInterval = setInterval(async () => {
    let result = await chrome.storage.local.get(["recentJiraTabsVisited"]);
    let recentJiraTabsVisited = result.recentJiraTabsVisited;
    if(recentJiraTabsVisited && recentJiraTabsVisited.length) {
        recentJiraTabsVisited = recentJiraTabsVisited.filter(recentTab => {
            return new Date().getTime() - recentTab.ts < 48*3600000; // 1 hour
        });
        await chrome.storage.local.set({ recentJiraTabsVisited: recentJiraTabsVisited });
    }
}, 10000);

const activeTabChanged = async (activeInfo) => {
    // console.log('active tab changed');
    // console.log(activeInfo);
    let tabs = await chrome.tabs.query({active: true, windowId: activeInfo.windowId});
    if(tabs && tabs.length){
        let tab = tabs[0];
        let matchedPatterns = tab.url.match(new RegExp(/https:\/\/jira\.grazitti\.com\/browse\/([^\?$]+)/));
        if(matchedPatterns && matchedPatterns.length>1) {
            let jiraId = matchedPatterns[1];
            let title = tab.title;
            let result = await chrome.storage.local.get(["recentJiraTabsVisited"]);
            let recentJiraTabsVisited = result.recentJiraTabsVisited;
            if(!recentJiraTabsVisited || typeof recentJiraTabsVisited.length == 'undefined') {
                recentJiraTabsVisited = [];
            }
            let alreadyPresent = false;
            recentJiraTabsVisited.map(recentTab => {
                if(recentTab.url == tab.url) {
                    alreadyPresent = true;
                    recentTab.jiraId = jiraId,
                    recentTab.ts = new Date().getTime();
                }
            });
            if(!alreadyPresent){
                recentJiraTabsVisited.push({
                    jiraId: jiraId,
                    title: tab.title,
                    url: tab.url,
                    ts: new Date().getTime()
                });
            }
            await chrome.storage.local.set({ recentJiraTabsVisited: recentJiraTabsVisited });
        }
    }
}

chrome.tabs.onActivated.addListener(activeTabChanged);