const {
    makeKeyboardTiles,
    downloadFile,
    watermarkDir,
    rmdirWithFiles,
    makeCollage
} = require('../utils')
const fs = require('fs')
const path = require('path')

async function handlePost(ctx) {
    let username = ctx.from.username
    // prepare choices
    let channels = await ctx.people.getChannels(username, ctx.update.message.date)
    if (!channels.length) {
        ctx.reply('There is no channel with a valid license registered here by you. Contact @' + ctx.admins[0] + ' for renewal.')
        return
    }
    if (channels.length === 1) {
        ctx.people.set(username, {draft_destination: channels[0], conversation: 'post.title'})
        ctx.reply('You will be posting to @' + channels[0] + '. What is the title of the post?')
    } else {
        let keyboard = makeKeyboardTiles(channels.map(ch => {return {text: '@' + channel, callback_data: 'post_channel:' + ch}}))
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
    ctx.people.set(username, {draft_destination: channel, conversation: 'post.title'})
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.message.message_id
    let text = 'You will be posting to @' + channel + '.What is the title of the post?'
    ctx.telegram.editMessageText(chatId, messageId, undefined, text)
}

function handleTitleStage(ctx) {
    let username = ctx.from.username
    let title = ctx.message.text
    ctx.people.set(username, {draft_title: title, conversation: 'post.description'})
    ctx.reply('Write the description. You can make bulleted lists easily by beginning new lines with . (dot) and it will be replaced with a real bullet character. You can also change the character in /settings => "Description bullet".')
}

function handleDescriptionStage(ctx) {
    let username = ctx.from.username
    let description = ctx.message.text
    ctx.people.set(username, {draft_description: description, conversation: 'post.price'})
    ctx.reply('And the price? How much is it?')
}

function handlePriceStage(ctx) {
    let username = ctx.from.username
    let price = ctx.message.text
    ctx.people.set(username, {draft_price: price, conversation: 'post.photo'})
    ctx.reply('Send some photos and finally send the command /end when you\'re done.')
    // clear the images dir for the new photos
    let imagesDir = path.join(ctx.imagesDir, username, 'draft-images')
    rmdirWithFiles(imagesDir)
}

async function handlePhotoStagePhotos(ctx) {
    let username = ctx.from.username
    let imagesDir = path.join(ctx.imagesDir, username, 'draft-images')
    let photo = ctx.update.message.photo
    let fileProps = await ctx.telegram.getFile(photo[photo.length-1].file_id)
    let filePath = path.join(imagesDir, path.basename(fileProps.file_path))
    let url = `https://api.telegram.org/file/bot${ctx.telegram.token}/${fileProps.file_path}`
    await downloadFile(url, filePath)
    ctx.reply('Received. Send more or /end it.')
}

async function handlePhotoStageEnd(ctx) {
    let username = ctx.from.username
    let channel = await ctx.people.get(username, 'draft_destination')
    let logoImg = path.join(ctx.imagesDir, username, 'logo-' + channel + '.png')
    try {
        await fs.promises.stat(logoImg) // check if it exists
    } catch (err) {
        if (err.code === 'ENOENT') {
            logoImg = undefined
            ctx.reply("You don't have your logo here, the images will not be watermarked. To watermark your images with your logo, go to /settings and 'Logo'.")
        }
    }
    let draftCollage = path.join(ctx.imagesDir, username, 'draft-collage.jpg')
    let imagesDir = path.join(ctx.imagesDir, username, 'draft-images')
    await makeCollage(imagesDir, draftCollage, logoImg)  // make a collage and watermark it
    let images = await watermarkDir(imagesDir, imagesDir, logoImg)  // watermark every image
    let removedAtPost = [  // messages removed when the draft is posted
        // intro to the watermarked images preview
        (await ctx.reply('The individual images will look like this...', {
            reply_markup: {remove_keyboard: true}
        })).message_id]
    // the watermarked images
    let previewImages = await ctx.replyWithMediaGroup(images.map(img => {
        return { type: 'photo', media: {source: fs.createReadStream(img)} }
    }))
    for (let message of previewImages) {
        removedAtPost.push(message.message_id)
    }
    // the intro to the post preview
    removedAtPost.push((await ctx.reply('The post will look like this...')).message_id)
    // the post preview
    let caption = (await ctx.people.getDraft(username)).caption
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
    ctx.people.set(username, {
        draft_image_ids: JSON.stringify(imageIds),
        removed_message_ids: JSON.stringify(removedAtPost),
        conversation: 'post.ready'
    })
    fs.promises.unlink(draftCollage)
    rmdirWithFiles(imagesDir)
}

async function handlePostDraft(ctx) {
    let username = ctx.from.username
    let adminData = await ctx.people.getDraft(username)
    if (adminData) {
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
            try {
                await ctx.telegram.deleteMessage(adminData.chat_id, id)
            } catch(err) {
                console.log(err.message)
            }
        }))
        let chatId = ctx.update.callback_query.from.id
        let messageId = ctx.update.callback_query.message.message_id
        try {
            await ctx.telegram.deleteMessage(chatId, messageId)
        } catch(err) {
            console.log(err.message)
        }
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
        ctx.posts.insert(newMessageIdDb, {
            channel,
            title: adminData.title,
            description: adminData.description,
            price: adminData.price,
            caption: adminData.caption,
            image_ids: JSON.stringify(adminData.images),
            post_date: ctx.update.callback_query.message.date
        })
        // clean up the person draft
        ctx.people.clearDraft(username)
    } else {
        ctx.reply('Sorry, your draft has been cleared. Start a new one with /post.')
    }
}

async function handleDiscardDraft(ctx) {
    let adminData = await ctx.people.getDraft(ctx.from.username)
    if (adminData) {
        // remove the preview messages
        await Promise.all(adminData.removedIds.map(async id => {
            await ctx.telegram.deleteMessage(adminData.chat_id, id)
        }))
    }
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    try {
        await ctx.telegram.deleteMessage(chatId, messageId)
    } catch {}
    // clean up the person draft
    ctx.people.clearDraft(username)
    ctx.reply('Draft discarded.')
}

async function handleDeletePost(ctx) {
    let input = ctx.update.callback_query
    let postAddress = input.data
    let [channel, postId] = postAddress.split('/')
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let postExists = await ctx.posts.exists({channel, message_id: postId})
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
        ctx.posts.set({channel, message_id: postId}, {state: 'deleted'})
    } else {
        let text = '[deleted] Post not found, may have been alreary deleted'
        ctx.telegram.editMessageCaption(chatId, messageId, undefined, text)
    }
}

async function handleDetails(ctx) {  // details callback
    let [channel, postId] = ctx.update.callback_query.data.split('/')
    let messageDetails = await ctx.posts.get({channel, message_id: postId})
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
        ctx.reply(ctx.fallbackReply)
    }
}

async function handleEditTitle(ctx) {
    let username = ctx.from.username
    let text = ctx.update.message.text
    let postTitle
    if (text === 'skip') {
        let [channel, message_id] = await ctx.people.get(username, 'draft_destination').split('/')
        postTitle = await ctx.posts.get({channel, message_id}, 'title')
    } else {
        postTitle = text
    }
    ctx.people.set(username, {draft_title: postTitle, conversation: 'edit.description'})
    ctx.reply('Send the new description. If you don\'t want to change it, send <b>skip</b>.', {parse_mode: 'html'})
}

async function handleEditDescription(ctx) {
    let username = ctx.from.username
    let text = ctx.update.message.text
    let postDescription
    if (text === 'skip') {
        let [channel, message_id] = await ctx.people.get(username, 'draft_destination').split('/')
        postDescription = await ctx.posts.get({channel, message_id}, 'description')
    } else {
        postDescription = text
    }
    ctx.people.set(username, {draft_title: postDescription, conversation: 'edit.price'})
    ctx.reply('Send the new price. If you don\'t want to change it, send <b>skip</b>.', {parse_mode: 'html'})
}

async function handleEditPrice(ctx) {
    let username = ctx.from.username
    let text = ctx.update.message.text
    let postPrice
    if (text === 'skip') {
        let [channel, message_id] = await ctx.people.get(username, 'draft_destination').split('/')
        postPrice = await ctx.posts.get({channel, message_id}, 'price')
    } else {
        postPrice = text
    }
    ctx.people.set(username, {draft_title: postPrice, conversation: 'edit.ready'})
    let adminData = await ctx.people.getDraft(username, 'edit')
    let collage = adminData.images.collage
    let caption = '<i>The new caption will look like this...</i>\n\n' + adminData.caption
    let message = await ctx.replyWithPhoto(collage, {
        parse_mode: 'html',
        caption, reply_markup: {
            inline_keyboard: [
                [
                    {text: 'Save changes', callback_data: 'edit_after:save'},
                    {text: 'Discard', callback_data: 'edit_after:discard'}
                ]
            ]
        }
    })
    let removedIds = adminData.removedIds
    removedIds.preview = message.message_id
    ctx.people.set(username, {
        removed_message_ids: JSON.stringify(removedIds), username
    })
}

async function handleEditSaveDiscard(ctx) {
    let username = ctx.from.username
    let chatId = ctx.update.callback_query.from.id
    let command = ctx.update.callback_query.data
    if (command === 'save') {
        let adminData = await ctx.people.getDraft(username, 'edit')
        let [channel, postId] = adminData.destination.split('/')
        ctx.posts.set({channel, message_id: postId}, {
            title: adminData.title,
            description: adminData.description,
            price: adminData.price,
            caption: adminData.caption
        })
        let deletedMessage = adminData.removedIds.editOrigin
        ctx.telegram.deleteMessage(chatId, deletedMessage)
        // edit the post
        ctx.telegram.editMessageCaption('@' + channel, postId, undefined, adminData.caption, {
            reply_markup: {
                inline_keyboard: [[{text: 'Buy', url: startUrl}]]
            }
        })
        // edit the final message
        let itemLink = '<a href="https://t.me/' + adminData.destination + '">this item</a>'
        let caption = '<i>Editted the caption of</i> ' + itemLink + '.\n\n' + adminData.caption
        ctx.telegram.editMessageCaption(chatId, adminData.removedIds.preview, undefined, caption, {
            parse_mode: 'html',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [[{text: 'Edit caption', callback_data: 'edit:' + adminData.destination}]]
            }
        })
    } else {
        let deletedMessage = JSON.parse(await ctx.people.get(username, 'removed_message_ids')).preview
        ctx.reply('Editting cancelled.')
        ctx.telegram.deleteMessage(chatId, deletedMessage)
    }
    ctx.people.clearDraft(username)
}

async function handleEditCaption(ctx) {
    let username = ctx.from.username
    let input = ctx.update.callback_query
    let messageIdDb = input.data
    let [channel, postId] = messageIdDb.split('/')
    let checkDate = ctx.update.callback_query.message.date * 1
    let licenseValid = await ctx.channels.licenseIsValid(channel, checkDate)
    if (!licenseValid) {
        ctx.reply('Your license for this channel has expired. Contact @' + ctx.admins + ' for renewal.')
        return
    }
    let postExists = await ctx.posts.exists({channel, message_id: postId})
    if (postExists) {
        let messageId = ctx.update.callback_query.message.message_id
        let images = await ctx.posts.get({channel, message_id: messageId}, 'image_ids')
        ctx.people.set(username, {
            conversation: 'edit.title',
            draft_destination: messageIdDb,
            removed_message_ids: JSON.stringify({editOrigin: messageId}),
            draft_image_ids: images
        })
        let postUrl = 'https://t.me/' + messageIdDb
        let text = 'Editting <a href="' + postUrl + '">this post</a>, write the new title. You can send <b>skip</b> To keep the existing title.'
        ctx.reply(text, {parse_mode: 'html', disable_web_page_preview: true})
    } else {
        ctx.reply('Sorry, not found')
    }
}

async function handleRepost(ctx) {
    let input = ctx.update.callback_query
    let [channel, postId] = input.data.split('/')
    let postData = await ctx.posts.get({channel, message_id: postId},
        ['title, description', 'price', 'image_ids', 'state'])
    if (!postData) {
        ctx.reply('Sorry, not found')
        return
    }
    let licenseValid = await ctx.channels.licenseIsValid(channel, input.message.date)
    if (!licenseValid) {
        ctx.reply('Your license for this channel has expired. Contact @' + ctx.admins + ' for renewal.')
        return
    }
    let soldTemplate = await ctx.channels.get(channel, ['sold_template'])
    if (postData.state === 'available') {
        // mark as sold
        let soldText = soldTemplate.replace(/:caption\b/, postData.caption)
        ctx.telegram.editMessageCaption('@' + channel, postId, undefined, soldText)
        // also in db
        ctx.posts.set({channel, message_id: postId}, {state: 'sold'})
    }
    let collageId = JSON.parse(postData.image_ids).collage
    let message = await ctx.telegram.sendPhoto('@' + channel, collageId, {caption: postData.caption})
    let newMessageIdDb = channel + '/' + message.message_id
    ctx.posts.insert({
        channel,
        message_id: message.message_id,
        title: postData.title,
        description: postData.description,
        price: postData.price,
        caption: postData.caption,
        image_ids: postData.image_ids
    })
    let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + newMessageIdDb.replace('/', '-')
    ctx.telegram.editMessageReplyMarkup('@' + channel, message.message_id, undefined, {
        inline_keyboard: [
            [{text: 'Buy', url: startUrl}]
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
            }
        })
}

async function handleSoldToggle(ctx) {
    let messageIdDb = ctx.update.callback_query.data
    let [channel, messageId] = messageIdDb.split('/')
    let post = await ctx.posts.get({channel, message_id: messageId},
        ['caption', 'image_ids', 'state', 'sold_template'])
    let captionEntities = ctx.update.callback_query.message.caption_entities
    if (post.state === 'available' || ctx.state.forceSold) {
        let soldText = post.sold_template.replace(/:caption\b/, post.caption)
        try { // for when trying to edit with same content
            ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, soldText)
        } catch {}
        if (ctx.state.forceSold === undefined) {
            // change the state
            ctx.posts.set({channel, message_id: messageId}, {
                state: 'sold',
                sold_date: ctx.update.callback_query.message.date,
            })
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
                            {text: 'Undo sold', callback_data: 'sold:' + messageIdDb},
                            {text: 'Repost', callback_data: 'repost:' + messageIdDb},
                            {text: 'Delete', callback_data: 'delete:' + messageIdDb}
                        ]
                    ]
                }
            })
        }
    } else {
        let licenseValid = await ctx.channels.licenseIsValid(channel, input.message.date)
        if (!licenseValid) {
            ctx.reply('Your license for this channel has expired. Contact @' + ctx.admins[0] + ' for renewal.')
            return
        }
        let caption = post.caption
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + messageIdDb.replace('/', '-')
        ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, caption, {
            inline_keyboard: [[{text: 'Buy', url: startUrl}]]
        })
        // change the state
        ctx.posts.set({channel, message_id: messageId}, {state: 'available'})
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
                        {text: 'Mark as sold', callback_data: 'sold:' + messageIdDb},
                        {text: 'Repost', callback_data: 'repost:' + messageIdDb},
                        {text: 'Delete', callback_data: 'delete:' + messageIdDb}
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
    handlePhotoStagePhotos,
    handlePhotoStageEnd,
    handlePostDraft,
    handleDiscardDraft,
    handleDetails,
    handleSoldToggle,
    handleRepost,
    handleEditCaption,
    handleEditTitle,
    handleEditDescription,
    handleEditPrice,
    handleEditSaveDiscard,
    handleDeletePost
}
