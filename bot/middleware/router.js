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
}

const innerCommands = ['/end', '/cancel']

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

async function router(ctx) {
    if (!ctx.from) { // some updates aren't from a person, like channel post editted...
        return 1
    }
    let username = ctx.from.username

    // updateType: 'message',
    // updateSubTypes: [ 'text' ],
    let updateType = ctx.updateType
    let updateSubTypes = ctx.updateSubTypes

    // admin dependent --------------------------------------------------------
    let isAdmin = ctx.admins.includes(username)
    if (isAdmin) {
        if (updateType === 'message') {
            if (updateSubTypes.includes('text')) {
                let {command} = splitCommand(ctx.message.text)
                if (command === '/adminadd') {
                    await admin.handleAdminAdd(ctx)
                    return 1
                } else if (command === '/try') {
                    ctx.reply('Olla!')
                    return 1
                }
            }
        }
    }
    // not else because the admin can be a channel admin as well

    ctx.state.isChannelAdmin = await ctx.people.exists(username)
    if (ctx.state.isChannelAdmin) {
        // conversation independent ----------------------------------------------
        if (updateType === 'callback_query') {
            let callbackData = ctx.update.callback_query.data
            for (let [prefix, handler] of Object.entries(callbackHandlers)) {
                if (callbackData.slice(0, prefix.length) === prefix) {
                    // // remove the prefix, and the colon
                    ctx.update.callback_query.data = callbackData.slice(prefix.length)
                    handler(ctx)
                    ctx.answerCbQuery('Done')
                    return
                }
            }
        } else if (updateSubTypes.includes('text')) { // commands that work anywhere
            let text = ctx.message.text
            if (text[0] === '/') { // command
                let {command, payload} = splitCommand(text)
                ctx.state.payload = payload
                if (command === '/start') {
                    if (payload) {
                        await start.handleStart(ctx)
                    } else {
                        await start.handleWelcomeStart(ctx)
                    }
                    return
                } else if (command === '/post') {
                    await post.handlePost(ctx)
                    return
                } else if (command === '/settings') {
                    await settings.handleSettings(ctx)
                    return
                } else if (command === '/help') {
                    help.handleHelp(ctx)
                    return
                } else if (command === '/license') {
                    await license.handleLicense(ctx)
                    return
                } else if (command === '/cancel') {
                    await cancel.handleCancel(ctx)
                    return
                } else if (!innerCommands.includes(command)) {
                    ctx.reply('The command ' + command + ' is not supported. Look at the /help.')
                    return
                }
            }
        }

        // conversation dependent ------------------------------------------------
        let convo = await ctx.people.getConvo(username)
        if (convo === null) { // idle
            if (updateSubTypes.includes('text')) {
                let text = ctx.message.text
                if (/hi|hello/.test(text.toLowerCase())) {
                    ctx.reply('Hi, maybe you need /help')
                } else {
                    ctx.reply(ctx.fallbackReply)
                }
            } else {
                ctx.reply(ctx.fallbackReply)
            }
            return
        } else if (convo === 'post.title') {
            if (updateSubTypes.includes('text')) {
                post.handleTitleStage(ctx)
                return
            } else {
                ctx.reply('Please send a text for the title, or maybe you need /help.')
            }
        } else if (convo === 'post.description') {
            if (updateSubTypes.includes('text')) {
                post.handleDescriptionStage(ctx)
                return
            } else {
                ctx.reply('Please send a text for the description, or maybe you need /help.')
            }
        } else if (convo === 'post.price') {
            if (updateSubTypes.includes('text')) {
                post.handlePriceStage(ctx)
                return
            } else {
                ctx.reply('Please send a text for the price, or maybe you need /help.')
            }
        } else if (convo === 'post.photo') {
            if (updateSubTypes.includes('photo')) {
                await post.handlePhotoStagePhotos(ctx)
                return
            } else if (updateSubTypes.includes('text') && ctx.message.text === '/end') {
                await post.handlePhotoStageEnd(ctx)
            } else {
                ctx.reply('Please send some photos for the post and finally send /end, or maybe look at the /help.')
            }
        } else if (convo === 'edit.title') {
            if (updateSubTypes.includes('text')) {
                await post.handleEditTitle(ctx)
                return
            } else {
                ctx.reply('Please send a text for the title, or maybe you need /help.')
            }
        } else if (convo === 'edit.description') {
            if (updateSubTypes.includes('text')) {
                await post.handleEditDescription(ctx)
                return
            } else {
                ctx.reply('Please send a text for the description, or maybe you need /help.')
            }
        } else if (convo === 'edit.price') {
            if (updateSubTypes.includes('text')) {
                await post.handleEditPrice(ctx)
                return
            } else {
                ctx.reply('Please send a text for the price, or maybe you need /help.')
            }
        } else if (convo === 'settings.logo.document') {
            if (updateSubTypes.includes('document')) {
                await settings.handleSettingLogoDoc(ctx)
            } else {
                ctx.reply('Please send an image FILE for the logo')
            }
            return
        } else if (convo === 'settings.caption_template.text') {
            if (updateSubTypes.includes('text')) {
                await settings.handleSettingTextCaptionTempl(ctx)
            } else {
                ctx.reply('Please send a text for the caption template, or maybe you need /help.')
            }
            return
        } else if (convo === 'settings.sold_template.text') {
            if (updateSubTypes.includes('text')) {
                await settings.handleSettingTextSoldTempl(ctx)
            } else {
                ctx.reply('Please send a text for the sold template, or maybe you need /help.')
            }
            return
        } else if (convo === 'settings.contact_text.text') {
            if (updateSubTypes.includes('text')) {
                await settings.handleSettingTextContactText(ctx)
            } else {
                ctx.reply('Please send a text for the contact text, or maybe you need /help.')
            }
            return
        } else if (convo === 'settings.description_bullet.text') {
            if (updateSubTypes.includes('text')) {
                await settings.handleSettingTextDescBullet(ctx)
            } else {
                ctx.reply('Please send a text for the description bullet, or maybe you need /help.')
            }
            return
        } else {
        }
    } else {
        if (updateSubTypes.includes('text')) {
            let text = ctx.message.text
            if (text[0] === '/') { // a command
                let {command, payload} = splitCommand(text)
                ctx.state.payload = payload
                if (command === '/start') {
                    if (payload) {
                        await handleStart(ctx)
                    } else {
                        await handleWelcomeStart(ctx)
                    }
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

    return 1
}

module.exports = router
