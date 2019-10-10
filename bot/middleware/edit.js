const {draftToPostable} = require('../utils')

async function handleEditPost(ctx) {
    let username = ctx.from.username
    let stage = ctx.state.stage
    if (stage === 'edit.title') {
        let text = ctx.update.message.text
        if (text.trim() === 'skip') {
            let query = `UPDATE people
                            SET draft_title = (SELECT title FROM posts WHERE message_id = people.draft_destination),
                            conversation = "edit.description"
                         WHERE username = ?`
            ctx.state.sql(query, [username])
        } else {
            ctx.state.sql('UPDATE people SET draft_title = ?, conversation = "edit.description" WHERE username = ?', [text, username])
        }
        ctx.reply('Send the new description. If you don\'t want to change it, send <b>skip</b>.', {parse_mode: 'html'})
    } else if (stage === 'edit.description') {
        let text = ctx.update.message.text
        if (text.trim() === 'skip') {
            let query = `UPDATE people
                            SET draft_description = (SELECT description FROM posts WHERE message_id = people.draft_destination),
                            conversation = "edit.price"
                         WHERE username = ?`
            ctx.state.sql(query, [username])
        } else {
            ctx.state.sql('UPDATE people SET draft_description = ?, conversation = "edit.price" WHERE username = ?', [text, username])
        }
        ctx.reply('Send the new price. If you don\'t want to change it, send <b>skip</b>.', {parse_mode: 'html'})
    } else if (stage === 'edit.price') {
        let text = ctx.update.message.text
        if (text.trim() === 'skip') {
            let query = `UPDATE people
                            SET draft_price = (SELECT price FROM posts WHERE message_id = people.draft_destination),
                                conversation = "edit.ready",
                         WHERE username = ?`
            // await ctx.state.sql(query, [username])
        } else {
            // await ctx.state.sql('UPDATE people SET draft_price = ?, conversation = "edit.ready" WHERE username = ?', [text, username])
        }
        let adminData = await draftToPostable(username, ctx.state.sql)
        console.log(adminData)
        return
        let collage = adminData.images.collage
        let caption = '<i>The new caption will look like this...</i>\n\n' + adminData.caption
        let message = await ctx.replyWithPhoto(collage, {
                parse_mode: 'html',
                caption, reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Save changes', callback_data: 'edit:save.' + username },
                            { text: 'Discard', callback_data: 'edit:discard.' + username }
                        ]
                    ]
                }})
        let removedIds = adminData.removedIds
        removedIds.preview = message.message_id
        ctx.state.sql(`UPDATE people SET removed_message_ids = ?  conversation = "edit.ready"
                           WHERE username = ?`, [JSON.stringify(removedIds), username] )
    } else if (stage === 'edit.ready') {
        let adminData = await draftToPostable(username, ctx.state.sql)
        ctx.state.sql(`UPDATE people SET draft_title = NULL,
                              draft_description = NULL,
                              draft_destination = NULL,
                              draft_image_ids = NULL,
                              removed_message_ids = NULL,
                              preview_post_message_id = NULL,
                              conversation = NULL
             WHERE username = ?`, [adminData.username])
        let input = ctx.update.callback_query
        let command = input.data.slice(0, input.data.indexOf('.'))
        let chatId = ctx.update.callback_query.from.id
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + adminData.destination.replace('/', '-')
        let deletedMessage
        if (command === 'post_editted') {
            deletedMessage = adminData.removedIds.editOrigin
            ctx.telegram.editMessageCaption(adminData.caption, [[ { text: 'Buy', url: startUrl } ]])
            ctx.reply('Post updated.')
        } else {
            deletedMessage = adminData.removedIds.preview
            ctx.reply('Editting cancelled.')
        }
        ctx.telegram.deleteMessage(chatId, deletedMessage)
    } else {
        let input = ctx.update.callback_query
        let messageIdDb = input.data
        let query = 'SELECT 1 FROM posts WHERE message_id = ?'
        let postExists = (await ctx.state.sql(query, [messageIdDb]))[0]
        if (postExists) {
            let messageId = ctx.update.callback_query.message.message_id
            ctx.state.sql(`UPDATE people SET conversation = "edit.title",
                               draft_destination = ?,
                               removed_message_ids = ?,
                               draft_image_ids = (SELECT image_ids FROM posts WHERE message_id = people.draft_destination)
                            WHERE username = ?`, [messageIdDb, JSON.stringify({editOrigin: messageId}), username])
            let postUrl = 'https://t.me/' + messageIdDb
            let text = 'Editting <a href="' + postUrl + '">this post</a>, write the new title. You can send <b>skip</b> To keep the existing title.'
            ctx.reply(text, {parse_mode: 'html'})
        } else {
            ctx.reply('Sorry, not found')
        }
    }
}

module.exports = handleEditPost
