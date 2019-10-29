function makeKeyboard(permissions, buttons) {
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

async function sendToMany(ctx, persons, buttons, imageId, caption) {
    // persons: [{username, edit_others, delete_others}, ...]
    let notifs = []
    await Promise.all(persons.map(async person => {
        let chatId = await ctx.people.get(person.person, 'chat_id')
        if (chatId) {
            let message = await ctx.telegram.sendPhoto(chatId, imageId, {
                caption,
                ...makeKeyboard(person, buttons)
            })
            notifs.push({ person: person.person, channel, id: message.message_id, post_id: postId })
        }
    }))
    return notifs
}

async function clearPrevious(ctx, channel, postId, excludeId) {
    let previous = await ctx.posts.getNotif(channel, postId)
    for (let prev of previous.filter(p => p.message_id != excludeId)) {
        try { // delete the previous one
            let old = prev.message_id
            ctx.telegram.deleteMessage(chatId, old)
        } catch (err) {
            console.log(err.code, err.message, err.description)
        }
    }
}

async function notifyPost(ctx, channel, postId, data) { // send post notifications
    let author = ctx.from.username
    // to the author
    let addr = channel + '/' + postId
    let newLink = '<a href="https://t.me/' + addr + '">here</a>'
    let caption = '<i>Done, you can find your new post </i>' + newLink + '<i>, and it looks like this.</i>\n\n' + data.caption
    let message = await ctx.replyWithPhoto(data.image, {caption,
        parse_mode: 'html', reply_markup: {
            inline_keyboard: [[data.buttons.edit, data.buttons.sold, data.buttons.delete]]
        }
    })
    // to the others
    let others = await ctx.channels.getPermitted(channel)
    others = others.filter(person => person.person !== author) // make sure the author is not included
    // if author is not admin, notify them as well
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (channelAdmin !== author) others.push({person: channelAdmin, edit_others: true, delete_others: true})
    let caption = '<i>There is a new post</i> ' + newLink + ' <i>by</i> @' + author + ' <i>on</i> @' + channel + '.\n\n' + data.caption
    let notifs = await sendToMany(ctx, others, data.buttons, data.image, caption)
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
    let caption = '@' + editor + ' <i>editted the caption of</i> ' + newLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption + interestedText
    let notifs = await sendToMany(ctx, others, data.buttons, data.image, caption)
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
    let caption = '<i>You marked</i> ' + itemLink + ' <b>sold</b>.\n\n<s>' + data.caption + '</s>
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
    let caption = '@' + editor + ' <i> marked </i> ' + newLink + ' <i>sold on</i> @' + channel + '.\n\n<s>' + data.caption + '</s>',
    let notifs = await sendToMany(ctx, others, data.buttons, data.image, caption)
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
    await clearPrevious(ctx, channel, postId, messageId)
    let caption = '@' + editor + ' <i>reposted</i> ' + newLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption
    let notifs = await sendToMany(ctx, others, data.buttons, data.image, caption)
    notifs.push({person: editor, channel, id: messageId, post_id: newId})
    await ctx.posts.setNotif(notifs)
}

async function notifyDelete(ctx, channel, postId) {
    let editor = ctx.from.username
    let permitted = await ctx.channels.getPermitted(channel)
    let addr = channel + '/' + postId
    let itemLink = '<a href="https://t.me/' + addr + '">this item</a>'
    // edit the editor message
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let postCaption = await ctx.posts.get({channel, message_id: postId}, 'caption')
    let caption = '<i>You deleted</i> ' + itemLink + '.\n\n<s>' + postCaption + '</s>'
    ctx.telegram.editMessageCaption(chatId, messageId, undefined, caption, {
        parse_mode: 'html',
        disable_web_page_preview: true,
    })
    // to the others
    let others = permitted.filter(person => person.person !== editor) // make sure the editor is not included
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (channelAdmin !== editor) others.push({person: channelAdmin, edit_others: true, delete_others: true})
    await clearPrevious(ctx, channel, postId, messageId)
    let caption = '@' + editor + ' <i>deleted</i> ' + itemLink + ' <i>from</i> @' + channel + '.\n\n<s>' + data.caption + '</s>'
    let notifs = await sendToMany(ctx, others, undefined, data.image, caption)
    notifs.push({person: editor, channel, id: messageId, post_id: postId})
    await ctx.posts.setNotif(notifs)
}

async function notifyBuy(ctx, channel, postId, data) {
    // send messages to both parties.
    let itemLink = `<a href="https://t.me/${channel + '/' + postId}">this item</a>`
    let postData = await ctx.posts.get({channel, message_id: postId}, ['caption', 'image_ids', 'author'])
    let collage = JSON.parse(postData.image_ids).collage
    let authorChat = await ctx.people.get(postData.author, 'chat_id')

    data.customers.push({name: data.customer.name + ' (NEW!)', id: data.customer.id})
    let interestedText = '\n\nInterested customers are:\n' + data.customers.map(cust => '\u2022 <a href="tg://user?id=' + cust.id + '">' + cust.name + '</a>').join('\n')
    // to the customer
    let contactText = await ctx.channels.get(channel, 'contact_text')
    let caption = '<i>You have selected</i> ' + itemLink + ' <i>from</i> @' + channel + '.\n\n' + postData.caption + '\n\n' + contactText
    // to the customer
    ctx.replyWithPhoto(data.image, {
        data.caption,
        disable_web_page_preview: true,
        parse_mode: 'html',
        reply_markup: { inline_keyboard: [data.buttons.customer] }
    })
    // to stakeholders
    let others = permitted.filter(person => person.person !== postData.author) // make sure the editor and author are not included
    others.push({person: postData.author, edit_others: true, delete_others: true})
    // if editor is not admin, notify them as well
    let channelAdmin = await ctx.channels.get(channel, 'admin')
    if (channelAdmin !== postData.author) others.push({person: channelAdmin, edit_others: true, delete_others: true})
    await clearPrevious(ctx, channel, postId) // no exclude
    let caption = '<i>You have a new customer for</i> ' + newLink + ' <i>on</i> @' + channel + '.\n\n' + data.caption + interestedText
    let notifs = await sendToMany(ctx, others, data.buttons, data.image, caption)
    await ctx.posts.setNotif(notifs)
}

module.exports = {
    notifyPost,
    notifyEdit,
    notifySold,
    notifyRepost,
    notifyDelete,
    notifyBuy
}
