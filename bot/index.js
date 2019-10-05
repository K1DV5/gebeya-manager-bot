const methods = require('./methods')
const Telegraf = require('telegraf')

// methods.updateAdminsChannels()
// console.log('Updated')

const token = '893764106:AAG5W3yWFE4vKL0dsvCo4AfNy-9VaPvl2J4';

const bot = new Telegraf(token)

bot.start(methods.handleStart)
bot.command('post', methods.handlePost)
bot.on('text', methods.handleText)
bot.on('photo', methods.handlePhotoStage)

// bot.on('callback_query', (ctx) => {
//     console.log(ctx)
// })
//

bot.launch().then(() => console.log('listening...')).catch((err)=>{console.log(err.message)})

// methods.stopDB()
