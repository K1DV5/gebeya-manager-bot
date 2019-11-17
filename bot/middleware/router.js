const start = require('../handlers/start')
const admin = require('../handlers/admin')
const post = require('../handlers/post')
const help = require('../handlers/help')
const license = require('../handlers/license')
const settings = require('../handlers/settings')
const cancel = require('../handlers/cancel')

// the callback data comes in like main_task:data and the keys are main_task
const callbackHandlers = {
    'post:': post.handlePostDraft,
    'post_channel:': post.handleChannelStage,
    'discard:': post.handleDiscardDraft,
    'details:': post.handleDetails, // buyer
    'sold:': post.handleSold,
    'repost:': post.handleRepost,
    'edit:': post.handleEditCaption,
    'edit_after:': post.handleEditSaveDiscard, // after some changs are made, save or discard
    'delete:': post.handleDeletePost,
    'settings:': settings.handleSettingIntro,
    'settings.dsc_mod:': settings.handleSettingDescriptionMode
}

const commandHandlers = {
    '/start': ctx => {
        // refresh the chat id, refresh is in the bot link at /adminadd
        let payload = ctx.state.payload
        if (payload && payload !== 'refresh') {
            start.handleStart(ctx)
        } else {
            start.handleWelcomeStart(ctx)
        }
    },
    '/post': post.handlePost,
    '/settings': settings.handleSettings,
    '/help': help.handleHelp,
    '/license': license.handleLicense,
    '/cancel': cancel.handleCancel
}

const convoHandlers = {
    'post.title': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            post.handleTitleStage(ctx)
        } else {
            ctx.reply('Please send a text for the title, or maybe you need /help.')
        }
    },

    'post.description': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            post.handleDescriptionStage(ctx)
        } else {
            ctx.reply('Please send a text for the description, or maybe you need /help.')
        }
    },

    'post.price': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            post.handlePriceStage(ctx)
        } else {
            ctx.reply('Please send a text for the price, or maybe you need /help.')
        }
    },

    'post.photo': async ctx => {
        if (ctx.updateSubTypes.includes('photo')) {
            await post.handlePhotoStagePhotos(ctx)
        } else if (ctx.updateSubTypes.includes('text') && ctx.message.text === '/end') {
            await post.handlePhotoStageEnd(ctx)
        } else {
            ctx.reply('Please send some photos for the post and finally send /end, or maybe look at the /help.')
        }
    },

    'edit.title': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            post.handleEditTitle(ctx)
        } else {
            ctx.reply('Please send a text for the title, or maybe you need /help.')
        }
    },

    'edit.description': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            post.handleEditDescription(ctx)
        } else {
            ctx.reply('Please send a text for the description, or maybe you need /help.')
        }
    },

    'edit.price': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            post.handleEditPrice(ctx)
        } else {
            ctx.reply('Please send a text for the price, or maybe you need /help.')
        }
    },

    'settings.logo.document': ctx => {
        if (ctx.updateSubTypes.includes('document') || ctx.updateSubTypes.includes('photo')) {
            settings.handleSettingLogoDoc(ctx)
        } else {
            ctx.reply('Please send an image FILE for the logo')
        }
    },

    'settings.caption_template.text': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            settings.handleSettingTextCaptionTempl(ctx)
        } else {
            ctx.reply('Please send a text for the caption template, or maybe you need /help.')
        }
    },

    'settings.sold_template.text': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            settings.handleSettingTextSoldTempl(ctx)
        } else {
            ctx.reply('Please send a text for the sold template, or maybe you need /help.')
        }
    },

    'settings.contact_text.text': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            settings.handleSettingTextContactText(ctx)
        } else {
            ctx.reply('Please send a text for the contact text, or maybe you need /help.')
        }
    },

    'settings.description_bullet.text': ctx => {
        if (ctx.updateSubTypes.includes('text')) {
            settings.handleSettingTextDescBullet(ctx)
        } else {
            ctx.reply('Please send a text for the description bullet, or maybe you need /help.')
        }
    }
}

function splitCommand(text) {
    // split command and payload
    text = text.trim()
    if (text.includes(' ')) {
        let command =text.split(' ', 1)[0]
        let payload = text.slice(text.indexOf(' ') + 1)
        return {command, payload}
    }
    return {command: text}
}

async function customerRoute(ctx) {
    if (ctx.updateSubTypes.includes('text')) {
        let text = ctx.message.text
        if (text[0] === '/') { // a command
            let {command, payload} = splitCommand(text)
            ctx.state.payload = payload
            if (command === '/start') {
                commandHandlers['/start'](ctx)
            } else {
                ctx.reply('You are not an admin of any channel here, you can\'t use that.')
            }
        } else if (/hi|hello/.test(text.toLowerCase())) {
            ctx.reply('Hi, maybe you need /help')
        } else {
            ctx.reply(ctx.fallbackReply)
        }
    } else {
        ctx.reply(ctx.fallbackReply)
    }
}

async function adminRoute(ctx) {
    let updateType = ctx.updateType
    let updateSubTypes = ctx.updateSubTypes
    if (updateType === 'message') {
        if (updateSubTypes.includes('text')) {
            let {command} = splitCommand(ctx.message.text)
            if (command[0] === '/') {
                if (command === '/adminadd') {
                    await admin.handleAdminAdd(ctx)
                } else if (command === '/try') {
                    ctx.reply('Olla!')
                } else {
                    ctx.reply('No command like that')
                }
                return true
            }
        }
    }
}

async function callbackRoute(ctx) {
    let callbackData = ctx.update.callback_query.data
    let prefix = callbackData.split(':', 1)[0] + ':'
    let handler = callbackHandlers[prefix]
    if (handler) {
        // remove the prefix, and the colon
        ctx.update.callback_query.data = callbackData.slice(prefix.length)
        await handler(ctx)
        ctx.answerCbQuery('Done')
    }
}

async function router(ctx) {
    // some updates aren't from a person, like channel post editted...
    if (!ctx.from) return 1

    let username = ctx.from.username
    ctx.state.isChannelAdmin = await ctx.people.exists(username)
    if (ctx.state.isChannelAdmin) {
        // conversation independent ----------------------------------------------
        if (ctx.updateType === 'callback_query') {
            await callbackRoute(ctx)
            return 1
        } else if (ctx.updateSubTypes.includes('text')) {
            let text = ctx.message.text
            let {command, payload} = splitCommand(text)
            if (Object.keys(commandHandlers).includes(command)) { // commands that work anywhere
                ctx.state.payload = payload
                let handler = commandHandlers[command]
                await handler(ctx)
                return 1
            }
        }
        // conversation dependent ------------------------------------------------
        let convo = await ctx.people.getConvo(username)
        if (convo && Object.keys(convoHandlers).includes(convo)) {
            let handler = convoHandlers[convo]
            await handler(ctx)
            return 1
        } else if (ctx.updateSubTypes.includes('text')) {
            let text = ctx.message.text
            if (/hi|hello/.test(text.toLowerCase())) {
                ctx.reply('Hi, maybe you need /help')
                return 1
            }
        }
    }
    // if it gets here, check if they are admin --------------------------------------
    if (ctx.admins.includes(username)) { // admin
        let handled = await adminRoute(ctx)
        if (handled) {
            return 1
        }
    }

    // the customer
    await customerRoute(ctx)
    return 1
}

module.exports = router
