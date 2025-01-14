import func from "@/util/func";
import api from "./api";
import React, {  } from 'react'
import { Text,HorizontalStack, Badge, Link, List, Box, Icon, VerticalStack, Avatar, Button, ButtonGroup, Tag} from '@shopify/polaris';
import { history } from "@/util/history";
import PersistStore from "../../../main/PersistStore";
import observeFunc from "../observe/transform";
import TooltipText from "../../components/shared/TooltipText";
import { circle_cancel, circle_tick_minor } from "../../components/icons";
import {ResourcesMajor,
  CollectionsMajor,
  FlagMajor,
  CreditCardSecureMajor,
  MarketingMajor,
  FraudProtectMajor} from '@shopify/polaris-icons';

const MAX_SEVERITY_THRESHOLD = 100000;

function getStatus(state) {
  return state._name ? state._name : (state.name ? state.name : state)
}

function getOrderPriority(state) {
  let status = getStatus(state);
  switch (status) {
    case "RUNNING": return 1;
    case "SCHEDULED": return 2;
    case "STOPPED": return 4;
    case "FAILED":
    case "FAIL": return 5;
    default: return 3;
  }
}

function getTestingRunType(testingRun, testingRunResultSummary, cicd) {
  if (testingRunResultSummary.metadata != null || cicd) {
    return 'CI/CD';
  }
  if (testingRun.scheduleTimestamp >= func.timeNow() && testingRun.scheduleTimestamp < func.timeNow() + 86400) {
    return 'Recurring';
  }
  return 'One-time'
}

function getTotalSeverity(countIssues) {
  let ts = 0;
  if (countIssues == null) {
    return 0;
  }
  ts = MAX_SEVERITY_THRESHOLD * (countIssues['High'] * MAX_SEVERITY_THRESHOLD + countIssues['Medium']) + countIssues['Low']
  return ts;
}

function getTotalSeverityTestRunResult(severity) {
  if (severity == null || severity.length == 0) {
    return 0;
  }
  let ts = MAX_SEVERITY_THRESHOLD * ((severity[0].includes("High")) * MAX_SEVERITY_THRESHOLD + (severity[0].includes('Medium'))) + (severity[0].includes('Low'))
  return ts;
}

function getRuntime(scheduleTimestamp, endTimestamp, state) {
  let status = getStatus(state);
  if (status === 'RUNNING') {
    return "Currently running";
  }
  const currTime = Date.now();
  if (endTimestamp <= 0) {
    if (currTime > scheduleTimestamp) {
      return "Was scheduled for " + func.prettifyEpoch(scheduleTimestamp)
    } else {
      return "Next run in " + func.prettifyEpoch(scheduleTimestamp)
    }
  }
  return 'Last run ' + func.prettifyEpoch(endTimestamp);
}

function getAlternateTestsInfo(state) {
  let status = getStatus(state);
  switch (status) {
    case "RUNNING": return "Tests are still running";
    case "SCHEDULED": return "Tests have been scheduled";
    case "STOPPED": return "Tests have been stopped";
    case "FAILED":
    case "FAIL": return "Test execution has failed during run";
    default: return "Information unavailable";
  }
}

function getTestsInfo(testResultsCount, state){
    return (testResultsCount == null) ? getAlternateTestsInfo(state) : testResultsCount
}

function minimizeTagList(items){
  if(items.length>1){

    let ret = items.slice(0,1)
    ret.push(`+${items.length-1} more`)
    return ret;
  }
  return items;
}

function checkTestFailure(summaryState, testRunState) {
  if (testRunState == 'COMPLETED' && summaryState != 'COMPLETED') {
    return true;
  }
  return false;
}

function getCweLink(item) {
  let linkUrl = ""
  let cwe = item.split("-")
  if (cwe[1]) {
    linkUrl = `https://cwe.mitre.org/data/definitions/${cwe[1]}.html`
  }
  return linkUrl;
}

function getCveLink(item) {
  return `https://nvd.nist.gov/vuln/detail/${item}`
}

const transform = {
  tagList: (list, linkType) => {

    let ret = list?.map((tag, index) => {

        let linkUrl = ""
        switch(linkType){
          case "CWE":
            linkUrl = getCweLink(tag)
            break;
          case "CVE":
            linkUrl = getCveLink(tag)
            break;
            default:
            break;
        }

        return (
          <Link key={index} url={linkUrl} target="_blank">
            <Badge progress="complete" key={index}>{tag}</Badge>
          </Link>
        )
      })
      return ret;
    },
    prepareDataFromSummary : (data, testRunState) => {
      let obj={};
      obj['testingRunResultSummaryHexId'] = data?.hexId;
      let state = data?.state;
      if(checkTestFailure(state, testRunState)){
        state = 'FAIL'
      }
      obj['orderPriority'] = getOrderPriority(state)
      obj['icon'] = func.getTestingRunIcon(state);
      obj['iconColor'] = func.getTestingRunIconColor(state)
      obj['summaryState'] = getStatus(state)
      obj['startTimestamp'] = data?.startTimestamp
      obj['endTimestamp'] = data?.endTimestamp
      obj['severity'] = func.getSeverity(data?.countIssues)
      obj['severityStatus'] = func.getSeverityStatus(data?.countIssues)
      obj['metadata'] = func.flattenObject(data?.metadata)
      return obj;
    },
    prepareCountIssues : (data) => {
      let obj={
        'High': data['HIGH'] || 0,
        'Medium': data['MEDIUM'] || 0,
        'Low': data['LOW'] || 0
      };
      return obj;
    },
    prettifyTestName: (testName, icon, iconColor, state)=>{
      let iconComp
      switch(state){
        case "COMPLETED":
          iconComp = (<Box><Icon source={circle_tick_minor} /></Box>)
          break;
        case "STOPPED":
          iconComp = (<Box><Icon source={circle_cancel} /></Box>)
          break;
        default:
          iconComp = (<Box><Icon source={icon} color={iconColor}/></Box>)
          break;
      }
      return(
        <HorizontalStack gap={4}>
          {iconComp}
          <Box maxWidth="350px">
            <TooltipText text={testName} tooltip={testName} textProps={{fontWeight: 'medium'}} />
          </Box>
        </HorizontalStack>
      )
    },
    filterObjectByValueGreaterThanZero: (obj)=> {
      const result = {};
    
      for (const key in obj) {
        if (obj.hasOwnProperty(key) && obj[key] > 0) {
          result[key] = obj[key];
        }
      }
    
      return result;
    },
  
  prepareTestRun: (data, testingRunResultSummary, cicd,prettified) => {
    let obj = {};
    if (testingRunResultSummary == null) {
      testingRunResultSummary = {};
    }
    if (testingRunResultSummary.countIssues != null) {
      testingRunResultSummary.countIssues = transform.prepareCountIssues(testingRunResultSummary.countIssues);
    }

    let state = data.state;
    if (checkTestFailure(testingRunResultSummary.state, state)) {
      state = 'FAIL'
    }

      obj['id'] = data.hexId;
      obj['testingRunResultSummaryHexId'] = testingRunResultSummary?.hexId;
      obj['orderPriority'] = getOrderPriority(state)
      obj['icon'] = func.getTestingRunIcon(state);
      obj['iconColor'] = func.getTestingRunIconColor(state)
      obj['name'] = data.name || "Test"
      obj['number_of_tests'] = data.testIdConfig == 1 ? "-" : getTestsInfo(testingRunResultSummary?.testResultsCount, state)
      obj['run_type'] = getTestingRunType(data, testingRunResultSummary, cicd);
      obj['run_time_epoch'] = Math.max(data.scheduleTimestamp,data.endTimestamp)
      obj['scheduleTimestamp'] = data.scheduleTimestamp
      obj['pickedUpTimestamp'] = data.pickedUpTimestamp
      obj['run_time'] = getRuntime(data.scheduleTimestamp ,data.endTimestamp, state)
      obj['severity'] = func.getSeverity(testingRunResultSummary.countIssues)
      obj['total_severity'] = getTotalSeverity(testingRunResultSummary.countIssues);
      obj['severityStatus'] = func.getSeverityStatus(testingRunResultSummary.countIssues)
      obj['runTypeStatus'] = [obj['run_type']]
      obj['nextUrl'] = "/dashboard/testing/"+data.hexId
      obj['testRunState'] = data.state
      obj['summaryState'] = state
      obj['startTimestamp'] = testingRunResultSummary?.startTimestamp
      obj['endTimestamp'] = testingRunResultSummary?.endTimestamp
      obj['metadata'] = func.flattenObject(testingRunResultSummary?.metadata)
      if(prettified){
        const prettifiedTest={
          ...obj,
          testName: transform.prettifyTestName(data.name || "Test", func.getTestingRunIcon(state),func.getTestingRunIconColor(state), state),
          severity: observeFunc.getIssuesList(transform.filterObjectByValueGreaterThanZero(testingRunResultSummary.countIssues))
        }
        return prettifiedTest
      }else{
        return obj
      }
    },
    prepareTestRuns : (testingRuns, latestTestingRunResultSummaries, cicd, prettified) => {
      let testRuns = []
      testingRuns.forEach((data)=>{
        let obj={};
        let testingRunResultSummary = latestTestingRunResultSummaries[data['hexId']] || {};
        obj = transform.prepareTestRun(data, testingRunResultSummary, cicd, prettified)
        testRuns.push(obj);
    })
    return testRuns;
    },
    prepareTestRunResult : (hexId, data, subCategoryMap, subCategoryFromSourceConfigMap) => {
      let obj = {};
      obj['id'] = data.hexId;
      obj['name'] = func.getRunResultSubCategory(data, subCategoryFromSourceConfigMap, subCategoryMap, "testName")
      obj['detected_time'] = (data['vulnerable'] ? "Detected " : "Tried ") + func.prettifyEpoch(data.endTimestamp)
      obj["endTimestamp"] = data.endTimestamp
      obj['testCategory'] = func.getRunResultCategory(data, subCategoryMap, subCategoryFromSourceConfigMap, "shortName")
      obj['url'] = (data.apiInfoKey.method._name || data.apiInfoKey.method) + " " + data.apiInfoKey.url 
      obj['severity'] = data.vulnerable ? [func.toSentenceCase(func.getRunResultSeverity(data, subCategoryMap))] : []
      obj['total_severity'] = getTotalSeverityTestRunResult(obj['severity'])
      obj['severityStatus'] = obj["severity"].length > 0 ? [obj["severity"][0]] : []
      obj['categoryFilter'] = [obj['testCategory']]
      obj['testFilter'] = [obj['name']]
      obj['testResults'] = data['testResults'] || []
      obj['errors'] = obj['testResults'].filter((res) => (res.errors && res.errors.length > 0)).map((res) => res.errors.join(", "))
      obj['singleTypeInfos'] = data['singleTypeInfos'] || []
      obj['vulnerable'] = data['vulnerable'] || false
      obj['nextUrl'] = "/dashboard/testing/"+ hexId + "/result/" + data.hexId;
      obj['cwe'] = subCategoryMap[data.testSubType]?.cwe ? subCategoryMap[data.testSubType]?.cwe : []
      obj['cweDisplay'] = minimizeTagList(obj['cwe'])
      obj['cve'] = subCategoryMap[data.testSubType]?.cve ? subCategoryMap[data.testSubType]?.cve : []
      obj['cveDisplay'] = minimizeTagList(obj['cve'])
      return obj;
    },
    prepareTestRunResults : (hexId, testingRunResults, subCategoryMap, subCategoryFromSourceConfigMap) => {
      let testRunResults = []
      testingRunResults.forEach((data) => {
        let obj = transform.prepareTestRunResult(hexId, data, subCategoryMap, subCategoryFromSourceConfigMap);
        if(obj['name'] && obj['testCategory']){
          testRunResults.push(obj);
        }
      })
      return testRunResults;
    },
    issueSummaryTable(issuesDetails, subCategoryMap) {
      if (issuesDetails) {
          return [
              {
                  title: 'Issue category',
                  description: subCategoryMap[issuesDetails.id.testSubCategory].superCategory.displayName
              },
              {
                  title: 'Test run',
                  description: subCategoryMap[issuesDetails.id.testSubCategory].testName
              },
              {
                  title: 'Severity',
                  description: subCategoryMap[issuesDetails.id.testSubCategory].superCategory.severity._name
              },
              {
                  title: 'Endpoint',
                  description: {
                      method: issuesDetails.id.apiInfoKey.method,
                      url: issuesDetails.id.apiInfoKey.url
                  }
              },
              // {
              //     title: 'Collection',
              //     description: this.mapCollectionIdToName[issuesDetails.id.apiInfoKey.apiCollectionId]
              // }
          ]
      }
      return []
  },

  replaceTags(details, vulnerableRequests) {
    let percentageMatch = 0;
    vulnerableRequests?.forEach((request) => {
      let testRun = request['testResults']
      testRun?.forEach((runResult) => {
        if (percentageMatch < runResult.percentageMatch) {
          percentageMatch = runResult.percentageMatch
        }
      })
    })
    return details.replace(/{{percentageMatch}}/g, func.prettifyShort(percentageMatch))
  },

  fillMoreInformation(category, moreInfoSections, affectedEndpoints, jiraIssueUrl, createJiraTicket) {
    var key = /[^/]*$/.exec(jiraIssueUrl)[0];
    const jiraComponent = jiraIssueUrl.length > 0 ? (
      <Box>
              <Tag>
                  <HorizontalStack gap={1}>
                    <Avatar size="extraSmall" shape='round' source="/public/logo_jira.svg" />
                    <Link url={jiraIssueUrl}>
                      <Text>
                        {key}
                      </Text>
                    </Link>
                  </HorizontalStack>
                </Tag>
          </Box>
    ) : <Text> No Jira ticket created. Click on the top right button to create a new ticket.</Text>
    
    //<Box width="300px"><Button onClick={createJiraTicket} plain disabled={window.JIRA_INTEGRATED != "true"}>Click here to create a new ticket</Button></Box>
    let filledSection = []
    moreInfoSections.forEach((section) => {
      let sectionLocal = {}
      sectionLocal.icon = section.icon
      sectionLocal.title = section.title
      switch (section.title) {
        case "Description":
        if(category?.issueDetails == null || category?.issueDetails == undefined){
          return;
        }
          sectionLocal.content = (
            <Text color='subdued'>
              {transform.replaceTags(category?.issueDetails, category?.vulnerableTestingRunResults) || "No impact found"}
            </Text>
          )
          break;
        case "Impact":
          if(category?.issueImpact == null || category?.issueImpact == undefined){
            return;
          }
          sectionLocal.content = (
            <Text color='subdued'>
              {category?.issueImpact || "No impact found"}
            </Text>
          )
          break;
        case "Tags":
          if (category?.issueTags == null || category?.issueTags == undefined || category?.issueTags.length == 0) {
            return;
          }
          sectionLocal.content = (
            <HorizontalStack gap="2">
              {
                transform.tagList(category?.issueTags)
              }
            </HorizontalStack>
          )
          break;
        case "CWE":
          if (category?.cwe == null || category?.cwe == undefined || category?.cwe.length == 0) {
            return;
          }
          sectionLocal.content = (
            <HorizontalStack gap="2">
              {
                transform.tagList(category?.cwe, "CWE")
              }
            </HorizontalStack>
          )
          break;
        case "CVE":
          if (category?.cve == null || category?.cve == undefined || category?.cve.length == 0) {
            return;
          }
          sectionLocal.content = (
            <HorizontalStack gap="2">
              {
                transform.tagList(category?.cve, "CVE")
              }
            </HorizontalStack>
          )
          break;
        case "References":
          if (category?.references == null || category?.references == undefined || category?.references.length == 0) {
            return;
          }
          sectionLocal.content = (
            <List type='bullet' spacing="extraTight">
              {
                category?.references?.map((reference) => {
                  return (
                    <List.Item key={reference}>
                      <Link key={reference} url={reference} monochrome removeUnderline target="_blank">
                        <Text color='subdued'>
                          {reference}
                        </Text>
                      </Link>
                    </List.Item>
                  )
                })
              }
            </List>
          )
          break;
        case "API endpoints affected":
          if (affectedEndpoints == null || affectedEndpoints == undefined || affectedEndpoints.length == 0) {
            return;
          }
          sectionLocal.content = (
            <List type='bullet'>
              {
                affectedEndpoints?.map((item, index) => {
                  return (
                    <List.Item key={index}>
                      <Text color='subdued'>
                        {item.id.apiInfoKey.method} {item.id.apiInfoKey.url}
                      </Text>
                    </List.Item>)
                })
              }
            </List>
          )
          break;
          case "Jira":
              sectionLocal.content = jiraComponent
              break;
          default:
            sectionLocal.content = section.content
      }
      filledSection.push(sectionLocal)
    })
    return filledSection;
  },

  filterContainsConditions(conditions, operator) { //operator is string as 'OR' or 'AND'
    let filteredCondition = {}
    let found = false
    filteredCondition['operator'] = operator
    filteredCondition['predicates'] = []
    conditions.forEach(element => {
      if (element.value && element.operator === operator) {
        if (element.type === 'CONTAINS') {
          filteredCondition['predicates'].push({ type: element.type, value: element.value })
          found = true
        } else if (element.type === 'BELONGS_TO' || element.type === 'NOT_BELONGS_TO') {
          let collectionMap = element.value
          let collectionId = Object.keys(collectionMap)[0]

          if (collectionMap[collectionId]) {
            let apiKeyInfoList = []
            collectionMap[collectionId].forEach(apiKeyInfo => {
              apiKeyInfoList.push({ 'url': apiKeyInfo['url'], 'method': apiKeyInfo['method'], 'apiCollectionId': Number(collectionId) })
              found = true
            })
            if (apiKeyInfoList.length > 0) {
              filteredCondition['predicates'].push({ type: element.type, value: apiKeyInfoList })
            }
          }
        }
      }
    });
    if (found) {
      return filteredCondition;
    }
  },

  fillConditions(conditions, predicates, operator) {
    predicates.forEach(async (e, i) => {
      let valueFromPredicate = e.value
      if (Array.isArray(valueFromPredicate) && valueFromPredicate.length > 0) {
        let valueForCondition = {}
        let collectionId = valueFromPredicate[0]['apiCollectionId']
        let apiInfoKeyList = []
        for (var index = 0; index < valueFromPredicate.length; index++) {
          let apiEndpoint = {
            method: valueFromPredicate[index]['method'],
            url: valueFromPredicate[index]['url']
          }
          apiInfoKeyList.push({
            method: apiEndpoint.method,
            url: apiEndpoint.url
          })
        }
        valueForCondition[collectionId] = apiInfoKeyList
        conditions.push({ operator: operator, type: e.type, value: valueForCondition })
      } else {
        conditions.push({ operator: operator, type: e.type, value: valueFromPredicate })
      }
    })
  },

  createConditions(data) {
    let testingEndpoint = data
    let conditions = []
    if (testingEndpoint?.andConditions) {
      transform.fillConditions(conditions, testingEndpoint.andConditions.predicates, 'AND')
    }
    if (testingEndpoint?.orConditions) {
      transform.fillConditions(conditions, testingEndpoint.orConditions.predicates, 'OR')
    }
    return conditions;
  },
  setTestMetadata() {
    api.fetchAllSubCategories().then((resp) => {
      let subCategoryMap = {}
      resp.subCategories.forEach((x) => {
        subCategoryMap[x.name] = x
      })
      let subCategoryFromSourceConfigMap = {}
      resp.testSourceConfigs.forEach((x) => {
        subCategoryFromSourceConfigMap[x.id] = x
      })
      PersistStore.getState().setSubCategoryMap(subCategoryMap)
      PersistStore.getState().setSubCategoryFromSourceConfigMap(subCategoryFromSourceConfigMap)
    })
  },
  prettifySummaryTable(summaries) {
    summaries = summaries.map((obj) => {
      const date = new Date(obj.startTimestamp * 1000)
      return{
        ...obj,
        prettifiedSeverities: observeFunc.getIssuesList(obj.countIssues),
        startTime: date.toLocaleTimeString() + " on " +  date.toLocaleDateString(),
        id: obj.hexId
      }
    })
    return summaries;
  },
convertSubIntoSubcategory(resp){
  let obj = {}
  let countObj = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  }
  const subCategoryMap = PersistStore.getState().subCategoryMap
  Object.keys(resp).forEach((key)=>{
    const objectKey = subCategoryMap[key] ? subCategoryMap[key].superCategory.shortName : key;
    if(obj.hasOwnProperty(objectKey)){
      let tempObj =  JSON.parse(JSON.stringify(obj[objectKey]));
      let newObj = {
        ...tempObj,
        text: resp[key] + tempObj.text
      }
      obj[objectKey] = newObj;
      countObj[subCategoryMap[key].superCategory.severity._name]+=resp[key]
    }
    else if(!subCategoryMap[key]){
      obj[objectKey] = {
        text: resp[key],
        color: func.getColorForCharts(key)
      }
      countObj.HIGH+=resp[key]
    }else{
      obj[objectKey] = {
        text: resp[key],
        color: func.getColorForCharts(subCategoryMap[key].superCategory.name)
      }
      countObj[subCategoryMap[key].superCategory.severity._name]+=resp[key]
    }

  })

  const sortedEntries = Object.entries(obj).sort(([, val1], [, val2]) => {
    const prop1 = val1['text'];
    const prop2 = val2['text'];
    return prop2 - prop1 ;
  });

  return {
    subCategoryMap: Object.fromEntries(sortedEntries),
    countMap: countObj
  }

},

getInfoSectionsHeaders(){
  let moreInfoSections = [
    {
      icon: FlagMajor,
      title: "Impact",
      content: ""
    },
    {
      icon: CollectionsMajor,
      title: "Tags",
      content: ""
    },
    {
      icon: CreditCardSecureMajor,
      title: "CWE",
      content: ""
    },
    {
      icon: FraudProtectMajor,
      title: "CVE",
      content: ""
    },
    {
      icon: MarketingMajor,
      title: "API endpoints affected",
      content: ""
    },
    {
      icon: ResourcesMajor,
      title: "References",
      content: ""
    },
    {
      icon: ResourcesMajor,
      title: "Jira",
      content: ""
    }
  ]
  return moreInfoSections
},
getUrlComp(url){
  let arr = url.split(' ')
  const method = arr[0]
  const endpoint = arr[1]

  return(
    <HorizontalStack gap={1}>
      <Box width="54px">
        <HorizontalStack align="end">
          <Text variant="bodyMd" color="subdued">{method}</Text>
        </HorizontalStack>
      </Box>
      <Text variant="bodyMd">{endpoint}</Text>
    </HorizontalStack>
  )
},

getCollapsibleRow(urls){
  return(
    <tr style={{background: "#EDEEEF"}}>
      <td colSpan={7}>
        <Box paddingInlineStart={4} paddingBlockEnd={2} paddingBlockStart={2}>
          <VerticalStack gap={2}>
            {urls.map((ele,index)=>{
              return(
                <Link monochrome onClick={() => history.navigate(ele.nextUrl)} removeUnderline key={index}>
                  {this.getUrlComp(ele.url)}
                </Link>
              )
            })}
          </VerticalStack>
        </Box>
      </td>
    </tr>
  )
},

getPrettifiedTestRunResults(testRunResults){
  let testRunResultsObj = {}
  testRunResults.forEach((test)=>{
    const key = test.name + ': ' + test.vulnerable
    if(testRunResultsObj.hasOwnProperty(key)){
      let endTimestamp = Math.max(test.endTimestamp, testRunResultsObj[key].endTimestamp)
      let urls = testRunResultsObj[key].urls
      urls.push({url: test.url, nextUrl: test.nextUrl})
      let obj = {
        ...test,
        urls: urls,
        endTimestamp: endTimestamp
      }
      delete obj["nextUrl"]
      delete obj["url"]
      testRunResultsObj[key] = obj
    }else{
      let urls = [{url: test.url, nextUrl: test.nextUrl}]
      let obj={
        ...test,
        urls:urls,
      }
      delete obj["nextUrl"]
      delete obj["url"]
      testRunResultsObj[key] = obj
    }
  })
  let prettifiedResults = []
  Object.keys(testRunResultsObj).forEach((key)=>{
    let obj = testRunResultsObj[key]
    let prettifiedObj = {
      ...obj,
      nameComp: <Box maxWidth="250px"><TooltipText tooltip={obj.name} text={obj.name} textProps={{fontWeight: 'medium'}}/></Box>,
      severityComp: obj?.vulnerable === true ? <Badge size="small" status={func.getTestResultStatus(obj?.severity[0])}>{obj?.severity[0]}</Badge> : <Text>-</Text>,
      cweDisplayComp: obj?.cweDisplay?.length > 0 ? <HorizontalStack gap={1}>
        {obj.cweDisplay.map((ele,index)=>{
          return(
            <Badge size="small" status={func.getTestResultStatus(ele)} key={index}>{ele}</Badge>
          )
        })}
      </HorizontalStack> : <Text>-</Text>,
      totalUrls: obj.urls.length,
      scanned_time_comp: <Text variant="bodyMd">{func.prettifyEpoch(obj?.endTimestamp)}</Text>,
      collapsibleRow: this.getCollapsibleRow(obj.urls),
      urlFilters: obj.urls.map((ele) => ele.url)
    }
    prettifiedResults.push(prettifiedObj)
  })
  return prettifiedResults
}
}

export default transform