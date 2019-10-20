
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
if (os.hostname() === 'K1DV5') {
    bot = new Telegraf('959496597:AAEWFvI1oYv58RLrrckR_c1cW-4-tPZ1Pjw')
} else {
    try {
        bot = new Telegraf('949809527:AAGfH21rcESpeMZTcvZJYymAozX8llLjdDw')
        // TLS options
        tlsOptions = {
            cert: fs.readFileSync(path.join(__dirname, '../self-server-cert.pem')),
            key: fs.readFileSync(path.join(__dirname, '../self-server-key.pem')),
          // ca: [
          //   // This is necessary only if the client uses a self-signed certificate.
          //   fs.readFileSync('client-cert.pem')
          // ]
        }

        // Set telegram webhook
        // The second argument is necessary only if the client uses a self-signed 
        // certificate. Including it for a verified certificate may cause things to break.
        bot.telegram.setWebhook('https://k1dv5.com:8443/tg-gebeya', {
            source: path.join(__dirname, '../self-server-cert.pem')
        }).then(() => {fs.writeFileSync('success1.txt', 'Webhook set')})
    } catch(err) {
        fs.writeFileSync('err.txt', err)
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

// bot.catch(err => {console.log(err.message)})


// do actual work
// bot.command('try', (ctx) => {
//     console.log(ctx)
// })
bot.use(router)

if (os.hostname() === 'K1DV5') {
    bot.launch().then(() => console.log('bot listening...')).catch((err)=>{console.log(err.message)})
} else {
    try {
        bot.startWebhook('/tg-gebeya', tlsOptions, 8443)
        fs.writeFileSync('success.txt', 'Listening...')
    } catch(err) {
        fs.writeFileSync('err2.txt', err)
    }
}
