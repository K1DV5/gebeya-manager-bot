const mysql = require('mysql')
const makeCollage = require('collage')
const Telegraf = require('telegraf')

const CHANNEL = '@mygeb'
const ADMINS = ['K1DV5']

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

sql('select * from posts').then(r=>console.log(r))


async function handleStart(ctx) {
    let chatId = ctx.message.chat.id
    let username = cts.from.username
    if (ADMINS.includes(username)) {
        sql('INSERT INTO sessions (chat_id, chat_type, stage) values (?, "admin", ?) ON DUPLICATE KEY UPDATE stage = ?', [chatId, 0, 0])
        ctx.reply('Welcome, please input /newpost to post a new item.')
    } else {
        sql('INSERT INTO sessions (chat_id, stage) VALUES (?, ?) ON DUPLICATE KEY UPDATE stage = ?', [chatId, 0, 0])
        if (ctx.startPayload) {
            let messageId = ctx.startPayload
            let message = await sql('SELECT * FROM posts WHERE message_id = ?', [messageId])[0]
            ctx.telegram.sendPhoto(chatId, message.image_posted, `${message.title}\n\n${message.body}`)
            ctx.reply('To buy this item, contact @' + ADMINS[0] + '.')
            ctx.telegram.sendPhoto(ADMINS[0], message.image_posted, `${message.title}\n\n${message.body}\n\n` + ctx.message.from.username + ' may contact you.')
        } else {
            ctx.reply('Welcome, please go to our channel ' + CHANNEL + 'and select Buy on an item.')
        }
    }
}

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
