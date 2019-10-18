const path = require('path')
const {downloadFile} = require('../utils')

async function handleSettings(ctx) {
    let username = ctx.from.username
    let hasValidChannels = await ctx.people.getChannels(username, ctx.update.message.date)
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
        finalText: (ctx, channel) => 'You will be changing the logo for @' + channel + ', send the logo AS A FILE because Telegam will remove the transparency if you send it as a photo.'
    },
    caption_template: {
        finalConvo: 'settings.caption_template.text',
        introText: 'Which channel\'s caption template do you want to change?',
        finalText: async (ctx, channel) => {
            let currentTemplate = (await ctx.channels.get(channel, 'caption_template'))
                .replace(/:title\b/, '<b>:title</b>')
                .replace(/:description\b/, '<b>:description</b>')
                .replace(/:price\b/, '<b>:price</b>')
            let text = '<i>You will be changing the caption template for</i> @' + channel + ', <i>here is the current template, you can edit anything except</i> <b>:title</b>, <b>:description</b> <i>and</i> <b>:price</b>. <i>Those are placeholders for the posts.</i>\n\n' + currentTemplate
            return text
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
            return text
        }
    },
    contact_text: {
        finalConvo: 'settings.contact_text.text',
        introText: 'Which channel\'s contact text do you want to change?',
        finalText: async (ctx, channel) => {
            let currentText = await ctx.channels.get(channel, 'contact_text')
            let text = '<i>You will be changing the text shown below the caption when a customer selects "Buy" from</i> @' + channel + ', <i>here is the current text. You can include additional info like phone numbers and so on.</i>\n\n' + currentText
            return text
        }
    },
    description_bullet: {
        finalConvo: 'settings.description_bullet.text',
        introText: 'Which channel\'s description bullet do you want to change?',
        finalText: async (ctx, channel) => {
            let currentBullet = await ctx.channels.get(channel, 'description_bullet')
            let text = '<i>You will be changing the bullet point characters in the description of the item you post on</i> @' + channel + ', <i>here is the current one. Send a new phrase that you want to appear when you begin lines with "." (dot) in the description.</i>\n\n' + currentBullet
            return text
        }
    }
}

async function handleSettingIntro(ctx) {
    let username = ctx.from.username
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let type = ctx.update.callback_query.data
    let channels = await ctx.people.getChannels(username, ctx.update.callback_query.message.date)
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
        ctx.telegram.editMessageText(chatId, messageId, undefined, text, {parse_mode: 'html'})
    }
}

async function handleSettingChannel(ctx) {
    let username = ctx.from.username
    let [type, channel] = ctx.update.callback_query.data.split('.')
    let convo = settingSpectficParams[type].finalConvo
    ctx.people.set(username, {conversation: convo, to_update: channel})
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let text = await settingSpectficParams[type].finalText(ctx, channel)
    ctx.telegram.editMessageText(chatId, messageId, undefined, text, {parse_mode: 'html'})
}

async function handleSettingTextContactText(ctx) {
    let username = ctx.from.username
    let text = ctx.update.message.text
    let channel = await ctx.people.get(username, 'to_update')
    ctx.channels.set(channel, {contact_text: text})
    ctx.people.set(username, {conversation: null})
    ctx.reply('@' + channel + "'s contact text has been updated. The new one will be shown the next time a user selects an item.")
}

async function handleSettingTextCaptionTempl(ctx) {
    let username = ctx.from.username
    let text = ctx.update.message.text
    if (/:title\b/.test(text) && /:description\b/.test(text) && /:price/.test(text)) {
        let channel = await ctx.people.get(username, 'to_update')
        ctx.channels.set(channel, {caption_template: text})
        ctx.people.set(username, {conversation: null})
        ctx.reply('@' + channel + "'s caption template has been updated. This change will take effect from the next post on.")
    } else {
        ctx.reply('You have to include the above three elements, try again.')
    }
}

async function handleSettingTextSoldTempl(ctx) {
    let username = ctx.from.username
    let text = ctx.update.message.text
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
    let text = ctx.update.message.text
    let channel = await ctx.people.get(username, 'to_update')
    ctx.channels.set(channel, {description_bullet: text})
    ctx.people.set(username, {conversation: null})
    ctx.reply('@' + channel + "'s description bullet has been updated. The new one will be shown the next time you post something.")
}

async function handleSettingLogoDoc(ctx) {
    let username = ctx.from.username
    let doc = ctx.update.message.document
    let [type, ext] = doc.mime_type.split('/')
    if (type === 'image') {
        try {
            let docProps = await ctx.telegram.getFile(ctx.update.message.document.file_id)
            let documentUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${docProps.file_path}`
            let channel = await ctx.people.get(username, 'to_update')
            let filePath = path.join(ctx.imagesDir, username, 'logo-' + channel + '.' + ext)
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
    } else {
        ctx.reply('This is not an image. Please send an image file.')
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
}
