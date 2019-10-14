const {draftToPostable} = require('../utils')

async function handleEditPost(ctx) {
    let username = ctx.from.username
    let stage = ctx.state.stage
    if (stage === 'edit.title') {
        let text = ctx.update.message.text
        if (text.trim() === 'skip') {
            let query = `UPDATE people
                            SET draft_title = (SELECT title FROM posts
                                WHERE channel = SUBSTRING_INDEX(people.draft_destination, '/', 1)
                                AND message_id = SUBSTRING_INDEX(people.draft_destination, '/', -1)),
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
                            SET draft_description = (SELECT description FROM posts
                                WHERE channel = SUBSTRING_INDEX(people.draft_destination, '/', 1)
                                AND message_id = SUBSTRING_INDEX(people.draft_destination, '/', -1)),
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
                            SET draft_price = (SELECT price FROM posts
                                WHERE channel = SUBSTRING_INDEX(people.draft_destination, '/', 1)
                                AND message_id = SUBSTRING_INDEX(people.draft_destination, '/', -1)),
                         WHERE username = ?`
            await ctx.state.sql(query, [username])
        } else {
            await ctx.state.sql('UPDATE people SET draft_price = ? WHERE username = ?', [text, username])
        }
        let adminData = await draftToPostable(username, ctx.state.sql, 'edit')
        let collage = adminData.images.collage
        let caption = '<i>The new caption will look like this...</i>\n\n' + adminData.caption
        let message = await ctx.replyWithPhoto(collage, {
                parse_mode: 'html',
                caption, reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Save changes', callback_data: 'edit.after:save' },
                            { text: 'Discard', callback_data: 'edit.after:discard' }
                        ]
                    ]
                }})
        let removedIds = adminData.removedIds
        removedIds.preview = message.message_id
        ctx.state.sql(`UPDATE people SET removed_message_ids = ?, conversation = "edit.ready"
                           WHERE username = ?`, [JSON.stringify(removedIds), username] )
    } else if (stage === 'edit.ready') {
        let adminData = await draftToPostable(username, ctx.state.sql, 'edit')
        let [channel, postId] = adminData.destination.split('/')
        ctx.state.sql(`UPDATE people SET draft_title = NULL,
                              draft_description = NULL,
                              draft_destination = NULL,
                              draft_image_ids = NULL,
                              removed_message_ids = NULL,
                              preview_post_message_id = NULL,
                              conversation = NULL
             WHERE username = ?`, [username])
        ctx.state.sql(`UPDATE posts SET title = ?,
                                        description = ?,
                                        price = ?,
                                        caption = ?
                                        WHERE channel = ? AND message_id = ?`,
            [adminData.title, adminData.description, adminData.price, adminData.caption, channel, postId])
        let input = ctx.update.callback_query
        let chatId = ctx.update.callback_query.from.id
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + adminData.destination.replace('/', '-')
        let deletedMessage
        if (input.data === 'save') {
            deletedMessage = adminData.removedIds.editOrigin
            // edit the post
            ctx.telegram.editMessageCaption('@' + channel, postId, undefined, adminData.caption, {
                reply_markup: {
                    inline_keyboard: [[{ text: 'Buy', url: startUrl }]]
                }
            })
            // edit the final message
            let itemLink = '<a href="https://t.me/' + adminData.destination + '">this item</a>'
            let caption = '<i>Editted the caption of</i> ' + itemLink + '.\n\n' + adminData.caption
            ctx.telegram.editMessageCaption(chatId, adminData.removedIds.preview, undefined, caption, {
                parse_mode: 'html',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [[{ text: 'Edit caption', callback_data: 'edit:' + adminData.destination }]]
                }
            })
        } else {
            deletedMessage = adminData.removedIds.preview
            ctx.reply('Editting cancelled.')
        }
        ctx.telegram.deleteMessage(chatId, deletedMessage)
    } else {
        let input = ctx.update.callback_query
        let messageIdDb = input.data
        let [channel, postId] = messageIdDb.split('/')
        let licenseValid = (await ctx.state.sql('SELECT license_expiry FROM channels WHERE username = ?', [channel]))[0].license_expiry*1 > ctx.update.callback_query.message.date
        if (!licenseValid) {
            ctx.reply('Your license for this channel has expired. Contact @' + ctx.state.admins + ' for renewal.')
            return
        }
        let query = 'SELECT 1 FROM posts WHERE channel = ? AND message_id = ?'
        let postExists = (await ctx.state.sql(query, [channel, postId]))[0]
        if (postExists) {
            let messageId = ctx.update.callback_query.message.message_id
            ctx.state.sql(`UPDATE people SET conversation = "edit.title",
                               draft_destination = ?,
                               removed_message_ids = ?,
                               draft_image_ids = (SELECT image_ids FROM posts
                                                    WHERE channel = SUBSTRING_INDEX(people.draft_destination, '/', 1)
                                                    AND message_id = SUBSTRING_INDEX(people.draft_destination, '/', -1)),
                            WHERE username = ?`, [messageIdDb, JSON.stringify({editOrigin: messageId}), username])
            let postUrl = 'https://t.me/' + messageIdDb
            let text = 'Editting <a href="' + postUrl + '">this post</a>, write the new title. You can send <b>skip</b> To keep the existing title.'
            ctx.reply(text, {parse_mode: 'html', disable_web_page_preview: true})
        } else {
            ctx.reply('Sorry, not found')
        }
    }
}

module.exports = handleEditPost
