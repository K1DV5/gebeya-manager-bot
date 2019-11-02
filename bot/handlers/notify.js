async function deleteMessage(ctx, chatId, messageId) {
    // try to delete it and if failed, edit it to convey deletion
    let success
    try {
        await ctx.telegram.deleteMessage(chatId, messageId)
        success = true
    } catch (err) {
        success = false
        if (err.code == 400) {
            try {
                await ctx.telegram.editMessageCaption(chatId, messageId, undefined, '[deleted]')
            } catch (err) {
                if (err.code == 400) {
                    await ctx.telegram.editMessageCaption(chatId, messageId, undefined, '[deleted]')
                } else {
                    console.log('edit error:', err.code, err.message)
                }
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
    keyboard = keyboard.length ? {reply_markup: {inline_keyboard: [keyboard]}} : {}
    return keyboard
}

async function sendToMany(ctx, permissions, buttons, imageId, caption) {
    // permissions: [{username, edit_others, delete_others}, ...]
    let messageIds = {}
    await Promise.all(permissions.map(async perm => {
        let chatId = await ctx.people.get(perm.person, 'chat_id')
        if (chatId) {
            let message = await ctx.telegram.sendPhoto(chatId, imageId, {
                caption,
                parse_mode: 'html',
                ...makeKeyboard(perm, buttons)
            })
            messageIds[perm.person] = message.message_id
        }
    }))
    return messageIds
}

async function clearPrevious(ctx, channel, postId, excludeId) {
    let previous = await ctx.posts.getNotif(channel, postId)
    for (let prev of previous.filter(p => p.message_id != excludeId)) {
        let chatId = await ctx.people.get(prev.person, 'chat_id')
        // delete the previous one
        await deleteMessage(ctx, chatId, prev.message_id)
    }
}

async function notifyPost(ctx, channel, postId, data) { // send post notifications
    let author = ctx.from.username
    // to the author
    let addr = channel + '/' + postId
    let newLink = '<a href="https://t.me/' + addr + '">here</a>'
    let caption = '<i>Done, you can find your new post </i>' + newLink + '<i>, and it looks like this.</i>\n\n' + data.caption
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    ctx.telegram.editMessageCaption(chatId, messageId, undefined, caption, {
        parse_mode: 'html',
        disable_web_page_preview: true,
        ...makeKeyboard('all', data.buttons)
    })
    // to the others
    let others = await ctx.channels.getPermitted(channel)
    others = others.filter(person => person.person !== author) // make sure the author is not included
    // if author is not admin, notify them as well
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (channelAdmin !== author) others.push({person: channelAdmin, edit_others: true, delete_others: true})
    caption = '<i>There is a new post</i> ' + newLink + ' <i>by</i> @' + author + ' <i>on</i> @' + channel + '.\n\n' + data.caption
    let messageIds = await sendToMany(ctx, others, data.buttons, data.image, caption)
    let notifs = others
        .filter(o => messageIds[o.person])
        .map(o => {return {person: o.person, channel, id: messageIds[o.person], post_id: postId}})
    notifs.push({person: author, channel, id: message.message_id, post_id: postId})
    await ctx.posts.setNotif(notifs)
}


async function notifyEdit(ctx, channel, postId, data) {
    let editor = ctx.from.username
    let author = await ctx.posts.get({channel, message_id: postId}, 'author') // who first posted it
    let permitted = await ctx.channels.getPermitted(channel)
    let addr = channel + '/' + postId
    let customers = JSON.parse(await ctx.posts.get({channel, message_id: postId}, 'interested'))
    let interestedText = customers.length ? '\n\nInterested customers are:\n' + customers.map(cust => '\u2022 <a href="tg://user?id=' + cust.id + '">' + cust.name + '</a>').join('\n') : ''
    let itemLink = '<a href="https://t.me/' + addr + '">this item</a>'
    // edit the editor message
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let caption = '<i>You editted the caption of</i> ' + itemLink + '.\n\n' + data.caption + interestedText
    let keyboard
    if (author === editor) {
        keyboard = makeKeyboard('all', data.buttons)
    } else {
        let permissions = permitted.filter(p => p.person === editor)[0]
        keyboard = makeKeyboard(permissions, data.buttons)
    }
    ctx.telegram.editMessageCaption(chatId, messageId, undefined, caption, {
        parse_mode: 'html',
        disable_web_page_preview: true,
        ...keyboard
    })
    // to the others
    let others = permitted.filter(person => ![editor, author].includes(person.person)) // make sure the editor and author are not included
    if (editor !== author) others.push({person: author, edit_others: true, delete_others: true})
    // if editor is not admin, notify them as well
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (channelAdmin !== editor) others.push({person: channelAdmin, edit_others: true, delete_others: true})
    // clear the previous notifs of the others
    await clearPrevious(ctx, channel, postId, messageId)
    caption = '@' + editor + ' <i>editted the caption of</i> ' + itemLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption + interestedText
    let messageIds = await sendToMany(ctx, others, data.buttons, data.image, caption)
    let notifs = others
        .filter(o => messageIds[o.person])
        .map(o => {return {person: o.person, channel, id: messageIds[o.person], post_id: postId}})
    notifs.push({person: editor, channel, id: messageId, post_id: postId})
    await ctx.posts.setNotif(notifs)
}

async function notifySold(ctx, channel, postId, data) {
    let editor = ctx.from.username
    let author = await ctx.posts.get({channel, message_id: postId}, 'author') // who first posted it
    let permitted = await ctx.channels.getPermitted(channel)
    let addr = channel + '/' + postId
    let itemLink = '<a href="https://t.me/' + addr + '">this item</a>'
    // edit the editor message
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let caption = '<i>You marked</i> ' + itemLink + ' <b>sold</b>.\n\n' + data.caption
    let keyboard
    if (author === editor) {
        keyboard = makeKeyboard('all', data.buttons)
    } else {
        let permissions = permitted.filter(p => p.person === editor)[0]
        keyboard = makeKeyboard(permissions, data.buttons)
    }
    ctx.telegram.editMessageCaption(chatId, messageId, undefined, caption, {
        parse_mode: 'html',
        disable_web_page_preview: true,
        ...keyboard
    })
    // to the others
    let others = permitted.filter(person => ![editor, author].includes(person.person)) // make sure the editor and author are not included
    if (editor !== author) others.push({person: author, edit_others: true, delete_others: true})
    // if editor is not admin, notify them as well
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (channelAdmin !== editor) others.push({person: channelAdmin, edit_others: true, delete_others: true})
    let previous = await ctx.posts.getNotif(channel, postId)
    await clearPrevious(ctx, channel, postId, messageId)
    caption = '@' + editor + ' <i> marked </i> ' + itemLink + ' <i>sold on</i> @' + channel + '.\n\n' + data.caption
    let messageIds = await sendToMany(ctx, others, data.buttons, data.image, caption)
    let notifs = others
        .filter(o => messageIds[o.person])
        .map(o => {return {person: o.person, channel, id: messageIds[o.person], post_id: postId}})
    notifs.push({person: editor, channel, id: messageId, post_id: postId})
    await ctx.posts.setNotif(notifs)

}

async function notifyRepost(ctx, channel, oldId, newId, data) {
    let editor = ctx.from.username
    let author = await ctx.posts.get({channel, message_id: oldId}, 'author') // who first posted it
    let permitted = await ctx.channels.getPermitted(channel)
    let addr = channel + '/' + newId
    let itemLink = '<a href="https://t.me/' + addr + '">this item</a>'
    // edit the editor message
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let caption = '<i>You reposted</i> ' + itemLink + '.\n\n' + data.caption
    let keyboard
    if (author === editor) {
        keyboard = makeKeyboard('all', data.buttons)
    } else {
        let permissions = permitted.filter(p => p.person === editor)[0]
        keyboard = makeKeyboard(permissions, data.buttons)
    }
    ctx.telegram.editMessageCaption(chatId, messageId, undefined, caption, {
        parse_mode: 'html',
        disable_web_page_preview: true,
        ...keyboard
    })
    // to the others
    let others = permitted.filter(person => ![editor, author].includes(person.person)) // make sure the editor and author are not included
    if (editor !== author) others.push({person: author, edit_others: true, delete_others: true})
    // if editor is not admin, notify them as well
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (channelAdmin !== editor) others.push({person: channelAdmin, edit_others: true, delete_others: true})
    await clearPrevious(ctx, channel, oldId, messageId)
    caption = '@' + editor + ' <i>reposted</i> ' + itemLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption
    let messageIds = await sendToMany(ctx, others, data.buttons, data.image, caption)
    let notifs = others
        .filter(o => messageIds[o.person])
        .map(o => {return {person: o.person, channel, id: messageIds[o.person], post_id: newId}})
    notifs.push({person: editor, channel, id: messageId, post_id: newId})
    await ctx.posts.setNotif(notifs)
}

async function notifyDelete(ctx, channel, postId, data) {
    let editor = ctx.from.username
    let permitted = await ctx.channels.getPermitted(channel)
    let addr = channel + '/' + postId
    // edit the editor message
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let caption = data.text + '\n\n' + data.caption
    let keyboard
    if (data.author === editor) {
        keyboard = makeKeyboard('all', data.buttons)
    } else {
        let permissions = permitted.filter(p => p.person === editor)[0]
        keyboard = makeKeyboard(permissions, data.buttons)
    }
    ctx.telegram.editMessageCaption(chatId, messageId, undefined, caption, {
        parse_mode: 'html',
        disable_web_page_preview: true,
        ...keyboard
    })
    // to the others
    let others = permitted.filter(person => person.person !== editor) // make sure the editor is not included
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (channelAdmin !== editor) others.push({person: channelAdmin, edit_others: true, delete_others: true})
    await clearPrevious(ctx, channel, postId, messageId)
    caption = data.text + '\n<i>by</i> ' + '@' + editor + ' <i>from</i> @' + channel
    let messageIds = await sendToMany(ctx, others, data.buttons, data.image, caption)
    let notifs = others
        .filter(o => messageIds[o.person])
        .map(o => {return {person: o.person, channel, id: messageIds[o.person], post_id: postId}})
    notifs.push({person: editor, channel, id: messageId, post_id: postId})
    await ctx.posts.setNotif(notifs)
}

async function notifyBuy(ctx, channel, postId, data) {
    // send messages to both parties.
    let itemLink = `<a href="https://t.me/${channel + '/' + postId}">this item</a>`
    let interestedText = '\n\nInterested customers are:\n' + data.customers.map(cust => '\u2022 <a href="tg://user?id=' + cust.id + '">' + cust.name + '</a>').join('\n')
    // to the customer
    let contactText = await ctx.channels.get(channel, 'contact_text')
    let caption = '<i>You have selected</i> ' + itemLink + ' <i>from</i> @' + channel + '.\n\n' + data.caption + '\n\n' + contactText
    // to the customer
    ctx.replyWithPhoto(data.image, {
        caption,
        disable_web_page_preview: true,
        parse_mode: 'html',
        reply_markup: { inline_keyboard: [data.buttons.customer] }
    })
    // to stakeholders
    let permitted = await ctx.channels.getPermitted(channel)
    let others = permitted.filter(person => person.person !== data.author) // make sure the editor and author are not included
    others.push({person: data.author, edit_others: true, delete_others: true})
    // if editor is not admin, notify them as well
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (channelAdmin !== data.author) others.push({person: channelAdmin, edit_others: true, delete_others: true})
    clearPrevious(ctx, channel, postId) // no exclude
    caption = '<i>You have a new customer for</i> ' + itemLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption + interestedText
    let messageIds = await sendToMany(ctx, others, data.buttons, data.image, caption)
    let notifs = others
        .filter(o => messageIds[o.person])
        .map(o => {return {person: o.person, channel, id: messageIds[o.person], post_id: postId}})
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
