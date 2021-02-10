require('dotenv-safe').config();

const axios = require('axios');
const schedule = require('node-schedule');
const KrakenClient = require('kraken-api');
const kraken = new KrakenClient(process.env.KRAKEN_API_KEY, process.env.KRAKEN_API_PRIVATE_KEY);

const { format, differenceInSeconds, add } = require('date-fns');

async function getLatestTweet(account) {
    const response = await axios({
        url: `https://api.twitter.com/1.1/statuses/user_timeline.json?screen_name=${account}`,
        headers: {
            Authorization: `Bearer ${process.env.TWITTER_API_BEARER_TOKEN}`
        }
    });

    const tweet = response.data[0];

    return tweet;
}

const user = 'code_to_freedom';
const interval = 10; // seconds
const sell_delay = 5; // minutes
let bought = false;

const job = schedule.scheduleJob(`*/${interval} * * * * *`, async () => {
    const now = new Date();
    const balance = await kraken.api('Balance');
    const BTC_balance = Number(balance.result['XXBT'] || 0).toFixed(8);
    const XDG_balance = Number(balance.result['XXDG'] || 0).toFixed(8);

    console.log(`Current balance: ${BTC_balance} BTC | ${XDG_balance} DOGE`);

    const displayDate = format(now, 'yyyy/MM/dd hh:mm:ss');
    console.log(`${displayDate}: Checking for tweets...`);

    // get the tweet object
    const tweet = await getLatestTweet(user);

    const { text } = tweet;

    // get the number of seconds since it was posted

    const secondsAgo = differenceInSeconds(now, new Date(tweet.created_at));

    if (secondsAgo < 10) {
        // this is a new tweet
        console.log(`${displayDate}: New tweet from ${user}: ${tweet.text}`);
        if (text.toLowerCase().includes('doge') && ! bought) {
            console.log('This tweet mentions DOGE. BUYING.');

            // BUY 50 DOGECOIN
            const response = await kraken.api('AddOrder', {
                pair: 'XXDGXXBT',
                type: 'buy',
                ordertype: 'market',
                volume: 50
            });

            if (! response.error.length) {
                bought = true;
            }

            const sellDate = add(now, { minutes: sell_delay });

            schedule.scheduleJob(sellDate, async () => {
                console.log('5 minutes have passed since we bought. SELLING.');

                // SELL 50 DOGECOIN
                const response = await kraken.api('AddOrder', {
                    pair: 'XXDGXXBT',
                    type: 'sell',
                    ordertype: 'market',
                    volume: 50
                });

                if (! response.error.length) {
                    bought = false;
                }
            })
        } else {
            console.log('This tweet does not mention DOGE :(');
        }
    }
});
