const mysql = require('mysql')
const os = require('os')
// const handlers = require('./handlers')
const Telegraf = require('telegraf')
// the handlers
const start = require('./middleware/start')
const post = require('./middleware/post')
const admin = require('./middleware/admin')
const settings = require('./middleware/settings')
const help = require('./middleware/help')
const license = require('./middleware/license')
const text = require('./middleware/text')
const doc = require('./middleware/document')
const callback = require('./middleware/callback')

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
    token = '949809527:AAGfH21rcESpeMZTcvZJYymAozX8llLjdDw';
    connection = mysql.createConnection({
        host: 'cpanel.k1dv5.com',
        user: 'k1dv5com_tg_bot',
        password: 'tg_bot_pass',
        database: 'k1dv5com_tg_gebeya'
    })
}

connection.connect()

function queryDb(sql, args) {
    // process sql query and return the result
    return new Promise((resolve) => {
        connection.query(sql, args, (error, results) => {
            if (error) {
                console.log(error.message)
            } else if (results) {
                resolve(results)
            }
        })
    })
}

const bot = new Telegraf(token)

bot.use(async (ctx, next) => { // set necessary variables
    ctx.state.sql = queryDb
    ctx.state.admins = SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES
    ctx.state.fallbackReply = 'Error, don\'t know what you want to do. Maybe you need /help'
    ctx.state.imagesDir = '../images-staging'
    let channelAdmins = (await queryDb('SELECT username FROM people')).map(p => p.username)
    let from = ctx.from.username
    if (channelAdmins.includes(from)) {
        ctx.state.isAdmin = true
        ctx.state.stage = (await queryDb('SELECT conversation FROM people WHERE username = ?', [from]))[0].conversation
    }
    next()
})

bot.start(               start)
bot.command('post',      post)
bot.command('adminadd',  admin)
bot.command('settings',  settings)
bot.command('help',      help)
bot.command('license',   license)
bot.command('end',       post)
bot.on('text',           text)
bot.on('photo',          post)
bot.on('document',       doc)
bot.on('callback_query', callback)

bot.launch().then(() => console.log('listening...')).catch((err)=>{console.log(err.message)})

// connection.end()
