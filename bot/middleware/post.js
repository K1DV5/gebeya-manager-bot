const {
    makeKeyboardTiles,
    draftToPostable,
    downloadPhotos,
    watermarkDir,
    rmdirWithFiles,
    makeCollage
} = require('../utils')
const fs = require('fs')
const util = require('util')
const path = require('path')

let photosReceived = {
}

function post(ctx) {
    if (ctx.state.isAdmin) {
        let stage = ctx.state.stage
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
    let channels = (await ctx.state.sql('SELECT c.username, c.license_expiry FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).filter(ch => ch.license_expiry*1 > ctx.update.message.date).map(ch => ch.username)
    if (!channels.length) {
        ctx.state.sql('UPDATE people SET conversation = NULL, chat_id = ? WHERE username = ?', [ctx.chat.id, username])
        ctx.reply('There is no channel with a valid license registered here by you. Contact @' + ctx.state.admins[0] + ' for renewal.')
        return
    }
    ctx.state.sql('UPDATE people SET conversation = "post.channel", chat_id = ? WHERE username = ?', [ctx.chat.id, username])
    if (channels.length === 1) {
        ctx.state.sql('UPDATE people SET draft_destination = ?, conversation = ? WHERE username = ?',
            [channels[0], 'post.title', username])
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
    let channels = await ctx.state.sql('SELECT c.username, c.license_expiry FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])
    if (channels.includes(channel)) {
        ctx.state.sql('UPDATE people SET draft_destination = ?, conversation = ? WHERE username = ?',
                       [channel, 'post.title', username])
        let chatId = ctx.update.callback_query.from.id
        let messageId = ctx.message.message_id
        let text = 'You will be posting to @' + channel + '.What is the title of the post?'
        ctx.telegram.editMessageText(chatId, messageId, undefined, text)
    } else {
        ctx.reply('There is no channel with that username registered here by you.\nEnter another channel or choose one of those on the buttons')
    }
}

function handleTitleStage(ctx) {
    let username = ctx.from.username
    let title = ctx.message.text
    ctx.state.sql('UPDATE people SET draft_title = ?, conversation = ? WHERE username = ?',
        [title, 'post.description', username])
    ctx.reply('Write the description')
}

function handleDescriptionStage(ctx) {
    let username = ctx.from.username
    let description = ctx.message.text
    ctx.state.sql('UPDATE people SET draft_description = ?, conversation = ? WHERE username = ?',
        [description, 'post.price', username])
    ctx.reply('And the price? How much is it?')
}

function handlePriceStage(ctx) {
    let username = ctx.from.username
    let price = ctx.message.text
    ctx.state.sql('UPDATE people SET draft_price = ?, conversation = ? WHERE username = ?',
        [price, 'post.photo', username])
    ctx.reply('Send some photos and finally send the command /end when you\'re done.', {
        reply_markup: {
            resize_keyboard: true
        }
    })
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
        // clear the object
        photosReceived[username] = undefined
        let imagesDir = path.join(ctx.state.imagesDir, username, 'draft-images')
        let channel = (await ctx.state.sql('SELECT draft_destination FROM people WHERE username = ?', [username]))[0].draft_destination
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
        let caption = (await draftToPostable(username, ctx.state.sql)).caption
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
        ctx.state.sql('UPDATE people SET draft_image_ids = ?, preview_post_message_id = ?, removed_message_ids = ?, conversation = "post.ready" WHERE username = ?', [
            JSON.stringify(imageIds),
            postPreview.message_id,
            JSON.stringify(removedAtPost),
            username
        ])
        fs.promises.unlink(draftCollage)
        rmdirWithFiles(imagesDir)
    }
}

async function handlePostDraft(ctx) {
    let adminData = (await draftToPostable(ctx.from.username, ctx.state.sql))
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
    ctx.state.sql('INSERT INTO posts (channel, message_id, title, description, price, caption, image_ids, post_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [channel,
        message.message_id,
        adminData.title,
        adminData.description,
        adminData.price,
        adminData.caption,
        JSON.stringify(adminData.images),
        ctx.update.callback_query.message.date
    ])
    // clean up the person draft
    ctx.state.sql(`UPDATE people SET draft_title = NULL,
                           draft_description = NULL,
                           draft_destination = NULL,
                           draft_image_ids = NULL,
                           removed_message_ids = NULL,
                           preview_post_message_id = NULL
         WHERE username = ?`, [adminData.username])
}

async function handleDiscardDraft(ctx) {
    let adminData = (await draftToPostable(ctx.from.username, ctx.state.sql))
    // remove the preview messages
    await Promise.all(adminData.removedIds.map(async id => {
        await ctx.telegram.deleteMessage(adminData.chat_id, id)
    }))
    await ctx.telegram.deleteMessage(adminData.chat_id, adminData.previewId)
    // clean up the person draft
    ctx.state.sql(`UPDATE people SET draft_title = NULL,
                           draft_description = NULL,
                           draft_destination = NULL,
                           draft_image_ids = NULL,
                           removed_message_ids = NULL,
                           preview_post_message_id = NULL,
                           conversation = NULL
         WHERE username = ?`, [adminData.username])
    ctx.reply('Draft discarded.')
}

module.exports = post
