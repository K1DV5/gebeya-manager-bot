const mysql = require('mysql')
const makeCollage = require('./collage')
const methods = require('./methods')
const Telegraf = require('telegraf')

let connection = mysql.createConnection({
    host: 'localhost',
    user: 'bot',
    password : 'secret',
    database: 'my_gebeya'
})

connection.connect()

function sql(sql, args) {
    // process sql query and return the result
    return new Promise((resolve, reject) => {
        connection.query(sql, args, (error, results) => {
            if (error) {
                reject(error)
            } else if (results) {
                resolve(results)
            }
        })
    })
}

const INIT_INFO = {
    K1DV5: ['@mygeb']
}

const ADMINS = Object.keys(INIT_INFO)
const CHANNELS = ['@mygeb']

// methods.updateAdminsChannels()
console.log(methods)

//const token = '893764106:AAG5W3yWFE4vKL0dsvCo4AfNy-9VaPvl2J4';

//const bot = new Telegraf(token)

//bot.command('new', async (ctx) => {
//    // console.log(ctx.startPayload)
//    let message = await ctx.telegram.sendMessage('@mygeb', 'Sending...')
//    let message_id = message.message_id
//    ctx.telegram.editMessageText('@mygeb', message_id, undefined, "New,,", {
//        reply_markup: {
//        inline_keyboard: [
//                [
//                    {
//                        text: 'HO ho',
//                        url: 'https://t.me/MyGebeyaBot?start=' + message_id
//                    }
//                ]
//            ]
//        }
//    })
//    console.log(message_id)
//    // ctx.reply('done')
//})

//// bot.on('callback_query', (ctx) => {
////     console.log(ctx)
//// })
////

//bot.start(async ctx => {
//    chat_id = ctx.message.chat.id
//    let message = await ctx.telegram.forwardMessage(chat_id, '@mygeb', ctx.startPayload)
//    ctx.telegram.editMessageText(chat_id, message.message_id, undefined, message.text)
//    // ctx.telegram.deleteMessage(message.chat.id, message.message_id)
//    // ctx.reply(message.text, message.reply_markup)
//    // console.log(message)
//})


//bot.launch().then(() => console.log('listening')).catch((err)=>{console.log(err.message)})

 connection.end()
