function getIndeedSearchUrl(keyword, location, offset) {
    const formattedKeyword = keyword.replace(" ", "+")
    const params = new URLSearchParams({ q: formattedKeyword, l: location, start: offset})
    return `https://de.indeed.com/jobs?${params}`
}

function proxyUrl(url) {
    const scrapeOpsApiKey = 'db32013d-1e86-4be1-9573-b541505319ae'
    const payload = new URLSearchParams({ api_key: scrapeOpsApiKey, url: url, country: 'us' })
    return `https://proxy.scrapeops.io/v1/?${payload}`
}

async function fetchJobIds(keyword, location, number) {
    const jobIdList = []

    for (let offset = 0; offset < number; offset += 15) {
        try {
            const indeedJobsUrl = await getIndeedSearchUrl(keyword, location, offset)
            console.log(indeedJobsUrl)

            const prxUrl = proxyUrl(indeedJobsUrl)
            const response = await fetch(prxUrl)

            console.log(response.status)

            if (response.status === 200) {
                const text = await response.text()
                const scriptTagMatch = text.match(/window\.mosaic\.providerData\["mosaic-provider-jobcards"\]=(\{.+?\});/)

                if (scriptTagMatch) {
                    const jsonBlob = JSON.parse(scriptTagMatch[1])
                    const jobsList = jsonBlob.metaData.mosaicProviderJobCardsModel.results

                    jobsList.forEach(job => {
                        if (job.jobkey) {
                            jobIdList.push(job.jobkey)
                        }
                    })

                    if (jobsList.length < 10) {
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Error', e)
        }
    }

    return jobIdList
}

async function fetchJobDetails(jobId) {
    const url = `https://de.indeed.com/viewjob?viewtype=embedded&jk=${jobId}`;
    const prxUrl = await proxyUrl(url);
    const response = await fetch(prxUrl);
    const text = await response.text();
    const regex = /_initialData=(\{.+?\});/
    const match = regex.exec(text)

    if (match) {
        const jsonBlob = JSON.parse(match[1])
        
        const jobInfo = jsonBlob.jobInfoWrapperModel.jobInfoModel;
        const jobHeader = jobInfo.jobInfoHeaderModel;
        const salaryInfo = jsonBlob.salaryInfoModel;
        const jobTypes = jsonBlob.jobInfoWrapperModel?.jobInfoModel?.jobDescriptionSectionModel?.jobDetailsSection?.jobTypes?.map(type => type.label) || null;
        const shiftsAndSchedules = jsonBlob.jobInfoWrapperModel?.jobInfoModel?.jobDescriptionSectionModel?.jobDetailsSection?.shiftsAndSchedule?.map(shift => shift.label) || null;

        const jobAttributes = {
            jobTitle: jobHeader.jobTitle,
            company: jobHeader.companyName,
            rating: jobHeader.companyReviewModel ? jobHeader.companyReviewModel.ratingsModel.rating : null,
            reviewCount: jobHeader.companyReviewModel ? jobHeader.companyReviewModel.ratingsModel.count : null,
            salaryMin: salaryInfo?.salaryMin || null,
            salaryMax: salaryInfo?.salaryMax || null,
            salaryType: salaryInfo?.salaryType || null,
            jobTypes: jobTypes,
            shiftsAndSchedules: shiftsAndSchedules,
            description: jobInfo.sanitizedJobDescription
        };

        return jobAttributes;
    }
}

// Example usage
async function main() {
    const keyword = 'Werkstattleiter';
    const location = 'Berlin'
    const jobIds = await fetchJobIds(keyword, location, 5);
    
    const jobsList = []

    for (const jobId of jobIds) {
        const job = await fetchJobDetails(jobId);
        jobsList.push({ ...job })
        // Process and store jobData as needed
    }

    var json = JSON.stringify(jobsList)
    var fs = require('fs')
    fs.writeFile(`${keyword}-${jobsList.length}.json`, json, 'utf-8', (err) => {console.error(err)})
}

main();