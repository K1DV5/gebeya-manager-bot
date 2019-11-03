const {
    makeKeyboardTiles,
    downloadFile,
    watermarkDir,
    rmdirWithFiles,
    makeCollage
} = require('../utils')
const {
    notifyPost,
    notifyEdit,
    notifySold,
    notifyRepost,
    notifyDelete,
    deleteMessage
} = require('./notify')
const fs = require('fs')
const path = require('path')

async function handlePost(ctx) {
    let username = ctx.from.username
    // prepare licensed channel choices
    let channels = await ctx.people.getChannels(username, ctx.update.message.date, 'post')
    if (!channels.length) {
        ctx.reply('There is no channel with a valid license registered here by you. Contact @' + ctx.admins[0] + ' for renewal.')
        return
    }
    if (channels.length === 1) {
        let message = await ctx.reply('You will be posting to @' + channels[0] + '. What is the title of the post?')
        await ctx.people.set(username, {
            to_update: channels[0],
            conversation: 'post.title',
            removed_message_ids: `[${message.message_id},${ctx.update.message.message_id}]`
        })
    } else {
        let keyboard = makeKeyboardTiles(channels.map(ch => {return {text: '@' + ch, callback_data: 'post_channel:' + ch}}))
        let message = await ctx.reply('Which channel do you want to post to?', {
            reply_markup: {
                inline_keyboard: keyboard,
            }
        })
        await ctx.people.set(username, {
            removed_message_ids: `[${message.message_id},${ctx.update.message.message_id}]`
        })
    }
}

async function handleChannelStage(ctx) {
    let username = ctx.from.username
    let channel = ctx.update.callback_query.data
    // already added to the removed ids
    await ctx.people.set(username, {to_update: channel, conversation: 'post.title'})
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let text = 'You will be posting to @' + channel + '. What is the title of the post?'
    ctx.telegram.editMessageText(chatId, messageId, undefined, text)
}

async function handleTitleStage(ctx) {
    let username = ctx.from.username
    let messageId = ctx.update.message.message_id
    let title = ctx.message.text
    let removed = JSON.parse(await ctx.people.get(username, 'removed_message_ids'))
    let message = await ctx.reply('Write the description (bullet lists as well).')
    let newRemoved = JSON.stringify([...removed, message.message_id, messageId])
    await ctx.people.set(username, {draft_title: title, conversation: 'post.description', removed_message_ids: newRemoved})
}

async function handleDescriptionStage(ctx) {
    let username = ctx.from.username
    let messageId = ctx.update.message.message_id
    let description = ctx.message.text
    let removed = JSON.parse(await ctx.people.get(username, 'removed_message_ids'))
    let message = await ctx.reply('And the price? How much is it?')
    let newRemoved = JSON.stringify([...removed, message.message_id, messageId])
    await ctx.people.set(username, {draft_description: description, conversation: 'post.price', removed_message_ids: newRemoved})
}

async function handlePriceStage(ctx) {
    let username = ctx.from.username
    let messageId = ctx.update.message.message_id
    let price = ctx.message.text
    let removed = JSON.parse(await ctx.people.get(username, 'removed_message_ids'))
    let message = await ctx.reply('Send some photos and finally send the command /end when you\'re done.')
    let newRemoved = JSON.stringify([...removed, message.message_id, messageId])
    await ctx.people.set(username, {draft_price: price, conversation: 'post.photo', removed_message_ids: newRemoved})
    // clear the images dir for the new photos
    let imagesDir = path.join(ctx.imagesDir, username, 'draft-images')
    rmdirWithFiles(imagesDir)
}

async function handlePhotoStagePhotos(ctx) {
    let username = ctx.from.username
    let messageId = ctx.update.message.message_id
    let removed = JSON.parse(await ctx.people.get(username, 'removed_message_ids'))
    let newRemoved = JSON.stringify([...removed, messageId])
    await ctx.people.set(username, {removed_message_ids: newRemoved})
    let imagesDir = path.join(ctx.imagesDir, username, 'draft-images')
    let photo = ctx.update.message.photo
    let fileProps = await ctx.telegram.getFile(photo[photo.length-1].file_id)
    let filePath = path.join(imagesDir, path.basename(fileProps.file_path))
    let url = `https://api.telegram.org/file/bot${ctx.telegram.token}/${fileProps.file_path}`
    await downloadFile(url, filePath)
}

async function handlePhotoStageEnd(ctx) {
    let username = ctx.from.username
    let messageId = ctx.update.message.message_id
    let removed = JSON.parse(await ctx.people.get(username, 'removed_message_ids'))
    let channel = await ctx.people.get(username, 'to_update')
    let logoImg = path.join(ctx.imagesDir, username, 'logo-' + channel + '.png')
    let draftCollage = path.join(ctx.imagesDir, username, 'draft-collage.jpg')
    let imagesDir = path.join(ctx.imagesDir, username, 'draft-images')
    try { // make sure there is at least one photo
        let photos = await fs.promises.readdir(imagesDir) // dir might not exist
        let stat = await fs.promises.stat(path.join(imagesDir, photos[0] || '0')) // no file may exist
    } catch (err) {
        if (err.code === 'ENOENT') {
            ctx.reply('You have not sent any photos. Please send some and then /end, or /cancel the post.')
            return
        }
    }
    try {
        await fs.promises.stat(logoImg) // check if it exists
    } catch (err) {
        if (err.code === 'ENOENT') {
            logoImg = undefined
            ctx.reply("You don't have your logo here, the images will not be watermarked. To watermark your images with your logo, go to /settings and 'Logo'.")
        }
    }
    await makeCollage(imagesDir, draftCollage, logoImg)  // make a collage and watermark it
    let images = await watermarkDir(imagesDir, imagesDir, logoImg)  // watermark every image
    let removedAtPost = [  // messages removed when the draft is posted
        ...removed,
        messageId,
        // intro to the watermarked images preview
        (await ctx.reply('The individual images will look like this...')).message_id]
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
        let postId = message.message_id
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + channel + '-' + postId
        ctx.telegram.editMessageReplyMarkup('@' + channel, postId, undefined, {
            inline_keyboard: [[{text: 'Buy', url: startUrl}]]
        })
        // remove the preview messages
        let chatId = ctx.update.callback_query.from.id
        adminData.removedIds.map(id => { deleteMessage(ctx, chatId, id) })
        // record the post
        await ctx.posts.insert({
            channel,
            message_id: postId,
            author: username,
            title: adminData.title,
            description: adminData.description,
            price: adminData.price,
            caption: adminData.caption,
            image_ids: JSON.stringify(adminData.images),
            post_date: ctx.update.callback_query.message.date
        })
        // send notifs
        let postAddr = channel + '/' + postId
        let data = {
            caption: adminData.caption,
            image: adminData.images.collage,
            buttons: {
                // classified on permissions basis
                edit: [
                    {text: 'Edit caption', callback_data: 'edit:' + postAddr},
                    {text: 'Mark sold', callback_data: 'sold:' + postAddr},
                ],
                delete: [{text: 'Delete', callback_data: 'delete:' + postAddr}]
            }
        }
        await notifyPost(ctx, channel, postId, data)
        // clean up the person draft
        ctx.people.clearDraft(username)
    } else {
        ctx.reply('Sorry, your draft has been cleared. Start a new one with /post.')
    }
}

async function handleDiscardDraft(ctx) {
    let username = ctx.from.username
    let adminData = await ctx.people.getDraft(username)
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    if (adminData) {
        // remove the preview messages
        await Promise.all(adminData.removedIds.map(async id => {
            await deleteMessage(ctx, chatId, id)
        }))
    }
    await deleteMessage(ctx, chatId, messageId)
    // clean up the person draft
    ctx.people.clearDraft(username)
    ctx.reply('Draft discarded.')
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
    } else if (messageDetails.state === 'deleted') {
        ctx.reply('Sorry, item removed.')
    } else {
        ctx.reply(ctx.fallbackReply)
    }
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
        let images = await ctx.posts.get({channel, message_id: postId}, 'image_ids')
        let postUrl = 'https://t.me/' + messageIdDb
        let text = 'Editting <a href="' + postUrl + '">this post</a>, write the new title. You can send <b>skip</b> To keep the existing title.'
        let message = await ctx.reply(text, {parse_mode: 'html', disable_web_page_preview: true})
        ctx.people.set(username, {
            conversation: 'edit.title',
            to_update: messageIdDb,
            removed_message_ids: JSON.stringify([messageId, message.message_id]),
            draft_image_ids: images
        })
    } else {
        ctx.reply('Sorry, not found')
    }
}

async function handleEditTitle(ctx) {
    let username = ctx.from.username
    let messageId = ctx.update.message.message_id
    let text = ctx.update.message.text
    let postTitle
    if (text === 'skip') {
        let destination = await ctx.people.get(username, 'to_update')
        let [channel, message_id] = destination.split('/')
        postTitle = await ctx.posts.get({channel, message_id}, 'title')
    } else {
        postTitle = text
    }
    let message = await ctx.reply('Send the new description. If you don\'t want to change it, send <b>skip</b>.', {parse_mode: 'html'})
    let removed = JSON.parse(await ctx.people.get(username, 'removed_message_ids'))
    let newRemoved = JSON.stringify([...removed, message.message_id, messageId])
    ctx.people.set(username, {draft_title: postTitle, conversation: 'edit.description', removed_message_ids: newRemoved})
}

async function handleEditDescription(ctx) {
    let username = ctx.from.username
    let messageId = ctx.update.message.message_id
    let text = ctx.update.message.text
    let postDescription
    if (text === 'skip') {
        let destination = await ctx.people.get(username, 'to_update')
        let [channel, message_id] = destination.split('/')
        postDescription = await ctx.posts.get({channel, message_id}, 'description')
    } else {
        postDescription = text
    }
    let message = await ctx.reply('Send the new price. If you don\'t want to change it, send <b>skip</b>.', {parse_mode: 'html'})
    let removed = JSON.parse(await ctx.people.get(username, 'removed_message_ids'))
    let newRemoved = JSON.stringify([...removed, message.message_id, messageId])
    ctx.people.set(username, {draft_description: postDescription, conversation: 'edit.price', removed_message_ids: newRemoved})
}

async function handleEditPrice(ctx) {
    let username = ctx.from.username
    let text = ctx.update.message.text
    let postPrice
    if (text === 'skip') {
        let destination = await ctx.people.get(username, 'to_update')
        let [channel, message_id] = destination.split('/')
        postPrice = await ctx.posts.get({channel, message_id}, 'price')
    } else {
        postPrice = text
    }
    let removed = JSON.parse(await ctx.people.get(username, 'removed_message_ids'))
    let messageId = ctx.update.message.message_id
    let newRemoved = JSON.stringify([...removed, messageId])
    ctx.people.set(username, {draft_price: postPrice, conversation: 'edit.ready', removed_message_ids: newRemoved})
    let adminData = await ctx.people.getDraft(username, 'edit')
    let collage = adminData.images.collage
    let caption = '<i>The new caption will look like this...</i>\n\n' + adminData.caption
    ctx.replyWithPhoto(collage, {
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
}

async function handleEditSaveDiscard(ctx) {
    let username = ctx.from.username
    let chatId = ctx.update.callback_query.from.id
    let command = ctx.update.callback_query.data
    let adminData = await ctx.people.getDraft(username, 'edit')
    if (command === 'save') {
        let [channel, postId] = adminData.destination.split('/')
        ctx.posts.set({channel, message_id: postId}, {
            title: adminData.title,
            description: adminData.description,
            price: adminData.price,
            caption: adminData.caption
        })
        // remove the unnecessary messages
        adminData.removedIds.map(id => { deleteMessage(ctx, chatId, id) })
        // edit the post
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + adminData.destination.replace('/', '-')
        try {
            await ctx.telegram.editMessageCaption('@' + channel, postId, undefined, adminData.caption, {
                reply_markup: {
                    inline_keyboard: [[{text: 'Buy', url: startUrl}]]
                }
            })
        } catch {
            ctx.reply('Couldn\'t edit the post')
            return
        }
        let newMessageIdDb = channel + '/' + postId
        let data = {
            caption: adminData.caption,
            image: ctx.update.callback_query.message.photo.slice(-1)[0].file_id,
            buttons: {
                // classified on permissions basis
                edit: [
                    {text: 'Edit caption', callback_data: 'edit:' + newMessageIdDb},
                    {text: 'Mark sold', callback_data: 'sold:' + newMessageIdDb},
                ],
                delete: [{text: 'Delete', callback_data: 'delete:' + newMessageIdDb}]
            }
        }
        await notifyEdit(ctx, channel, postId, data)
    } else {
        // delete everything except the origin
        adminData.removedIds.slice(1).map(id => { deleteMessage(ctx, chatId, id) })
        let messageId = ctx.update.callback_query.message.message_id
        deleteMessage(ctx, chatId, messageId)
        ctx.reply('Editting cancelled.')
    }
    ctx.people.clearDraft(username)
}

async function handleSold(ctx) {
    let messageIdDb = ctx.update.callback_query.data
    let [channel, messageId] = messageIdDb.split('/')
    let post = await ctx.posts.get({channel, message_id: messageId},
        ['caption', 'image_ids', 'state', 'sold_template'])
    if (post.state === 'available' || ctx.state.forceSold) {
        let soldTemplate = await ctx.channels.get(channel, 'sold_template')
        let soldText = soldTemplate.replace(/:caption\b/, post.caption)
        try { // for when trying to edit with same content
            ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, soldText)
        } catch {}
        if (ctx.state.forceSold === undefined) {
            // change the state
            ctx.posts.set({channel, message_id: messageId}, {
                state: 'sold',
                sold_date: ctx.update.callback_query.message.date,
            })
            let data = {
                caption: soldText,
                image: post.image_ids,
                buttons: {
                    // classified on permissions basis
                    edit: [{text: 'Repost', callback_data: 'repost:' + messageIdDb}],
                    delete: [{text: 'Delete', callback_data: 'delete:' + messageIdDb}]
                }
            }
            await notifySold(ctx, channel, messageId, data)
        }
    } else {
        ctx.reply('Already marked sold.')
    }
}

async function handleRepost(ctx) {
    let input = ctx.update.callback_query
    let [channel, postId] = input.data.split('/')
    let postData = await ctx.posts.get({channel, message_id: postId})
    if (!postData) {
        ctx.reply('Sorry, not found')
        return
    }
    let licenseValid = await ctx.channels.licenseIsValid(channel, input.message.date)
    if (!licenseValid) {
        ctx.reply('Your license for this channel has expired. Contact @' + ctx.admins + ' for renewal.')
        return
    }
    if (postData.state !== 'deleted') {
        // remove the current one
        deleteMessage(ctx, '@' + channel, postId)
        // also in db
        ctx.posts.set({channel, message_id: postId}, {state: 'deleted'})
    }
    let collageId = JSON.parse(postData.image_ids).collage
    let message = await ctx.telegram.sendPhoto('@' + channel, collageId, {caption: postData.caption})
    let newMessageIdDb = channel + '/' + message.message_id
    ctx.posts.insert({
        channel,
        message_id: message.message_id,
        author: ctx.from.username,
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
    let data = {
        caption: postData.caption,
        image: collageId,
        buttons: {
            // classified on permissions basis
            edit: [
                {text: 'Edit caption', callback_data: 'edit:' + newMessageIdDb},
                {text: 'Mark sold', callback_data: 'sold:' + newMessageIdDb},
            ],
            delete: [{text: 'Delete', callback_data: 'delete:' + newMessageIdDb}]
        }
    }
    notifyRepost(ctx, channel, postId, message.message_id, data)
}

async function handleDeletePost(ctx) {
    let input = ctx.update.callback_query
    let postAddress = input.data
    let [channel, postId] = postAddress.split('/')
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let postData = await ctx.posts.get({channel, message_id: postId}, ['author', 'caption', 'image_ids'])
    if (postData) { // means post exists
        let postAddr = channel + '/' + postId
        let text
        try {
            await ctx.telegram.deleteMessage('@' + channel, postId)
            text = '--- ITEM DELETED ---'
        } catch {
            ctx.state.forceSold = true // force make it sold
            await handleSold(ctx)
            let itemLink = `<a href="https://t.me/${postAddr}">ITEM</a>`
            text = '----\n' + itemLink + ' MARKED SOLD\ncould not be deleted\ncan be deleted manually\n----'
        }
        let collage = JSON.parse(postData.image_ids).collage
        let data = {
            caption: postData.caption,
            author: postData.author,
            text,
            image: collage,
            buttons: {
                // classified on permissions basis
                edit: [ {text: 'Repost', callback_data: 'repost:' + postAddr}, ]
            }
        }
        notifyDelete(ctx, channel, postId, data)
        ctx.posts.set({channel, message_id: postId}, {state: 'deleted'})
    } else {
        let text = '[deleted] Post not found, may have been alreary deleted'
        ctx.telegram.editMessageCaption(chatId, messageId, undefined, text)
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
    handleSold,
    handleRepost,
    handleEditCaption,
    handleEditTitle,
    handleEditDescription,
    handleEditPrice,
    handleEditSaveDiscard,
    handleDeletePost
}

