
// -{node --inspect %f}
const os = require('os')
const path = require('path')
const Telegraf = require('telegraf')
// const fs = require('fs')
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
// let tlsOptions
if (os.hostname() === 'K1DV5') {
    bot = new Telegraf(process.env.TEST_BOT) // the testing bot
    // bot = new Telegraf(process.env.MAIN_BOT) // the testing bot
} else {
    // const cert = process.env.SSL_CERT
    // const key = process.env.SSL_KEY
    // tlsOptions = {
    //     cert: fs.readFileSync(cert),
    //     key: fs.readFileSync(key),
    // }

    // main bot, disable webhook reply to get sent message ids and avoid other errors
    bot = new Telegraf(process.env.MAIN_BOT, {telegram: {webhookReply: false}})
    // Set telegram webhook. to make it secure, use the token as the path.
    // commented to prevent setting it everytime this script is run
    // bot.telegram.setWebhook('https://tg-bot.' + process.env.DOMAIN + '/' + process.env.MAIN_BOT)
}

// the data models
bot.context.people = new peopleModel()
bot.context.channels = new channelsModel()
bot.context.posts = new postsModel()
// where the image manipulations will occur
bot.context.imagesDir = path.join(__dirname, '../images')
// the logo dir
bot.context.logoDir = path.join(bot.context.imagesDir, '.channels-logo')
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

if (os.hostname() === 'K1DV5') {
    bot.launch().then(() => console.log('bot listening...'))
} else {
    // set the info
    bot.context.botInfo = {username: process.env.BOT_USERNAME} // missing when using webhook
    bot.startWebhook('/' + process.env.MAIN_BOT, null, 8443)
}
