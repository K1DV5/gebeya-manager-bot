
// -{node --inspect %f}
const os = require('os')
const path = require('path')
const Telegraf = require('telegraf')
const fs = require('fs')
// for the tokens etc
require('dotenv').config({path: path.join(__dirname, '../.env')})

// the router
const router = require('./middleware/router')

// the models
const peopleModel = require('./models/people')
const channelsModel = require('./models/channels')
const postsModel = require('./models/posts')

const SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES = ['K1DV5']

let bot
let tlsOptions
if (os.hostname() === 'K1DV5') {
    bot = new Telegraf(process.env.TEST_BOT) // the testing bot
    // bot = new Telegraf(process.env.MAIN_BOT) // main bot
} else {
    const cert = path.join(__dirname, process.env.SSL_CERT)
    const key = path.join(__dirname, process.env.SSL_KEY)
    try {
        // main bot, disable webhook reply to get sent message ids
        bot = new Telegraf(process.env.MAIN_BOT, {telegram: {webhookReply: false}})
        tlsOptions = {
            cert: fs.readFileSync(cert),
            key: fs.readFileSync(key),
        }

        // Set telegram webhook
        bot.telegram.setWebhook('https://' + process.env.DOMAIN + process.env.BOT_PATH, { source: cert })
    } catch(err) {
        fs.writeFileSync('err-webhook-set.txt', err)
    }
}

// the data models
bot.context.people = new peopleModel()
bot.context.channels = new channelsModel()
bot.context.posts = new postsModel()
// where the image manipulations will occur
bot.context.imagesDir = path.join(__dirname, '../images-staging')
// default reply for unknown intent
bot.context.fallbackReply = 'Error, don\'t know what you want to do. Maybe you need /help'
// the sys admins
bot.context.admins = SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES
// default keyboard
bot.context.defaultKeyboard = {
    keyboard: [[
        {text: '/post'},
        {text: '/settings'},
    ], [
        {text: '/license'},
        {text: '/help'},
    ], [
        {text: '/cancel'},
        {text: '/end'}
    ]],
    resize_keyboard: true,
    // one_time_keyboard: true
}

// do actual work
bot.use(router)

function start(err) {
    if (!err || ['ECONNREFUSED', 'ETIMEDOUT'].includes(err.code) && tried < trials) {
        bot.launch().then(() => console.log('bot listening...')).catch((err)=>{
            if (['ECONNREFUSED', 'ETIMEDOUT'].includes(err.code)) {
                console.log(err.code, 'retrying...')
                start()
                tried++
            } else {
                throw err
            }
        })
    } else {
        throw err
    }
}

if (os.hostname() === 'K1DV5') {
    let tried = 0
    let trials = 10
    bot.catch(start)
    start()
} else {
    try {
        // set the info
        bot.context.botInfo = {username: 'GebeyaManagerBot'}
        bot.startWebhook(process.env.BOT_PATH, tlsOptions, 8443)
        // require('https')
        // .createServer(tlsOptions, bot.webhookCallback(process.env.BOT_PATH))
        // .listen(8443)
    } catch(err) {
        fs.writeFileSync('err-webhook-start.txt', err)
    }
}
