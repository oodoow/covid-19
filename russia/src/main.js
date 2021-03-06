// This is the main Node.js source code file of your actor.

// Include Apify SDK. For more information, see https://sdk.apify.com/
const Apify = require('apify');

Apify.main(async () => {
    // Get input of the actor (here only for demonstration purposes).
    const input = await Apify.getInput();
    console.log('Input:');
    console.dir(input);

    // Create and initialize an instance of the RequestList class that contains
    // a list of URLs to crawl. Here we use just a few hard-coded URLs.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'https://www.rosminzdrav.ru/ministry/covid19' },
        ],
    });
    await requestList.initialize();
    const kvStore = await Apify.openKeyValueStore('COVID-19-RUSSIA');
    const dataset = await Apify.openDataset('COVID-19-RUSSIA-HISTORY');

    // Create an instance of the CheerioCrawler class - a crawler
    // that automatically loads the URLs and parses their HTML using the cheerio library.
    const crawler = new Apify.CheerioCrawler({
        // Let the crawler fetch URLs from our list.
        requestList,

        // The crawler downloads and processes the web pages in parallel, with a concurrency
        // automatically managed based on the available system memory and CPU (see AutoscaledPool class).
        // Here we define some hard limits for the concurrency.
        minConcurrency: 10,
        maxConcurrency: 50,

        // On error, retry each page at most once.
        maxRequestRetries: 1,

        // Increase the timeout for processing of each page.
        handlePageTimeoutSecs: 60,

        // This function will be called for each URL to crawl.
        handlePageFunction: async ({ request, body, $ }) => {
            console.log(`Processing ${request.url}...`);
            
            // Extract data from the page using cheerio.
            var data = {};
            data.sourceUrl = request.url;
            data.lastUpdatedAtApify = new Date();
            data.readMe = "https://apify.com/krakorj/covid-russia";

            // Source title
            const sourceTitle = $('title').text();
            data.sourceTitle = sourceTitle;
            
            // Source text is the first info article in page
            var src = $('article div.row div.col-md-12 p span');
            console.log(src.text());

            // Timestamp of the last article
            var date = src.text();
            var rex = /(?<day>\d+)\.(?<month>\d+)\.(?<year>\d+).*?(?<hours>\d+):(?<minutes>\d+)/g;
            var match = rex.exec(date);
            if (match != null) {
                date = match.groups.year + "-" + match.groups.month + "-" + match.groups.day + 
                    "T" + match.groups.hours + ":" + match.groups.minutes + ":00Z";
                data.lastUpdatedAtSource = new Date(date);
                console.log("Info date: " + date);
            }
            
            // Tested cases
            //console.log(src.text());
            rex = /.*?провед.*?(?<testedCasesTotal>[\d\s\.]+).*?лаборатор/s
            match = rex.exec(src.text());
            if (match != null)
                data.testedCasesTotal = match.groups.testedCasesTotal
                    .replace(/[\s\.]/g,"");
            rex = /.*?(?<testedCasesTotal>[\d\s\.,]+)тыся/s
            match = rex.exec(src.text());
            if (match != null)
                data.testedCasesTotal = match.groups.testedCasesTotal
                    .replace(/[\s]/g,"").replace(/,/g,".")*1000;
            data.testedCasesTotal = data.testedCasesTotal.toString();

            // Infected
            //console.log(src.text());
            rex = /.*?регистрирова.*?(?<infectedTotal>[\d\s\.]+)/s
            match = rex.exec(src.text());
            if (match != null)
                data.infectedTotal = match.groups.infectedTotal
                    .replace(/[\s\.]/g,"");
            
            // Recovered
            //console.log(src.text());
            rex = /.*?выздоровле.*?(?<recoveredTotal>[\d\s\.]+)/s
            match = rex.exec(src.text());
            if (match != null)
                data.recoveredTotal = match.groups.recoveredTotal
                    .replace(/[\s\.]/g,"");
            
            // Deadths
            //console.log(src.text());
            rex = /.*?(?<deathsTotal>[\d\s\.]+)[^\d]*?умер/s
            match = rex.exec(src.text());
            if (match != null)
                data.deathsTotal = match.groups.deathsTotal
                    .replace(/[\s\.]/g,"");
            else {
                data.deathsTotal = "0";
            }

            console.log(data);

            // Store the results to the default dataset. In local configuration,
            // the data will be stored as JSON files in ./apify_storage/datasets/default
            await Apify.pushData(data);

            // OUTPUT update
            console.log('Setting OUTPUT...')
            await Apify.setValue('OUTPUT', data);

            // Key-value store / data set update
            console.log('Setting LATEST...')
            let latest = await kvStore.getValue('LATEST');
            if (!latest) {
                await kvStore.setValue('LATEST', data);
                latest = data;
                await dataset.pushData(data);
            }
            else {
                var latestUpdateTimestamp = new Date(latest.lastUpdatedAtSource);
                if (latestUpdateTimestamp.getTime() != data.lastUpdatedAtSource.getTime()) {
                    await dataset.pushData(data);
                }
            }
            
            await kvStore.setValue('LATEST', data);

            // Done :)
            console.log('Finished');
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();

    

    console.log('Crawler finished.'); 
});

    
