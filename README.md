# dex-history-fetcher

This repository contains all the code used to fetch the data from various DEXes and generate liquidity data for each pairs

To be able to do so without taking too much time, it's a multi step process

1. Data fetching
2. Data unification

Documentation available [here](./docs/README.md)

## Run a fetcher

1. `npm install`
1. Set the RPC_URL environment variable
2. Install glpsol
```
#!/bin/bash

# Step 1: Download the file from the URL to /tmp
wget -P /tmp https://ftp.gnu.org/gnu/glpk/glpk-5.0.tar.gz

# Step 2: Untar the downloaded archive and move it to ./glpk
mkdir ./glpk
tar -xzf /tmp/glpk-5.0.tar.gz -C ./glpk --strip-components=1

# Step 3: Navigate to ./glpk and run configure, make, and make install
cd ./glpk || exit
./configure || exit
make || exit
make check || exit
sudo make install || exit
```

`export RPC_URL=https://url/`
1. Start the sushiswapv2 history fetcher (the fastest one)

`node ./src/sushiswap.v2/sushiswap.v2.history.fetcher.js`

It should run for several minutes the first time and at the end, the process should display

```
UniswapV2HistoryFetcher: ending
UniswapV2HistoryFetcher: sleeping 24.69 minutes
```

And you should be able to see the ./data directory filled with data

```
./data/uniswapv2
./data/precomputed/uniswapv2
```

