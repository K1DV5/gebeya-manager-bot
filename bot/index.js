const mysql = require('mysql')
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

let connection
let token
if (os.hostname() === 'K1DV5') {
    token = '959496597:AAEWFvI1oYv58RLrrckR_c1cW-4-tPZ1Pjw'
    connection = mysql.createConnection({
        host: 'localhost',
        user: 'k1dv5com_tg_bot',
        database: 'k1dv5com_tg_gebeya'
    })
} else {
    token = '949809527:AAGfH21rcESpeMZTcvZJYymAozX8llLjdDw'
    connection = mysql.createConnection({
        host: 'cpanel.k1dv5.com',
        user: 'k1dv5com_tg_bot',
        password: 'tg_bot_pass',
        database: 'k1dv5com_tg_gebeya'
    })
}

connection.connect()

const bot = new Telegraf(token)

// the data models
bot.context.people = new peopleModel(connection)
bot.context.channels = new channelsModel(connection)
bot.context.posts = new postsModel(connection)
// where the image manipulations will occur
bot.context.imagesDir = path.join(__dirname, '../images-staging')
// default reply for unknown intent
bot.context.fallbackReply = 'Error, don\'t know what you want to do. Maybe you need /help'
// the sys admins
bot.context.admins = SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES

// bot.catch(err => {console.log(err.message)})

// do actual work
bot.use(router)

bot.launch().then(() => console.log('bot listening...')).catch((err)=>{console.log(err.message)})

// for web requests
var server = https.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'})
    var message = 'This is a telegram bot. Go to <a href="https://t.me/GebeyaManagerBot">here</a> and talk to it.'
    res.end(message)
})
// server.listen(3000, () => console.log('server listening...'));

// connection.end()
