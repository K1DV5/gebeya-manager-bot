
async function handleStart(ctx) {
    let {id: userId, username} = ctx.update.message.from
    if (ctx.startPayload) {  // a button on a post was clicked
        let messageIdDb = ctx.startPayload.trim().replace('-', '/')
        let message = (await ctx.state.sql('SELECT * FROM posts WHERE message_id = ?', [messageIdDb]))[0]
        if (message) {
            let [channel] = messageIdDb.split('/', 1)
            // send messages to both parties.
            let itemText = 'this item'
            let itemLink = `<a href="https://t.me/${messageIdDb}">${itemText}</a>`
            let person = (await ctx.state.sql(`SELECT a.chat_id AS chat_id, a.username AS username
                                    FROM posts AS p
                                    INNER JOIN channels AS c
                                        ON p.channel = c.username
                                    INNER JOIN people AS a
                                        ON c.admin = a.username
                                    WHERE message_id = ?`, [messageIdDb]))[0]

            // to the customer
            let query = `SELECT p.caption, p.image_ids AS images, c.contact_text AS contactText
                                FROM posts as p
                                INNER JOIN channels as c
                                    ON c.username = p.channel
                                WHERE p.message_id = ?`
            let postData = (await ctx.state.sql(query, [messageIdDb]))[0]
            let caption = '<i>You have selected</i> ' + itemLink + ' <i>from</i> @' + channel + '.\n\n' + postData.caption + '\n\n' + postData.contactText
            let collage = JSON.parse(postData.images).collage
            ctx.replyWithPhoto(collage, {
                caption,
                disable_web_page_preview: true,
                parse_mode: 'html',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Details', callback_data: 'details:' + messageIdDb },
                            { text: 'Contact seller', url: 'https://t.me/' + person.username }
                        ]
                    ]
                }
            })

            // to the person (seller)
            let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
            caption = `<i>You have a</i> ${customerLink} <i>who wants to buy</i> ${itemLink} <i>from</i> @${channel}. <i>They may contact you</i>.\n\n` + postData.caption
            ctx.telegram.sendPhoto(person.chat_id, collage, {
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
        let people = (await ctx.state.sql('SELECT username FROM people')).map(p => p.username)
        if (people.includes(username)) {
            // person exists in db assumed
            ctx.state.sql(`UPDATE people SET chat_id = ? WHERE username = ?`,
                [ctx.chat.id, username])
            // store the chat id for the username
            ctx.reply('Welcome, now I can talk to you. Please send /post to post a new item.')
        } else {
            let reply = 'Welcome, please go to one of our channels '
            let channels = (await ctx.state.sql('SELECT username FROM channels')).map(ch => ch.username)
            for (let channel of channels) {
                reply += '@' + channel + ', '
            }
            reply = reply.slice(0, -2) + ' and select "Buy" on an item.'
            ctx.reply(reply)
        }
    }
}

module.exports = handleStart
