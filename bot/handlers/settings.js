const path = require('path')
const {downloadFile, makeKeyboardTiles, escapeHTML} = require('../utils')

async function handleSettings(ctx) {
    let username = ctx.from.username
    let hasValidChannels = await ctx.people.getChannels(username, ctx.update.message.date, 'setting')
    if (hasValidChannels) {
        ctx.reply('What do you want to change?', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Logo', callback_data: 'settings:logo' },],
                    [
                        { text: 'Caption template', callback_data: 'settings:caption_template' },
                        { text: 'Contact text', callback_data: 'settings:contact_text' }
                    ],
                    [
                        { text: 'Sold template', callback_data: 'settings:sold_template' },
                        { text: 'Description bullet', callback_data: 'settings:description_bullet' },
                    ],
                    [
                        { text: 'Description mode', callback_data: 'settings:description_mode' },
                        { text: 'Update permissions', callback_data: 'settings:channel_permissions' },
                    ]
                ]
            }
        })
    } else {
        ctx.reply('You have no channel with a valid license. Contact @' + ctx.state.admins[0] + ' for renewal.')
    }
}

const settingSpectficParams = {
    logo: {
        finalConvo: 'settings.logo.document',
        introText: 'Which channel\'s logo do you want to change?',
        finalText: (ctx, channel) => {
            return {text: 'You will be changing the logo for @' + channel + '. Send the logo as a file (recommended to preserve the transparency) or as a photo.'}
        }
    },
    caption_template: {
        finalConvo: 'settings.caption_template.text',
        introText: 'Which channel\'s caption template do you want to change?',
        finalText: async (ctx, channel) => {
            let currentTemplate = (await ctx.channels.get(channel, 'caption_template'))
                .replace(/:title\b/, '<b>:title</b>')
                .replace(/:description\b/, '<b>:description</b>')
                .replace(/:price\b/, '<b>:price</b>')
            let text = '<i>You will be changing the caption template for</i> @' + channel + ', <i>here is the current template, placeholders are </i> <b>:title</b> <i>(optional)</i>, <b>:description</b> <i>(required) and</i> <b>:price</b> <i>(optional). If you omit the optional ones, you won\'t be asked for them when you post.</i>\n\n' + currentTemplate
            return {text}
        }
    },
    sold_template: {
        finalConvo: 'settings.sold_template.text',
        introText: 'Which channel\'s sold template do you want to change?',
        finalText: async (ctx, channel) => {
            let currentTemplate = await ctx.channels.get(channel, 'sold_template')
            let text = '<i>You will be changing the template of the text shown when the item is sold from</i> @'
                       + channel
                       + ', <i>here is the current template, you can edit anything except</i> <b>:caption</b>. <i>It is a placeholder for the caption.</i>\n\n'
                       + currentTemplate.replace(/:caption\b/, '<b>:caption</b>')
            return {text}
        }
    },
    contact_text: {
        finalConvo: 'settings.contact_text.text',
        introText: 'Which channel\'s contact text do you want to change?',
        finalText: async (ctx, channel) => {
            let currentText = await ctx.channels.get(channel, 'contact_text')
            let text = '<i>You will be changing the text shown below the caption when a customer selects "Buy" from</i> @' + channel + ', <i>here is the current text. You can include additional info like phone numbers and so on.</i>\n\n' + currentText
            return {text}
        }
    },
    description_bullet: {
        finalConvo: 'settings.description_bullet.text',
        introText: 'Which channel\'s description bullet do you want to change?',
        finalText: async (ctx, channel) => {
            let currentBullet = await ctx.channels.get(channel, 'description_bullet')
            let text = '<i>You will be changing the bullet point characters in the description of the item you post on</i> @' + channel + ', <i>here is the current one. Send a new phrase that you want to appear when you begin lines with "." (dot) in the description.</i>\n\n' + currentBullet
            return {text}
        }
    },
    channel_permissions: {
        finalConvo: 'settings.channel_permissions',
        introText: 'Which channel do you want to update permissions of?',
        finalText: async (ctx, channel) => {
            let admins = await ctx.telegram.getChatAdministrators('@' + channel)
            await ctx.channels.updatePermissions(channel, admins, ctx.botInfo.username)
            return {text: 'The permissions for @' + channel + ' have been updated.'}
        }
    },
    description_mode: {
        finalConvo: 'settings.description_mode',
        introText: 'Which channel do you want to change the default description mode of?',
        finalText: async (ctx, channel) => {
            let isBullet = await ctx.channels.get(channel, 'description_is_bullet')
            let current = isBullet ? 'without' : 'with'
            let text = '<i>You will be changing whether new lines or lines that begin with</i> <b>.</b> <i>are treated as bullets on descriptions on</i> @' + channel + '. <i>Currently, lines</i> <b>' + current + '</b> <i>a</i> <b>.</b> <i>at the beginning are taken as bullet points.</i>'
            return {
                text,
                reply_markup: {
                    inline_keyboard: [[
                        {text: 'With .', callback_data: 'settings.dsc_mod:' + channel + ',false'},
                        {text: 'Without .', callback_data: 'settings.dsc_mod:' + channel + ',true'}
                    ]]
                }
            }
        }
    }
}

async function handleSettingIntro(ctx) {
    let username = ctx.from.username
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let [type, channel] = ctx.update.callback_query.data.split('.')
    let channels = await ctx.people.getChannels(username, ctx.update.callback_query.message.date, 'setting')
    if (channel) {
        handleSettingChannel(ctx)
        return
    }
    if (channels.length > 1) {
        let buttons = channels.map(ch => {return {text: '@' + ch, callback_data: 'settings:' + type + '.' + ch}})
        let keyboard = makeKeyboardTiles(buttons)
        let text = settingSpectficParams[type].introText
        ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
            reply_markup: {
                inline_keyboard: keyboard,
            }
        })
    } else if (channels.length === 1) { // auto select the first one and bypass the channel selection
        let channel = channels[0]
        let convo = settingSpectficParams[type].finalConvo
        ctx.people.set(username, {conversation: convo, to_update: channel})
        let text = await settingSpectficParams[type].finalText(ctx, channel)
        ctx.telegram.editMessageText(chatId, messageId, undefined, text.text, {parse_mode: 'html', reply_markup: text.reply_markup})
    }
}

async function handleSettingChannel(ctx) {
    let username = ctx.from.username
    let [type, channel] = ctx.update.callback_query.data.split('.')
    let convo = settingSpectficParams[type].finalConvo
    ctx.people.set(username, {conversation: convo, to_update: channel})
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let current = settingSpectficParams[type]
    let text = await current.finalText(ctx, channel)
    ctx.telegram.editMessageText(chatId, messageId, undefined, text.text, { parse_mode: 'html', reply_markup: text.reply_markup})
}

async function handleSettingTextContactText(ctx) {
    let username = ctx.from.username
    let text = escapeHTML(ctx.update.message.text)
    let channel = await ctx.people.get(username, 'to_update')
    ctx.channels.set(channel, {contact_text: text})
    ctx.people.set(username, {conversation: null})
    ctx.reply('@' + channel + "'s contact text has been updated. The new one will be shown the next time a user selects an item.")
}

async function handleSettingTextCaptionTempl(ctx) {
    let username = ctx.from.username
    let text = escapeHTML(ctx.update.message.text)
    if (/:description\b/.test(text)) {
        let channel = await ctx.people.get(username, 'to_update')
        ctx.channels.set(channel, {caption_template: text})
        ctx.people.set(username, {conversation: null})
        ctx.reply('@' + channel + "'s caption template has been updated. This change will take effect from the next post on.")
    } else {
        ctx.reply('You have to include at least :description, try again.')
    }
}

async function handleSettingTextSoldTempl(ctx) {
    let username = ctx.from.username
    let text = escapeHTML(ctx.update.message.text)
    if (/:caption\b/.test(text)) {
        let channel = await ctx.people.get(username, 'to_update')
        ctx.channels.set(channel, {sold_template: text})
        ctx.people.set(username, {conversation: null})
        ctx.reply('@' + channel + "'s sold template has been updated. This change will take effect the next time an item is marked sold.")
    } else {
        ctx.reply('You have to include ":caption", try again.')
    }
}

async function handleSettingTextDescBullet(ctx) {
    let username = ctx.from.username
    let text = escapeHTML(ctx.update.message.text)
    let channel = await ctx.people.get(username, 'to_update')
    ctx.channels.set(channel, {description_bullet: text})
    ctx.people.set(username, {conversation: null})
    ctx.reply('@' + channel + "'s description bullet has been updated. The new one will be shown the next time you post something.")
}

async function handleSettingDescriptionMode(ctx) {
    let username = ctx.from.username
    let data = ctx.update.callback_query.data
    let [channel, result] = data.split(',')
    let mode = result === 'true' ? true : false
    ctx.channels.set(channel, {description_is_bullet: mode})
    ctx.people.set(username, {conversation: null, to_update: null})
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let text = 'The default description mode for @' + channel + ' has changed.'
    ctx.telegram.editMessageText(chatId, messageId, undefined, text)
}

async function handleSettingLogoDoc(ctx) {
    let username = ctx.from.username
    let fileProps
    if (ctx.updateSubTypes.includes('document')) {
        let doc = ctx.update.message.document
        let [type] = doc.mime_type.split('/')
        if (type !== 'image') {
            ctx.reply('This is not an image. Please send an image file.')
            return
        }
        fileProps = await ctx.telegram.getFile(ctx.update.message.document.file_id)
    } else if (ctx.updateSubTypes.includes('photo')) {
        let photo = ctx.update.message.photo
        fileProps = await ctx.telegram.getFile(photo.slice(-1)[0].file_id)
    }
    try {
        let documentUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${fileProps.file_path}`
        let channel = await ctx.people.get(username, 'to_update')
        let filePath = path.join(ctx.logoDir, channel)
        await downloadFile(documentUrl, filePath)
        ctx.reply('Done, this change will take effect the next time you post an item on @' + channel + '.')
        ctx.people.set(username, {conversation: null})
    } catch(err) {
        if (err.code === 'ECONNREFUSED') {
            ctx.reply('Sorry, a connection problem occured. Send it again.')
        } else {
            throw err
        }
    }
}

module.exports = {
    handleSettings,
    handleSettingIntro,
    handleSettingChannel,
    handleSettingTextDescBullet,
    handleSettingTextSoldTempl,
    handleSettingTextCaptionTempl,
    handleSettingTextContactText,
    handleSettingLogoDoc,
    handleSettingDescriptionMode
}
