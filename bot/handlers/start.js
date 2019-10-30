const {notifyBuy} = require('./notify')

async function handleWelcomeStart(ctx) {
    let username = ctx.from.username
    if (ctx.state.isChannelAdmin) {
        // store the chat id for the username
        let name = ctx.from.first_name || username
        await ctx.reply('Welcome, ' + name + ', please send\n/post to post a new item. Or you can go to\n/help to know more.', {
            reply_markup: ctx.defaultKeyboard
        })
        ctx.people.set(username, {chat_id: ctx.update.message.chat.id})
    } else {
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
        reply = reply.slice(0, -2) + ' and select "Buy" on an item.'
        ctx.reply(reply)
    }
}

async function handleStart(ctx) {
    let userId = ctx.update.message.from.id
    let messageIdDb = ctx.state.payload.replace('-', '/')
    let [channel, postId] = messageIdDb.split('/')
    let postData = await ctx.posts.get({channel, message_id: postId})
    if (postData) {
        // add to the interested list
        let previousCust = JSON.parse(postData.interested)
        let name = ctx.from.first_name || ctx.from.username || 'Anonymous'
        let custId = ctx.from.id
        let customer = {name, id: custId}
        let newList = JSON.stringify([...previousCust.filter(cst => cst.id != custId), customer])
        await ctx.posts.set({channel, message_id: postId}, {interested: newList})
        let data = {
            caption: postData.caption,
            image: JSON.parse(postData.image_ids).collage,
            customers: previousCust,
            author: postData.author,
            customer,
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
    handleWelcomeStart
}
