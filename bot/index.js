const mysql = require('mysql')
const handlers = require('./handlers')
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

handlers.init(SUPER_MEGA_SUPER_COLOSSAL_SUPER_BIG_HUGE_BIG_BOSSES, queryDb, token)

const bot = new Telegraf(token)

bot.start(handlers.handleStart)
bot.on('callback_query', handlers.handleCallback)
bot.command('post', handlers.handlePost)
bot.command('adminadd', handlers.handleAdminAdd)
bot.on('text', handlers.handleText)
bot.on('photo', handlers.handlePhotoStage)
bot.on('document', console.log)

bot.launch().then(() => console.log('listening...')).catch((err)=>{console.log(err.message)})

// connection.end()
