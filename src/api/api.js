const express = require('express');
const fs = require('fs');
const { getAvailableCurve } = require('../curve/curve.utils');
const { getAvailableUniswapV2 } = require('../uniswap.v2/uniswap.v2.utils');
const compression = require('compression');
var cors = require('cors');
var path = require('path');
const { roundTo, getDay } = require('../utils/utils');
const { DATA_DIR } = require('../utils/constants');
const { getAvailableForDashboard, getDataForPairAndPlatform, checkPlatform, getFetcherResults, getMorphoOverview } = require('./dashboardUtils');
const app = express();

app.use(cors());
app.use(compression());

const port = process.env.API_PORT || 3000;

const cache = {};
const cacheDuration = 30 * 60 * 1000; // 30 min cache duration

app.get('/api/dashboard/morpho-overview', async (req, res, next) => {
    try {
        const kinzaOverview = getMorphoOverview();
        res.json(kinzaOverview);
    } catch (error) {
        res.status(400).json({ error: error.message });
        next();
    }
});

// getprecomputeddata?platform=uniswapv2&span=1
app.get('/api/getprecomputeddata', async (req, res, next) => {
    try {
        // console.log('received getprecomputeddata request', req);
        const platform = req.query.platform;
        const span = Number(req.query.span);

        if (!span || !platform) {
            res.status(400).json({ error: 'span and platform required' });
            next();
        }

        const fileName = `concat-${span}d.json`;
        const cacheKey = `concat_${platform}_${span}`;
        if (!cache[cacheKey]
            || cache[cacheKey].cachedDate < Date.now() - cacheDuration) {
            const filePath = path.join(DATA_DIR, 'precomputed', 'riskoracle', platform, fileName);
            console.log(`try reading file ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log(`${filePath} does not exists`);
                res.status(404).json({ error: 'file does not exist' });
                return;
            }
            else {
                console.log(`${filePath} exists, saving data to cache`);
                cache[cacheKey] = {
                    data: JSON.parse(fs.readFileSync(filePath)),
                    cachedDate: Date.now(),
                };
            }
        } else {
            const cacheRemaining = cacheDuration - (Date.now() - cache[cacheKey].cachedDate);
            console.log(`returning key ${cacheKey} from cache. Cache remaining duration ${roundTo(cacheRemaining/1000, 2)} seconds`);
        }

        res.json(cache[cacheKey].data);
    } catch (error) {
        next(error);
    }
});

// getprecomputeddata?platform=uniswapv2&span=1
app.get('/api/getaveragedata', async (req, res, next) => {
    try {
        // console.log('received getaveragedata request', req);
        const platform = req.query.platform;
        const span = Number(req.query.span);

        if (!span || !platform) {
            res.status(400).json({ error: 'span and platform required' });
            next();
        }

        const fileName = `averages-${span}d.json`;
        const cacheKey = `averages_${platform}_${span}`;
        if (!cache[cacheKey]
            || cache[cacheKey].cachedDate < Date.now() - cacheDuration) {
            const filePath = path.join(DATA_DIR, 'precomputed', 'riskoracle', platform, fileName);
            console.log(`try reading file ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log(`${filePath} does not exists`);
                res.status(404).json({ error: 'file does not exist' });
                return;
            }
            else {
                console.log(`${filePath} exists, saving data to cache`);
                cache[cacheKey] = {
                    data: JSON.parse(fs.readFileSync(filePath)),
                    cachedDate: Date.now(),
                };
            }
        } else {
            const cacheRemaining = cacheDuration - (Date.now() - cache[cacheKey].cachedDate);
            console.log(`returning key ${cacheKey} from cache. Cache remaining duration ${roundTo(cacheRemaining/1000, 2)} seconds`);
        }

        res.json(cache[cacheKey].data);
    } catch (error) {
        next(error);
    }
});

app.get('/api/available', (req, res) => {
    const available = {};
    available['uniswapv2'] = getAvailableUniswapV2(DATA_DIR);
    available['curve'] = getAvailableCurve(DATA_DIR);

    res.json(available);
});


// getallclfs?date=18.2.2023 (date optional)
app.get('/api/getallclfs', async (req, res, next) => {
    try {
        const date = req.query.date ? req.query.date : getDay();
        const folder = req.query.latest === undefined ? 'latest' : req.query.latest === false ? date : 'latest';

        const fileName = req.query.latest ? 'all_CLFs.json' : `${date}_all_CLFs`;
        const cacheKey = req.query.latest ? 'all_CLFs.json' : `${date}_all_CLFs`;
        if (!cache[cacheKey]
            || cache[cacheKey].cachedDate < Date.now() - cacheDuration) {
            const filePath = path.join(DATA_DIR, 'clf', folder, fileName);
            console.log(`try reading file ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log(`${filePath} does not exists`);
                res.status(404).json({ error: 'file does not exist' });
                return;
            }
            else {
                console.log(`${filePath} exists, saving data to cache`);
                cache[cacheKey] = {
                    data: JSON.parse(fs.readFileSync(filePath)),
                    cachedDate: Date.now(),
                };
            }
        } else {
            const cacheRemaining = cacheDuration - (Date.now() - cache[cacheKey].cachedDate);
            console.log(`returning key ${cacheKey} from cache. Cache remaining duration ${roundTo(cacheRemaining/1000, 2)} seconds`);
        }

        res.json(cache[cacheKey].data);
    } catch (error) {
        next(error);
    }
});

// getclfs?platform=compoundV3&date=18.2.2023 (date optional)
app.get('/api/getclfs', async (req, res, next) => {
    try {
        const platform = req.query.platform;
        const date = req.query.date ? req.query.date : getDay();
        const folder = req.query.latest === undefined ? 'latest' : req.query.latest === false ? date : 'latest';


        if (!platform) {
            res.status(400).json({ error: 'platform required' });
            next();
        }
        const fileName = req.query.latest ? `${platform}CLFs.json` : `${date}_${platform}CLFs.json`;
        const cacheKey = req.query.latest ? `${platform}CLFs.json` : `${date}_${platform}CLFs.json`;
        if (!cache[cacheKey]
            || cache[cacheKey].cachedDate < Date.now() - cacheDuration) {
            const filePath = path.join(DATA_DIR, 'clf', folder, fileName);
            console.log(`try reading file ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log(`${filePath} does not exists`);
                res.status(404).json({ error: 'file does not exist' });
                return;
            }
            else {
                console.log(`${filePath} exists, saving data to cache`);
                cache[cacheKey] = {
                    data: JSON.parse(fs.readFileSync(filePath)),
                    cachedDate: Date.now(),
                };
            }
        } else {
            const cacheRemaining = cacheDuration - (Date.now() - cache[cacheKey].cachedDate);
            console.log(`returning key ${cacheKey} from cache. Cache remaining duration ${roundTo(cacheRemaining/1000, 2)} seconds`);
        }

        res.json(cache[cacheKey].data);
    } catch (error) {
        next(error);
    }
});


app.get('/api/getcurrentclfgraphdata', async (req, res, next) => {
    try {
        const platform = req.query.platform;
        const date = req.query.date ? req.query.date : getDay();
        const folder = req.query.latest === undefined ? 'latest' : req.query.latest === false ? date : 'latest';


        if (!platform) {
            res.status(400).json({ error: 'platform required' });
            next();
        }
        const fileName = req.query.latest ? `${platform}_graphData.json` : `${date}_${platform}_graphData.json`;
        const cacheKey = req.query.latest ? `${platform}_graphData.json` : `${date}_${platform}_graphData.json`;
        if (!cache[cacheKey]
            || cache[cacheKey].cachedDate < Date.now() - cacheDuration) {
            const filePath = path.join(DATA_DIR, 'clf', folder, fileName);
            console.log(`try reading file ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log(`${filePath} does not exists`);
                res.status(404).json({ error: 'file does not exist' });
                return;
            }
            else {
                console.log(`${filePath} exists, saving data to cache`);
                cache[cacheKey] = {
                    data: JSON.parse(fs.readFileSync(filePath)),
                    cachedDate: Date.now(),
                };
            }
        } else {
            const cacheRemaining = cacheDuration - (Date.now() - cache[cacheKey].cachedDate);
            console.log(`returning key ${cacheKey} from cache. Cache remaining duration ${roundTo(cacheRemaining/1000, 2)} seconds`);
        }

        res.json(cache[cacheKey].data);
    } catch (error) {
        next(error);
    }
});

// getcurrentaverageclfs?platform=compoundV3&date=18.2.2023 (date optional)
app.get('/api/getcurrentaverageclfs', async (req, res, next) => {
    try {
        const platform = req.query.platform;
        const date = req.query.date ? req.query.date : getDay();
        const folder = req.query.latest === undefined ? 'latest' : req.query.latest === false ? date : 'latest';


        if (!platform) {
            res.status(400).json({ error: 'platform required' });
            next();
        }
        const fileName = req.query.latest ? `${platform}_average_CLFs.json` : `${date}_${platform}_average_CLFs.json`;
        const cacheKey = req.query.latest ? `${platform}_average_CLFs.json` : `${date}_${platform}_average_CLFs.json`;
        if (!cache[cacheKey]
            || cache[cacheKey].cachedDate < Date.now() - cacheDuration) {
            const filePath = path.join(DATA_DIR, 'clf', folder, fileName);
            console.log(`try reading file ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log(`${filePath} does not exists`);
                res.status(404).json({ error: 'file does not exist' });
                return;
            }
            else {
                console.log(`${filePath} exists, saving data to cache`);
                cache[cacheKey] = {
                    data: JSON.parse(fs.readFileSync(filePath)),
                    cachedDate: Date.now(),
                };
            }
        } else {
            const cacheRemaining = cacheDuration - (Date.now() - cache[cacheKey].cachedDate);
            console.log(`returning key ${cacheKey} from cache. Cache remaining duration ${roundTo(cacheRemaining/1000, 2)} seconds`);
        }

        res.json(cache[cacheKey].data);
    } catch (error) {
        next(error);
    }
});

// NEW CLF API
app.get('/api/clf/getaveragerisklevels', async (req, res, next) => {
    try {
        const folder = 'latest';
        const protocolsAvg = {};
        for(const subDir of fs.readdirSync(`${DATA_DIR}/clf/`)) {
            if(subDir == 'latest') {
                continue;
            }

            const fullFileName = `${DATA_DIR}/clf/${subDir}/${folder}/${subDir}_CLFs.json`;
            if(!fs.existsSync(fullFileName)) {
                continue;
            }

            const protocolValue = JSON.parse(fs.readFileSync(fullFileName));
            protocolsAvg[subDir] = protocolValue.weightedCLF;
        }

        res.json(protocolsAvg);
    } catch (error) {
        next(error);
    }
});

// getcurrentclfgraphdata?platform=compoundV3&date=18.2.2023 (date optional)
app.get('/api/clf/getcurrentclfgraphdata', async (req, res, next) => {
    try {
        const platform = req.query.platform;
        const date = req.query.date ? req.query.date : getDay();
        const folder = req.query.latest === undefined ? 'latest' : req.query.latest === false ? date : 'latest';


        if (!platform) {
            res.status(400).json({ error: 'platform required' });
            next();
        }
        const fileName = req.query.latest ? `${platform}_graphData.json` : `${date}_${platform}_graphData.json`;
        const cacheKey = req.query.latest ? `new_${platform}_graphData.json` : `new_${date}_${platform}_graphData.json`;
        if (!cache[cacheKey]
            || cache[cacheKey].cachedDate < Date.now() - cacheDuration) {
            const filePath = path.join(DATA_DIR, 'clf', platform, folder, fileName);
            console.log(`try reading file ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log(`${filePath} does not exists`);
                res.status(404).json({ error: 'file does not exist' });
                return;
            }
            else {
                console.log(`${filePath} exists, saving data to cache`);
                cache[cacheKey] = {
                    data: JSON.parse(fs.readFileSync(filePath)),
                    cachedDate: Date.now(),
                };
            }
        } else {
            const cacheRemaining = cacheDuration - (Date.now() - cache[cacheKey].cachedDate);
            console.log(`returning key ${cacheKey} from cache. Cache remaining duration ${roundTo(cacheRemaining/1000, 2)} seconds`);
        }

        res.json(cache[cacheKey].data);
    } catch (error) {
        next(error);
    }
});

app.get('/api/clf/getcurrentaverageclfs', async (req, res, next) => {
    try {
        const platform = req.query.platform;
        const date = req.query.date ? req.query.date : getDay();
        const folder = req.query.latest === undefined ? 'latest' : req.query.latest === false ? date : 'latest';


        if (!platform) {
            res.status(400).json({ error: 'platform required' });
            next();
        }
        const fileName = req.query.latest ? `${platform}_average_CLFs.json` : `${date}_${platform}_average_CLFs.json`;
        const cacheKey = req.query.latest ? `new_${platform}_average_CLFs.json` : `new_${date}_${platform}_average_CLFs.json`;
        if (!cache[cacheKey]
            || cache[cacheKey].cachedDate < Date.now() - cacheDuration) {
            const filePath = path.join(DATA_DIR, 'clf', platform, folder, fileName);
            console.log(`try reading file ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log(`${filePath} does not exists`);
                res.status(404).json({ error: 'file does not exist' });
                return;
            }
            else {
                console.log(`${filePath} exists, saving data to cache`);
                cache[cacheKey] = {
                    data: JSON.parse(fs.readFileSync(filePath)),
                    cachedDate: Date.now(),
                };
            }
        } else {
            const cacheRemaining = cacheDuration - (Date.now() - cache[cacheKey].cachedDate);
            console.log(`returning key ${cacheKey} from cache. Cache remaining duration ${roundTo(cacheRemaining/1000, 2)} seconds`);
        }

        res.json(cache[cacheKey].data);
    } catch (error) {
        next(error);
    }
});

app.get('/api/dashboard/overview', async (req, res, next) => {
    try {
        const fetcherResults = getFetcherResults();
        res.json(fetcherResults);
    } catch (error) {
        res.status(400).json({ error: error.message });
        next();
    }
});

app.get('/api/dashboard/available/:platform', async (req, res, next) => {
    try {
        const platform = req.params.platform;
        checkPlatform(platform);
        const available = getAvailableForDashboard(platform);
        res.json(available);
    } catch (error) {
        res.status(400).json({ error: error.message });
        next();
    }
});

app.get('/api/dashboard/:platform/:base/:quote', async (req, res, next) => {
    try {
        const platform = req.params.platform;
        checkPlatform(platform);
        const base = req.params.base;
        const quote = req.params.quote;

        const data = getDataForPairAndPlatform(platform, base, quote);
        res.json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
        next();
    }
});


app.get('/api/qc/price/:platform/:base/:quote', async (req, res, next) => {
    try {
        throw new Error('NOT IMPLEMENTED');
        // const platform = req.params.platform;
        // checkPlatform(platform);
        // const base = req.params.base;
        // const quote = req.params.quote;

        // res.json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
        next();
    }
});

app.listen(port, () => {
    console.log(`listening on port ${port}`);
});

