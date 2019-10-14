
async function handleRepost(ctx) {
    let input = ctx.update.callback_query
    let [channel, postId] = input.data.split('/')
    let query = `SELECT p.caption, p.image_ids as images, p.state, c.sold_template, c.license_expiry
                 FROM posts as p
                 INNER JOIN channels AS c
                     ON c.username = p.channel
                 WHERE p.channel = ? AND p.message_id = ?`
    let postData = (await ctx.state.sql(query, [channel, postId]))[0]
    if (!postData) {
        ctx.reply('Sorry, not found')
        return
    }
    if (postData.license_expiry*1 < input.message.date) {
        ctx.reply('Your license for this channel has expired. Contact @' + ctx.state.admins + ' for renewal.')
        return
    }
    if (postData.state === 'available') {
        // mark as sold
        let soldText = postData.sold_template.replace(/:caption\b/, postData.caption)
        ctx.telegram.editMessageCaption('@' + channel, postId, undefined, soldText)
        // also in db
        ctx.state.sql('UPDATE posts SET state = "sold" WHERE channel = ? AND message_id = ?', [channel, postId])
    }
    let collageId = JSON.parse(postData.images).collage
    let message = await ctx.telegram.sendPhoto('@' + channel, collageId, {caption: postData.caption})
    let newMessageIdDb = channel + '/' + message.message_id
    ctx.state.sql('INSERT INTO posts (channel, message_id, caption, image_ids) VALUES (?, ?, ?, ?)',
        [channel, message.message_id, postData.caption, postData.images])
    let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + newMessageIdDb.replace('/', '-')
    ctx.telegram.editMessageReplyMarkup('@' + channel, message.message_id, undefined, {
        inline_keyboard: [
            [ { text: 'Buy', url: startUrl } ]
        ]
    })
    let newLink = '<a href="https://t.me/' + newMessageIdDb + '">here</a>'
    ctx.telegram.editMessageCaption(
        input.from.id, input.message.message_id,
        undefined,
        '<i>New item posted, you can find your new post</i> ' + newLink + '.\n\n' + postData.caption,
        {
            disable_web_page_preview: true,
            parse_mode: 'html',
            reply_markup: { 
             inline_keyboard: [[{text: 'Edit caption', callback_data: 'edit:' + newMessageIdDb}]]
        }})
}

module.exports = handleRepost
