require('dotenv-safe').config();

const twilio = require("twilio")();
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

async function getBalance() {
    const balance = await kraken.api('Balance');

    return balance.result;
}

const user = 'elonmusk';
const interval = 10; // seconds
const sellDelay = 2; // minutes
const volume = 100; // doge coins
let bought = false;

const job = schedule.scheduleJob(`*/${interval} * * * * *`, async () => {
    const now = new Date();

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

            // BUY DOGECOIN
            const response = await kraken.api('AddOrder', {
                pair: 'XXDGXXBT',
                type: 'buy',
                ordertype: 'market',
                volume: volume
            });

            if (! response.error.length) {
                bought = true;
            }

            const balance = await getBalance();
            const BTC_balance = Number(balance['XXBT'] || 0).toFixed(8);
            const XDG_balance = Number(balance['XXDG'] || 0);

            // TEXT ME
            await twilio.messages.create({
                body: `${user} just tweeted: "${tweet.text}". Bought ${volume} DOGE. Balance: ${BTC_balance} BTC | ${XDG_balance} DOGE`,
                from: "+16087655499",
                to: process.env.PHONE_NUMBER,
            });

            const sellDate = add(now, { minutes: sellDelay });

            schedule.scheduleJob(sellDate, async () => {
                console.log(`${sellDelay} minutes have passed since we bought. SELLING.`);

                // SELL DOGECOIN
                const response = await kraken.api('AddOrder', {
                    pair: 'XXDGXXBT',
                    type: 'sell',
                    ordertype: 'market',
                    volume: volume
                });

                if (! response.error.length) {
                    bought = false;
                }

                const balance = await getBalance();
                const BTC_balance = Number(balance['XXBT'] || 0).toFixed(8);
                const XDG_balance = Number(balance['XXDG'] || 0);

                // TEXT ME
                await twilio.messages.create({
                    body: `SOLD ${volume} DOGE. Balance: ${BTC_balance} BTC | ${XDG_balance} DOGE`,
                    from: "+16087655499",
                    to: process.env.PHONE_NUMBER,
                });
            })
        } else {
            console.log('This tweet does not mention DOGE :(');
        }
    }
});
