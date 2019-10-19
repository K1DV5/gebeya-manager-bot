
// -{node --inspect %f}
var https = require('http');
const os = require('os')
const path = require('path')
const Telegraf = require('telegraf')

// the router
const router = require('./middleware/router')

// the models
const peopleModel = require('./models/people')
const channelsModel = require('./models/channels')
const postsModel = require('./models/posts')

const SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES = ['K1DV5']

const token = (os.hostname() === 'K1DV5' ?
    '959496597:AAEWFvI1oYv58RLrrckR_c1cW-4-tPZ1Pjw':
    '949809527:AAGfH21rcESpeMZTcvZJYymAozX8llLjdDw')

const bot = new Telegraf(token)

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

bot.launch().then(() => console.log('bot listening...')).catch((err)=>{console.log(err.message)})

// for web requests
if (os.hostname() !== 'K1DV5') {
    let server = https.createServer(function(req, res) {
        res.writeHead(200, {'Content-Type': 'text/html'})
        let message = 'This is a telegram bot. Go to <a href="https://t.me/GebeyaManagerBot">here</a> and talk to it.'
        res.end(message)
    })
    server.listen(3000, () => console.log('server listening...'));
}

