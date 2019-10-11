
async function handleDetails(ctx) {  // details callback
    let messageIdDb = ctx.update.callback_query.data
    let messageDetails = (await ctx.state.sql('SELECT * FROM posts WHERE message_id = ?', [messageIdDb]))[0]
    if (messageDetails && messageDetails.state === 'available') {
        // let person = (await ctx.state.sql(`SELECT a.username
        //                         FROM posts AS p
        //                         INNER JOIN channels AS c
        //                             ON p.channel = c.username
        //                         INNER JOIN people AS a
        //                             ON c.admin = a.username
        //                         WHERE message_id = ?`,
        //                         [messageIdDb]))[0]
        let images = JSON.parse(messageDetails.image_ids).watermarked
        images = images.map(img => {return {type: 'photo', media: img}})
        // put the caption on the last one
        images[images.length - 1].caption = messageDetails.caption
        ctx.replyWithMediaGroup(images, {
            // reply_markup: {
            //     inline_keyboard: [
            //             [
            //                 {
            //                     text: 'Contact seller',
            //                     url: 'https://t.me/' + person.username
            //                 }
            //             ]
            //         ]
            // }
        })
    } else if (messageDetails.state === 'sold') {
        ctx.reply('Sorry, item already sold.')
    } else if (messageDetails.status === 'deleted') {
        ctx.reply('Details not found')
    } else {
        ctx.reply(ctx.state.fallbackReply)
    }
}

module.exports = handleDetails
