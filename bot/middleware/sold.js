
async function handleSoldToggle(ctx) {
    let messageIdDb = ctx.update.callback_query.data
    let [channel, messageId] = messageIdDb.split('/')
    let query = `SELECT p.caption, p.image_ids, p.state, p.channel, c.sold_template
                 FROM posts as p
                 INNER JOIN channels AS c
                 ON c.username = p.channel
                 WHERE p.message_id = ?`
    let post = (await ctx.state.sql(query, messageIdDb))[0]
    let captionEntities = ctx.update.callback_query.message.caption_entities
    if (post.state === 'available' || ctx.state.forceSold) {
        let soldText = post.sold_template.replace(/:caption\b/, post.caption)
        try { // for when trying to edit with same content
            ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, soldText)
        } catch {}
        if (ctx.state.forceSold === undefined) {
            // change the state
            ctx.state.sql('UPDATE posts SET state = "sold", sold_date = ? WHERE message_id = ?', [ctx.update.callback_query.message.date, messageIdDb])
            // replace the button with undo
            let userId = captionEntities.filter(e => e.type == 'text_mention')[0].user.id
            let itemLink = '<a href="' + captionEntities.filter(e => e.type == 'text_link')[0].url + '">this item</a>'
            let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
            let text = `You have a ${customerLink} who wants to buy ${itemLink} from @${post.channel}. They may contact you.`
            let chatId = ctx.update.callback_query.from.id
            let adminMessageId = ctx.update.callback_query.message.message_id
            ctx.telegram.editMessageCaption(chatId, adminMessageId, undefined, text, {
                parse_mode: 'html',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Undo sold', callback_data: 'sold:' + messageIdDb },
                            { text: 'Repost', callback_data: 'repost:' + messageIdDb },
                            { text: 'Delete', callback_data: 'delete:' + messageIdDb }
                        ]
                    ]
                }
            })
        }
    } else {
        let caption = post.caption
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + messageIdDb.replace('/', '-')
        ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, caption, {
            inline_keyboard: [ [ { text: 'Buy', url: startUrl } ] ]
        })
        // change the state
        ctx.state.sql('UPDATE posts SET state = "available" WHERE message_id = ?', [messageIdDb])
        // replace the button with undo
        let userId = captionEntities.filter(e => e.type == 'text_mention')[0].user.id
        let itemLink = '<a href="' + captionEntities.filter(e => e.type == 'text_link')[0].url + '">this item</a>'
        let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
        let text = `You have a ${customerLink} who wants to buy ${itemLink} from @${post.channel}. They may contact you.`
        let chatId = ctx.update.callback_query.from.id
        let adminMessageId = ctx.update.callback_query.message.message_id
        ctx.telegram.editMessageCaption(chatId, adminMessageId, undefined, text, {
            parse_mode: 'html',
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
    }
}

module.exports = handleSoldToggle
