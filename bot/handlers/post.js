const {
    makeKeyboardTiles,
    downloadFile,
    watermarkDir,
    rmdirWithFiles,
    makeCollage
} = require('../utils')
const fs = require('fs')
const path = require('path')

function post(ctx) {
    if (ctx.state.isAdmin) {
        let stage = ctx.state.convo
        let message = ctx.update.message
        if (message && message.text && message.text.indexOf('/post') === 0) {
            stage = null
        }
        if (stage === 'post.channel') {
            handleChannelStage(ctx)
        } else if (stage === 'post.title') {
            handleTitleStage(ctx)
        } else if (stage === 'post.description') {
            handleDescriptionStage(ctx)
        } else if (stage === 'post.price') {
            handlePriceStage(ctx)
        } else if (stage === 'post.photo') {
            handlePhotoStage(ctx)
        } else if (stage === 'post.post') {
            handlePostDraft(ctx)
        } else if (stage === 'post.discard') {
            handleDiscardDraft(ctx)
        } else {
            handlePost(ctx)
        }
    } else {
        ctx.reply('You are not registered here as an admin of any channel.')
    }
}

async function handlePost(ctx) {
    let username = ctx.from.username
    // prepare choices
    let channels = await ctx.people.getChannels(username, ctx.update.message.date)
    if (!channels.length) {
        ctx.reply('There is no channel with a valid license registered here by you. Contact @' + ctx.state.admins[0] + ' for renewal.')
        return
    }
    if (channels.length === 1) {
        ctx.people.set(username, {draft_destination: channels[0], conversation: 'post.title'})
        ctx.reply('You will be posting to @' + channels[0] + '. What is the title of the post?')
    } else {
        let keyboard = makeKeyboardTiles(channels.map(ch => {return {text: '@' + channel, callback_data: 'post.channel:' + ch}}))
        ctx.reply('Which channel do you want to post to?', {
            reply_markup: {
                inline_keyboard: keyboard,
            }
        })
    }
}

async function handleChannelStage(ctx) {
    let username = ctx.from.username
    let channel = ctx.update.callback_query.data.split(':')[1]
    ctx.state.people.set(username, {draft_destination: channel, conversation: 'post.title'})
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.message.message_id
    let text = 'You will be posting to @' + channel + '.What is the title of the post?'
    ctx.telegram.editMessageText(chatId, messageId, undefined, text)
}

function handleTitleStage(ctx) {
    let username = ctx.from.username
    let title = ctx.message.text
    ctx.state.people.set(username, {draft_title: title, conversation: 'post.description'})
    ctx.reply('Write the description. You can make bulleted lists easily by beginning new lines with . (dot) and it will be replaced with a real bullet character. You can also change the character in /settings => "Description bullet".')
}

function handleDescriptionStage(ctx) {
    let username = ctx.from.username
    let description = ctx.message.text
    ctx.state.people.set(username, {draft_description: description, conversation: 'post.price'})
    ctx.reply('And the price? How much is it?')
}

function handlePriceStage(ctx) {
    let username = ctx.from.username
    let price = ctx.message.text
    ctx.state.people.set(username, {draft_price: price, conversation: 'post.photo'})
    ctx.reply('Send some photos and finally send the command /end when you\'re done.')
    // clear the images dir for the new photos
    let imagesDir = path.join(ctx.state.imagesDir, username, 'draft-images')
    rmdirWithFiles(imagesDir)
}

async function handlePhotoStage(ctx) {
    let username = ctx.from.username
    let imagesDir = path.join(ctx.state.imagesDir, username, 'draft-images')
    if (ctx.updateSubTypes.includes('photo')) {
        let photo = ctx.update.message.photo
        let fileProps = await ctx.telegram.getFile(photo[photo.length-1].file_id)
        let filePath = path.join(imagesDir, path.basename(fileProps.file_path))
        let url = `https://api.telegram.org/file/bot${ctx.telegram.token}/${fileProps.file_path}`
        await downloadFile(url, filePath)
        ctx.reply('Received. Send more or /end it.')
    } else if (ctx.updateSubTypes.includes('text') && ctx.update.message.text === '/end') {
        let channel = await ctx.state.people.get(username, 'draft_destination')
        let logoImg = path.join(ctx.state.imagesDir, username, 'logo-' + channel + '.png')
        try {
            await fs.promises.stat(logoImg) // check if it exists
        } catch (err) {
            if (err.code === 'ENOENT') {
                logoImg = undefined
                ctx.reply("You don't have your logo here, the images will not be watermarked. To watermark your images with your logo, go to /settings and 'Logo'.")
            }
        }
        let draftCollage = path.join(ctx.state.imagesDir, username, 'draft-collage.jpg')
        await makeCollage(imagesDir, draftCollage, logoImg)  // make a collage and watermark it
        let images = await watermarkDir(imagesDir, imagesDir, logoImg)  // watermark every image
        let removedAtPost = [  // messages removed when the draft is posted
            // intro to the watermarked images preview
            (await ctx.reply('The individual images will look like this...', {
                reply_markup: {remove_keyboard: true}
            })).message_id]
        // the watermarked images
        let previewImages = await ctx.replyWithMediaGroup(images.map(img => {
            return {
                type: 'photo',
                media: {source: fs.createReadStream(img)}
            }
        }))
        for (let message of previewImages) {
            removedAtPost.push(message.message_id)
        }
        // the intro to the post preview
        removedAtPost.push((await ctx.reply('The post will look like this...')).message_id)
        // the post preview
        let caption = (await ctx.state.people.getDraft(username)).caption
        let postPreview = await ctx.replyWithPhoto(
            {source: fs.createReadStream(draftCollage)}, {
            caption, reply_markup: {
                inline_keyboard: [
                    [
                        {text: 'Post', callback_data: 'post:' + username},
                        {text: 'Discard', callback_data: 'discard:' + username}
                    ]
                ]
            }
        },
        )
        let imageIds = {
            collage: postPreview.photo.slice(-1)[0].file_id,
            watermarked: previewImages.map(msg => msg.photo.slice(-1)[0].file_id)
        }
        ctx.state.people.set(username, {
            draft_image_ids: JSON.stringify(imageIds),
            preview_post_message_id: postPreview.message_id,
            removed_message_ids: JSON.stringify(removedAtPost),
            conversation: 'post.ready'
        })
        fs.promises.unlink(draftCollage)
        rmdirWithFiles(imagesDir)
    }
}

async function handlePostDraft(ctx) {
    let adminData = await ctx.state.people.getDraft(ctx.from.username)
    let channel = adminData.destination
    let message = await ctx.telegram.sendPhoto('@' + channel, adminData.images.collage, {caption: adminData.caption})
    let newMessageIdDb = channel + '/' + message.message_id
    let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + newMessageIdDb.replace('/', '-')
    ctx.telegram.editMessageReplyMarkup('@' + channel, message.message_id, undefined, {
        inline_keyboard: [
            [{text: 'Buy', url: startUrl}]
        ]
    })
    // remove the preview messages
    await Promise.all(adminData.removedIds.map(async id => {
        await ctx.telegram.deleteMessage(adminData.chat_id, id)
    }))
    await ctx.telegram.deleteMessage(adminData.chat_id, adminData.previewId)
    // reply notice
    let newLink = '<a href="https://t.me/' + newMessageIdDb + '">here</a>'
    let caption = '<i>Done, you can find your new post </i>' + newLink + '<i>, and it looks like this.</i>\n\n' + adminData.caption
    ctx.replyWithPhoto(adminData.images.collage, {
            caption,
            parse_mode: 'html', reply_markup: {
                inline_keyboard: [
                    [{text: 'Edit caption', callback_data: 'edit:' + newMessageIdDb}]
                ]
            }
        }
    )
    // record the post
    ctx.state.posts.insert(newMessageIdDb, {
        channel,
        title: adminData.title,
        description: adminData.description,
        price: adminData.price,
        caption: adminData.caption,
        image_ids: JSON.stringify(adminData.images),
        post_date: ctx.update.callback_query.message.date
    })
    // clean up the person draft
    ctx.state.people.clearDraft(username)
}

async function handleDiscardDraft(ctx) {
    let adminData = await ctx.state.people.getDraft(ctx.from.username)
    // remove the preview messages
    await Promise.all(adminData.removedIds.map(async id => {
        await ctx.telegram.deleteMessage(adminData.chat_id, id)
    }))
    await ctx.telegram.deleteMessage(adminData.chat_id, adminData.previewId)
    // clean up the person draft
    ctx.state.people.clearDraft(username)
    ctx.reply('Draft discarded.')
}

async function handleDeletePost(ctx) {
    let input = ctx.update.callback_query
    let postAddress = input.data
    let [channel, postId] = postAddress.split('/')
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let query = 'SELECT state FROM posts WHERE channel = ? AND message_id = ?'
    let postExists = (await ctx.state.sql(query, [channel, postId]))[0].state !== 'deleted'
    if (postExists) {
        try {
            ctx.telegram.deleteMessage('@' + channel, postId)
            let text = 'Post deleted.'
            ctx.telegram.editMessageCaption(chatId, messageId, undefined, text)
        } catch {
            ctx.state.forceSold = true // force make it sold
            handleSoldToggle(ctx)
            let text = "can't delete message, marked sold. You can delete it manually."
            ctx.telegram.editMessageCaption(chatId, messageId, undefined, text)
        }
        ctx.state.sql('UPDATE posts SET state = "deleted" WHERE channel = ? AND message_id = ?', [channel, postId])
    } else {
        let text = '[deleted] Post not found, may have been alreary deleted'
        ctx.telegram.editMessageCaption(chatId, messageId, undefined, text)
    }
}

async function handleDetails(ctx) {  // details callback
    let [channel, postId] = ctx.update.callback_query.data.split('/')
    let messageDetails = (await ctx.state.sql('SELECT * FROM posts WHERE channel = ? AND message_id = ?', [channel, postId]))[0]
    if (messageDetails && messageDetails.state === 'available') {
        // let person = (await ctx.state.sql(`SELECT a.username
        //                         FROM posts AS p
        //                         INNER JOIN channels AS c
        //                             ON p.channel = c.username
        //                         INNER JOIN people AS a
        //                             ON c.admin = a.username
        //                         WHERE channel = ? AND message_id = ?`,
        //                         [channel, postId]))[0]
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
                                AND message_id = SUBSTRING_INDEX(people.draft_destination, '/', -1))
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
                                                    AND message_id = SUBSTRING_INDEX(people.draft_destination, '/', -1))
                            WHERE username = ?`, [messageIdDb, JSON.stringify({editOrigin: messageId}), username])
            let postUrl = 'https://t.me/' + messageIdDb
            let text = 'Editting <a href="' + postUrl + '">this post</a>, write the new title. You can send <b>skip</b> To keep the existing title.'
            ctx.reply(text, {parse_mode: 'html', disable_web_page_preview: true})
        } else {
            ctx.reply('Sorry, not found')
        }
    }
}

async function handleRepost(ctx) {
    let input = ctx.update.callback_query
    let [channel, postId] = input.data.split('/')
    let query = `SELECT p.caption, p.title, p.description, p.price, p.image_ids as images, p.state, c.sold_template, c.license_expiry
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
    ctx.state.sql('INSERT INTO posts (channel, message_id, title, description, price, caption, image_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [channel, message.message_id, postData.title, postData.description, postData.price, postData.caption, postData.images])
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

async function handleSoldToggle(ctx) {
    let messageIdDb = ctx.update.callback_query.data
    let [channel, messageId] = messageIdDb.split('/')
    let query = `SELECT p.caption, p.image_ids, p.state, p.channel, c.sold_template, c.license_expiry
                 FROM posts as p
                 INNER JOIN channels AS c
                 ON c.username = p.channel
                 WHERE p.channel = ? AND p.message_id = ?`
    let post = (await ctx.state.sql(query, [channel, messageId]))[0]
    let captionEntities = ctx.update.callback_query.message.caption_entities
    if (post.state === 'available' || ctx.state.forceSold) {
        let soldText = post.sold_template.replace(/:caption\b/, post.caption)
        try { // for when trying to edit with same content
            ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, soldText)
        } catch {}
        if (ctx.state.forceSold === undefined) {
            // change the state
            ctx.state.sql('UPDATE posts SET state = "sold", sold_date = ? WHERE channel = ? AND message_id = ?', [ctx.update.callback_query.message.date, channel, messageId])
            // replace the button with undo
            let userId = captionEntities.filter(e => e.type == 'text_mention')[0].user.id
            let itemLink = '<a href="' + captionEntities.filter(e => e.type == 'text_link')[0].url + '">this item</a>'
            let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
            let text = `<i>You have a</i> ${customerLink} <i>who wants to buy</i> ${itemLink} <i>from</i> @${post.channel}. <i>They may contact you</i>.\n\n` + post.caption
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
        if (post.license_expiry*1 < ctx.update.callback_query.message.date) {
            ctx.reply('Your license for this channel has expired. Contact @' + ctx.state.admins + ' for renewal.')
            return
        }
        let caption = post.caption
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + messageIdDb.replace('/', '-')
        ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, caption, {
            inline_keyboard: [ [ { text: 'Buy', url: startUrl } ] ]
        })
        // change the state
        ctx.state.sql('UPDATE posts SET state = "available" WHERE channel = ? AND message_id = ?', [channel, messageId])
        // replace the button with undo
        let userId = captionEntities.filter(e => e.type == 'text_mention')[0].user.id
        let itemLink = '<a href="' + captionEntities.filter(e => e.type == 'text_link')[0].url + '">this item</a>'
        let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
        let text = `<i>You have a</i> ${customerLink} <i>who wants to buy</i> ${itemLink} <i>from</i> @${post.channel}. <i>They may contact you</i>.\n\n` + post.caption
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

module.exports = {
    handlePost,
    handleChannelStage,
    handleTitleStage,
    handleDescriptionStage,
    handlePriceStage,
    handlePhotoStage,
    handlePostDraft,
    handleDiscardDraft
}
