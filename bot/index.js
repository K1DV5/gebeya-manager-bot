const mysql = require('mysql')
// const handlers = require('./handlers')
const Telegraf = require('telegraf')

const token = '949809527:AAGfH21rcESpeMZTcvZJYymAozX8llLjdDw';

const SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES = ['K1DV5']

let connection = mysql.createConnection({
    host: 'localhost',
    user: 'bot',
    password : 'secret',
    database: 'my_gebeya'
})

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

bot.start(               require('./middleware/start'))
bot.command('post',      require('./middleware/post'))
bot.command('adminadd',  require('./middleware/admin'))
bot.command('settings',  require('./middleware/settings'))
bot.command('help',      require('./middleware/help'))
bot.command('license',   require('./middleware/license'))
bot.on('text',           require('./middleware/text'))
bot.on('photo',          require('./middleware/post'))
bot.on('document',       require('./middleware/document'))
bot.on('callback_query', require('./middleware/callback'))

bot.launch().then(() => console.log('listening...')).catch((err)=>{console.log(err.message)})

// connection.end()
