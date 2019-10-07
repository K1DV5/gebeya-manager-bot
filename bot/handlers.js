const path = require('path')
const fs = require('fs')
const photo = require('./photo')

let SQL // the query function
let ADMINS // only these can edit the db by sending messages
let BOT_TOKEN
let FALLBACK_REPLY = "Error, don't know what to say"
let IMAGE_STAGING_DIR = '../images-staging'

function init(admins, queryFunc, token) {
    ADMINS = admins
    SQL = queryFunc
    BOT_TOKEN = token
}

function argparse(from) {
    // find values of parameters written like cli args: /command -p param /// but spaces are allowed.
    let paramsSection = from[0] === '/'? from.split(' ').slice(1) : from.trim()
    let params = {positional: []}
    let currentKey = null
    for (let part of paramsSection) {
        part = part.trim()
        if (part) {
            if (part[0] === '-') {
                part = part.slice(1)
                if (currentKey && !params[currentKey]) {
                    params[currentKey] = true
                } else if (params[currentKey] && typeof params[currentKey] === 'string') {
                    params[currentKey] = params[currentKey].trim()
                }
                currentKey = part
                params[currentKey] = true
            } else {
                if (currentKey === null) {
                    params.positional.push(part)
                } else if (typeof params[currentKey] === 'string') {
                    params[currentKey] += ' ' + part
                } else {
                    params[currentKey] = part
                }
            }
        }
    }
    return params
}

async function handleAdminAdd(ctx) {
    let username = ctx.from.username
    if (ADMINS.includes(username)) {
        let text = ctx.message.text
        let args = argparse(text)
        ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
        if (args.p === '1221') {
            if (args.u && args.c && args.e) {
                await SQL('INSERT IGNORE INTO sellers (username) VALUES (?)', [args.u])
                let licenseExpiry = new Date(args.e)
                SQL(`INSERT INTO channels (username, seller, license_expiry) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE seller = VALUES(seller), license_expiry = VALUES(license_expiry)`,
                    [args.c, args.u, licenseExpiry.getTime()])
                ctx.reply(`New channel @${args.c} by @${args.u} added, license expiring on ${licenseExpiry.toString()}`)
            } else {
                ctx.reply('Necessary arguments not given: -u, -c, -e, -p')
            }
        } else {
            ctx.reply(FALLBACK_REPLY)
        }
    } else {
        console.log('Not admin')
        ctx.reply(FALLBACK_REPLY)
    }
}

async function handleStart(ctx) {
    let {id: userId, username} = ctx.update.message.from
    if (ctx.startPayload) {  // a button on a post was clicked
        let messageIdDb = ctx.startPayload.trim().replace('-', '/')
        let message = (await SQL('SELECT * FROM posts WHERE message_id = ?', [messageIdDb]))[0]
        if (message) {
            let [channel] = messageIdDb.split('/', 1)
            // send messages to both parties.
            let itemText = 'this item'
            let itemLink = `<a href="https://t.me/${messageIdDb}">${itemText}</a>`
            let admin = (await SQL(`SELECT a.chat_id AS chat_id, a.username AS username
                                    FROM posts AS p
                                    INNER JOIN channels AS c
                                        ON p.channel = c.username
                                    INNER JOIN sellers AS a
                                        ON c.admin = a.username
                                    WHERE message_id = ?`,
                [messageIdDb]))[0]

            // to the customer
            let contactText = (await SQL('SELECT contact_text FROM channels WHERE username = ?',
                [channel]))[0].contact_text
            let text = 'You have selected ' + itemLink + ' from @' + channel +  '.\n' + contactText
            ctx.reply(text, {
                parse_mode: 'html',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Details',
                                callback_data: 'details:' + messageIdDb
                            },
                            {
                                text: 'Contact seller',
                                url: 'https://t.me/' + admin.username
                            }
                        ]
                    ]
                }
            })

            // to the admin
            let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
            text = `You have a ${customerLink} who wants to buy ${itemLink} from @${channel}. They may contact you.`
            ctx.telegram.sendMessage(admin.chat_id, text, {
                parse_mode: 'html',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Mark as sold',
                                callback_data: 'sold:' + messageIdDb
                            },
                            {
                                text: 'Repost',
                                callback_data: 'repost:' + messageIdDb
                            }
                        ]
                    ]
                }
            })
        } else {
            ctx.reply('No message with that id was found.')
        }
    } else {
        let sellers = (await SQL('SELECT username FROM sellers')).map(s => s.username)
        if (sellers.includes(username)) {
            // admin exists in db assumed
            SQL(`UPDATE sellers SET chat_id = ?, draft_stage = ? WHERE username = ?`,
                [ctx.chat.id, 0, username])
            // store the chat id for the username
            ctx.reply('Welcome, now I can talk to you. Please send /post to post a new item.')
        } else {
            let reply = 'Welcome, please go to one of our channels '
            let channels = (await SQL('SELECT username FROM channels')).map(ch => ch.username)
            for (let channel of channels) {
                reply += '@' + channel + ', '
            }
            reply = reply.slice(0, -2) + ' and select "Buy" on an item.'
            ctx.reply(reply)
        }
    }
}

async function handlePost(ctx) {
    let username = ctx.from.username
    let sellers = (await SQL('SELECT username FROM sellers')).map(s => s.username)
    if (sellers.includes(username)) {
        SQL('UPDATE sellers SET draft_stage = ? WHERE username = ?', ['post.channel', username])
        // prepare choices
        let channels = (await SQL('SELECT c.username FROM channels as c INNER JOIN sellers AS s ON s.username = c.seller WHERE s.username = ?', [username])).map(ch => ch.username)
        if (channels.length === 1) {
            SQL('UPDATE sellers SET draft_channel = ?, draft_stage = ? WHERE username = ?',
                [channels[0], 'post.title', username])
            ctx.reply('You will be posting to @' + channels[0] + '. What is the title of the post?')
        } else {
            let keyboardRows = []
            let keyboardTiles = []
            for (let channel of channels) {
                let channelButton = {
                    text: '@' + channel,
                }
                if (keyboardTiles.length === 3) {
                    keyboardRows.push(keyboardTiles)
                    keyboardTiles = [channelButton]
                } else {
                    keyboardTiles.push(channelButton)
                }
            }
            if (keyboardTiles.length) {
                keyboardRows.push(keyboardTiles)
            }
            ctx.reply('Which channel do you want to post to?', {
                reply_markup: {
                    keyboard: keyboardRows,
                    resize_keyboard: true,
                }
            })
        }
    } else {
        ctx.reply('You are not registered here as an admin of any channel.')
    }
}

async function handleText(ctx) {
    let username = ctx.from.username
    let text = ctx.message.text
    let sellers = (await SQL('SELECT username FROM sellers')).map(s => s.username)
    if (sellers.includes(username) && text.trim()) {
        // get the current stage
        let draftStage = (await SQL('SELECT draft_stage FROM sellers WHERE username = ?', [username]))[0]
        let stage = draftStage.draft_stage
        if (stage == 'post.channel') {
            // to the title stage
            handleChannelStage(ctx)
        } else if (stage == 'post.title') {
            // to the description stage
            handleTitleStage(ctx)
        } else if (stage == 'post.description') {
            // to the description stage
            handleDescriptionStage(ctx)
        } else if (stage == 'post.price') {
            // to the price stage
            handlePriceStage(ctx)
        } else {
            ctx.reply(FALLBACK_REPLY)
        }
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
}

async function handleChannelStage(ctx) {
    let username = ctx.from.username
    let text = ctx.message.text
    let channel = text.indexOf('@') === 0 ? text.slice(1) : text
    let channels = await SQL('SELECT c.username, c.license_expiry FROM channels as c INNER JOIN sellers AS s ON s.username = c.seller WHERE s.username = ?', [username])
    if (channels.includes(channel)) {
        let licenseExpiry = (await SQL('SELECT license_expiry FROM channels WHERE username = ?',
            [channel]))
        if (licenseExpiry > ctx.message.date) {
            SQL('UPDATE sellers SET draft_channel = ?, draft_stage = ? WHERE username = ?',
                [channel, 'post.title', username])
            ctx.reply('What is the title of the post?', {
                reply_markup: {
                    remove_keyboard: true
                }
            })
        } else {
            ctx.reply('Sorry, your license for this channel has expired. Contact the admin for renewal.')
        }
    } else {
        ctx.reply('There is no channel with that username registered here by you.\nEnter another channel or choose one of those on the buttons')
    }
}

function handleTitleStage(ctx) {
    let username = ctx.from.username
    let title = ctx.message.text
    SQL('UPDATE sellers SET draft_title = ?, draft_stage = ? WHERE username = ?',
        [title, 'post.description', username])
    ctx.reply('Write the description')
}

function handleDescriptionStage(ctx) {
    let username = ctx.from.username
    let description = ctx.message.text
    SQL('UPDATE sellers SET draft_description = ?, draft_stage = ? WHERE username = ?',
        [description, 'post.price', username])
    ctx.reply('And the price? How much is it?')
}

function handlePriceStage(ctx) {
    let username = ctx.from.username
    let price = ctx.message.text
    SQL('UPDATE sellers SET draft_price = ?, draft_stage = ? WHERE username = ?',
        [price, 'post.photo', username])
    ctx.reply('Send some photos')
}

async function draftToPostable(username) {
    let query = `SELECT a.username,
                        a.chat_id,
                        a.draft_channel AS channel,
                        a.draft_title AS title,
                        a.draft_description AS description,
                        a.draft_price as price,
                        a.draft_image_ids AS images,
                        a.preview_post_message_id as previewId,
                        a.preview_removed_message_ids as removedIds,
                        a.draft_stage as stage,
                        c.caption_template AS template
                 FROM sellers as a
                 INNER JOIN channels AS c
                    ON c.username = a.draft_channel
                 WHERE a.username = ?`
    let adminData = (await SQL(query, [username]))[0]
    if (adminData) {
        adminData.caption = adminData.template
            .replace(/:title\b/, adminData.title)
            .replace(/:description\b/, adminData.description)
            .replace(/:price\b/, adminData.price)
        adminData.images = adminData.images ? JSON.parse(adminData.images) : null
        adminData.removedIds = adminData.removedIds ? JSON.parse(adminData.removedIds) : null
        return adminData
    }
    console.log('Not found')
}

async function handlePhotoStage(ctx) {
    let username = ctx.from.username
    let sellers = (await SQL('SELECT username FROM sellers')).map(s => s.username)
    if (sellers.includes(username)) {
        // get the current stage
        let draftStage = (await SQL('SELECT draft_stage FROM sellers WHERE username = ?', [username]))[0]
        let stage = draftStage.draft_stage
        if (stage === 'post.photo') {
            let filesToDown = []
            for (let photo of ctx.update.message.photo) {
                filesToDown.push(await ctx.telegram.getFile(photo.file_id))
            }
            let imagesDir = path.join(IMAGE_STAGING_DIR, username, 'draft-images')
            let channel = (await SQL('SELECT draft_channel FROM sellers WHERE username = ?', [username]))[0].draft_channel
            let logoImg = path.join(IMAGE_STAGING_DIR, username, 'logo-' + channel + '.png')
            let draftCollage = path.join(IMAGE_STAGING_DIR, username, 'draft-collage.jpg')
            let images = await photo.downloadPhotos(imagesDir, filesToDown, BOT_TOKEN)
            await photo.makeCollage(imagesDir, draftCollage, logoImg)  // make a collage and watermark it
            await photo.watermarkDir(imagesDir, imagesDir, logoImg)  // watermark every image
            let removedAtPost = [  // messages removed when the draft is posted
                // intro to the watermarked images preview
                (await ctx.reply('The individual images will look like this.')).message_id]
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
            removedAtPost.push((await ctx.reply('The post will look like this.')).message_id)
            // the post preview
            let caption = (await draftToPostable(username)).caption
            let postPreview = await ctx.replyWithPhoto(
                {source: fs.createReadStream(draftCollage)}, {
                caption, reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Post',
                                callback_data: 'post:' + username
                            },
                            {
                                text: 'Discard',
                                callback_data: 'discard:' + username
                            }
                        ]
                    ]
                }
            },
            )
            let imageIds = {
                collage: postPreview.photo.slice(-1)[0].file_id,
                watermarked: previewImages.map(msg => msg.photo.slice(-1)[0].file_id)
            }
            SQL('UPDATE sellers SET draft_image_ids = ?, preview_post_message_id = ?, preview_removed_message_ids = ?, draft_stage = ? WHERE username = ?', [
                JSON.stringify(imageIds),
                postPreview.message_id,
                JSON.stringify(removedAtPost),
                'post.ready',
                username
            ])
            fs.promises.unlink(draftCollage)
            photo.rmdirWithFiles(imagesDir)
        } else {
            ctx.reply(FALLBACK_REPLY)
        }
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
}

async function handlePostDraft(ctx) {
    let adminData = (await draftToPostable(ctx.from.username))
    if (adminData.stage === 'post.ready') {
        let channel = adminData.channel
        let message = await ctx.telegram.sendPhoto('@' + channel, adminData.images.collage, {caption: adminData.caption})
        let newMessageIdDb = channel + '/' + message.message_id
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + newMessageIdDb.replace('/', '-')
        ctx.telegram.editMessageReplyMarkup('@' + channel, message.message_id, undefined, {
            inline_keyboard: [
                [
                    {
                        text: 'Buy',
                        url: startUrl
                    }
                ]
            ]
        })
        // remove the preview messages
        await Promise.all(adminData.removedIds.map(async id => {
            await ctx.telegram.deleteMessage(adminData.chat_id, id)
        }))
        await ctx.telegram.deleteMessage(adminData.chat_id, adminData.previewId)
        // reply notice
        let newLink = '<a href="https://t.me/' + newMessageIdDb + '">here</a>'
        ctx.reply('Done, you can find your new post ' + newLink + '.', {parse_mode: 'html'})
        // record the post
        SQL('INSERT INTO posts (message_id, channel, caption, image_ids) VALUES (?, ?, ?, ?)',
            [newMessageIdDb, channel, adminData.caption, JSON.stringify(adminData.images)])
        // clean up the admin draft
        SQL(`UPDATE sellers SET draft_title = NULL,
                               draft_description = NULL,
                               draft_channel = NULL,
                               draft_image_ids = NULL,
                               preview_removed_message_ids = NULL,
                               preview_post_message_id = NULL
             WHERE username = ?`, [adminData.username])
    } else {
        let text = 'You haven\'t completed your draft, you still have to input '
        for (let [prop, value] of Object.entries(adminData)) {
            if (value === null) {
                if (prop === 'title') {
                    text += 'the title, '
                } else if (prop === 'description') {
                    text += 'the description, '
                } else if (prop === 'image_ids') {
                    text += 'the photos'
                } else if (prop === 'channel') {
                    text += 'the channel'
                }
            }
        }
        ctx.reply(text.slice(0, -2) + '.')
    }
}

async function handleDiscardDraft(ctx) {
    let adminData = (await draftToPostable(ctx.from.username))
    // remove the preview messages
    await Promise.all(adminData.removedIds.map(async id => {
        await ctx.telegram.deleteMessage(adminData.chat_id, id)
    }))
    await ctx.telegram.deleteMessage(adminData.chat_id, adminData.previewId)
    // clean up the admin draft
    SQL(`UPDATE sellers SET draft_title = NULL,
                           draft_description = NULL,
                           draft_channel = NULL,
                           draft_image_ids = NULL,
                           preview_removed_message_ids = NULL,
                           preview_post_message_id = NULL
        WHERE username = ?`, [adminData.username])
    ctx.reply('Draft discarded.')
}

async function handleDetails(ctx) {  // details callback
    let messageIdDb = ctx.update.callback_query.data
    let messageDetails = (await SQL('SELECT * FROM posts WHERE message_id = ?', [messageIdDb]))[0]
    if (messageDetails) {
        // let admin = (await SQL(`SELECT a.username
        //                         FROM posts AS p
        //                         INNER JOIN channels AS c
        //                             ON p.channel = c.username
        //                         INNER JOIN sellers AS a
        //                             ON c.admin = a.username
        //                         WHERE message_id = ?`,
        //                         [messageIdDb]))[0]
        let images = JSON.parse(messageDetails.image_ids)
        images = images.map(img => {return {type: 'photo', media: img}})
        // put the caption on the last one
        images[images.length - 1].caption = messageDetails.caption
        ctx.replyWithMediaGroup(images, {
            // reply_markup: {
            //     inline_keyboard: [
            //             [
            //                 {
            //                     text: 'Contact seller',
            //                     url: 'https://t.me/' + admin.username
            //                 }
            //             ]
            //         ]
            // }
        })
    } else {
        ctx.reply('Details not found')
    }
}

async function handleSoldToggle(ctx) {
    let messageIdDb = ctx.update.callback_query.data
    let [channel, messageId] = messageIdDb.split('/')
    let query = `SELECT p.caption, p.image_ids, p.state, p.channel, c.sold_template
                 FROM posts as p
                 INNER JOIN channels AS c
                 ON c.username = p.channel
                 WHERE p.message_id = ?`
    let post = (await SQL(query, messageIdDb))[0]
    let messageEntities = ctx.update.callback_query.message.entities
    if (post.state === 'available') {
        let soldText = post.sold_template.replace(/:caption\b/, post.caption)
        ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, soldText)
        // change the state
        SQL('UPDATE posts SET state = "sold" WHERE message_id = ?', [messageIdDb])
        // replace the button with undo
        let userId = messageEntities.filter(e => e.type == 'text_mention')[0].user.id
        let itemLink = '<a href="' + messageEntities.filter(e => e.type == 'text_link')[0].url + '">this item</a>'
        let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
        let text = `You have a ${customerLink} who wants to buy ${itemLink} from @${post.channel}. They may contact you.`
        let chatId = ctx.update.callback_query.from.id
        let adminMessageId = ctx.update.callback_query.message.message_id
        ctx.telegram.editMessageText(chatId, adminMessageId, undefined, text, {
            parse_mode: 'html',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: 'Undo sold',
                            callback_data: 'sold:' + messageIdDb
                        },
                        {
                            text: 'Repost',
                            callback_data: 'repost:' + messageIdDb
                        }
                    ]
                ]
            }
        })
    } else {
        let caption = post.caption
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + messageIdDb.replace('/', '-')
        ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, caption, {
            inline_keyboard: [
                [
                    {
                        text: 'Buy',
                        url: startUrl
                    }
                ]
            ]
        })
        // change the state
        SQL('UPDATE posts SET state = "available" WHERE message_id = ?', [messageIdDb])
        // replace the button with undo
        let userId = messageEntities.filter(e => e.type == 'text_mention')[0].user.id
        let itemLink = '<a href="' + messageEntities.filter(e => e.type == 'text_link')[0].url + '">this item</a>'
        let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
        let text = `You have a ${customerLink} who wants to buy ${itemLink} from @${post.channel}. They may contact you.`
        let chatId = ctx.update.callback_query.from.id
        let adminMessageId = ctx.update.callback_query.message.message_id
        ctx.telegram.editMessageText(chatId, adminMessageId, undefined, text, {
            parse_mode: 'html',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: 'Mark as sold',
                            callback_data: 'sold:' + messageIdDb
                        },
                        {
                            text: 'Repost',
                            callback_data: 'repost:' + messageIdDb
                        }
                    ]
                ]
            }
        })
    }
}

async function handleRepost(ctx) {
    let input = ctx.update.callback_query
    let messageIdDb = input.data
    let query = `SELECT p.caption, p.image_ids as images, p.channel, c.sold_template
                 FROM posts as p
                 INNER JOIN channels AS c
                     ON c.username = p.channel
                 WHERE p.message_id = ?`
    let postData = (await SQL(query, [messageIdDb]))[0]
    if (postData) {
        // mark as sold
        let soldText = postData.sold_template.replace(/:caption\b/, postData.caption)
        ctx.telegram.editMessageCaption('@' + postData.channel, messageIdDb.split('/')[1], undefined, soldText)
        // also in db
        SQL('UPDATE posts SET state = "sold" WHERE message_id = ?', [messageIdDb])
        let collageId = JSON.parse(postData.images).collage
        let message = await ctx.telegram.sendPhoto('@' + postData.channel, collageId, {caption: postData.caption})
        let newMessageIdDb = postData.channel + '/' + message.message_id
        SQL('INSERT INTO posts (message_id, channel, caption, image_ids) VALUES (?, ?, ?, ?)',
            [newMessageIdDb, postData.channel, postData.caption, postData.images])
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + newMessageIdDb.replace('/', '-')
        ctx.telegram.editMessageReplyMarkup('@' + postData.channel, message.message_id, undefined, {
            inline_keyboard: [
                [
                    {
                        text: 'Buy',
                        url: startUrl
                    }
                ]
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

function handleCallback(ctx) {
    let callbackData = ctx.update.callback_query.data
    console.log(callbackData)
    let prefixes = {
        'post:': handlePostDraft,
        'discard:': handleDiscardDraft,
        'details:': handleDetails, // buyer
        'sold:': handleSoldToggle,
        'repost:': handleRepost,
    }
    for (let [prefix, handler] of Object.entries(prefixes)) {
        // remove the prefix
        ctx.update.callback_query.data = callbackData.slice(prefix.length)
        if (callbackData.slice(0, prefix.length) === prefix) {
            handler(ctx)
        }
    }
    ctx.answerCbQuery('Done')
}

module.exports = {
    init,
    handleStart,
    handlePost,
    handleText,
    handleCallback,
    handleTitleStage,
    handleDescriptionStage,
    handlePhotoStage,
    handleAdminAdd,
}
