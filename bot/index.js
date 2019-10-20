
// -{node --inspect %f}
const os = require('os')
const path = require('path')
const Telegraf = require('telegraf')
const fs = require('fs')

// the router
const router = require('./middleware/router')

// the models
const peopleModel = require('./models/people')
const channelsModel = require('./models/channels')
const postsModel = require('./models/posts')

const SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES = ['K1DV5']

let bot
let tlsOptions
if (os.hostname() !== 'K1DV5') {
    bot = new Telegraf('959496597:AAEWFvI1oYv58RLrrckR_c1cW-4-tPZ1Pjw') // the testing bot
    // bot = new Telegraf('949809527:AAGfH21rcESpeMZTcvZJYymAozX8llLjdDw') // main bot
} else {
    const cert = path.join(__dirname, '../self-server-cert.pem')
    const key = path.join(__dirname, '../self-server-key.pem')
    try {
        bot = new Telegraf('949809527:AAGfH21rcESpeMZTcvZJYymAozX8llLjdDw') // main bot
        tlsOptions = {
            cert: fs.readFileSync(cert),
            key: fs.readFileSync(key),
        }

        // Set telegram webhook
        bot.telegram.setWebhook('https://k1dv5.com:8443/tg-gebeya', { source: cert })
            .then(fs.writeFileSync('scc-webhook1.txt', 'Webhook set'))
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

// do actual work
bot.use(router)

if (os.hostname() !== 'K1DV5') {
    bot.launch().then(() => console.log('bot listening...')).catch((err)=>{console.log(err.message)})
} else {
    try {
        bot.startWebhook('/tg-gebeya', tlsOptions, 8443)
        fs.writeFileSync('scc-webhook2.txt', 'Webhook started')
    } catch(err) {
        fs.writeFileSync('err-webhook-start.txt', err)
    }
}
