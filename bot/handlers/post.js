const {
    makeKeyboardTiles,
    downloadPhotos,
    watermarkDir,
    rmdirWithFiles,
    makeCollage
} = require('../utils')
const fs = require('fs')
const path = require('path')

let photosReceived = {
}

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
    ctx.state.people.set(username, {conversation: null, chat_id: ctx.chat.id})
    // prepare choices
    let channels = await ctx.state.people.getChannels(username, ctx.update.message.date)
    if (!channels.length) {
        ctx.reply('There is no channel with a valid license registered here by you. Contact @' + ctx.state.admins[0] + ' for renewal.')
        return
    }
    if (channels.length === 1) {
        ctx.state.people.set(username, {draft_destination: channels[0], conversation: 'post.title'})
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
    ctx.reply('Write the description')
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
}

async function handlePhotoStage(ctx) {
    let username = ctx.from.username
    if (ctx.updateSubTypes.includes('photo')) {
        let photo = ctx.update.message.photo
        let fileProps = await ctx.telegram.getFile(photo[photo.length-1].file_id)
        if (photosReceived[username]) {
            photosReceived[username].push(fileProps)
        } else {
            photosReceived[username] = [fileProps]
        }
    } else if (ctx.updateSubTypes.includes('text') && ctx.update.message.text === '/end') {
        // get the accumulated file props
        let filesToDown = photosReceived[username]
        if (filesToDown === undefined) {
            ctx.reply('You haven\'t sent any photos, send some and then /end')
            return
        }
        // clear the object
        photosReceived[username] = undefined
        let imagesDir = path.join(ctx.state.imagesDir, username, 'draft-images')
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
        let images = await downloadPhotos(imagesDir, filesToDown, ctx.telegram.token)
        await makeCollage(imagesDir, draftCollage, logoImg)  // make a collage and watermark it
        await watermarkDir(imagesDir, imagesDir, logoImg)  // watermark every image
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

module.exports = post
