
async function handleStart(ctx) {
    let {id: userId, username} = ctx.update.message.from
    if (ctx.startPayload) {  // a button on a post was clicked
        let messageIdDb = ctx.startPayload.trim().replace('-', '/')
        let [channel, postId] = messageIdDb.split('/')
        let message = (await ctx.state.sql('SELECT * FROM posts WHERE channel = ? AND message_id = ?', [channel, postId]))[0]
        if (message) {
            // send messages to both parties.
            let itemText = 'this item'
            let itemLink = `<a href="https://t.me/${messageIdDb}">${itemText}</a>`
            let adminUsername = await ctx.state.posts.getAdmin(messageIdDb)
            let adminChatId = await ctx.state.people.get(adminUsername, ['chat_id'])

            // to the customer
            let postData = await ctx.state.posts.get(messageIdDb, ['caption', 'image_ids'])
            let contactText = await ctx.state.channels.get(channel, 'contact_text')
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
                            { text: 'Mark as sold', callback_data: 'sold:' + messageIdDb },
                            { text: 'Repost', callback_data: 'repost:' + messageIdDb },
                            { text: 'Delete', callback_data: 'delete:' + messageIdDb }
                        ]
                    ]
                }
            })
        } else {
            ctx.reply('No message with that id was found.')
        }
    } else {
        if (ctx.state.isAdmin) {
            // store the chat id for the username
            ctx.state.people.set(username, {chat_id: ctx.chat.id})
            ctx.reply('Welcome, now I can talk to you. Please send /post to post a new item.')
        } else {
            let reply = 'Welcome, please go to one of our channels '
            let channels = await ctx.state.channels.getUsernames()
            let chosen = []
            if (channels.length > limit) {
                let limit = 5
                // limit the number of shown channels to 5
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
}

module.exports = handleStart
