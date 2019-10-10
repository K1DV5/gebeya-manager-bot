
async function handleRepost(ctx) {
    let input = ctx.update.callback_query
    let messageIdDb = input.data
    let query = `SELECT p.caption, p.image_ids as images, p.channel, p.state, c.sold_template
                 FROM posts as p
                 INNER JOIN channels AS c
                     ON c.username = p.channel
                 WHERE p.message_id = ?`
    let postData = (await ctx.state.sql(query, [messageIdDb]))[0]
    if (postData) {
        if (postData.state === 'available') {
            // mark as sold
            let soldText = postData.sold_template.replace(/:caption\b/, postData.caption)
            ctx.telegram.editMessageCaption('@' + postData.channel, messageIdDb.split('/')[1], undefined, soldText)
            // also in db
            ctx.state.sql('UPDATE posts SET state = "sold" WHERE message_id = ?', [messageIdDb])
        }
        let collageId = JSON.parse(postData.images).collage
        let message = await ctx.telegram.sendPhoto('@' + postData.channel, collageId, {caption: postData.caption})
        let newMessageIdDb = postData.channel + '/' + message.message_id
        ctx.state.sql('INSERT INTO posts (message_id, channel, caption, image_ids) VALUES (?, ?, ?, ?)',
            [newMessageIdDb, postData.channel, postData.caption, postData.images])
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + newMessageIdDb.replace('/', '-')
        ctx.telegram.editMessageReplyMarkup('@' + postData.channel, message.message_id, undefined, {
            inline_keyboard: [
                [ { text: 'Buy', url: startUrl } ]
            ]
        })
        let newLink = '<a href="https://t.me/' + newMessageIdDb + '">here</a>'
        ctx.telegram.editMessageText(
            input.from.id, input.message.message_id,
            undefined,
            'New item posted, you can find your new post ' + newLink + '.',
            {parse_mode: 'html'})
    } else {
        ctx.reply('Sorry, not found')
    }
}

module.exports = handleRepost
