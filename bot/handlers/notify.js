/**
 * tries to delete messages on telegram and if it fails
 * tries to edit them with deleted text and if it fails
 * maybe means the message doesn't exist.
 * @param {object} ctx the context from telegraf
 * @param {string} chatId the chatId for the deleted message
 * @param {string | Number} messageId the message id of the message to delete
 * @param {string} failText the text to edit to on fail
 */
async function deleteMessage(ctx, chatId, messageId, failText='[deleted]') {
    // try to delete it and if failed, edit it to convey deletion
    let success
    try {
        await ctx.telegram.deleteMessage(chatId, messageId)
        success = true
    } catch (err) {
        success = false
        if (err.code == 400) {
            try {
                await ctx.telegram.editMessageCaption(chatId, messageId, undefined, failText)
            } catch (err) {
                console.log('edit error:', err.code, err.message)
            }
        } else {
            console.log('delete error:', err.code, err.message)
        }
    }
    return success
}

function makeKeyboard(permissions, buttons) {
    // make sure all are iterable
    buttons.edit = buttons.edit || []
    buttons.delete = buttons.delete || []
    if (permissions === 'all') {
        return {reply_markup: {
            inline_keyboard: [[...buttons.edit, ...buttons.delete]]
        }}
    }
    let keyboard = []
    if (buttons) {
        // buttons classification by permissions is for this
        if (permissions.edit_others) {
            keyboard.push(...buttons.edit)
        }
        if (permissions.delete_others) {
            keyboard.push(...buttons.delete)
        }
    }
    return keyboard.length ? {reply_markup: {inline_keyboard: [keyboard]}} : {}
}

/**
 * prepares the people to send messages to
 * @param {object} ctx: the context
 * @param {string} channel: the channel
 * @param {string | string[]} fullPerms: people with full permissions
 * @returns {Promise<Array<Object>>} others: the prepared
 */
async function preparePerms(ctx, channel, fullPerms) {
    let perms = await ctx.channels.getPermitted(channel)
    // change the permissions to full for some
    fullPerms = Array.isArray(fullPerms) ? fullPerms : [fullPerms]
    // include the channel admin with full permissions
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (!fullPerms.includes(channelAdmin)) fullPerms.push(channelAdmin)
    perms = [
        ...perms.filter(p => !fullPerms.includes(p.person)),
        ...fullPerms.map(p => {return {
            person: p, edit_others: true, delete_others: true
        }})
    ]
    return perms
}

/**
 * Sends notifs to the people with permissions
 * @param {Object} ctx the context
 * @param {string} channel the channel
 * @param {string} postId the post id
 * @param {Object[]} perms people with their permissions to send notifs to
 * @param {Object} buttons the buttons with permission classification
     * @param {Array<Object>} buttons.edit the buttons given to those with edit permissions
     * @param {Array<Object>} buttons.delete the buttons given to those with delete permissions
 * @param {string} imageId the image id in the message
 * @param {string} caption the caption in the message
 * @param {string | string[] | null} exclude the usernames of the people to exclude from notifying
 */
async function sendNotifs(ctx, channel, postId, perms, buttons, imageId, caption, exclude=null) {
    exclude = Array.isArray(exclude) ? exclude : [exclude]
    // the previously sent notifs by person
    let previous = (await ctx.posts.getNotif(channel, postId)).reduce((acc, curr) => {
        acc[curr.person] = curr.message_id
        return acc
    }, {})
    let notifs = []
    await Promise.all(perms.filter(p => !exclude.includes(p.person)).map(async perm => {
        let chatId = await ctx.people.get(perm.person, 'chat_id')
        if (chatId) {
            // delete the previous
            if (previous[perm.person]) deleteMessage(ctx, chatId, previous[perm.person])
            // and send a new one
            let message = await ctx.telegram.sendPhoto(chatId, imageId, {
                caption,
                parse_mode: 'html',
                ...makeKeyboard(perm, buttons)
            })
            notifs.push({
                person: perm.person,
                channel: channel,
                id: message.message_id,
                post_id: postId
            })
        }
    }))
    return notifs
}

function sendNotifSelf(ctx, caption, buttons, author, permissions) {
    let self = ctx.from.username
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let keyboard
    if (author === self) {
        keyboard = makeKeyboard('all', buttons)
    } else {
        keyboard = makeKeyboard(permissions, buttons)
    }
    ctx.telegram.editMessageCaption(chatId, messageId, undefined, caption, {
        parse_mode: 'html',
        disable_web_page_preview: true,
        ...keyboard
    })
    return messageId
}

async function notifyPost(ctx, channel, postId, data) { // send post notifications
    let author = ctx.from.username
    // to the author
    let newLink = '<a href="https://t.me/' + channel + '/' + postId + '">item</a>'
    let caption = '<i>You posted a new</i> ' + newLink + ' <i>on</i> @' + channel + '\n\n' + data.caption
    let messageId = sendNotifSelf(ctx, caption, data.buttons, author) // permissions not needed
    caption = '<i>There is a new post</i> ' + newLink + ' <i>by</i> @' + author + ' <i>on</i> @' + channel + '.\n\n' + data.caption
    // to the others
    let others = await preparePerms(ctx, channel, author)
    let notifs = await sendNotifs(ctx, channel, postId, others, data.buttons, data.image, caption, author)
    notifs.push({person: author, channel, id: messageId, post_id: postId})
    await ctx.posts.setNotif(notifs)
}


async function notifyEdit(ctx, channel, postId, data) {
    let editor = ctx.from.username
    let author = await ctx.posts.get({channel, message_id: postId}, 'author') // who first posted it
    let customers = JSON.parse(await ctx.posts.get({channel, message_id: postId}, 'interested'))
    let interestedText = customers.length ? '\n\nInterested customers are:\n' + customers.map(cust => '\u2022 <a href="tg://user?id=' + cust.id + '">' + cust.name + '</a>').join('\n') : ''
    let itemLink = '<a href="https://t.me/' + channel + '/' + postId + '">this item</a>'
    // edit the editor message
    let caption = '<i>You editted the caption of</i> ' + itemLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption + interestedText
    let perms = await preparePerms(ctx, channel, author)
    let selfPerms = perms.filter(p => p.person === editor)[0]
    let messageId = sendNotifSelf(ctx, caption, data.buttons, author, selfPerms)
    caption = '@' + editor + ' <i>editted the caption of</i> ' + itemLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption + interestedText
    let notifs = await sendNotifs(ctx, channel, postId, perms, data.buttons, data.image, caption, editor)
    notifs.push({person: editor, channel, id: messageId, post_id: postId})
    await ctx.posts.setNotif(notifs)
}

async function notifySold(ctx, channel, postId, data) {
    let editor = ctx.from.username
    let author = await ctx.posts.get({channel, message_id: postId}, 'author') // who first posted it
    let itemLink = '<a href="https://t.me/' + channel + '/' + postId + '">this item</a>'
    // edit the editor message
    let caption = '<i>You marked</i> ' + itemLink + ' <b>sold on</b> @' + channel + '.\n\n' + data.caption
    let perms = await preparePerms(ctx, channel, author)
    let selfPerms = perms.filter(p => p.person === editor)[0]
    let messageId = sendNotifSelf(ctx, caption, data.buttons, author, selfPerms)
    caption = '@' + editor + ' <i> marked </i> ' + itemLink + ' <i>sold on</i> @' + channel + '.\n\n' + data.caption
    let notifs = await sendNotifs(ctx, channel, postId, perms, data.buttons, data.image, caption, editor)
    notifs.push({person: editor, channel, id: messageId, post_id: postId})
    await ctx.posts.setNotif(notifs)

}

async function notifyRepost(ctx, channel, newId, data) {
    let editor = ctx.from.username
    let author = await ctx.posts.get({channel, message_id: newId}, 'author') // who first posted it
    let itemLink = '<a href="https://t.me/' + channel + '/' + newId + '">this item</a>'
    // edit the editor message
    let caption = '<i>You reposted</i> ' + itemLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption
    // to the others
    let perms = await preparePerms(ctx, channel, author)
    let selfPerms = perms.filter(p => p.person === editor)[0]
    let messageId = sendNotifSelf(ctx, caption, data.buttons, author, selfPerms)
    caption = '@' + editor + ' <i>reposted</i> ' + itemLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption
    let notifs = await sendNotifs(ctx, channel, newId, perms, data.buttons, data.image, caption, editor)
    notifs.push({person: editor, channel, id: messageId, post_id: newId})
    await ctx.posts.setNotif(notifs)
}

async function notifyDelete(ctx, channel, postId, data) {
    let editor = ctx.from.username
    let author = await ctx.posts.get({channel, message_id: postId}, 'author') // who first posted it
    // edit the editor message
    let caption = data.text + '\n<i>from</i> @' + channel + '\n\n' + data.caption
    let perms = await preparePerms(ctx, channel, author)
    let selfPerms = perms.filter(p => p.person === editor)[0]
    let messageId = sendNotifSelf(ctx, caption, data.buttons, author, selfPerms)
    caption = data.text + '\n<i>by</i> ' + '@' + editor + ' <i>from</i> @' + channel
    let notifs = await sendNotifs(ctx, channel, postId, perms, data.buttons, data.image, caption, editor)
    notifs.push({person: editor, channel, id: messageId, post_id: postId})
    await ctx.posts.setNotif(notifs)
}

async function notifyBuy(ctx, channel, postId, data) {
    // send messages to both parties.
    let itemLink = `<a href="https://t.me/${channel + '/' + postId}">this item</a>`
    let interestedText = '\n\nInterested customers are:\n' + data.customers.map(cust => '\u2022 <a href="tg://user?id=' + cust.id + '">' + cust.name + '</a>').join('\n')
    // to the customer
    let contactText = await ctx.channels.get(channel, 'contact_text')
    let caption = '<i>You have selected</i> ' + itemLink + ' <i>from</i> @' + channel + '. THE SELLER HAS BEEN NOTIFIED that you want to buy this item. You can contact them or they can contact you.\n\n' + data.caption + '\n\n' + contactText
    // to the customer
    ctx.replyWithPhoto(data.image, {
        caption,
        disable_web_page_preview: true,
        parse_mode: 'html',
        reply_markup: { inline_keyboard: [data.buttons.customer] }
    })
    // to stakeholders
    let author = await ctx.posts.get({channel, message_id: postId}, 'author') // who first posted it
    let perms = await preparePerms(ctx, channel, author)
    caption = '<i>You have a new customer for</i> ' + itemLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption + interestedText
    let notifs = await sendNotifs(ctx, channel, postId, perms, data.buttons, data.image, caption)
    await ctx.posts.setNotif(notifs)
}

module.exports = {
    notifyPost,
    notifyEdit,
    notifySold,
    notifyRepost,
    notifyDelete,
    notifyBuy,
    deleteMessage
}
