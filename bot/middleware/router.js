const start = require('../handlers/start')
const admin = require('../handlers/admin')
const post = require('../handlers/post')

// the callback data comes in like main_task:data and the keys are main_task
const callbackHandlers = {
    post,
    discard: post
    // 'details:': details, // buyer
    // 'sold:': sold,
    // 'repost:': repost,
    // 'edit:': ctx => {ctx.state.stage = null; edit(ctx)},
    // 'edit.after:': edit, // after some changs are made, save or discard
    // 'delete:': del,
    // 'settings:': settings,
}

async function router(ctx) {
    // THIS FUNCTION HANDLES EVERYTHING OTHER THAN THE TASK BEGINNER COMMANDS.
    // THEY SHOULD BE HANDLED DIRECTLY USING THE LIBRARY'S NATIVE METHODS BEFORE GETTING HERE


    let username = ctx.from.username
    // updateType: 'message',
    // updateSubTypes: [ 'text' ],
    let updateType = ctx.updateType
    let updateSubTypes = ctx.updateSubTypes

    // admin dependent
    let isAdmin = ctx.admins.includes(username)
    if (isAdmin) {
        if (updateType === 'message') {
            if (updateSubTypes.includes('text')) {
                let command = ctx.update.message.text.split(' ', 1)[0]
                if (command === '/adminadd') {
                    admin.handleAdminAdd(ctx)
                    return
                }
            }
        }
    }
    // not else because the admin can be a channel admin as well

    let isChannelAdmin = ctx.people.exists(username)
    if (isChannelAdmin) {
        // conversation independent
        if (updateType === 'callback_query') {
            let callbackData = ctx.update.callback_query.data
            for (let [prefix, handler] of Object.entries(callbackHandlers)) {
                if (callbackData.slice(0, prefix.length) === prefix) {
                    // // remove the prefix, and the colon
                    // ctx.update.callback_query.data = callbackData.slice(prefix.length + 1)
                    handler(ctx)
                    return
                }
            }
            ctx.answerCbQuery('Done')
        }

        let convo = await ctx.people.getConvo(username)
        if (convo === null) { // idle
            if (updateType === 'message') {
                if (updateType === 'text') {
                    let text = ctx.update.message.text
                    if (text[0] === '/') { // command
                        let command = text.split(' ', 1)[0]
                        // let additionalText = text.slice(command.length + 1).trim()
                        ctx.reply('The command ' + command + ' is not supported. Look at the /help.')
                    } else {
                        if (/hi|hello/.test(text.toLowerCase())) {
                            ctx.reply('Hi, maybe you need /help')
                        } else {
                            ctx.reply(ctx.fallbackReply)
                        }
                    }
                } else {
                    ctx.reply(ctx.fallbackReply)
                }
            } else {
                ctx.reply(ctx.fallbackReply)
            }
            return
        } else if (convo === 'post.channel') {
        } else if (convo === 'post.title') {
        } else if (convo === 'post.description') {
        } else if (convo === 'post.price') {
        } else if (convo === 'post.photo') {
        } else if (convo === 'post.ready') {
        } else if (convo === 'settings.logo.document') {
        } else if (convo === 'settings.caption_template.text') {
        } else if (convo === 'settings.sold_template.text') {
        } else if (convo === 'settings.contact_text.text') {
        } else if (convo === 'settings.description_bullet.text') {
        } else if (convo === null) {
        }
    } else {
    }
}

module.exports = router
