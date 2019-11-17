const {notifyBuy} = require('./notify')

async function handleWelcomeStart(ctx) { // for empty start from admins
    let username = ctx.from.username
    // store the chat id for the username
    let name = ctx.from.first_name || username
    await ctx.reply('Welcome, ' + name + ', please send\n/post to post a new item. Or you can go to\n/help to know more.', {
        reply_markup: ctx.defaultKeyboard
    })
    ctx.people.set(username, {chat_id: ctx.update.message.chat.id})
}

async function handleCustomerStart(ctx) { // for empty start from customers
    let reply = 'Welcome, please go to one of our channels '
    let channels = await ctx.channels.getUsernames()
    let chosen = []
    // limit the number of shown channels to 5
    let limit = 5
    if (channels.length > limit) {
        for (let i = 0; i < limit; i++) {
            let selectedIndex = Math.round(Math.random()*channels.length)
            chosen.push(channels[selectedIndex])
            channels.splice(selectedIndex)
        }
    } else {
        chosen = channels
    }
    for (let channel of chosen) {
        reply += '@' + channel + ', '
    }
    reply = reply.slice(0, -2) + ' and select "Buy" on an item. Or see the /help'
    ctx.reply(reply)
}

async function handleStart(ctx) { // start with a buy link parameter
    let messageIdDb = ctx.state.payload.replace('-', '/')
    let [channel, postId] = messageIdDb.split('/')
    let postData = await ctx.posts.get({channel, message_id: postId})
    if (postData) {
        // add to the interested list
        let custId = ctx.from.id
        let name = ctx.from.first_name || ctx.from.username || '[Anonymous]'
        let customer = {name, id: custId}
        let previousCust = JSON.parse(postData.interested).filter(cst => cst.id != custId)
        let newList = JSON.stringify([...previousCust, customer])
        await ctx.posts.set({channel, message_id: postId}, {interested: newList})
        let data = {
            caption: postData.caption,
            image: JSON.parse(postData.image_ids).collage,
            customers: [...previousCust, {name: name + ' (NEW!)', id: custId}],
            author: postData.author,
            buttons: {
                // classified on permissions basis
                edit: [
                    {text: 'Edit caption', callback_data: 'edit:' + messageIdDb},
                    {text: 'Mark sold', callback_data: 'sold:' + messageIdDb},
                ],
                delete: [{text: 'Delete', callback_data: 'delete:' + messageIdDb}],
                customer: [
                    { text: 'Details', callback_data: 'details:' + messageIdDb },
                    { text: 'Contact seller', url: 'https://t.me/' + postData.author },
                ]
            }
        }
        await notifyBuy(ctx, channel, postId, data)
    } else {
        ctx.reply('No message with that id was found.')
    }
}

module.exports = {
    handleStart,
    handleCustomerStart,
    handleWelcomeStart
}
