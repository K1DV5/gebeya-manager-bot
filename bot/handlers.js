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
                await SQL('INSERT IGNORE INTO people (username) VALUES (?)', [args.u])
                let licenseExpiry = new Date(args.e)
                SQL(`INSERT INTO channels (username, admin, license_expiry) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE admin = VALUES(admin),
                                             license_expiry = VALUES(license_expiry),
                                             contact_text = CONCAT("To buy this item, contact @", VALUES(admin), ".")`,
                    [args.c, args.u, licenseExpiry.getTime()])
                ctx.reply(`New channel @${args.c} by @${args.u} added, license expiring on ${licenseExpiry.toString()}`)
            } else {
                ctx.reply('Necessary arguments not given: -u, -c, -e, -p')
            }
        } else {
            ctx.reply(FALLBACK_REPLY)
        }
    } else {
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
            let person = (await SQL(`SELECT a.chat_id AS chat_id, a.username AS username
                                    FROM posts AS p
                                    INNER JOIN channels AS c
                                        ON p.channel = c.username
                                    INNER JOIN people AS a
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
                            { text: 'Details', callback_data: 'details:' + messageIdDb },
                            { text: 'Contact seller', url: 'https://t.me/' + person.username }
                        ]
                    ]
                }
            })

            // to the person
            let customerLink = `<a href="tg://user?id=${userId}">customer</a>`
            text = `You have a ${customerLink} who wants to buy ${itemLink} from @${channel}. They may contact you.`
            ctx.telegram.sendMessage(person.chat_id, text, {
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
        } else {
            ctx.reply('No message with that id was found.')
        }
    } else {
        let people = (await SQL('SELECT username FROM people')).map(p => p.username)
        if (people.includes(username)) {
            // person exists in db assumed
            SQL(`UPDATE people SET chat_id = ? WHERE username = ?`,
                [ctx.chat.id, username])
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

function makeKeyboardTiles(buttons) {
    let keyboardRows = []
    let keyboardTiles = []
    for (let button of buttons) {
        if (keyboardTiles.length === 3) {
            keyboardRows.push(keyboardTiles)
            keyboardTiles = [button]
        } else {
            keyboardTiles.push(button)
        }
    }
    if (keyboardTiles.length) {
        keyboardRows.push(keyboardTiles)
    }
    return keyboardRows
}

async function handlePost(ctx) {
    let username = ctx.from.username
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        SQL('UPDATE people SET conversation = ?, chat_id = ? WHERE username = ?', ['post.channel', ctx.chat.id, username])
        // prepare choices
        let channels = (await SQL('SELECT c.username FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).map(ch => ch.username)
        if (channels.length === 1) {
            SQL('UPDATE people SET draft_channel = ?, conversation = ? WHERE username = ?',
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
    } else {
        ctx.reply('You are not registered here as an admin of any channel.')
    }
}

async function handleChannelStage(ctx) {
    let username = ctx.from.username
    let channel = ctx.update.callback_query.data.split(':')[1]
    let channels = await SQL('SELECT c.username, c.license_expiry FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])
    if (channels.includes(channel)) {
        let licenseExpiry = (await SQL('SELECT license_expiry FROM channels WHERE username = ?',
            [channel]))
        if (licenseExpiry > ctx.message.date) {
            SQL('UPDATE people SET draft_channel = ?, conversation = ? WHERE username = ?',
                [channel, 'post.title', username])
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.message.message_id
            let text = 'You will be posting to @' + channel + '.What is the title of the post?'
            ctx.telegram.editMessageText(chatId, messageId, undefined, text)
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
    SQL('UPDATE people SET draft_title = ?, conversation = ? WHERE username = ?',
        [title, 'post.description', username])
    ctx.reply('Write the description')
}

function handleDescriptionStage(ctx) {
    let username = ctx.from.username
    let description = ctx.message.text
    SQL('UPDATE people SET draft_description = ?, conversation = ? WHERE username = ?',
        [description, 'post.price', username])
    ctx.reply('And the price? How much is it?')
}

function handlePriceStage(ctx) {
    let username = ctx.from.username
    let price = ctx.message.text
    SQL('UPDATE people SET draft_price = ?, conversation = ? WHERE username = ?',
        [price, 'post.photo', username])
    ctx.reply('Send some photos')
}

async function draftToPostable(username) {
    let query = `SELECT p.username,
                        p.chat_id,
                        p.draft_channel AS channel,
                        p.draft_title AS title,
                        p.draft_description AS description,
                        p.draft_price as price,
                        p.draft_image_ids AS images,
                        p.preview_post_message_id as previewId,
                        p.preview_removed_message_ids as removedIds,
                        p.conversation as stage,
                        c.caption_template AS template
                 FROM people AS p
                 INNER JOIN channels AS c
                    ON c.username = p.draft_channel
                 WHERE p.username = ?`
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
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        // get the current stage
        let draftStage = (await SQL('SELECT conversation FROM people WHERE username = ?', [username]))[0]
        let stage = draftStage.conversation
        if (stage === 'post.photo') {
            let filesToDown = []
            for (let photo of ctx.update.message.photo) {
                filesToDown.push(await ctx.telegram.getFile(photo.file_id))
            }
            let imagesDir = path.join(IMAGE_STAGING_DIR, username, 'draft-images')
            let channel = (await SQL('SELECT draft_channel FROM people WHERE username = ?', [username]))[0].draft_channel
            let logoImg = path.join(IMAGE_STAGING_DIR, username, 'logo-' + channel + '.png')
            try {
                await fs.promises.stat(logoImg) // check if it exists
            } catch(err) {
                if (err.code === 'ENOENT') {
                    logoImg = undefined
                    ctx.reply("You don't have your logo here, the images will not be watermarked. To watermark your images with your logo, go to /settings and 'Logo'.")
                }
            }
            let draftCollage = path.join(IMAGE_STAGING_DIR, username, 'draft-collage.jpg')
            let images = await photo.downloadPhotos(imagesDir, filesToDown, BOT_TOKEN)
            await photo.makeCollage(imagesDir, draftCollage, logoImg)  // make a collage and watermark it
            await photo.watermarkDir(imagesDir, imagesDir, logoImg)  // watermark every image
            let removedAtPost = [  // messages removed when the draft is posted
                // intro to the watermarked images preview
                (await ctx.reply('The individual images will look like this...')).message_id]
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
            let caption = (await draftToPostable(username)).caption
            let postPreview = await ctx.replyWithPhoto(
                {source: fs.createReadStream(draftCollage)}, {
                caption, reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Post', callback_data: 'post:' + username },
                            { text: 'Discard', callback_data: 'discard:' + username }
                        ]
                    ]
                }
            },
            )
            let imageIds = {
                collage: postPreview.photo.slice(-1)[0].file_id,
                watermarked: previewImages.map(msg => msg.photo.slice(-1)[0].file_id)
            }
            SQL('UPDATE people SET draft_image_ids = ?, preview_post_message_id = ?, preview_removed_message_ids = ?, conversation = ? WHERE username = ?', [
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
                [ { text: 'Buy', url: startUrl } ]
            ]
        })
        // remove the preview messages
        await Promise.all(adminData.removedIds.map(async id => {
            await ctx.telegram.deleteMessage(adminData.chat_id, id)
        }))
        await ctx.telegram.deleteMessage(adminData.chat_id, adminData.previewId)
        // reply notice
        let newLink = '<a href="https://t.me/' + newMessageIdDb + '">here</a>'
        ctx.reply('Done, you can find your new post ' + newLink + '.',
            {parse_mode: 'html', reply_markup: {
                inline_keyboard: [
                    { text: 'Edit caption', callback_data: 'edit:' + newMessageIdDb }
                ]
            }}
        )
        // record the post
        SQL('INSERT INTO posts (message_id, channel, caption, image_ids) VALUES (?, ?, ?, ?)',
            [newMessageIdDb, channel, adminData.caption, JSON.stringify(adminData.images)])
        // clean up the person draft
        SQL(`UPDATE people SET draft_title = NULL,
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
    // clean up the person draft
    SQL(`UPDATE people SET draft_title = NULL,
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
        // let person = (await SQL(`SELECT a.username
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
    if (post.state === 'available' || ctx.forceSold) {
        let soldText = post.sold_template.replace(/:caption\b/, post.caption)
        try {
            ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, soldText)
        } catch {}
        if (forceSold === undefined) {
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
                            { text: 'Undo sold', callback_data: 'sold:' + messageIdDb },
                            { text: 'Repost', callback_data: 'repost:' + messageIdDb }
                        ]
                    ]
                }
            })
        }
    } else {
        let caption = post.caption
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + messageIdDb.replace('/', '-')
        ctx.telegram.editMessageCaption('@' + channel, messageId, undefined, caption, {
            inline_keyboard: [
                [
                    { text: 'Buy', url: startUrl }
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
                        { text: 'Mark as sold', callback_data: 'sold:' + messageIdDb },
                        { text: 'Repost', callback_data: 'repost:' + messageIdDb }
                    ]
                ]
            }
        })
    }
}

async function handleRepost(ctx) {
    let input = ctx.update.callback_query
    let messageIdDb = input.data
    let query = `SELECT p.caption, p.image_ids as images, p.channel, p.state, c.sold_template
                 FROM posts as p
                 INNER JOIN channels AS c
                     ON c.username = p.channel
                 WHERE p.message_id = ?`
    let postData = (await SQL(query, [messageIdDb]))[0]
    if (postData) {
        if (postData.state === 'available') {
            // mark as sold
            let soldText = postData.sold_template.replace(/:caption\b/, postData.caption)
            ctx.telegram.editMessageCaption('@' + postData.channel, messageIdDb.split('/')[1], undefined, soldText)
            // also in db
            SQL('UPDATE posts SET state = "sold" WHERE message_id = ?', [messageIdDb])
        }
        let collageId = JSON.parse(postData.images).collage
        let message = await ctx.telegram.sendPhoto('@' + postData.channel, collageId, {caption: postData.caption})
        let newMessageIdDb = postData.channel + '/' + message.message_id
        SQL('INSERT INTO posts (message_id, channel, caption, image_ids) VALUES (?, ?, ?, ?)',
            [newMessageIdDb, postData.channel, postData.caption, postData.images])
        let startUrl = 'https://t.me/' + ctx.botInfo.username + '?start=' + newMessageIdDb.replace('/', '-')
        ctx.telegram.editMessageReplyMarkup('@' + postData.channel, message.message_id, undefined, {
            inline_keyboard: [
                [ { text: 'Buy', url: startUrl } ]
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

async function handleDeletePost(ctx) {
    let input = ctx.update.callback_query
    let messageIdDb = input.data
    let query = 'SELECT 1 FROM posts WHERE message_id = ?'
    let postExists = (await SQL(query, [messageIdDb]))[0]
    if (postExists) {
        let [channel, postId] = messageIdDb.split('/')
        let chatId = ctx.update.callback_query.from.id
        let messageId = ctx.update.callback_query.message.message_id
        try {
            ctx.telegram.deleteMessage('@' + channel, postId)
            let text = 'Post deleted.'
            ctx.telegram.editMessageText(chatId, messageId, undefined, text)
        } catch {
            ctx.state.forceSold = true // force make it sold
            handleSoldToggle(ctx)
            let text = "can't delete message, marked sold. You can delete it manually."
            ctx.telegram.editMessageText(chatId, messageId, undefined, text)
        }
    } else {
        ctx.reply('Sorry, not found')
    }
}

async function handleEditPost(ctx) {
    let username = ctx.from.username
    let stage = (await SQL('SELECT conversation FROM people WHERE username = ?', [username]))[0].conversation
    if (stage === 'edit.title') {
        let text = ctx.update.message.text
        if (text.trim() !== 'skip') {
            SQL('UPDATE people SET draft_title = ?, conversation = "edit.description" WHERE username = ?', [text, username])
            ctx.reply('Send the new description. If you don\'t want to change it, send <b>skip</b>.', {parse_mode: 'html'})
        } else {
            SQL('UPDATE people SET ')
        }
    } else if (stage === 'edit.description') {
        let text = ctx.update.message.text
        if (text.trim() !== 'skip') {
            SQL('UPDATE people SET draft_destination = ?, conversation = "edit.price" WHERE username = ?', [text, username])
            ctx.reply('Send the new price. If you don\'t want to change it, send <b>skip</b>.', {parse_mode: 'html'})
        }
    } else if (stage === 'edit.price') {
        let text = ctx.update.message.text
        if (text.trim() !== 'skip') {
            await SQL('UPDATE people SET draft_price = ?, conversation = "edit.ready" WHERE username = ?', [text, username])
            let caption = await draftToPostable(username)
            ctx.reply('Send the new description. If you don\'t want to change it, send <b>skip</b>.', {parse_mode: 'html'})
        }
    } else if (stage === 'edit.ready') {
        let input = ctx.update.callback_query
        let messageIdDb = input.data
        let postExists = (await SQL(query, [messageIdDb]))[0]
        if (postExists) {
            SQL('UPDATE people SET conversation = "edit.title", draft_destination = ? WHERE username = ?', [messageIdDb, username])
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.update.callback_query.message.message_id
            ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, {
                inline_keyboard: [
                    [ { text: 'Buy', url: startUrl } ]
                ]
            })
        } else {
            ctx.reply('Sorry, not found')
        }
    } else {
        let input = ctx.update.callback_query
        let messageIdDb = input.data
        let postExists = (await SQL(query, [messageIdDb]))[0]
        if (postExists) {
            SQL('UPDATE people SET conversation = "edit.title", draft_destination = ? WHERE username = ?', [messageIdDb, username])
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.update.callback_query.message.message_id
            ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, {
                inline_keyboard: [
                    [ { text: 'Buy', url: startUrl } ]
                ]
            })
        } else {
            ctx.reply('Sorry, not found')
        }
    }
}

async function handleSettings(ctx) {
    let username = ctx.from.username
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        SQL('UPDATE people SET conversation = NULL WHERE username = ?', [username])
        let licences = (await SQL('SELECT c.license_expiry FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).map(l=>l.license_expiry)
        if (licences.some(expire => expire > ctx.message.date)) {
            ctx.reply('What do you want to change?', {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Logo', callback_data: 'settings.logo:' },
                            { text: 'Contact text', callback_data: 'settings.contact_text:' }
                        ],
                        [
                            { text: 'Caption template', callback_data: 'settings.caption_template:' },
                            { text: 'Sold template', callback_data: 'settings.sold_template:' }
                        ]
                    ]
                }
            })
        } else {
            ctx.reply('You have no channel with a valid license. Contact @' + ADMINS[0] + ' for renewal.')
        }
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
}

async function handleSettingLogo(ctx) {
    let username = ctx.from.username
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        SQL('UPDATE people SET conversation = "settings.logo.channel" WHERE username = ?', [username])
        let channels = (await SQL('SELECT c.username FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).map(ch => ch.username)
        let buttons = channels.map(ch => {return {text: '@' + ch, callback_data: 'settings.logo.channel:' + ch}})
        let keyboard = makeKeyboardTiles(buttons)
        let chatId = ctx.update.callback_query.from.id
        let messageId = ctx.update.callback_query.message.message_id
        let text = 'Which channel\'s logo do you want to change?'
        ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
            reply_markup: {
                inline_keyboard: keyboard,
            }
        })
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
}

async function handleSettingLogoChannel(ctx) {
    let username = ctx.from.username
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        let stage = (await SQL('SELECT conversation FROM people WHERE username = ?', [username]))[0].conversation
        if (stage === 'settings.logo.channel') {
            let channel = ctx.update.callback_query.data
            SQL('UPDATE people SET settings_channel = ?, conversation = ? WHERE username = ?', [channel, 'settings.logo.document', username])
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.update.callback_query.message.message_id
            let text = 'You will be changing the logo for @' + channel + ', send the logo AS A DOCUMENT because Telegam will remove the transparency if you send it as a photo.'
            ctx.telegram.editMessageText(chatId, messageId, undefined, text)
        } else {
            ctx.reply(FALLBACK_REPLY)
        }
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
}

async function handleDocument(ctx) {
    let username = ctx.from.username
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        // get the current stage
        let stage = (await SQL('SELECT conversation FROM people WHERE username = ?', [username]))[0].conversation
        if (stage === 'settings.logo.document') {
            let doc = ctx.update.message.document
            let [type, ext] = doc.mime_type.split('/')
            if (type === 'image') {
                let docProps = await ctx.telegram.getFile(ctx.update.message.document.file_id)
                let documentUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${docProps.file_path}`
                let channel = (await SQL('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
                let filePath = path.join(IMAGE_STAGING_DIR, username, 'logo-' + channel + '.' + ext)
                photo.downloadFile(documentUrl, filePath)
                ctx.reply('Done, this change will take effect the next time you post an item on @' + channel + '.')
            } else {
                ctx.reply('This is not an image. Send an image file.')
            }
        } else {
            ctx.reply(FALLBACK_REPLY)
        }
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
}

async function handleSettingCaptionTemplate(ctx) {
    let username = ctx.from.username
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        // get the current stage
        let stage = (await SQL('SELECT conversation FROM people WHERE username = ?', [username]))[0].conversation
        if (stage === 'settings.caption_template.channel') {
            let channel = ctx.update.callback_query.data
            let currentTemplate = (await SQL('SELECT caption_template FROM channels WHERE username = ?', [channel]))[0].caption_template
                .replace(/:title\b/, '<b>:title</b>')
                .replace(/:description\b/, '<b>:description</b>')
                .replace(/:price\b/, '<b>:price</b>')
            SQL('UPDATE people SET settings_channel = ?, conversation = ? WHERE username = ?', [channel, 'settings.caption_template.text', username])
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.update.callback_query.message.message_id
            let text = '<i>You will be changing the caption template for</i> @' + channel + ', <i>here is the current template, you can edit anything except</i> <b>:title</b>, <b>:description</b> <i>and</i> <b>:price</b>. <i>Those are placeholders for the posts.</i>\n\n' + currentTemplate
            ctx.telegram.editMessageText(chatId, messageId, undefined, text, {parse_mode: 'html'})
        } else if (stage === 'settings.caption_template.text') {
            let text = ctx.update.message.text
            if (/:title\b/.test(text) && /:description\b/.test(text) && /:price/.test(text)) {
                let channel = (await SQL('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
                SQL('UPDATE channels SET caption_template = ? WHERE username = ?', [text, channel])
                SQL('UPDATE people SET conversation = NULL WHERE username = ?', [username])
                ctx.reply('@' + channel + "'s caption template has been updated. This change will take effect from the next post on.")
            } else {
                ctx.reply('You have to include the above three elements, try again.')
            }
        } else {
            SQL('UPDATE people SET conversation = "settings.caption_template.channel" WHERE username = ?', [username])
            let channels = (await SQL('SELECT c.username FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).map(ch => ch.username)
            let buttons = channels.map(ch => {return {text: '@' + ch, callback_data: 'settings.caption_template:' + ch}})
            let keyboard = makeKeyboardTiles(buttons)
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.update.callback_query.message.message_id
            let text = 'Which channel\'s caption template do you want to change?'
            ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
                reply_markup: {
                    inline_keyboard: keyboard,
                }
            })
        }
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
}

async function handleSettingSoldTemplate(ctx) {
    let username = ctx.from.username
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        // get the current stage
        let stage = (await SQL('SELECT conversation FROM people WHERE username = ?', [username]))[0].conversation
        if (stage === 'settings.sold_template.channel') {
            let channel = ctx.update.callback_query.data
            let currentTemplate = (await SQL('SELECT sold_template FROM channels WHERE username = ?', [channel]))[0].sold_template
                .replace(/:caption\b/, '<b>:caption</b>')
            SQL('UPDATE people SET settings_channel = ?, conversation = "settings.sold_template.text" WHERE username = ?', [channel, username])
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.update.callback_query.message.message_id
            let text = '<i>You will be changing the template of the text shown when the item is sold from</i> @' + channel + ', <i>here is the current template, you can edit anything except</i> <b>:caption</b>. <i>It is a placeholder for the caption.</i>\n\n' + currentTemplate
            ctx.telegram.editMessageText(chatId, messageId, undefined, text, {parse_mode: 'html'})
        } else if (stage === 'settings.sold_template.text') {
            let text = ctx.update.message.text
            if (/:caption\b/.test(text)) {
                let channel = (await SQL('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
                SQL('UPDATE channels SET sold_template = ? WHERE username = ?', [text, channel])
                SQL('UPDATE people SET conversation = NULL WHERE username = ?', [username])
                ctx.reply('@' + channel + "'s sold template has been updated. This change will take effect the next time an item is marked sold.")
            } else {
                ctx.reply('You have to include ":caption", try again.')
            }
        } else {
            SQL('UPDATE people SET conversation = "settings.sold_template.channel" WHERE username = ?', [username])
            let channels = (await SQL('SELECT c.username FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).map(ch => ch.username)
            let buttons = channels.map(ch => {return {text: '@' + ch, callback_data: 'settings.sold_template:' + ch}})
            let keyboard = makeKeyboardTiles(buttons)
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.update.callback_query.message.message_id
            let text = 'Which channel\'s sold template do you want to change?'
            ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
                reply_markup: { inline_keyboard: keyboard }
            })
        }
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
}

async function handleSettingContactText(ctx) {
    let username = ctx.from.username
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        // get the current stage
        let stage = (await SQL('SELECT conversation FROM people WHERE username = ?', [username]))[0].conversation
        if (stage === 'settings.contact_text.channel') {
            let channel = ctx.update.callback_query.data
            let currentText = (await SQL('SELECT contact_text FROM channels WHERE username = ?', [channel]))[0].contact_text
            SQL('UPDATE people SET settings_channel = ?, conversation = "settings.contact_text.text" WHERE username = ?', [channel, username])
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.update.callback_query.message.message_id
            let text = '<i>You will be changing the contact text shown when an item is selected from</i> @' + channel + ', <i>here is the current text, you can send a new one</i>\n\n' + currentText
            ctx.telegram.editMessageText(chatId, messageId, undefined, text, {parse_mode: 'html'})
        } else if (stage === 'settings.contact_text.text') {
            let text = ctx.update.message.text
            let channel = (await SQL('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
            SQL('UPDATE channels SET contact_text = ? WHERE username = ?', [text, channel])
            SQL('UPDATE people SET conversation = NULL WHERE username = ?', [username])
            ctx.reply('@' + channel + "'s contact text has been updated. The new one will be shown the next time a user selects an item.")
        } else {
            SQL('UPDATE people SET conversation = "settings.contact_text.channel" WHERE username = ?', [username])
            let channels = (await SQL('SELECT c.username FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).map(ch => ch.username)
            let buttons = channels.map(ch => {return {text: '@' + ch, callback_data: 'settings.contact_text:' + ch}})
            let keyboard = makeKeyboardTiles(buttons)
            let chatId = ctx.update.callback_query.from.id
            let messageId = ctx.update.callback_query.message.message_id
            let text = 'Which channel\'s contact text do you want to change?'
            ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
                reply_markup: {
                    inline_keyboard: keyboard,
                }
            })
        }
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
}

function handleCallback(ctx) {
    let callbackData = ctx.update.callback_query.data
    let prefixes = {
        'post:': handlePostDraft,
        'post.channel:': handleChannelStage,
        'discard:': handleDiscardDraft,
        'details:': handleDetails, // buyer
        'sold:': handleSoldToggle,
        'repost:': handleRepost,
        'edit:': handleEditPost,
        'delete:': handleDeletePost,
        'settings.logo:': handleSettingLogo,
        'settings.logo.channel:': handleSettingLogoChannel,
        'settings.caption_template:': handleSettingCaptionTemplate,
        'settings.sold_template:': handleSettingSoldTemplate,
        'settings.contact_text:': handleSettingContactText,
    }
    for (let [prefix, handler] of Object.entries(prefixes)) {
        if (callbackData.slice(0, prefix.length) === prefix) {
            // remove the prefix
            ctx.update.callback_query.data = callbackData.slice(prefix.length)
            handler(ctx)
        }
    }
    ctx.answerCbQuery('Done')
}

async function handleText(ctx) {
    let username = ctx.from.username
    let text = ctx.message.text
    let people = (await SQL('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username) && text.trim()) {
        // get the current stage
        let draftStage = (await SQL('SELECT conversation FROM people WHERE username = ?', [username]))[0]
        let stage = draftStage.conversation
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
        } else if (stage == 'settings.caption_template.text') {
            handleSettingCaptionTemplate(ctx)
        } else if (stage == 'settings.sold_template.text') {
            handleSettingSoldTemplate(ctx)
        } else if (stage == 'settings.contact_text.text') {
            handleSettingContactText(ctx)
        } else {
            ctx.reply(FALLBACK_REPLY)
        }
    } else {
        ctx.reply(FALLBACK_REPLY)
    }
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
    handleSettings,
    handleDocument,
    handleAdminAdd,
}
