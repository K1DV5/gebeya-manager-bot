
async function handleWelcomeStart(ctx) {
    let username = ctx.from.username
    if (ctx.state.isChannelAdmin) {
        // store the chat id for the username
        let name = ctx.from.first_name || username
        await ctx.reply('Welcome, ' + name + ', please send\n/post to post a new item. Or you can go to\n/help to know more.', {
            reply_markup: ctx.defaultKeyboard
        })
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
    let message = await ctx.posts.get({channel, message_id: postId})
    if (message) {
        // send messages to both parties.
        let itemText = 'this item'
        let itemLink = `<a href="https://t.me/${messageIdDb}">${itemText}</a>`
        let adminUsername = await ctx.posts.getAdmin(channel, postId)
        let adminChatId = await ctx.people.get(adminUsername, 'chat_id')

        // to the customer
        let postData = await ctx.posts.get({channel, message_id: postId}, ['caption', 'image_ids'])
        let contactText = await ctx.channels.get(channel, 'contact_text')
        let caption = '<i>You have selected</i> ' + itemLink + ' <i>from</i> @' + channel + '.\n\n' + postData.caption + '\n\n' + contactText
        let collage = JSON.parse(postData.image_ids).collage
        ctx.replyWithPhoto(collage, {
            caption,
            disable_web_page_preview: true,
            parse_mode: 'html',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Details', callback_data: 'details:' + messageIdDb },
                        { text: 'Contact seller', url: 'https://t.me/' + adminUsername }
                    ]
                ]
            }
        })

        // to the person (seller)
        let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
        caption = `<i>You have a</i> ${customerLink} <i>who wants to buy</i> ${itemLink} <i>from</i> @${channel}. <i>They may contact you</i>.\n\n` + postData.caption
        ctx.telegram.sendPhoto(adminChatId, collage, {
            caption,
            parse_mode: 'html',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Mark sold', callback_data: 'sold:' + messageIdDb },
                        { text: 'Delete', callback_data: 'delete:' + messageIdDb }
                    ]
                ]
            }
        })
    } else {
        ctx.reply('No message with that id was found.')
    }
}

module.exports = {
    handleStart,
    handleWelcomeStart
}
