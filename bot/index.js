const mysql = require('mysql')
var https = require('http');
const os = require('os')
const path = require('path')
// const handlers = require('./handlers')
const Telegraf = require('telegraf')

const start = require('./handlers/start')
const admin = require('./handlers/admin')
const post = require('./handlers/post')
// const admin = require('./middleware/admin')
// const settings = require('./middleware/settings')
// const help = require('./middleware/help')
// const license = require('./middleware/license')
const text = require('./handlers/text')
// const doc = require('./middleware/document')
const callback = require('./handlers/callback')

const peopleModel = require('./models/people')
const channelsModel = require('./models/channels')
const postsModel = require('./models/posts')

const SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES = ['K1DV5']

let connection
let token
if (os.hostname() === 'K1DV5') {
    token = '959496597:AAEx1xGOKOnFY3gmk6LsUyrg3LaXhAFy7gE'
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

bot.use(async (ctx, next) => { // set necessary variables
    ctx.state.admins = SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES
    ctx.state.fallbackReply = 'Error, don\'t know what you want to do. Maybe you need /help'
    // the models
    ctx.state.people = new peopleModel()
    ctx.state.channels = new channelsModel()
    ctx.state.posts = new postsModel()

    ctx.state.imagesDir = path.join(__dirname, '../images-staging')
    let from = ctx.from.username
    ctx.state.isAdmin = await ctx.state.people.exists(from)
    if (ctx.state.isAdmin) {
        ctx.state.convo = await ctx.state.people.getConvo(from)
    }
    next()
})

bot.catch(err => {console.log(err.message)})

bot.start(               start)
bot.command('post',      post)
bot.command('adminadd',  admin)
// bot.command('settings',  settings)
// bot.command('help',      help)
// bot.command('license',   license)
bot.command('end',       post)
bot.on('text',           text)
bot.on('photo',          post)
// bot.on('document',       doc)
bot.on('callback_query', callback)

bot.launch().then(() => console.log('bot listening...')).catch((err)=>{console.log(err.message)})

// for web requests
var server = https.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    var message = 'This is a telegram bot. Go to <a href="https://t.me/GebeyaManagerBot">here</a> and talk to it.',
        version = 'NodeJS ' + process.versions.node + '\n',
        response = [message, version].join('<br><br>');
    res.end(response);
});
server.listen(3000, () => console.log('server listening...'));

// connection.end()
